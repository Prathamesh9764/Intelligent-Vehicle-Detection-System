"""
Orchestrator — reads active cameras from DB, spawns one CameraWorker
process per camera, monitors health, restarts on failure or config change.
"""

import json
import multiprocessing
import os
import signal
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from redis_client import RedisBroker

DATABASE_URL = os.environ.get("DATABASE_URL")

# Grace period before trusting heartbeat absence as "stuck" (covers
# RTSP connect + first-frame wait inside the worker, ~30s worst case).
HEARTBEAT_GRACE_SEC = int(os.environ.get("HEARTBEAT_GRACE_SEC", "60"))
# Proactive restart even on a healthy worker, to bound memory/handle
# creep and clear any camera-side cruft. 0 disables.
WORKER_MAX_AGE_SEC = int(os.environ.get("WORKER_MAX_AGE_SEC", "0"))
# Crash-loop protection: if a worker needs more than RESTART_THRESHOLD
# restarts (death or stale-heartbeat) inside CRASH_WINDOW_SEC, stop
# respawning it for CRASH_COOLDOWN_SEC and log an alarm, instead of
# hammering an unhealthy worker in a silent 7s restart loop.
CRASH_WINDOW_SEC = int(os.environ.get("CRASH_WINDOW_SEC", "600"))
RESTART_THRESHOLD = int(os.environ.get("RESTART_THRESHOLD", "5"))
CRASH_COOLDOWN_SEC = int(os.environ.get("CRASH_COOLDOWN_SEC", "60"))


def run_worker_process(camera_id, rtsp_url):
    """Entry point for a child process — loads zones from DB and runs pipeline."""
    from integration.run_pipeline import run_pipeline, PIPELINE_CONFIG

    PIPELINE_CONFIG["source"] = rtsp_url

    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)

    roi_pts = []
    speed_gates = []
    gate_distance = None
    try:
        db: Session = Session()
        rows = db.execute(
            text("SELECT zone_type, coords, gate_distance_meters FROM zones WHERE camera_id = :cid AND is_active = TRUE"),
            {"cid": camera_id},
        ).fetchall()
        db.close()
        engine.dispose()
        for zone_type, coords, gate_distance_m in rows:
            if zone_type == "ROI" and len(coords) >= 3:
                roi_pts = coords
            elif zone_type == "SPEED_GATE" and len(coords) >= 2:
                speed_gates = coords
                if gate_distance_m:
                    gate_distance = float(gate_distance_m)
        print(f"[Worker] Loaded zones: ROI({len(roi_pts)}pts) {len(speed_gates)}gates for camera {camera_id}")
    except Exception as e:
        print(f"[Worker] Zone load failed for camera {camera_id}: {e}")

    # Pass the DB value straight into the pipeline. Setting GATE_DISTANCE on
    # os.environ here is NOT enough: integration.run_pipeline already read that
    # var at import time to build PIPELINE_CONFIG, so an env mutation here would
    # be silently ignored and speed would use the .env default.
    run_pipeline(roi_pts, speed_gates, camera_id=camera_id, gate_distance_meters=gate_distance)


class Orchestrator:
    def __init__(self):
        self.processes: dict[str, dict] = {}
        self.redis = RedisBroker()
        self._engine = None
        self._session_maker = None
        self.crash_times: dict[str, float] = {}
        self.crash_count: dict[str, int] = {}
        self._cooldown_until: dict[str, float] = {}
        self._cooldown_acked: dict[str, bool] = {}

    def _get_session(self):
        if self._engine is None:
            self._engine = create_engine(DATABASE_URL)
            self._session_maker = sessionmaker(bind=self._engine)
        return self._session_maker()

    def sync_with_db(self):
        db = self._get_session()
        try:
            rows = db.execute(
                text("SELECT id, rtsp_url FROM camera WHERE is_active = TRUE")
            ).fetchall()
        finally:
            db.close()

        active_ids = set()
        for cam_id, rtsp_url in rows:
            cam_id_str = str(cam_id)
            active_ids.add(cam_id_str)
            existing = self.processes.get(cam_id_str)

            if existing is None:
                print(f"[Orchestrator] Spawning worker for camera {cam_id_str}")
                self._spawn(cam_id_str, rtsp_url)
            elif existing.get("rtsp_url") != rtsp_url:
                print(f"[Orchestrator] Config changed for camera {cam_id_str}, restarting")
                self._kill(cam_id_str)
                self._spawn(cam_id_str, rtsp_url)
            elif not existing["process"].is_alive():
                if not self._should_restart(cam_id_str):
                    continue
                print(f"[Orchestrator] Worker died for camera {cam_id_str}, restarting")
                self._kill(cam_id_str)
                self._spawn(cam_id_str, rtsp_url)
            elif self._is_stale(cam_id_str, existing):
                # Process/thread objects say "alive" but no heartbeat —
                # this is the old-thrashed-worker case (e.g. cap.read()
                # blocked forever on a frozen camera). SIGKILL via _kill
                # is required; SIGTERM won't interrupt a blocked C call.
                if not self._should_restart(cam_id_str):
                    continue
                print(f"[Orchestrator] Camera {cam_id_str} stale (no heartbeat), force-restarting")
                self._kill(cam_id_str)
                self._spawn(cam_id_str, rtsp_url)
            elif WORKER_MAX_AGE_SEC and (time.time() - existing["started_at"]) > WORKER_MAX_AGE_SEC:
                print(f"[Orchestrator] Camera {cam_id_str} hit max age, refreshing")
                self._kill(cam_id_str)
                self._spawn(cam_id_str, rtsp_url)

        for cam_id in list(self.processes.keys()):
            if cam_id not in active_ids:
                print(f"[Orchestrator] Camera {cam_id} removed, killing worker")
                self._kill(cam_id)

    def _is_stale(self, camera_id, entry):
        if time.time() - entry["started_at"] < HEARTBEAT_GRACE_SEC:
            return False  # still inside connect/first-frame window
        return not self.redis.is_heartbeat_alive(camera_id)

    def _should_restart(self, camera_id):
        """Decide whether a failed/stuck worker should be respawned now.

        Tracks how often a camera restarts within CRASH_WINDOW_SEC. A
        healthy-scope restart (first few) proceeds normally; once a worker
        exceeds RESTART_THRESHOLD restarts inside the window it's treated
        as crash-looping: log an alarm once and back off for
        CRASH_COOLDOWN_SEC instead of respawning every sync tick.
        """
        now = time.time()

        # Prune the sliding window: done once at the next failed-restart
        # event (cheap; we never write while a worker is healthy).
        if camera_id in self.crash_times:
            if now - self.crash_times[camera_id] > CRASH_WINDOW_SEC:
                del self.crash_times[camera_id]
                del self.crash_count[camera_id]
        elif camera_id in self.crash_count:
            del self.crash_count[camera_id]

        # In cooldown — do not spawn. Alarm once per cooldown period.
        cool_end = self._cooldown_until.get(camera_id, 0.0)
        if now < cool_end:
            if not self._cooldown_acked.get(camera_id, False):
                print(
                    f"[ALARM] Camera {camera_id} crash-looping "
                    f"({self.crash_count.get(camera_id, RESTART_THRESHOLD) + 1} restarts "
                    f"in {CRASH_WINDOW_SEC}s); suppressing respawn for "
                    f"{int(cool_end - now)}s"
                )
                self._cooldown_acked[camera_id] = True
            return False

        count = self.crash_count.get(camera_id, 0)
        if count >= RESTART_THRESHOLD:
            self._cooldown_until[camera_id] = now + CRASH_COOLDOWN_SEC
            self._cooldown_acked[camera_id] = False
            self.crash_times.pop(camera_id, None)
            self.crash_count.pop(camera_id, None)
            print(
                f"[ALARM] Camera {camera_id} exceeded {RESTART_THRESHOLD} restarts "
                f"in the window; suppressing respawn for {CRASH_COOLDOWN_SEC}s"
            )
            return False

        # Count this restart and allow it.
        self.crash_times[camera_id] = now
        self.crash_count[camera_id] = count + 1
        return True

    def _spawn(self, camera_id, rtsp_url):
        p = multiprocessing.Process(
            target=run_worker_process,
            args=(camera_id, rtsp_url),
            daemon=True,
        )
        p.start()
        self.processes[camera_id] = {
            "process": p,
            "rtsp_url": rtsp_url,
            "started_at": time.time(),
        }

    def _kill(self, camera_id):
        entry = self.processes.pop(camera_id, None)
        if entry:
            p = entry["process"]
            if p.is_alive():
                p.terminate()
                p.join(timeout=2)
                if p.is_alive():
                    p.kill()
                    p.join()
        self.redis.clean_camera(camera_id)

    def run(self):
        print("[Orchestrator] Starting…")
        signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
        signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
        try:
            while True:
                try:
                    self.sync_with_db()
                except Exception as e:
                    print(f"[Orchestrator] DB sync failed ({e}), retrying…")
                time.sleep(5)
        except KeyboardInterrupt:
            pass
        finally:
            for cam_id in list(self.processes.keys()):
                self._kill(cam_id)
            print("[Orchestrator] Shut down.")


if __name__ == "__main__":
    Orch = Orchestrator()
    Orch.run()