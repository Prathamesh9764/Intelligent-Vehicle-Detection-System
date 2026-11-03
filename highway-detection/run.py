import os
import json
import queue
import threading
import time
import re
import psycopg2
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO
from flask import Flask, render_template_string, Response
import asyncio
import websockets

from speed_engine import box_overlap_polygon as _box_overlap_polygon
from speed_engine import check_line_crossing as _check_line_crossing
from speed_engine import point_in_polygon, distance, polygon_area
from database.db import BackendClient

CONFIG = {
    "source": "speed.mp4",
    "rtsp_transport": "tcp",
    "rtsp_reconnect_sec": 5,
    "rtsp_retries": 0,
    "model": "yolov8n.pt",
    "tracker": "bytetrack.yaml",
    "conf": 0.40,
    "iou": 0.50,
    "device": "",
    "output_dir": "vehicle_clips",
    "config_file": "roi_config.json",
    "vehicle_classes": [2, 5, 7],
    "class_map": {2: "car", 5: "bus", 7: "truck"},
    "grace_frames": 30,
    "num_writer_threads": 2,
    "frame_queue_size": 16,
    "write_queue_size": 16,
    "lp_model": "model/license_plate.pt",
    "lp_conf": 0.40,
    "speed_gates": [
        [[1300, 1700], [1850, 1400]],
        [[1450, 1350], [1900, 1450]],
    ],
    "gate_distance_meters": 15.0,
    "db": {
        "dbname": "speed",
        "user": "postgres",
        "password": "opop",
        "host": "localhost",
        "port": "5432",
    },
}

COLORS = {
    "roi": (0, 255, 255),
    "box": (0, 200, 255),
    "active": (0, 255, 80),
    "gate0": (255, 0, 255),
    "gate1": (0, 255, 255),
}

output_frame = None
frame_lock = threading.Lock()
app = Flask(__name__)

def load_config_json(path):
    if not os.path.exists(path):
        return None, None
    with open(path, "r") as f:
        data = json.load(f)
    roi = data.get("roi")
    gates = data.get("speed_gates")
    dist = data.get("gate_distance_meters")
    if dist is not None:
        CONFIG["gate_distance_meters"] = dist
    print(f"[Config] Loaded ROI ({len(roi)} pts) and {len(gates)} gates from {path}")
    return roi, gates

def save_config_json(path, roi, speed_gates):
    data = {
        "roi": roi,
        "speed_gates": speed_gates,
        "gate_distance_meters": CONFIG["gate_distance_meters"],
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[Config] Saved ROI + gates to {path}")

class SetupDrawer:
    def __init__(self, frame):
        self.frame = frame.copy()
        self.display_size = self._calc_display(frame.shape[1], frame.shape[0])
        self.scale_x = frame.shape[1] / self.display_size[0]
        self.scale_y = frame.shape[0] / self.display_size[1]
        self.mode = "roi"
        self.roi_points = []
        self.gates = []
        self._current_clicks = []

    def _calc_display(self, w, h):
        try:
            import tkinter as tk
            root = tk.Tk()
            sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
            root.destroy()
        except Exception:
            sw, sh = 1366, 768
        max_w, max_h = int(sw * 0.85), int(sh * 0.85)
        scale = min(max_w / w, max_h / h, 1.0)
        return (int(w * scale), int(h * scale))

    def _to_orig(self, dx, dy):
        return int(dx * self.scale_x), int(dy * self.scale_y)

    def _to_disp(self, ox, oy):
        return int(ox / self.scale_x), int(oy / self.scale_y)

    def mouse_callback(self, event, x, y, flags, param):
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        ox, oy = self._to_orig(x, y)
        if self.mode == "roi":
            self.roi_points.append([ox, oy])
            print(f"  ROI point {len(self.roi_points)}: ({ox}, {oy})")
        elif self.mode in ("gate0", "gate1"):
            self._current_clicks.append([ox, oy])
            print(f"  Gate {0 if self.mode == 'gate0' else 1} point {len(self._current_clicks)}: ({ox}, {oy})")
            if len(self._current_clicks) == 2:
                self.gates.append(self._current_clicks[:])
                self._current_clicks = []
                if self.mode == "gate0":
                    self.mode = "gate1"
                    print("  -> Now draw Gate 1 (exit line). Click 2 points.")
                else:
                    self.mode = "done"
                    print("  -> All gates drawn!")

    def run(self):
        window = "Setup: Draw ROI + Speed Gates"
        cv2.namedWindow(window, cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(window, self.mouse_callback)
        cv2.resizeWindow(window, *self.display_size)
        instructions = [
            ("ROI: Left-click points, press 'c' to close polygon", (0, 255, 255)),
            ("Gates: 2 clicks per line. Gate 0 (entry) then Gate 1 (exit)", (255, 0, 255)),
            ("Press 'r' to reset all | Press 's' to save and start", (0, 255, 0)),
        ]
        print("\n=== INTERACTIVE SETUP ===")
        print("Step 1: Draw ROI polygon (left-click points, press 'c' to close)")
        print("Step 2: Draw Gate 0 - entry line (click 2 points)")
        print("Step 3: Draw Gate 1 - exit line (click 2 points)")
        print("Press 's' to save and start, 'r' to reset, 'q' to quit without saving\n")
        while self.mode != "done" or len(self.roi_points) < 3:
            vis = cv2.resize(self.frame.copy(), self.display_size)
            if self.roi_points:
                disp_pts = [self._to_disp(p[0], p[1]) for p in self.roi_points]
                for i, dp in enumerate(disp_pts):
                    cv2.circle(vis, dp, 5, (0, 0, 255), -1)
                    if i > 0:
                        cv2.line(vis, disp_pts[i - 1], dp, (0, 255, 255), 2)
                if len(self.roi_points) >= 3 and self.mode == "roi":
                    cv2.line(vis, disp_pts[-1], disp_pts[0], (0, 255, 255), 1)
            if len(self.roi_points) >= 3 and self.mode != "roi":
                disp_pts = np.array(
                    [self._to_disp(p[0], p[1]) for p in self.roi_points], dtype=np.int32
                )
                overlay = vis.copy()
                cv2.fillPoly(overlay, [disp_pts], (0, 255, 255))
                cv2.addWeighted(overlay, 0.15, vis, 0.85, 0, vis)
                cv2.polylines(vis, [disp_pts], True, (0, 255, 255), 2)
            for gi, gate in enumerate(self.gates):
                color = COLORS["gate0"] if gi == 0 else COLORS["gate1"]
                dp1 = self._to_disp(gate[0][0], gate[0][1])
                dp2 = self._to_disp(gate[1][0], gate[1][1])
                cv2.line(vis, dp1, dp2, color, 2)
                cv2.putText(vis, f"Gate {gi}", ((dp1[0]+dp2[0])//2, (dp1[1]+dp2[1])//2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            for cp in self._current_clicks:
                dp = self._to_disp(cp[0], cp[1])
                cv2.circle(vis, dp, 5, (0, 0, 255), -1)
            y_off = 25
            for text, color in instructions:
                cv2.putText(vis, text, (10, y_off), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                y_off += 25
            mode_text = {
                "roi": "MODE: Draw ROI polygon (click points, 'c' to close)",
                "gate0": "MODE: Draw Gate 0 - ENTRY line (click 2 points)",
                "gate1": "MODE: Draw Gate 1 - EXIT line (click 2 points)",
                "done": "DONE - Press 's' to save and start",
            }
            cv2.putText(vis, mode_text[self.mode], (10, y_off + 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            cv2.imshow(window, vis)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("c") and self.mode == "roi" and len(self.roi_points) >= 3:
                self.mode = "gate0"
                print("  ROI closed. -> Now draw Gate 0 (entry line). Click 2 points.")
            elif key == ord("r"):
                self.roi_points = []
                self.gates = []
                self._current_clicks = []
                self.mode = "roi"
                print("  Reset. Start over: draw ROI polygon.")
            elif key == ord("s") and len(self.roi_points) >= 3 and len(self.gates) == 2:
                cv2.destroyWindow(window)
                return self.roi_points, self.gates
            elif key == ord("q"):
                cv2.destroyWindow(window)
                print("  Quit without saving.")
                return None, None
        cv2.destroyWindow(window)
        return self.roi_points, self.gates

def get_last_vehicle_id(video_dir):
    max_id = 0
    if not os.path.exists(video_dir):
        return 0
    pattern = re.compile(r"vehicle_(\d+)_")
    for filename in os.listdir(video_dir):
        match = pattern.search(filename)
        if match:
            try:
                num = int(match.group(1))
                if num > max_id:
                    max_id = num
            except ValueError:
                continue
    return max_id

def get_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]

def get_db_connection():
    return psycopg2.connect(**CONFIG["db"])

def ensure_db_schema():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """ALTER TABLE public.vehicle_data
               ADD COLUMN IF NOT EXISTS video_path TEXT"""
        )
        conn.commit()
        cur.close()
        print("[DB] Schema check: video_path column ready.")
    except Exception as e:
        print(f"[DB] Schema migration error: {e}")
    finally:
        if conn:
            conn.close()

def roi_to_np(roi) -> np.ndarray:
    return np.array(roi, dtype=np.int32)

def box_overlap_polygon(x1, y1, x2, y2, poly_pts) -> float:
    if isinstance(poly_pts, np.ndarray):
        poly_pts = poly_pts.tolist()
    return _box_overlap_polygon(x1, y1, x2, y2, poly_pts)

def segments_intersect(A, B, C, D) -> bool:
    return _check_line_crossing(A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1])

def draw_polygon_roi(frame: np.ndarray, poly_pts: np.ndarray):
    overlay = frame.copy()
    cv2.fillPoly(overlay, [poly_pts], (0, 255, 255))
    cv2.addWeighted(overlay, 0.10, frame, 0.90, 0, frame)
    cv2.polylines(frame, [poly_pts], True, COLORS["roi"], 2)

def draw_speed_gates(frame: np.ndarray, gates):
    for i, gate in enumerate(gates):
        color = COLORS["gate0"] if i == 0 else COLORS["gate1"]
        p1, p2 = tuple(gate[0]), tuple(gate[1])
        cv2.line(frame, p1, p2, color, 2)
        label = f"Gate {i}"
        mid_x = (p1[0] + p2[0]) // 2
        mid_y = (p1[1] + p2[1]) // 2 - 8
        cv2.putText(frame, label, (mid_x, mid_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

def crop_bbox(frame, bbox, pad=6):
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    x1 = max(0, x1 - pad); y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad); y2 = min(h, y2 + pad)
    return frame[y1:y2, x1:x2]

def _is_rtsp_source(source) -> bool:
    return isinstance(source, str) and source.lower().startswith("rtsp://")

class CaptureThread(threading.Thread):
    def __init__(self, source, frame_q: queue.Queue):
        super().__init__(daemon=True)
        self.source = source
        self.frame_q = frame_q
        self.stopped = threading.Event()
        self.connected = threading.Event()
        self._cap = None
        self.fps = 25.0

    def _open_capture(self):
        if _is_rtsp_source(self.source):
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                f"rtsp_transport;{CONFIG['rtsp_transport']}"
            )
        cap = cv2.VideoCapture(self.source)
        return cap

    def _reconnect_wait(self):
        self.stopped.wait(CONFIG["rtsp_reconnect_sec"])

    def run(self):
        retries = 0
        max_retries = CONFIG["rtsp_retries"]
        while not self.stopped.is_set():
            self._cap = self._open_capture()
            if not self._cap or not self._cap.isOpened():
                print("[CaptureThread] Failed to open capture source.")
                self._reconnect_wait()
                retries += 1
                if 0 < max_retries < retries:
                    print("[CaptureThread] Max retries reached.")
                    break
                continue
            self.fps = self._cap.get(cv2.CAP_PROP_FPS) or 25.0
            print(f"[CaptureThread] Source opened (FPS: {self.fps:.1f})")
            retries = 0
            while not self.stopped.is_set():
                ret, frame = self._cap.read()
                if not ret:
                    print("[CaptureThread] Frame read failed -- reconnecting...")
                    self._cap.release()
                    self._cap = None
                    self._reconnect_wait()
                    break
                try:
                    self.frame_q.put(frame, timeout=1)
                    if not self.connected.is_set():
                        self.connected.set()
                except queue.Full:
                    pass
        if self._cap is not None:
            self._cap.release()
        print("[CaptureThread] Stopped.")

    def close(self):
        self.stopped.set()
        if self._cap is not None:
            self._cap.release()

class WriterThread(threading.Thread):
    def __init__(self, write_q):
        super().__init__(daemon=True)
        self.write_q, self.stopped = write_q, threading.Event()

    def run(self):
        while not self.stopped.is_set():
            try:
                task = self.write_q.get(timeout=0.5)
                if task is None:
                    break
                task()
            except queue.Empty:
                continue

MAX_BUFFER_FRAMES = 150

class VehicleTrack:
    def __init__(self, tid, name, out_dir, fps, size, grace, vehicle_type):
        self.tid = tid
        self.name = name
        self.out_dir = out_dir
        self.fps = fps
        self.size = size
        self.grace_frames = grace
        self.vehicle_type = vehicle_type
        self.entry_time_dt = datetime.now()
        self.in_roi = True
        self.absent_frames = 0
        self.frame_count = 0
        self.best_crop = None
        self.best_area = 0.0
        self.plate_crop = None
        self.plate_saved = False
        self.position_history = []
        self.entry_gate_info = None
        self.speed_kmh = None
        self.frame_buffer = []
        self.buffer_times = []
        self.video_path = None

    def buffer_frame(self, vis_frame):
        if len(self.frame_buffer) < MAX_BUFFER_FRAMES:
            self.frame_buffer.append(vis_frame)
            self.buffer_times.append(time.time())

    def write_video(self, v_dir):
        if len(self.frame_buffer) < 5:
            self.buffer_times.clear()
            return None
        h, w = self.frame_buffer[0].shape[:2]
        nw, nh = w // 2, h // 2
        real_duration = self.buffer_times[-1] - self.buffer_times[0]
        output_fps = max(1.0, len(self.frame_buffer) / real_duration) if real_duration > 0 else (self.fps or 25.0)
        print(f"  [Video] {len(self.frame_buffer)} frames over {real_duration:.1f}s → {output_fps:.1f} fps")
        fname = f"vehicle_{self.name}_{get_timestamp()}.mp4"
        path = str(Path(v_dir) / fname)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(path, fourcc, output_fps, (nw, nh))
        for f in self.frame_buffer:
            writer.write(cv2.resize(f, (nw, nh)))
        writer.release()
        tmp = path.replace(".mp4", "_h264.mp4")
        os.system(f'ffmpeg -i "{path}" -c:v libx264 -preset fast -crf 23 -y "{tmp}" 2>/dev/null')
        if os.path.exists(tmp):
            os.replace(tmp, path)
        self.video_path = path
        self.frame_buffer.clear()
        self.buffer_times.clear()
        return path

    def mark_present(self, frame, area, x1, y1, x2, y2):
        self.in_roi = True
        self.absent_frames = 0
        self.frame_count += 1
        if area > self.best_area:
            self.best_area = area
            h, w = frame.shape[:2]
            cx1, cy1 = max(0, x1), max(0, y1)
            cx2, cy2 = min(w, x2), min(h, y2)
            self.best_crop = frame[cy1:cy2, cx1:cx2].copy()

    def update_speed_tracking(self, cx, cy, t, gates):
        curr = (cx, cy)
        if self.position_history:
            prev = self.position_history[-1]
            for gi, gate in enumerate(gates):
                if segments_intersect(prev, curr, gate[0], gate[1]):
                    if self.entry_gate_info is None:
                        self.entry_gate_info = {"t": t, "g": gi}
                    elif self.entry_gate_info["g"] != gi and self.speed_kmh is None:
                        dt = t - self.entry_gate_info["t"]
                        if dt > 0:
                            self.speed_kmh = float(
                                (CONFIG["gate_distance_meters"] / dt) * 3.6
                            )
        self.position_history.append(curr)
        if len(self.position_history) > 2:
            self.position_history.pop(0)

    def mark_absent(self):
        self.in_roi = False
        self.absent_frames += 1
        return self.absent_frames >= self.grace_frames

    def finalize(self, write_q, s_dir, lp_dir):
        if self.frame_count < 5:
            self.frame_buffer.clear()
            self.buffer_times.clear()
            return

        speed_tag = f"_{self.speed_kmh:.1f}kmh" if self.speed_kmh is not None else ""
        shot_name = f"vehicle_{self.name}_{get_timestamp()}{speed_tag}.jpg"
        shot_path = str(Path(s_dir) / shot_name)

        crop_f = self.best_crop
        plate_f = self.plate_crop
        plate_path_out = None
        if plate_f is not None:
            plate_file = f"plate_{self.name}_{get_timestamp()}.jpg"
            plate_path_out = str(Path(lp_dir) / plate_file)

        video_frames = list(self.frame_buffer)
        video_times = list(self.buffer_times)
        self.frame_buffer.clear()
        self.buffer_times.clear()
        v_type = self.vehicle_type
        v_time = self.entry_time_dt
        v_speed = self.speed_kmh
        v_dir_path = str(self.out_dir / "videos")

        if len(video_times) >= 2:
            real_duration = video_times[-1] - video_times[0]
            fps_val = max(1.0, len(video_frames) / real_duration) if real_duration > 0 else (self.fps or 25.0)
        else:
            fps_val = self.fps or 25.0
        print(f"  [Video] {len(video_frames)} frames over {(video_times[-1] - video_times[0]) if len(video_times) >= 2 else 0:.1f}s → {fps_val:.1f} fps")

        def _save():
            video_path = None
            if len(video_frames) >= 5 and video_frames[0] is not None:
                h, w = video_frames[0].shape[:2]
                nw, nh = w // 2, h // 2
                fname = f"vehicle_{v_type}_{get_timestamp()}{speed_tag}.mp4"
                video_path = str(Path(v_dir_path) / fname)
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(video_path, fourcc, fps_val, (nw, nh))
                for f in video_frames:
                    writer.write(cv2.resize(f, (nw, nh)))
                writer.release()
                tmp = video_path.replace(".mp4", "_h264.mp4")
                os.system(f'ffmpeg -i "{video_path}" -c:v libx264 -preset fast -crf 23 -y "{tmp}" 2>/dev/null')
                if os.path.exists(tmp):
                    os.replace(tmp, video_path)

            if crop_f is not None:
                cv2.imwrite(shot_path, crop_f)
                print(f"  Screenshot: {shot_path}")
            if plate_f is not None and plate_path_out is not None:
                cv2.imwrite(plate_path_out, plate_f)
                print(f"  License plate: {plate_path_out}")
            conn = None
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    """INSERT INTO public.vehicle_data
                       (vehicle_type, entry_time, screenshot_path, speed, video_path)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (v_type, v_time, shot_path, v_speed, video_path),
                )
                conn.commit()
                cur.close()
                print(f"[DB] Saved: {v_type} | speed={v_speed} | {fname}")
            except Exception as e:
                print(f"[DB] Error: {e}")
            finally:
                if conn:
                    conn.close()

        write_q.put(_save)

def run_pipeline(roi_pts, speed_gates):
    global output_frame
    ensure_db_schema()
    out_dir = Path(CONFIG["output_dir"])
    v_dir = out_dir / "videos"
    s_dir = out_dir / "screenshots"
    lp_dir = out_dir / "license_plates"
    for d in [v_dir, s_dir, lp_dir]:
        d.mkdir(parents=True, exist_ok=True)

    v_counter = get_last_vehicle_id(str(v_dir))
    print(f"[Pipeline] Resuming from vehicle ID: {v_counter}")

    frame_q = queue.Queue(maxsize=CONFIG["frame_queue_size"])
    write_q = queue.Queue(maxsize=CONFIG["write_queue_size"])

    model = YOLO(CONFIG["model"])
    lp_model = YOLO(CONFIG["lp_model"])
    print(f"[Pipeline] Loaded vehicle model: {CONFIG['model']}")
    print(f"[Pipeline] Loaded LP model: {CONFIG['lp_model']}")
    cap_thread = CaptureThread(CONFIG["source"], frame_q)
    cap_thread.start()

    print("[Pipeline] Waiting for first frame...")
    if not cap_thread.connected.wait(timeout=30):
        print("[Pipeline] Timed out waiting for source.")
        return
    print("[Pipeline] Source connected.")

    fps = cap_thread.fps
    size = (int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

    writer_threads = [WriterThread(write_q) for _ in range(CONFIG["num_writer_threads"])]
    for wt in writer_threads:
        wt.start()

    ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(ws_loop)
    ws = None
    try:
        ws = ws_loop.run_until_complete(
            websockets.connect("ws://127.0.0.1:8000/ws/camera")
        )
        print("[Pipeline] Camera WS connected")
    except Exception as e:
        print(f"[Pipeline] Camera WS not available ({e})")

    poly_pts = roi_to_np(roi_pts)
    gates = speed_gates
    active_tracks = {}
    pipeline_start = time.time()
    frame_skip_counter = 0
    PROCESS_EVERY_N = 1
    last_config_reload = 0
    CONFIG_RELOAD_INTERVAL = 5.0

    backend = BackendClient()
    try:
        backend.login()
    except Exception:
        pass

    while not cap_thread.stopped.is_set():
        try:
            frame = frame_q.get(timeout=5)
        except queue.Empty:
            if not cap_thread.is_alive():
                print("[Pipeline] Capture thread exited.")
                break
            continue

        if frame is None:
            break

        qsize = frame_q.qsize()
        if qsize > CONFIG["frame_queue_size"] * 0.5:
            PROCESS_EVERY_N = max(2, PROCESS_EVERY_N)
        else:
            PROCESS_EVERY_N = 1

        frame_skip_counter += 1
        if frame_skip_counter % PROCESS_EVERY_N != 0:
            continue

        t = time.time() - pipeline_start

        vis = frame.copy()
        draw_polygon_roi(vis, poly_pts)
        draw_speed_gates(vis, gates)

        results = model.track(
            frame,
            persist=True,
            tracker=CONFIG["tracker"],
            conf=CONFIG["conf"],
            iou=CONFIG["iou"],
            verbose=False,
            classes=CONFIG["vehicle_classes"],
        )
        detected_in_roi = set()

        if results and results[0].boxes is not None:
            for box in results[0].boxes:
                if box.id is None:
                    continue
                tid = int(box.id.item())
                cls_id = int(box.cls.item())
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                if box_overlap_polygon(x1, y1, x2, y2, poly_pts) > 0.2:
                    detected_in_roi.add(tid)
                    if tid not in active_tracks:
                        v_counter += 1
                        v_type = CONFIG["class_map"].get(cls_id, "unknown")
                        active_tracks[tid] = VehicleTrack(
                            tid, f"{v_counter:03d}", out_dir, fps, size,
                            CONFIG["grace_frames"], v_type,
                        )

                    vt = active_tracks[tid]
                    vt.mark_present(frame, (x2 - x1) * (y2 - y1), x1, y1, x2, y2)

                    cx, cy = int((x1 + x2) / 2), int(y2)
                    vt.update_speed_tracking(cx, cy, t, gates)

                    if not vt.plate_saved:
                        crop = crop_bbox(frame, (x1, y1, x2, y2))
                        if crop.size > 0:
                            lp_results = lp_model(crop, conf=CONFIG["lp_conf"], verbose=False)
                            if lp_results and lp_results[0].boxes is not None and len(lp_results[0].boxes) > 0:
                                lp_box = lp_results[0].boxes[0]
                                lx1, ly1, lx2, ly2 = map(int, lp_box.xyxy[0].tolist())
                                lp_crop = crop[max(0,ly1):ly2, max(0,lx1):lx2]
                                if lp_crop.size > 0:
                                    vt.plate_crop = lp_crop.copy()
                                    vt.plate_saved = True

                    label = f"ID {vt.name} [{vt.vehicle_type}]"
                    if vt.speed_kmh is not None:
                        label += f" {vt.speed_kmh:.1f} km/h"
                    if vt.plate_saved:
                        label += " [LP]"

                    cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["active"], 2)
                    cv2.putText(
                        vis, label, (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["active"], 2,
                    )
                    vt.buffer_frame(vis)
                else:
                    cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["box"], 1)

        for tid, vt in list(active_tracks.items()):
            if tid not in detected_in_roi and vt.mark_absent():
                vt.finalize(write_q, s_dir, lp_dir)
                active_tracks.pop(tid)

        with frame_lock:
            output_frame = cv2.resize(vis, (1280, 720))

        if ws:
            _, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 70])
            try:
                ws_loop.run_until_complete(ws.send(buf.tobytes()))
            except Exception:
                pass

        # Periodically reload zone config from backend
        if time.time() - last_config_reload > CONFIG_RELOAD_INTERVAL:
            last_config_reload = time.time()
            try:
                zones = backend.get_zones(active_only=True)
                new_roi = None
                new_gates = None
                new_gate_distance = CONFIG["gate_distance_meters"]
                for z in zones:
                    if z["zone_type"] == "ROI":
                        new_roi = z["coords"]
                    elif z["zone_type"] == "SPEED_GATE":
                        new_gates = z["coords"]
                        if z.get("gate_distance_meters"):
                            new_gate_distance = float(z["gate_distance_meters"])
                if new_roi is not None:
                    reloaded = roi_to_np(new_roi)
                    if reloaded.shape != poly_pts.shape or not np.array_equal(reloaded, poly_pts):
                        poly_pts = reloaded
                        print(f"[Pipeline] ROI config reloaded ({len(new_roi)} pts)")
                if new_gates is not None:
                    if new_gates != gates:
                        gates = new_gates
                        CONFIG["gate_distance_meters"] = new_gate_distance
                        print(f"[Pipeline] Speed gates reloaded ({len(new_gates)} gates, {new_gate_distance}m)")
            except Exception:
                pass

@app.route("/")
def index():
    return render_template_string("""
        <html>
            <body style="background:#111; color:white; text-align:center;">
                <h1>Vehicle ROI Tracker + Speed</h1>
                <img src="/video_feed" style="width:80%;">
            </body>
        </html>
    """)

def gen_frames():
    global output_frame
    while True:
        with frame_lock:
            if output_frame is None:
                time.sleep(0.05)
                continue
            ret, buffer = cv2.imencode(".jpg", output_frame)
            frame_bytes = buffer.tobytes()
        yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
        time.sleep(0.04)

@app.route("/video_feed")
def video_feed():
    return Response(gen_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    config_path = CONFIG["config_file"]
    roi_pts = None
    speed_gates = None

    # Try loading zones from backend API first
    try:
        b = BackendClient()
        b.login()
        zones = b.get_zones(active_only=True)
        for z in zones:
            if z["zone_type"] == "ROI":
                roi_pts = z["coords"]
            elif z["zone_type"] == "SPEED_GATE":
                speed_gates = z["coords"]
                if z.get("gate_distance_meters"):
                    CONFIG["gate_distance_meters"] = float(z["gate_distance_meters"])
        if roi_pts and speed_gates:
            print(f"[Setup] Loaded zones from backend: ROI ({len(roi_pts)} pts), {len(speed_gates)} gates")
    except Exception as e:
        print(f"[Setup] Backend zone load failed ({e}), trying config file...")

    # Fall back to local config file
    if roi_pts is None or speed_gates is None:
        roi_pts, speed_gates = load_config_json(config_path)

        if roi_pts is None or speed_gates is None:
            print("[Setup] No config found. Opening interactive drawing mode...")
            print("[Setup] If the video source fails, check your 'source' in CONFIG.\n")

            cap = cv2.VideoCapture(CONFIG["source"])
            if not cap.isOpened():
                print(f"[Setup] ERROR: Cannot open source '{CONFIG['source']}'")
                exit(1)
            ret, first_frame = cap.read()
            cap.release()
            if not ret:
                print("[Setup] ERROR: Cannot read first frame.")
                exit(1)

            drawer = SetupDrawer(first_frame)
            roi_pts, speed_gates = drawer.run()

            if roi_pts is None:
                print("[Setup] No ROI/gates drawn. Exiting.")
                exit(1)

            save_config_json(config_path, roi_pts, speed_gates)
            print(f"\n[Setup] Config saved to {config_path}. Starting pipeline...\n")
        else:
            print(f"[Setup] Using saved config from {config_path}")

    CONFIG["roi"] = roi_pts
    CONFIG["speed_gates"] = speed_gates

    pipeline_t = threading.Thread(target=run_pipeline, args=(roi_pts, speed_gates), daemon=True)
    pipeline_t.start()
    app.run(host="0.0.0.0", port=5000, threaded=True)
