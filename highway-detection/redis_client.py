import json
import os

import redis


class RedisBroker:
    def __init__(self):
        host = os.environ.get("REDIS_HOST")
        port = int(os.environ.get("REDIS_PORT"))
        self.client = redis.Redis(host=host, port=port, db=0)

    def update_stats(self, camera_id, data):
        self.client.set(f"stats:{camera_id}", json.dumps(data))

    def update_frame(self, camera_id, frame_bytes):
        # TTL-backed so a crashed/stalled worker's last frame expires and
        # snapshots never show a stale "live" frame as current.
        self.client.set(f"frame:{camera_id}", frame_bytes, ex=15)

    def heartbeat(self, camera_id):
        import time
        self.client.set(f"heartbeat:{camera_id}", time.time(), ex=30)

    def is_heartbeat_alive(self, camera_id):
        """TTL-backed liveness check. Key auto-expires (ex=30) if worker
        stops heartbeating — stalled capture/inference shows up here even
        when the OS process/thread is still technically running."""
        return self.client.exists(f"heartbeat:{camera_id}") == 1

    def get_stats(self, camera_id):
        raw = self.client.get(f"stats:{camera_id}")
        return json.loads(raw) if raw else None

    def get_all_stats(self):
        keys = self.client.keys("stats:*")
        result = {}
        for k in keys:
            cid = k.decode().split(":", 1)[-1]
            raw = self.client.get(k)
            if raw:
                result[cid] = json.loads(raw)
        return result

    def get_frame(self, camera_id):
        return self.client.get(f"frame:{camera_id}")

    def update_fps(self, camera_id, fps):
        self.client.set(f"fps:{camera_id}", fps, ex=300)

    def get_fps(self, camera_id):
        raw = self.client.get(f"fps:{camera_id}")
        return float(raw) if raw else None

    def clean_camera(self, camera_id):
        self.client.delete(f"stats:{camera_id}", f"frame:{camera_id}", f"fps:{camera_id}", f"heartbeat:{camera_id}")