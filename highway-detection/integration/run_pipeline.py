# # plate, vehicle and video save in  this code
# """
# Highway detection pipeline — merges the standalone gate-based approach
# with the existing FastAPI + WebSocket architecture.

# Features
#   - Interactive ROI + speed-gate setup (first run only)
#   - Gate-based speed calculation (entry/exit lines)
#   - License plate detection + OCR
#   - Backend API submission via BackendClient
#   - WebSocket relay to backend for Live.jsx camera stream
#   - Grace-frame vehicle tracking with clip export
# """
# import json
# import os
# import queue
# import re
# import sys
# import threading
# import time
# from datetime import datetime
# from pathlib import Path

# from dotenv import load_dotenv

# sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# import cv2
# import numpy as np
# from ultralytics import YOLO
# from onvif import ONVIFCamera

# from config import (
#     MODEL_PATH,
#     PLATE_MODEL_PATH,
#     PLATE_OCR_MODEL_PATH,
#     PLATE_OCR_CONFIG_PATH,
#     CONFIDENCE_THRESHOLD,
#     IOU_THRESHOLD,
#     VIDEO_PATH,
# )
# from database.db import BackendClient
# from anpr.ocr import PlateOCR

# # ---------------------------------------------------------------------------
# # CONFIG
# # ---------------------------------------------------------------------------
# PIPELINE_CONFIG = {
#     "conf": float(os.environ.get("CONF", CONFIDENCE_THRESHOLD)),
#     "iou": float(os.environ.get("IOU", IOU_THRESHOLD)),
#     "grace_frames": int(os.environ.get("GRACE_FRAMES", 30)),
#     "num_writer_threads": int(os.environ.get("WRITER_THREADS", 2)),
#     "frame_queue_size": int(os.environ.get("FRAME_QUEUE_SIZE", 256)),
#     "write_queue_size": int(os.environ.get("WRITE_QUEUE_SIZE", 64)),
#     "gate_distance_meters": float(os.environ.get("GATE_DISTANCE", 15.0)),
#     "min_readings": int(os.environ.get("MIN_READINGS", 5)),
#     "output_dir": os.environ.get("OUTPUT_DIR", "vehicle_clips"),
#     "config_file": os.environ.get("CONFIG_FILE", "roi_config.json"),
#     "source": os.environ.get("VIDEO_SOURCE", str(VIDEO_PATH)),
# }

# COLORS = {
#     "roi": (0, 255, 255),
#     "box": (0, 200, 255),
#     "active": (0, 255, 80),
#     "gate0": (255, 0, 255),
#     "gate1": (0, 255, 255),
# }

# # ---------------------------------------------------------------------------
# # LICENSE PLATE FORMAT VALIDATION
# # (HSRP/BH regex + VALID_STATES + safe confusion correction)
# # ---------------------------------------------------------------------------
# from anpr.plate_validation import validate_plate

# # ---------------------------------------------------------------------------
# # ONVIF SHUTTER SPEED CONFIG
# # ---------------------------------------------------------------------------
# ONVIF_CONFIG = {
#     "enabled": os.environ.get("ONVIF_ENABLED", "true").lower() == "true",
#     "ip": os.environ.get("CAMERA_IP", "192.168.1.213"),
#     "port": int(os.environ.get("ONVIF_PORT", "80")),
#     "username": os.environ.get("CAMERA_USERNAME", "admin"),
#     "password": os.environ.get("CAMERA_PASSWORD", "admin"),
#     "exposure_time_us": int(os.environ.get("EXPOSURE_TIME_US", "8000")),
#     "gain": float(os.environ.get("CAMERA_GAIN", "20.0")),
#     "min_crop_dimension": int(os.environ.get("MIN_CROP_DIMENSION", "200")),
# }

# # ---------------------------------------------------------------------------
# # ONVIF SHUTTER SPEED
# # ---------------------------------------------------------------------------
# def configure_shutter_speed():
#     """Set manual fast shutter via ONVIF at startup for sharper captures."""
#     cfg = ONVIF_CONFIG
#     if not cfg["enabled"]:
#         print("[ONVIF] Shutter speed control disabled via ONVIF_ENABLED=false")
#         return
#     try:
#         cam = ONVIFCamera(cfg["ip"], cfg["port"], cfg["username"], cfg["password"])
#         media = cam.create_media_service()
#         imaging = cam.create_imaging_service()
#         profile = media.GetProfiles()[0]
#         token = profile.VideoSourceConfiguration.SourceToken
#         request = imaging.create_type("SetImagingSettings")
#         request.VideoSourceToken = token
#         request.ImagingSettings = {
#             "Exposure": {
#                 "Mode": "MANUAL",
#                 "ExposureTime": cfg["exposure_time_us"],
#                 "Gain": cfg["gain"],
#                 "Iris": 0.0,
#             }
#         }
#         imaging.SetImagingSettings(request)
#         time.sleep(1)
#         print(f"[ONVIF] Fast shutter set: {cfg['exposure_time_us']}us, gain {cfg['gain']}")
#     except Exception as e:
#         print(f"[ONVIF] Failed to set shutter: {e}")
#         print("[ONVIF] Continuing with camera's current exposure settings.")


# def blur_score(frame):
#     """Variance of Laplacian — higher = sharper image."""
#     gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
#     return cv2.Laplacian(gray, cv2.CV_64F).var()


# def detect_plate_on_crop(lp_model, vehicle_crop, conf_threshold):
#     """
#     Run the plate model ONCE on a single still image — the vehicle's
#     best/sharpest captured screenshot — rather than on a live per-frame
#     stream. Returns the cropped plate image, or None if nothing was found.
#     """
#     if vehicle_crop is None or vehicle_crop.size == 0:
#         return None
#     lp_results = lp_model(vehicle_crop, conf=conf_threshold, verbose=False)
#     if lp_results and lp_results[0].boxes is not None and len(lp_results[0].boxes) > 0:
#         lp_box = lp_results[0].boxes[0]
#         lx1, ly1, lx2, ly2 = map(int, lp_box.xyxy[0].tolist())
#         # Expand the box ~6% so YOLO's edge regression error never clips
#         # the last character before OCR sees it.
#         h, w = vehicle_crop.shape[:2]
#         pad_w = int((lx2 - lx1) * 0.06)
#         pad_h = int((ly2 - ly1) * 0.06)
#         lx1 = max(0, lx1 - pad_w)
#         ly1 = max(0, ly1 - pad_h)
#         lx2 = min(w, lx2 + pad_w)
#         ly2 = min(h, ly2 + pad_h)
#         lp_crop = vehicle_crop[ly1:ly2, lx1:lx2]
#         if lp_crop.size > 0 and lp_crop.shape[0] > 15 and lp_crop.shape[1] > 30:
#             return lp_crop.copy()
#     return None


# # ---------------------------------------------------------------------------
# # JSON CONFIG
# # ---------------------------------------------------------------------------
# def _clamp_gate_distance(dist):
#     """Clamp gate distance to a reasonable range (1–100 meters)."""
#     try:
#         d = float(dist)
#         return max(1.0, min(100.0, d))
#     except (TypeError, ValueError):
#         return 15.0


# def load_config_json(path):
#     if not os.path.exists(path):
#         return None, None
#     with open(path) as f:
#         data = json.load(f)
#     roi = data.get("roi")
#     gates = data.get("speed_gates")
#     dist = data.get("gate_distance_meters")
#     PIPELINE_CONFIG["gate_distance_meters"] = _clamp_gate_distance(dist if dist is not None else 15.0)
#     print(f"[Config] Loaded ROI ({len(roi)} pts) and {len(gates)} gates (gate_distance={PIPELINE_CONFIG['gate_distance_meters']}m)")
#     return roi, gates


# def save_config_json(path, roi, speed_gates):
#     data = {
#         "roi": roi,
#         "speed_gates": speed_gates,
#         "gate_distance_meters": PIPELINE_CONFIG["gate_distance_meters"],
#     }
#     with open(path, "w") as f:
#         json.dump(data, f, indent=2)
#     print(f"[Config] Saved to {path}")

# # ---------------------------------------------------------------------------
# # INTERACTIVE SETUP
# # ---------------------------------------------------------------------------
# class SetupDrawer:
#     def __init__(self, frame):
#         self.frame = frame.copy()
#         self.display_size = self._calc_display(frame.shape[1], frame.shape[0])
#         self.scale_x = frame.shape[1] / self.display_size[0]
#         self.scale_y = frame.shape[0] / self.display_size[1]
#         self.mode = "roi"
#         self.roi_points = []
#         self.gates = []
#         self._current_clicks = []

#     def _calc_display(self, w, h):
#         try:
#             import tkinter as tk
#             root = tk.Tk()
#             sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
#             root.destroy()
#         except Exception:
#             sw, sh = 1366, 768
#         max_w, max_h = int(sw * 0.85), int(sh * 0.85)
#         scale = min(max_w / w, max_h / h, 1.0)
#         return int(w * scale), int(h * scale)

#     def _to_orig(self, dx, dy):
#         return int(dx * self.scale_x), int(dy * self.scale_y)

#     def _to_disp(self, ox, oy):
#         return int(ox / self.scale_x), int(oy / self.scale_y)

#     def mouse_callback(self, event, x, y, flags, param):
#         if event != cv2.EVENT_LBUTTONDOWN:
#             return
#         ox, oy = self._to_orig(x, y)
#         if self.mode == "roi":
#             self.roi_points.append([ox, oy])
#             print(f"  ROI point {len(self.roi_points)}: ({ox}, {oy})")
#         elif self.mode in ("gate0", "gate1"):
#             self._current_clicks.append([ox, oy])
#             print(f"  Gate pt {len(self._current_clicks)}: ({ox}, {oy})")
#             if len(self._current_clicks) == 2:
#                 self.gates.append(self._current_clicks[:])
#                 self._current_clicks = []
#                 if self.mode == "gate0":
#                     self.mode = "gate1"
#                     print("  Now draw Gate 1 (exit). Click 2 pts.")
#                 else:
#                     self.mode = "done"
#                     print("  All gates drawn!")

#     def run(self):
#         window = "Setup: Draw ROI + Speed Gates"
#         cv2.namedWindow(window, cv2.WINDOW_NORMAL)
#         cv2.setMouseCallback(window, self.mouse_callback)
#         cv2.resizeWindow(window, *self.display_size)
#         instructions = [
#             ("ROI: Left-click, 'c' to close polygon", (0, 255, 255)),
#             ("Gate 0 (entry) then Gate 1 (exit) — 2 clicks each", (255, 0, 255)),
#             ("'r' reset | 's' save & start | 'q' quit", (0, 255, 0)),
#         ]
#         print("\n=== INTERACTIVE SETUP ===")
#         print("Step 1: Draw ROI polygon (left-click, 'c' to close)")
#         print("Step 2: Gate 0 (entry) — 2 clicks")
#         print("Step 3: Gate 1 (exit) — 2 clicks")
#         print("'s' save, 'r' reset, 'q' quit\n")
#         while self.mode != "done" or len(self.roi_points) < 3:
#             vis = cv2.resize(self.frame.copy(), self.display_size)
#             if self.roi_points:
#                 disp_pts = [self._to_disp(p[0], p[1]) for p in self.roi_points]
#                 for i, dp in enumerate(disp_pts):
#                     cv2.circle(vis, dp, 5, (0, 0, 255), -1)
#                     if i > 0:
#                         cv2.line(vis, disp_pts[i - 1], dp, (0, 255, 255), 2)
#                 if len(self.roi_points) >= 3 and self.mode == "roi":
#                     cv2.line(vis, disp_pts[-1], disp_pts[0], (0, 255, 255), 1)
#             if len(self.roi_points) >= 3 and self.mode != "roi":
#                 disp_pts = np.array([self._to_disp(p[0], p[1]) for p in self.roi_points], dtype=np.int32)
#                 overlay = vis.copy()
#                 cv2.fillPoly(overlay, [disp_pts], (0, 255, 255))
#                 cv2.addWeighted(overlay, 0.15, vis, 0.85, 0, vis)
#                 cv2.polylines(vis, [disp_pts], True, (0, 255, 255), 2)
#             for gi, gate in enumerate(self.gates):
#                 color = COLORS["gate0"] if gi == 0 else COLORS["gate1"]
#                 dp1 = self._to_disp(gate[0][0], gate[0][1])
#                 dp2 = self._to_disp(gate[1][0], gate[1][1])
#                 cv2.line(vis, dp1, dp2, color, 2)
#                 cv2.putText(vis, f"Gate {gi}", ((dp1[0] + dp2[0]) // 2, (dp1[1] + dp2[1]) // 2 - 10),
#                             cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
#             for cp in self._current_clicks:
#                 dp = self._to_disp(cp[0], cp[1])
#                 cv2.circle(vis, dp, 5, (0, 0, 255), -1)
#             y_off = 25
#             for text, color in instructions:
#                 cv2.putText(vis, text, (10, y_off), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
#                 y_off += 25
#             mode_text = {
#                 "roi": "MODE: Draw ROI ('c' to close)",
#                 "gate0": "MODE: Gate 0 — ENTRY line (2 clicks)",
#                 "gate1": "MODE: Gate 1 — EXIT line (2 clicks)",
#                 "done": "DONE — press 's' to save & start",
#             }
#             cv2.putText(vis, mode_text[self.mode], (10, y_off + 10),
#                         cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
#             cv2.imshow(window, vis)
#             key = cv2.waitKey(1) & 0xFF
#             if key == ord("c") and self.mode == "roi" and len(self.roi_points) >= 3:
#                 self.mode = "gate0"
#                 print("ROI closed. Draw Gate 0 (entry).")
#             elif key == ord("r"):
#                 self.roi_points = []; self.gates = []; self._current_clicks = []; self.mode = "roi"
#                 print("Reset.")
#             elif key == ord("s") and len(self.roi_points) >= 3 and len(self.gates) == 2:
#                 cv2.destroyWindow(window); return self.roi_points, self.gates
#             elif key == ord("q"):
#                 cv2.destroyWindow(window); return None, None
#         cv2.destroyWindow(window)
#         return self.roi_points, self.gates

# # ---------------------------------------------------------------------------
# # UTILS
# # ---------------------------------------------------------------------------
# def get_timestamp():
#     return datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]


# def get_last_vehicle_id(video_dir):
#     max_id = 0
#     if not os.path.exists(video_dir):
#         return 0
#     pattern = re.compile(r"vehicle_(\d+)_")
#     for fn in os.listdir(video_dir):
#         m = pattern.search(fn)
#         if m:
#             try:
#                 num = int(m.group(1))
#                 if num > max_id:
#                     max_id = num
#             except ValueError:
#                 continue
#     return max_id


# def roi_to_np(roi):
#     return np.array(roi, dtype=np.int32)


# def box_overlap_polygon(x1, y1, x2, y2, poly_pts):
#     cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
#     w, h = x2 - x1, y2 - y1
#     pts = [
#         (cx, cy),
#         (x1 + w * 0.25, y1 + h * 0.25),
#         (x1 + w * 0.75, y1 + h * 0.25),
#         (x1 + w * 0.25, y1 + h * 0.75),
#         (x1 + w * 0.75, y1 + h * 0.75),
#     ]
#     hits = 0
#     poly_r = poly_pts.reshape(-1, 1, 2)
#     for px, py in pts:
#         if cv2.pointPolygonTest(poly_r, (float(px), float(py)), False) >= 0:
#             hits += 1
#     return hits / len(pts)


# def segments_intersect(A, B, C, D):
#     def ccw(A, B, C):
#         return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
#     return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)


# def draw_polygon_roi(frame, poly_pts):
#     if poly_pts is None or len(poly_pts) < 3:
#         return
#     overlay = frame.copy()
#     pts = np.array(poly_pts, dtype=np.int32)
#     cv2.fillPoly(overlay, [pts], (0, 255, 255))
#     cv2.addWeighted(overlay, 0.10, frame, 0.90, 0, frame)
#     cv2.polylines(frame, [poly_pts], True, COLORS["roi"], 2)


# def draw_speed_gates(frame, gates):
#     if gates is None or len(gates) < 2:
#         return
#     for i, gate in enumerate(gates):
#         color = COLORS["gate0"] if i == 0 else COLORS["gate1"]
#         p1, p2 = tuple(gate[0]), tuple(gate[1])
#         cv2.line(frame, p1, p2, color, 2)
#         mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2 - 8)
#         cv2.putText(frame, f"Gate {i}", mid, cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)


# def crop_bbox(frame, bbox, pad=6):
#     h, w = frame.shape[:2]
#     x1, y1, x2, y2 = bbox
#     x1 = max(0, x1 - pad); y1 = max(0, y1 - pad)
#     x2 = min(w, x2 + pad); y2 = min(h, y2 + pad)
#     return frame[y1:y2, x1:x2]

# # ---------------------------------------------------------------------------
# # THREADS
# # ---------------------------------------------------------------------------
# class CaptureThread(threading.Thread):
#     def __init__(self, source, frame_q):
#         super().__init__(daemon=True)
#         self.source = source
#         self.frame_q = frame_q
#         self.stopped = threading.Event()
#         self.connected = threading.Event()
#         self._cap = None
#         self.fps = 25.0
#         self.measured_fps = 25.0
#         self._fps_counter = 0
#         self._fps_t0 = 0.0

#     def _open_capture(self):
#         if isinstance(self.source, str) and self.source.lower().startswith("rtsp://"):
#             os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
#         cap = cv2.VideoCapture(self.source)
#         return cap

#     def run(self):
#         retries = 0
#         max_retries = int(os.environ.get("RTSP_RETRIES", "0"))
#         reconnect_sec = int(os.environ.get("RTSP_RECONNECT_SEC", "5"))
#         while not self.stopped.is_set():
#             self._cap = self._open_capture()
#             if not self._cap or not self._cap.isOpened():
#                 self.stopped.wait(reconnect_sec)
#                 retries += 1
#                 if 0 < max_retries < retries:
#                     break
#                 continue
#             self.fps = self._cap.get(cv2.CAP_PROP_FPS) or 25.0
#             print(f"[CaptureThread] Source opened (FPS: {self.fps:.1f})")
#             retries = 0
#             self._fps_counter = 0
#             self._fps_t0 = time.time()
#             while not self.stopped.is_set():
#                 ret, frame = self._cap.read()
#                 if not ret:
#                     self._cap.release(); self._cap = None
#                     self.stopped.wait(reconnect_sec)
#                     break
#                 self._fps_counter += 1
#                 elapsed = time.time() - self._fps_t0
#                 if elapsed >= 5.0:
#                     self.measured_fps = self._fps_counter / elapsed
#                     self._fps_counter = 0
#                     self._fps_t0 = time.time()
#                 try:
#                     self.frame_q.put(frame, timeout=1)
#                     if not self.connected.is_set():
#                         self.connected.set()
#                 except queue.Full:
#                     pass
#         if self._cap:
#             self._cap.release()
#         print("[CaptureThread] Stopped.")

#     def close(self):
#         self.stopped.set()
#         if self._cap:
#             self._cap.release()


# class WriterThread(threading.Thread):
#     def __init__(self, write_q):
#         super().__init__(daemon=True)
#         self.write_q = write_q
#         self.stopped = threading.Event()

#     def run(self):
#         while not self.stopped.is_set():
#             try:
#                 task = self.write_q.get(timeout=0.5)
#                 if task is None:
#                     break
#                 task()
#             except queue.Empty:
#                 continue

# # ---------------------------------------------------------------------------
# # VEHICLE TRACK
# # ---------------------------------------------------------------------------
# MAX_BUFFER_FRAMES = 150


# class VehicleTrack:
#     def __init__(self, tid, name, fps, size, grace, vehicle_type, class_id):
#         self.tid = tid
#         self.name = name
#         self.fps = fps
#         self.size = size
#         self.grace_frames = grace
#         self.vehicle_type = vehicle_type
#         self.class_id = class_id
#         self.entry_time_dt = datetime.now()
#         self.in_roi = True
#         self.absent_frames = 0
#         self.frame_count = 0
#         self.best_crop = None
#         self.best_area = 0.0
#         self.best_blur_score = -1.0
#         self.plate_crop = None
#         self.plate_text = None
#         self.plate_raw = None
#         self.position_history = []
#         self.entry_gate_info = None
#         # self.speed_readings = []
#         self.speed_kmh = None
#         self.reported = False
#         self.min_readings = PIPELINE_CONFIG["min_readings"]
#         self.frame_buffer = []
#         self.frame_buffer_ts = []
#         self.video_path = None

#     # @property
#     # def speed_kmh(self):
#     #     return sum(self.speed_readings) / len(self.speed_readings) if self.speed_readings else None

#     def buffer_frame(self, vis_frame, t=None):
#         if len(self.frame_buffer) < MAX_BUFFER_FRAMES:
#             self.frame_buffer.append(vis_frame.copy())
#             self.frame_buffer_ts.append(
#                 t if t is not None else time.time()
#             )

#     def write_video(self, output_dir):
#         if len(self.frame_buffer) < 5:
#             return None

#         h, w = self.frame_buffer[0].shape[:2]
#         nw, nh = w // 2, h // 2

#         fname = f"vehicle_{self.name}_{get_timestamp()}.mp4"
#         path = str(Path(output_dir) / fname)

#         # Calculate actual time represented by buffered frames
#         if len(self.frame_buffer_ts) >= 2:
#             start_ts = self.frame_buffer_ts[0]
#             end_ts = self.frame_buffer_ts[-1]
#             duration = end_ts - start_ts

#             if duration > 0:
#                 real_fps = (len(self.frame_buffer) - 1) / duration
#             else:
#                 real_fps = self.fps or 25.0
#         else:
#             real_fps = self.fps or 25.0

#         # Prevent extreme FPS values
#         real_fps = max(1.0, min(real_fps, 30.0))

#         print(
#             f"[Video] Vehicle {self.name}: "
#             f"frames={len(self.frame_buffer)}, "
#             f"duration={duration:.2f}s, "
#             f"fps={real_fps:.2f}"
#         )

#         fourcc = cv2.VideoWriter_fourcc(*"mp4v")

#         writer = cv2.VideoWriter(
#             path,
#             fourcc,
#             real_fps,
#             (nw, nh)
#         )

#         for frame in self.frame_buffer:
#             resized = cv2.resize(frame, (nw, nh))
#             writer.write(resized)

#         writer.release()

#         # Convert to H.264
#         tmp = path.replace(".mp4", "_h264.mp4")

#         os.system(
#             f'ffmpeg -i "{path}" '
#             f'-c:v libx264 '
#             f'-preset fast '
#             f'-crf 23 '
#             f'-y "{tmp}" 2>/dev/null'
#         )

#         if os.path.exists(tmp):
#             os.replace(tmp, path)

#         self.video_path = path

#         # Clear both buffers
#         self.frame_buffer.clear()
#         self.frame_buffer_ts.clear()

#         return path

#     def mark_present(self, frame, area, x1, y1, x2, y2):
#         """
#         Track the best screenshot for this vehicle. 'Best' = largest area —
#         this is the frame plate detection will run on later (once, at report
#         time), so we also record its sharpness for logging/diagnostics.
#         """
#         self.in_roi = True
#         self.absent_frames = 0
#         self.frame_count += 1
#         if area > self.best_area:
#             h, w = frame.shape[:2]
#             cx1, cy1 = max(0, x1), max(0, y1)
#             cx2, cy2 = min(w, x2), min(h, y2)
#             candidate = frame[cy1:cy2, cx1:cx2]
#             if candidate.size > 0:
#                 self.best_area = area
#                 self.best_crop = candidate.copy()
#                 self.best_blur_score = blur_score(candidate)

#     def update_speed(self, cx, cy, t, gates):
#         curr = (cx, cy)
#         if self.position_history:
#             prev = self.position_history[-1]
#             for gi, gate in enumerate(gates):
#                 if segments_intersect(prev, curr, gate[0], gate[1]):
#                     if self.entry_gate_info is None:
#                         self.entry_gate_info = {"t": t, "g": gi}
#                     elif self.entry_gate_info["g"] != gi and self.speed_kmh is None:
#                         dt = t - self.entry_gate_info["t"]
#                         if dt > 0:
#                             self.speed_kmh = (PIPELINE_CONFIG["gate_distance_meters"] / dt) * 3.6
#         self.position_history.append(curr)
#         if len(self.position_history) > 6:
#             self.position_history.pop(0)

#     def mark_absent(self):
#         self.in_roi = False
#         self.absent_frames += 1
#         return self.absent_frames >= self.grace_frames

# # ---------------------------------------------------------------------------
# # PIPELINE
# # ---------------------------------------------------------------------------
# def run_pipeline(roi_pts, speed_gates, camera_id=None):
#     out_dir = Path(PIPELINE_CONFIG["output_dir"])
#     s_dir = out_dir / "screenshots"
#     lp_dir = out_dir / "license_plates"
#     v_dir = out_dir / "videos"
#     for d in [s_dir, lp_dir, v_dir]:
#         d.mkdir(parents=True, exist_ok=True)

#     configure_shutter_speed()

#     v_counter = get_last_vehicle_id(str(out_dir))
#     print(f"[Pipeline] Starting from vehicle ID: {v_counter}")

#     frame_q = queue.Queue(maxsize=PIPELINE_CONFIG["frame_queue_size"])
#     write_q = queue.Queue(maxsize=PIPELINE_CONFIG["write_queue_size"])

#     model = YOLO(MODEL_PATH)
#     lp_model = YOLO(PLATE_MODEL_PATH)
#     plate_ocr = None
#     try:
#         plate_ocr = PlateOCR(PLATE_OCR_MODEL_PATH, PLATE_OCR_CONFIG_PATH)
#     except Exception as e:
#         print(f"[Pipeline] Plate OCR unavailable, vehicle plates will be skipped: {e}")
#     src = PIPELINE_CONFIG["source"]
#     if isinstance(src, str) and src.isdigit():
#         src = int(src)
#     cap_thread = CaptureThread(src, frame_q)
#     cap_thread.start()

#     print("[Pipeline] Waiting for first frame...")
#     if not cap_thread.connected.wait(timeout=30):
#         print("[Pipeline] Timed out.")
#         return
#     print("[Pipeline] Connected.")

#     fps = cap_thread.fps
#     size = (int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
#             int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

#     from redis_client import RedisBroker
#     redis_broker = RedisBroker()
#     if camera_id:
#         redis_broker.update_fps(camera_id, cap_thread.measured_fps)
#         print(f"[Pipeline] Camera reported FPS: {fps:.1f}, measured: {cap_thread.measured_fps:.1f} (published to Redis)")

#     writer_threads = [WriterThread(write_q) for _ in range(PIPELINE_CONFIG["num_writer_threads"])]
#     for wt in writer_threads:
#         wt.start()

#     poly_pts = roi_to_np(roi_pts)
#     gates = speed_gates
#     active_tracks = {}
#     pipeline_start = time.time()
#     last_config_reload = 0
#     CONFIG_RELOAD_INTERVAL = 5.0
#     last_publish_time = 0.0
#     PUBLISH_INTERVAL = 0.1

#     # Backend client
#     backend = BackendClient()
#     try:
#         backend.login()
#         print(f"[Pipeline] Backend: {backend.base_url}")
#     except Exception as e:
#         print(f"[Pipeline] Backend login failed: {e}")

#     while not cap_thread.stopped.is_set():
#         try:
#             frame = frame_q.get(timeout=5)
#         except queue.Empty:
#             if not cap_thread.is_alive():
#                 break
#             continue
#         if frame is None:
#             break

#         # Drain stale frames — always process the latest to stay real-time
#         while not frame_q.empty() and not cap_thread.stopped.is_set():
#             try:
#                 frame = frame_q.get_nowait()
#             except queue.Empty:
#                 break

#         t = time.time() - pipeline_start
#         vis = frame.copy()
#         draw_polygon_roi(vis, poly_pts)
#         draw_speed_gates(vis, gates)

#         results = model.track(
#             frame, persist=True, conf=PIPELINE_CONFIG["conf"],
#             iou=PIPELINE_CONFIG["iou"], verbose=False,
#             # classes=[2, 5, 7],
#             classes=[2],
#         )
#         detected_in_roi = set()
#         # class_map = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
#         class_map = {2: "car"}

#         if results and results[0].boxes is not None:
#             for box in results[0].boxes:
#                 if box.id is None:
#                     continue
#                 tid = int(box.id.item())
#                 cls_id = int(box.cls.item())
#                 x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

#                 if box_overlap_polygon(x1, y1, x2, y2, poly_pts) > 0.2:
#                     detected_in_roi.add(tid)
#                     if tid not in active_tracks:
#                         v_counter += 1
#                         v_type = class_map.get(cls_id, "unknown")
#                         active_tracks[tid] = VehicleTrack(
#                             tid, f"{v_counter:03d}", fps, size,
#                             PIPELINE_CONFIG["grace_frames"], v_type, cls_id,
#                         )

#                     vt = active_tracks[tid]
#                     vt.mark_present(frame, (x2 - x1) * (y2 - y1), x1, y1, x2, y2)

#                     cx, cy = (x1 + x2) // 2, y2
#                     vt.update_speed(cx, cy, t, gates)

#                     # Defer all I/O (plate detection on the best screenshot,
#                     # video write, backend submit, screenshot save) to the
#                     # writer thread — nothing plate-related runs in this
#                     # hot per-frame loop anymore.
#                     if not vt.reported and vt.speed_kmh is not None and vt.frame_count >= vt.min_readings:
#                         vt.reported = True
#                         def _report_task(vt_ref=vt, b_ref=backend, v_ref=v_dir, cid=camera_id, lpm=lp_model, ocr=plate_ocr):
#                             # Plate detection runs ONCE here, on the writer
#                             # thread, against the vehicle's best (largest +
#                             # sharpest-tracked) screenshot — not per-frame.
#                             if vt_ref.best_crop is not None:
#                                 vt_ref.plate_crop = detect_plate_on_crop(
#                                     lpm, vt_ref.best_crop, CONFIDENCE_THRESHOLD
#                                 )
#                                 print(
#                                     f"[Plate] Track {vt_ref.name}: screenshot blur score "
#                                     f"{vt_ref.best_blur_score:.1f} (higher = sharper), "
#                                     f"plate {'found' if vt_ref.plate_crop is not None else 'not found'}"
#                                 )
#                             if vt_ref.plate_text is None and vt_ref.plate_crop is not None and ocr is not None:
#                                 text, raw, probs = ocr.read(vt_ref.plate_crop)
#                                 valid, plate, was_corrected = validate_plate(text, probs)
#                                 if valid:
#                                     vt_ref.plate_text = plate
#                                     vt_ref.plate_raw = raw if was_corrected else None
#                                 else:
#                                     vt_ref.plate_text = None
#                                     vt_ref.plate_raw = raw
#                                 print(
#                                     f"[Plate] Track {vt_ref.name}: fast OCR -> "
#                                     f"'{vt_ref.plate_text or ''}'"
#                                     f"{' (corrected)' if was_corrected else ''}"
#                                     f"{'' if vt_ref.plate_text else ' (invalid format, skipped)'}"
#                                 )
#                             video_path = vt_ref.write_video(str(v_ref))
#                             try:
#                                 result = b_ref.create_vehicle_record(
#                                     vehicle_type=vt_ref.vehicle_type,
#                                     license_plate_text=vt_ref.plate_text or None,
#                                     license_plate_raw_ocr=vt_ref.plate_raw or None,
#                                     speed=vt_ref.speed_kmh,
#                                     camera_id=cid,
#                                     screenshot=vt_ref.best_crop,
#                                     plate_crop=vt_ref.plate_crop,
#                                     video_path=video_path,
#                                 )
#                             except Exception as e:
#                                 print(f"[Pipeline] Failed to report track {vt_ref.name}: {e}")
#                                 result = None
#                             if result:
#                                 print(
#                                     f"[Pipeline] Reported track {vt_ref.name} "
#                                     f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h, "
#                                     f"plate='{vt_ref.plate_text}')"
#                                 )
#                                 if video_path and os.path.exists(video_path):
#                                     os.remove(video_path)
#                         write_q.put(_report_task)

#                     label = f"ID {vt.name} [{vt.vehicle_type}]"
#                     if vt.speed_kmh is not None:
#                         label += f" {vt.speed_kmh:.1f} km/h"
#                     if vt.plate_text:
#                         label += f" [{vt.plate_text}]"
#                     cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["active"], 2)
#                     cv2.putText(vis, label, (x1, y1 - 8),
#                                 cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["active"], 2)
#                     vt.buffer_frame(vis, time.time())
#                 else:
#                     cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["box"], 1)

#         # Clean up lost tracks
#         for tid, vt in list(active_tracks.items()):
#             if tid not in detected_in_roi and vt.mark_absent():
#                 if not vt.reported and vt.speed_kmh is not None and vt.frame_count >= vt.min_readings:
#                     vt.reported = True
#                     def _report_lost_task(vt_ref=vt, b_ref=backend, v_ref=v_dir, cid=camera_id, lpm=lp_model, ocr=plate_ocr):
#                         # Same deferred, once-only plate detection as the
#                         # normal report path, run on the best screenshot.
#                         if vt_ref.best_crop is not None:
#                             vt_ref.plate_crop = detect_plate_on_crop(
#                                 lpm, vt_ref.best_crop, CONFIDENCE_THRESHOLD
#                             )
#                             print(
#                                 f"[Plate] Track {vt_ref.name}: screenshot blur score "
#                                 f"{vt_ref.best_blur_score:.1f} (higher = sharper), "
#                                 f"plate {'found' if vt_ref.plate_crop is not None else 'not found'}"
#                             )
#                             if vt_ref.plate_text is None and vt_ref.plate_crop is not None and ocr is not None:
#                                 text, raw, probs = ocr.read(vt_ref.plate_crop)
#                                 valid, plate, was_corrected = validate_plate(text, probs)
#                                 if valid:
#                                     vt_ref.plate_text = plate
#                                     vt_ref.plate_raw = raw if was_corrected else None
#                                 else:
#                                     vt_ref.plate_text = None
#                                     vt_ref.plate_raw = raw
#                                 print(
#                                     f"[Plate] Track {vt_ref.name}: fast OCR -> "
#                                     f"'{vt_ref.plate_text or ''}'"
#                                     f"{' (corrected)' if was_corrected else ''}"
#                                     f"{'' if vt_ref.plate_text else ' (invalid format, skipped)'}"
#                                 )
#                         video_path = vt_ref.write_video(str(v_ref))
#                         try:
#                             result = b_ref.create_vehicle_record(
#                                 vehicle_type=vt_ref.vehicle_type,
#                                 license_plate_text=vt_ref.plate_text or None,
#                                 license_plate_raw_ocr=vt_ref.plate_raw or None,
#                                 speed=vt_ref.speed_kmh,
#                                 camera_id=cid,
#                                 screenshot=vt_ref.best_crop,
#                                 plate_crop=vt_ref.plate_crop,
#                                 video_path=video_path,
#                             )
#                             if result:
#                                 print(
#                                     f"[Pipeline] Reported lost track {vt_ref.name} "
#                                     f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h)"
#                                 )
#                                 if video_path and os.path.exists(video_path):
#                                     os.remove(video_path)
#                         except Exception as e:
#                             print(f"[Pipeline] Failed to report lost track {vt_ref.name}: {e}")
#                     write_q.put(_report_lost_task)
#                 active_tracks.pop(tid)

#         # Publish frame to Redis (for Live.jsx via backend WS) — throttled
#         if camera_id:
#             now = time.time()
#             if now - last_publish_time >= PUBLISH_INTERVAL:
#                 _, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 50])
#                 redis_broker.update_frame(camera_id, buf.tobytes())
#                 last_publish_time = now

#         # Periodically reload zone config from backend
#         if time.time() - last_config_reload > CONFIG_RELOAD_INTERVAL:
#             last_config_reload = time.time()
#             try:
#                 zones = backend.get_zones(active_only=True, camera_id=camera_id)
#                 new_roi = None
#                 new_gates = None
#                 new_gate_distance = PIPELINE_CONFIG["gate_distance_meters"]
#                 for z in zones:
#                     if z["zone_type"] == "ROI":
#                         new_roi = z["coords"]
#                     elif z["zone_type"] == "SPEED_GATE":
#                         new_gates = z["coords"]
#                         if z.get("gate_distance_meters"):
#                             new_gate_distance = float(z["gate_distance_meters"])
#                 if new_roi is not None:
#                     reloaded = roi_to_np(new_roi)
#                     if reloaded.shape != poly_pts.shape or not np.array_equal(reloaded, poly_pts):
#                         poly_pts = reloaded
#                         print(f"[Pipeline] ROI config reloaded ({len(new_roi)} pts)")
#                 if new_gates is not None:
#                     if new_gates != gates:
#                         gates = new_gates
#                         PIPELINE_CONFIG["gate_distance_meters"] = new_gate_distance
#                         print(f"[Pipeline] Speed gates reloaded ({len(new_gates)} gates, {new_gate_distance}m)")
#             except Exception:
#                 pass

#     cap_thread.close()
#     print(f"[Pipeline] Done. Tracked {v_counter} vehicles.")

# # ---------------------------------------------------------------------------
# # MAIN
# # ---------------------------------------------------------------------------
# def main():
#     import argparse
#     parser = argparse.ArgumentParser()
#     parser.add_argument("--camera-id", help="Camera UUID (override auto-detect)")
#     args = parser.parse_args()
#     camera_id = args.camera_id

#     # Connect directly to PostgreSQL
#     from sqlalchemy import create_engine, text
#     db_url = os.environ.get("DATABASE_URL")
#     if not db_url:
#         print("[Setup] DATABASE_URL not set, using local config only")
#     else:
#         engine = create_engine(db_url)
#         conn = engine.connect()

#         # Auto-detect first active camera if not specified
#         if not camera_id:
#             rows = conn.execute(text("SELECT id, name, rtsp_url FROM camera WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1")).fetchall()
#             if rows:
#                 camera_id = str(rows[0][0])
#                 print(f"[Setup] Auto-detected camera: {rows[0][1]} ({camera_id})")
#             else:
#                 print("[Setup] No active cameras found in DB")

#         # Fetch RTSP URL for the camera
#         if camera_id:
#             row = conn.execute(text("SELECT name, rtsp_url FROM camera WHERE id = :cid"), {"cid": camera_id}).fetchone()
#             if row:
#                 rtsp_url = row[1].strip('"')
#                 if rtsp_url:
#                     PIPELINE_CONFIG["source"] = rtsp_url
#                     print(f"[Setup] Using camera RTSP: {row[0]} ({rtsp_url})")

#         conn.close()
#         engine.dispose()

#     roi_pts = None
#     speed_gates = None

#     # Try loading zones from DB
#     if camera_id and db_url:
#         try:
#             engine = create_engine(db_url)
#             conn = engine.connect()
#             rows = conn.execute(
#                 text("SELECT zone_type, coords, gate_distance_meters FROM zones WHERE camera_id = :cid AND is_active = TRUE"),
#                 {"cid": camera_id},
#             ).fetchall()
#             conn.close()
#             engine.dispose()
#             for zone_type, coords, gate_distance in rows:
#                 if zone_type == "ROI" and len(coords) >= 3:
#                     roi_pts = coords
#                 elif zone_type == "SPEED_GATE" and len(coords) >= 2:
#                     speed_gates = coords
#                     if gate_distance:
#                         PIPELINE_CONFIG["gate_distance_meters"] = _clamp_gate_distance(gate_distance)
#             if roi_pts and speed_gates:
#                 print(f"[Setup] Loaded zones from DB: ROI ({len(roi_pts)} pts), {len(speed_gates)} gates")
#         except Exception as e:
#             print(f"[Setup] DB zone load failed ({e}), trying config file...")

#     # Fall back to local config file
#     if roi_pts is None or speed_gates is None:
#         config_path = PIPELINE_CONFIG["config_file"]
#         roi_pts, speed_gates = load_config_json(config_path)

#         if roi_pts is None or speed_gates is None:
#             print("[Setup] No config — opening interactive drawing mode...")
#             src = PIPELINE_CONFIG["source"]
#             if isinstance(src, str) and src.isdigit():
#                 src = int(src)
#             cap = cv2.VideoCapture(src)
#             if not cap.isOpened():
#                 print(f"[Setup] Cannot open source '{src}'")
#                 return
#             ret, first_frame = cap.read()
#             cap.release()
#             if not ret:
#                 print("[Setup] Cannot read first frame.")
#                 return
#             drawer = SetupDrawer(first_frame)
#             roi_pts, speed_gates = drawer.run()
#             if roi_pts is None:
#                 print("[Setup] Aborted.")
#                 return
#             save_config_json(config_path, roi_pts, speed_gates)
#             print(f"\n[Setup] Config saved. Starting pipeline...\n")
#         else:
#             print(f"[Setup] Using saved config from {config_path}")

#     run_pipeline(roi_pts, speed_gates, camera_id=camera_id)


# if __name__ == "__main__":
#     main()



# plate, vehicle and video save in this code
"""
Highway detection pipeline — merges the standalone gate-based approach
with the existing FastAPI + WebSocket architecture.

Features
  - Interactive ROI + speed-gate setup (first run only)
  - Gate-based speed calculation (entry/exit lines)
  - License plate detection + OCR
  - Backend API submission via BackendClient
  - WebSocket relay to backend for Live.jsx camera stream
  - Grace-frame vehicle tracking with clip export
  - Brightness-driven day/night gain (+ iris, if supported) switching.
    Shutter speed stays fixed at all times -- only gain/iris flex.
"""
import json
import math
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import cv2
import numpy as np
from ultralytics import YOLO
from onvif import ONVIFCamera

from config import (
    MODEL_PATH,
    PLATE_MODEL_PATH,
    PLATE_OCR_MODEL_PATH,
    PLATE_OCR_CONFIG_PATH,
    CONFIDENCE_THRESHOLD,
    IOU_THRESHOLD,
    VIDEO_PATH,
    VEHICLE_CLASSES,
    resolve_inference_device,
)
from database.db import BackendClient
from anpr.ocr import PlateOCR

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
PIPELINE_CONFIG = {
    "conf": float(os.environ.get("CONF", CONFIDENCE_THRESHOLD)),
    "iou": float(os.environ.get("IOU", IOU_THRESHOLD)),
    "tracker": os.environ.get("TRACKER", "bytetrack.yaml"),
    "grace_frames": int(os.environ.get("GRACE_FRAMES", 30)),
    "num_writer_threads": int(os.environ.get("WRITER_THREADS", 2)),
    "frame_queue_size": int(os.environ.get("FRAME_QUEUE_SIZE", 256)),
    "write_queue_size": int(os.environ.get("WRITE_QUEUE_SIZE", 64)),
    "gate_distance_meters": float(os.environ.get("GATE_DISTANCE", 15.0)),
    "min_readings": int(os.environ.get("MIN_READINGS", 5)),
    "output_dir": os.environ.get("OUTPUT_DIR", "vehicle_clips"),
    "config_file": os.environ.get("CONFIG_FILE", "roi_config.json"),
    "source": os.environ.get("VIDEO_SOURCE", str(VIDEO_PATH)),
}

# Safety valve: how long the detection loop waits for a writer slot before
# dropping a record instead of freezing the loop forever (which previously
# wedged the whole pipeline behind a saturated write queue).
WRITE_QUEUE_PUT_TIMEOUT = float(os.environ.get("WRITE_QUEUE_PUT_TIMEOUT", "30"))

# Inference device for YOLO (vehicle + plate) and the Keras plate OCR model.
# Falls back to CPU when the requested device isn't available.
INFERENCE_DEVICE = resolve_inference_device()

COLORS = {
    "roi": (0, 255, 255),
    "box": (0, 200, 255),
    "active": (0, 255, 80),
    "gate0": (255, 0, 255),
    "gate1": (0, 255, 255),
}

# ---------------------------------------------------------------------------
# LICENSE PLATE FORMAT VALIDATION
# (HSRP/BH regex + VALID_STATES + safe confusion correction)
# ---------------------------------------------------------------------------
from anpr.plate_validation import validate_plate

# ---------------------------------------------------------------------------
# ONVIF SHUTTER SPEED CONFIG
# ---------------------------------------------------------------------------
ONVIF_CONFIG = {
    "enabled": os.environ.get("ONVIF_ENABLED", "true").lower() == "true",
    "ip": os.environ.get("CAMERA_IP", "192.168.1.213"),
    "port": int(os.environ.get("ONVIF_PORT", "80")),
    "username": os.environ.get("CAMERA_USERNAME", "admin"),
    "password": os.environ.get("CAMERA_PASSWORD", "admin"),
    "exposure_time_us": int(os.environ.get("EXPOSURE_TIME_US", "8000")),
    "gain": float(os.environ.get("CAMERA_GAIN", "20.0")),
    "min_crop_dimension": int(os.environ.get("MIN_CROP_DIMENSION", "200")),
    "timeout_s": float(os.environ.get("ONVIF_TIMEOUT_S", "10")),
}


def _with_timeout(fn, timeout, desc):
    """
    Run fn in a daemon thread and wait up to `timeout` seconds.

    ONVIF (onvif-zeep / SOAP over Zeep) has no socket timeout of its own;
    a camera that accepts TCP but never answers leaves the worker blocked
    forever inside the call. This bounds the wait: on timeout the hung
    daemon thread is abandoned (and dies with the process), while the
    pipeline continues without ONVIF.

    Raises TimeoutError on timeout, otherwise re-raises whatever fn raised,
    or returns fn's value.
    """
    box = {}

    def _runner():
        try:
            box["value"] = fn()
            box["done"] = True
        except Exception as e:  # noqa: BLE001 - propagate through wrapper
            box["error"] = e
            box["done"] = True

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    t.join(timeout)
    if not box.get("done"):
        raise TimeoutError(f"{desc} did not respond within {timeout}s -- skipping ONVIF")
    if "error" in box:
        raise box["error"]
    return box["value"]

# ---------------------------------------------------------------------------
# DAY/NIGHT LIGHTING CONFIG
# Brightness-driven only -- no clock, no hybrid time-window logic.
# Shutter (ExposureTime) is NEVER touched by this -- it stays fixed at
# ONVIF_CONFIG["exposure_time_us"] set once by configure_shutter_speed().
# Only Gain (+ Iris, if the camera supports manual iris) flex between modes.
# ---------------------------------------------------------------------------
LIGHTING_CONFIG = {
    # Brightness check cadence -- lighting doesn't change fast enough to
    # need per-frame checks. Matches the cadence of CONFIG_RELOAD_INTERVAL.
    "check_interval_sec": float(os.environ.get("LIGHT_CHECK_INTERVAL", "8.0")),

    # Percentile used instead of mean -- avoids a few bright headlight
    # pixels skewing the reading upward while the rest of the scene is dark.
    "brightness_percentile": int(os.environ.get("LIGHT_PERCENTILE", "25")),

    # Hysteresis thresholds (0-255 grayscale scale).
    # Must satisfy: day_enter_threshold > night_enter_threshold.
    # TUNE THESE against real dusk/dawn brightness logs from your camera
    # before relying on them in production.
    "night_enter_threshold": float(os.environ.get("NIGHT_ENTER_THRESHOLD", "60.0")),
    "day_enter_threshold": float(os.environ.get("DAY_ENTER_THRESHOLD", "85.0")),

    # Dwell/confirmation: brightness must stay on the "other side" for this
    # many consecutive checks before the mode actually flips. Protects
    # against momentary shadows/headlight flares causing spurious switches.
    "confirm_checks": int(os.environ.get("LIGHT_CONFIRM_CHECKS", "3")),

    # Gain profiles (dB). TUNE the ceiling empirically -- past a certain
    # point, sensor noise degrades OCR accuracy faster than gain helps.
    "day_gain_db": float(os.environ.get("DAY_GAIN_DB", "6.0")),
    "night_gain_db": float(os.environ.get("NIGHT_GAIN_DB", "28.0")),
    "night_gain_ceiling_db": float(os.environ.get("NIGHT_GAIN_CEILING_DB", "36.0")),

    # Iris widening for night -- ONLY applied if manual iris is confirmed
    # supported at startup via GetOptions(). If unsupported, this is a
    # silent no-op and gain alone carries night compensation.
    "day_iris": None,  # None = leave iris untouched / camera auto in day mode
    "night_iris_widen_to_min": True,
}


class LightMode(Enum):
    DAY = "day"
    NIGHT = "night"


def measure_brightness(frame, poly_pts=None, percentile=25):
    """
    Compute a low-percentile grayscale brightness score from the frame,
    optionally restricted to the ROI polygon so out-of-ROI bright spots
    (sky, streetlights outside the lane) don't skew the reading.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    if poly_pts is not None and len(poly_pts) >= 3:
        mask = np.zeros(gray.shape, dtype=np.uint8)
        cv2.fillPoly(mask, [np.array(poly_pts, dtype=np.int32)], 255)
        sample = gray[mask == 255]
        if sample.size == 0:
            sample = gray.flatten()
    else:
        sample = gray.flatten()

    return float(np.percentile(sample, percentile))


class LightingController:
    """
    Owns the day/night state machine and applies ONVIF imaging profiles
    on confirmed transitions only. Shutter speed is deliberately excluded
    from every profile it applies -- only Gain (+ Iris if supported) change.
    """

    def __init__(self, onvif_config, lighting_config=None):
        self.cfg = onvif_config
        self.lcfg = lighting_config or LIGHTING_CONFIG

        self.mode = LightMode.DAY
        self._last_check_time = 0.0
        self._pending_mode = None
        self._pending_count = 0

        self._iris_supported = False
        self._iris_min = None
        self._iris_max = None

        self._imaging = None
        self._token = None

    def initialize(self, initial_frame=None, poly_pts=None):
        """
        Call once after configure_shutter_speed(), ideally once a first
        frame is available. Probes iris support and sets the correct
        STARTING mode immediately (rather than assuming DAY and waiting
        for the first check interval to elapse).
        """
        cfg = self.cfg
        if not cfg.get("enabled", True):
            print("[Lighting] Disabled via ONVIF_ENABLED=false, skipping.")
            return

        try:

            def _probe_iris():
                cam = ONVIFCamera(cfg["ip"], cfg["port"], cfg["username"], cfg["password"])
                media = cam.create_media_service()
                self._imaging = cam.create_imaging_service()
                profile = media.GetProfiles()[0]
                self._token = profile.VideoSourceConfiguration.SourceToken

                options = self._imaging.GetOptions({"VideoSourceToken": self._token})
                iris_opts = getattr(getattr(options, "Exposure", None), "Iris", None)
                if iris_opts is not None and hasattr(iris_opts, "Min"):
                    self._iris_supported = True
                    self._iris_min = iris_opts.Min
                    self._iris_max = iris_opts.Max
                    print(f"[Lighting] Manual iris supported. Range: {self._iris_min}-{self._iris_max}")
                else:
                    print("[Lighting] Manual iris NOT supported on this camera -- gain-only night compensation.")

            _with_timeout(_probe_iris, cfg["timeout_s"], "Camera ONVIF iris probe")
        except Exception as e:
            print(f"[Lighting] Failed to probe iris support: {e}")
            self._iris_supported = False

        if initial_frame is not None:
            brightness = measure_brightness(
                initial_frame, poly_pts, self.lcfg["brightness_percentile"]
            )
            starting_mode = (
                LightMode.NIGHT
                if brightness < self.lcfg["night_enter_threshold"]
                else LightMode.DAY
            )
            print(f"[Lighting] Startup brightness={brightness:.1f} -> mode={starting_mode.value}")
            self.mode = starting_mode
            try:
                _with_timeout(lambda: self._apply_profile(starting_mode), cfg["timeout_s"], "Initial lighting profile apply")
            except Exception as e:
                print(f"[Lighting] Initial profile apply skipped: {e}")
        else:
            try:
                _with_timeout(lambda: self._apply_profile(self.mode), cfg["timeout_s"], "Initial lighting profile apply")
            except Exception as e:
                print(f"[Lighting] Initial profile apply skipped: {e}")

    def check(self, frame, poly_pts=None):
        """
        Call this inside the main loop alongside the existing periodic
        config-reload check. Internally throttled to check_interval_sec,
        so it's safe to call every loop iteration -- it no-ops until due.
        Returns True if a mode transition was applied this call.
        """
        if self._imaging is None:
            return False

        now = time.time()
        if now - self._last_check_time < self.lcfg["check_interval_sec"]:
            return False
        self._last_check_time = now

        brightness = measure_brightness(
            frame, poly_pts, self.lcfg["brightness_percentile"]
        )

        candidate = self._evaluate_candidate(brightness)
        if candidate is None:
            self._pending_mode = None
            self._pending_count = 0
            return False

        if candidate == self._pending_mode:
            self._pending_count += 1
        else:
            self._pending_mode = candidate
            self._pending_count = 1

        print(
            f"[Lighting] brightness={brightness:.1f} candidate={candidate.value} "
            f"confirm={self._pending_count}/{self.lcfg['confirm_checks']}"
        )

        if self._pending_count >= self.lcfg["confirm_checks"] and candidate != self.mode:
            self.mode = candidate
            self._pending_mode = None
            self._pending_count = 0
            try:
                _with_timeout(
                    lambda: self._apply_profile(self.mode),
                    self.cfg["timeout_s"],
                    f"Lighting {self.mode.value} profile apply",
                )
            except Exception as e:
                print(f"[Lighting] {self.mode.value} profile apply failed: {e}")
            return True

        return False

    def _evaluate_candidate(self, brightness):
        if self.mode == LightMode.DAY and brightness < self.lcfg["night_enter_threshold"]:
            return LightMode.NIGHT
        if self.mode == LightMode.NIGHT and brightness > self.lcfg["day_enter_threshold"]:
            return LightMode.DAY
        return None

    def _apply_profile(self, mode: "LightMode"):
        """
        Applies gain (+ iris if supported) for the given mode.
        Shutter speed (ExposureTime) is deliberately NOT included here --
        it stays at whatever configure_shutter_speed() already set at
        pipeline startup.
        """
        if self._imaging is None or self._token is None:
            print("[Lighting] ONVIF imaging service not initialized, skipping apply.")
            return

        gain = (
            self.lcfg["night_gain_db"] if mode == LightMode.NIGHT
            else self.lcfg["day_gain_db"]
        )
        gain = min(gain, self.lcfg["night_gain_ceiling_db"])

        exposure_patch = {"Mode": "MANUAL", "Gain": gain}

        if self._iris_supported and self.lcfg["night_iris_widen_to_min"]:
            if mode == LightMode.NIGHT:
                exposure_patch["Iris"] = self._iris_min
            elif self.lcfg["day_iris"] is not None:
                exposure_patch["Iris"] = self.lcfg["day_iris"]

        try:
            request = self._imaging.create_type("SetImagingSettings")
            request.VideoSourceToken = self._token
            request.ImagingSettings = {"Exposure": exposure_patch}
            self._imaging.SetImagingSettings(request)
            time.sleep(1)  # same settle delay as configure_shutter_speed()
            print(f"[Lighting] Applied {mode.value} profile: gain={gain}dB, "
                  f"iris={'set' if 'Iris' in exposure_patch else 'unchanged'}")
        except Exception as e:
            print(f"[Lighting] Failed to apply {mode.value} profile: {e}")


# ---------------------------------------------------------------------------
# ONVIF SHUTTER SPEED (fixed, set once at startup -- never touched again)
# ---------------------------------------------------------------------------
def configure_shutter_speed():
    """Set manual fast shutter via ONVIF at startup for sharper captures.
    This stays fixed for the entire pipeline run regardless of day/night --
    only Gain/Iris flex via LightingController."""
    cfg = ONVIF_CONFIG
    if not cfg["enabled"]:
        print("[ONVIF] Shutter speed control disabled via ONVIF_ENABLED=false")
        return
    try:

        def _set_shutter():
            cam = ONVIFCamera(cfg["ip"], cfg["port"], cfg["username"], cfg["password"])
            media = cam.create_media_service()
            imaging = cam.create_imaging_service()
            profile = media.GetProfiles()[0]
            token = profile.VideoSourceConfiguration.SourceToken
            request = imaging.create_type("SetImagingSettings")
            request.VideoSourceToken = token
            request.ImagingSettings = {
                "Exposure": {
                    "Mode": "MANUAL",
                    "ExposureTime": cfg["exposure_time_us"],
                    "Gain": cfg["gain"],
                    "Iris": 0.0,
                }
            }
            imaging.SetImagingSettings(request)
            time.sleep(1)

        _with_timeout(_set_shutter, cfg["timeout_s"], "Camera ONVIF shutter set")
        print(f"[ONVIF] Fast shutter set: {cfg['exposure_time_us']}us, gain {cfg['gain']}")
    except Exception as e:
        print(f"[ONVIF] Failed to set shutter: {e}")
        print("[ONVIF] Continuing with camera's current exposure settings.")


def blur_score(frame):
    """Variance of Laplacian — higher = sharper image."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def detect_plate_on_crop(lp_model, vehicle_crop, conf_threshold, device="cpu"):
    """
    Run the plate model ONCE on a single still image — the vehicle's
    best/sharpest captured screenshot — rather than on a live per-frame
    stream. Returns the cropped plate image, or None if nothing was found.
    """
    if vehicle_crop is None or vehicle_crop.size == 0:
        return None
    lp_results = lp_model(vehicle_crop, conf=conf_threshold, verbose=False, device=device)
    if lp_results and lp_results[0].boxes is not None and len(lp_results[0].boxes) > 0:
        boxes = lp_results[0].boxes
        # If multiple plate-like detections come back, pick the one closest
        # to the bottom of the crop (largest y2) — that's the real plate,
        # near the bumper. Anything higher up is more likely a decal,
        # sticker, or reflection the detector false-fired on.
        best_idx = max(range(len(boxes)), key=lambda i: float(boxes[i].xyxy[0][3]))
        lp_box = boxes[best_idx]
        lx1, ly1, lx2, ly2 = map(int, lp_box.xyxy[0].tolist())
        # Expand the box ~6% so YOLO's edge regression error never clips
        # the last character before OCR sees it.
        h, w = vehicle_crop.shape[:2]
        pad_w = int((lx2 - lx1) * 0.09)
        pad_h = int((ly2 - ly1) * 0.09)
        lx1 = max(0, lx1 - pad_w)
        ly1 = max(0, ly1 - pad_h)
        lx2 = min(w, lx2 + pad_w)
        ly2 = min(h, ly2 + pad_h)
        lp_crop = vehicle_crop[ly1:ly2, lx1:lx2]
        if lp_crop.size > 0 and lp_crop.shape[0] > 15 and lp_crop.shape[1] > 30:
            return lp_crop.copy()
    return None


# ---------------------------------------------------------------------------
# JSON CONFIG
# ---------------------------------------------------------------------------
def _clamp_gate_distance(dist):
    """Clamp gate distance to a reasonable range (1–100 meters)."""
    try:
        d = float(dist)
        return max(1.0, min(100.0, d))
    except (TypeError, ValueError):
        return 15.0


def load_config_json(path):
    if not os.path.exists(path):
        return None, None
    with open(path) as f:
        data = json.load(f)
    roi = data.get("roi")
    gates = data.get("speed_gates")
    dist = data.get("gate_distance_meters")
    PIPELINE_CONFIG["gate_distance_meters"] = _clamp_gate_distance(dist if dist is not None else 15.0)
    print(f"[Config] Loaded ROI ({len(roi)} pts) and {len(gates)} gates (gate_distance={PIPELINE_CONFIG['gate_distance_meters']}m)")
    return roi, gates


def save_config_json(path, roi, speed_gates):
    data = {
        "roi": roi,
        "speed_gates": speed_gates,
        "gate_distance_meters": PIPELINE_CONFIG["gate_distance_meters"],
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[Config] Saved to {path}")

# ---------------------------------------------------------------------------
# INTERACTIVE SETUP
# ---------------------------------------------------------------------------
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
        return int(w * scale), int(h * scale)

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
            print(f"  Gate pt {len(self._current_clicks)}: ({ox}, {oy})")
            if len(self._current_clicks) == 2:
                self.gates.append(self._current_clicks[:])
                self._current_clicks = []
                if self.mode == "gate0":
                    self.mode = "gate1"
                    print("  Now draw Gate 1 (exit). Click 2 pts.")
                else:
                    self.mode = "done"
                    print("  All gates drawn!")

    def run(self):
        window = "Setup: Draw ROI + Speed Gates"
        cv2.namedWindow(window, cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(window, self.mouse_callback)
        cv2.resizeWindow(window, *self.display_size)
        instructions = [
            ("ROI: Left-click, 'c' to close polygon", (0, 255, 255)),
            ("Gate 0 (entry) then Gate 1 (exit) — 2 clicks each", (255, 0, 255)),
            ("'r' reset | 's' save & start | 'q' quit", (0, 255, 0)),
        ]
        print("\n=== INTERACTIVE SETUP ===")
        print("Step 1: Draw ROI polygon (left-click, 'c' to close)")
        print("Step 2: Gate 0 (entry) — 2 clicks")
        print("Step 3: Gate 1 (exit) — 2 clicks")
        print("'s' save, 'r' reset, 'q' quit\n")
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
                disp_pts = np.array([self._to_disp(p[0], p[1]) for p in self.roi_points], dtype=np.int32)
                overlay = vis.copy()
                cv2.fillPoly(overlay, [disp_pts], (0, 255, 255))
                cv2.addWeighted(overlay, 0.15, vis, 0.85, 0, vis)
                cv2.polylines(vis, [disp_pts], True, (0, 255, 255), 2)
            for gi, gate in enumerate(self.gates):
                color = COLORS["gate0"] if gi == 0 else COLORS["gate1"]
                dp1 = self._to_disp(gate[0][0], gate[0][1])
                dp2 = self._to_disp(gate[1][0], gate[1][1])
                cv2.line(vis, dp1, dp2, color, 2)
                cv2.putText(vis, f"Gate {gi}", ((dp1[0] + dp2[0]) // 2, (dp1[1] + dp2[1]) // 2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            for cp in self._current_clicks:
                dp = self._to_disp(cp[0], cp[1])
                cv2.circle(vis, dp, 5, (0, 0, 255), -1)
            y_off = 25
            for text, color in instructions:
                cv2.putText(vis, text, (10, y_off), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                y_off += 25
            mode_text = {
                "roi": "MODE: Draw ROI ('c' to close)",
                "gate0": "MODE: Gate 0 — ENTRY line (2 clicks)",
                "gate1": "MODE: Gate 1 — EXIT line (2 clicks)",
                "done": "DONE — press 's' to save & start",
            }
            cv2.putText(vis, mode_text[self.mode], (10, y_off + 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            cv2.imshow(window, vis)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("c") and self.mode == "roi" and len(self.roi_points) >= 3:
                self.mode = "gate0"
                print("ROI closed. Draw Gate 0 (entry).")
            elif key == ord("r"):
                self.roi_points = []; self.gates = []; self._current_clicks = []; self.mode = "roi"
                print("Reset.")
            elif key == ord("s") and len(self.roi_points) >= 3 and len(self.gates) == 2:
                cv2.destroyWindow(window); return self.roi_points, self.gates
            elif key == ord("q"):
                cv2.destroyWindow(window); return None, None
        cv2.destroyWindow(window)
        return self.roi_points, self.gates

# ---------------------------------------------------------------------------
# UTILS
# ---------------------------------------------------------------------------
def get_timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]


def get_last_vehicle_id(video_dir):
    max_id = 0
    if not os.path.exists(video_dir):
        return 0
    pattern = re.compile(r"vehicle_(\d+)_")
    for fn in os.listdir(video_dir):
        m = pattern.search(fn)
        if m:
            try:
                num = int(m.group(1))
                if num > max_id:
                    max_id = num
            except ValueError:
                continue
    return max_id


def roi_to_np(roi):
    return np.array(roi, dtype=np.int32)


def box_overlap_polygon(x1, y1, x2, y2, poly_pts):
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    w, h = x2 - x1, y2 - y1
    pts = [
        (cx, cy),
        (x1 + w * 0.25, y1 + h * 0.25),
        (x1 + w * 0.75, y1 + h * 0.25),
        (x1 + w * 0.25, y1 + h * 0.75),
        (x1 + w * 0.75, y1 + h * 0.75),
    ]
    hits = 0
    poly_r = poly_pts.reshape(-1, 1, 2)
    for px, py in pts:
        if cv2.pointPolygonTest(poly_r, (float(px), float(py)), False) >= 0:
            hits += 1
    return hits / len(pts)


def segments_intersect(A, B, C, D):
    def ccw(A, B, C):
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)


def extend_segment(p1, p2, extension=5000):
    """Stretch the line through p1->p2 by `extension` px past each endpoint,
    same position/orientation, just effectively infinite for intersection
    testing. Used only for the gate-crossing test -- draw_speed_gates still
    renders the original, as-configured endpoints. Guards against gate lines
    that were drawn short in the setup UI and don't span the full lane/ROI
    width vehicles actually travel through, which silently drops any vehicle
    whose track never happens to cross the literal drawn segment.
    """
    x1, y1 = p1
    x2, y2 = p2
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length == 0:
        return p1, p2
    ux, uy = dx / length, dy / length
    return (
        (x1 - ux * extension, y1 - uy * extension),
        (x2 + ux * extension, y2 + uy * extension),
    )


def draw_polygon_roi(frame, poly_pts):
    if poly_pts is None or len(poly_pts) < 3:
        return
    overlay = frame.copy()
    pts = np.array(poly_pts, dtype=np.int32)
    cv2.fillPoly(overlay, [pts], (0, 255, 255))
    cv2.addWeighted(overlay, 0.10, frame, 0.90, 0, frame)
    cv2.polylines(frame, [poly_pts], True, COLORS["roi"], 2)


def draw_speed_gates(frame, gates):
    if gates is None or len(gates) < 2:
        return
    for i, gate in enumerate(gates):
        color = COLORS["gate0"] if i == 0 else COLORS["gate1"]
        p1, p2 = tuple(gate[0]), tuple(gate[1])
        cv2.line(frame, p1, p2, color, 2)
        mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2 - 8)
        cv2.putText(frame, f"Gate {i}", mid, cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)


def crop_bbox(frame, bbox, pad=6):
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    x1 = max(0, x1 - pad); y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad); y2 = min(h, y2 + pad)
    return frame[y1:y2, x1:x2]

# ---------------------------------------------------------------------------
# THREADS
# ---------------------------------------------------------------------------
class CaptureThread(threading.Thread):
    def __init__(self, source, frame_q):
        super().__init__(daemon=True)
        self.source = source
        self.frame_q = frame_q
        self.stopped = threading.Event()
        self.connected = threading.Event()
        self._cap = None
        self.fps = 25.0
        self.measured_fps = 25.0
        self._fps_counter = 0
        self._fps_t0 = 0.0

    def _open_capture(self):
        if isinstance(self.source, str) and self.source.lower().startswith("rtsp://"):
            # stimeout (us) bounds ffmpeg's socket read — without it, a
            # frozen/half-dead RTSP stream makes cap.read() block forever,
            # the thread stays "alive" doing nothing, and no health check
            # (thread, process, or orchestrator) can ever detect it.
            stimeout_us = int(os.environ.get("RTSP_SOCKET_TIMEOUT_US", "8000000"))
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                f"rtsp_transport;tcp|stimeout;{stimeout_us}"
            )
        cap = cv2.VideoCapture(self.source)
        # Belt-and-suspenders: OpenCV-level timeouts (FFMPEG backend,
        # OpenCV >= 4.5.3). Older builds silently ignore unknown props.
        try:
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 15000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 8000)
        except Exception:
            pass
        return cap

    def run(self):
        retries = 0
        max_retries = int(os.environ.get("RTSP_RETRIES", "0"))
        reconnect_sec = int(os.environ.get("RTSP_RECONNECT_SEC", "5"))
        while not self.stopped.is_set():
            self._cap = self._open_capture()
            if not self._cap or not self._cap.isOpened():
                self.stopped.wait(reconnect_sec)
                retries += 1
                if 0 < max_retries < retries:
                    break
                continue
            self.fps = self._cap.get(cv2.CAP_PROP_FPS) or 25.0
            print(f"[CaptureThread] Source opened (FPS: {self.fps:.1f})")
            retries = 0
            self._fps_counter = 0
            self._fps_t0 = time.time()
            while not self.stopped.is_set():
                ret, frame = self._cap.read()
                if not ret:
                    self._cap.release(); self._cap = None
                    self.stopped.wait(reconnect_sec)
                    break
                self._fps_counter += 1
                elapsed = time.time() - self._fps_t0
                if elapsed >= 5.0:
                    self.measured_fps = self._fps_counter / elapsed
                    self._fps_counter = 0
                    self._fps_t0 = time.time()
                try:
                    self.frame_q.put(frame, timeout=1)
                    if not self.connected.is_set():
                        self.connected.set()
                except queue.Full:
                    pass
        if self._cap:
            self._cap.release()
        print("[CaptureThread] Stopped.")

    def close(self):
        self.stopped.set()
        if self._cap:
            self._cap.release()


def _find_ffmpeg():
    """Return a usable ffmpeg executable path, or None.

    Resolution order:
      1. system 'ffmpeg' on PATH
      2. the binary bundled with the imageio-ffmpeg pip package
    """
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return None


def _transcode_h264(src):
    """Transcode an OpenCV mp4v clip to browser-playable H.264.

    OpenCV's 'mp4v' output (MPEG-4 Part 2) cannot be decoded by Chrome,
    Firefox or Safari, so every clip must be re-encoded to H.264 before
    upload. Returns the path of the transcoded file on success, or None
    (with a logged reason) on failure -- failures are never silent.
    """
    exe = _find_ffmpeg()
    if not exe:
        print(
            "[Video] No ffmpeg found - cannot convert to H.264. "
            "Install it with `sudo apt install ffmpeg` or "
            "`pip install imageio-ffmpeg`. Clipping left un-converted "
            "and may not play in browsers."
        )
        return None

    dst = src.replace(".mp4", "_h264.mp4")
    cmd = [
        exe, "-y",
        "-i", src,
        "-c:v", "libx264",
        "-profile:v", "main",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "26",
        "-threads", "2",
        "-movflags", "+faststart",
        "-an",
        dst,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        print(f"[Video] ffmpeg binary missing ({exe}). Clipping left un-converted.")
        return None
    except subprocess.TimeoutExpired:
        print("[Video] ffmpeg H.264 conversion timed out.")
        return None

    if proc.returncode != 0:
        print(f"[Video] ffmpeg H.264 conversion FAILED (rc={proc.returncode}):")
        for line in proc.stderr.splitlines()[-5:]:
            print(f"  {line}")
        return None

    if not os.path.exists(dst):
        print("[Video] ffmpeg reported success but produced no output file.")
        return None

    print(f"[Video] Transcoded to H.264: {Path(dst).name} ({exe})")
    return dst


class WriterThread(threading.Thread):
    def __init__(self, write_q):
        super().__init__(daemon=True)
        self.write_q = write_q
        self.stopped = threading.Event()

    def run(self):
        while not self.stopped.is_set():
            try:
                task = self.write_q.get(timeout=0.5)
                if task is None:
                    break
                task()
            except queue.Empty:
                continue
            except Exception as e:  # noqa: BLE001 - never kill the writer thread
                traceback.print_exc()
                print(
                    f"[Writer] Task failed and was skipped ({e}). "
                    "Writer thread stays alive so the pipeline keeps flowing."
                )

# ---------------------------------------------------------------------------
# VEHICLE TRACK
# ---------------------------------------------------------------------------
MAX_BUFFER_FRAMES = 150
# Shared byte budget for all buffered track clips. Frames are downscaled to
# half resolution at buffer time (same size the writer ends up writing), which
# cuts peak memory ~4x; this budget additionally bounds the total even under
# many simultaneous or lingering tracks.
TRACK_BUFFER_BUDGET_MB = float(os.environ.get("TRACK_BUFFER_BUDGET_MB", "320"))


class VehicleTrack:
    def __init__(self, tid, name, fps, size, grace, vehicle_type, class_id):
        self.tid = tid
        self.name = name
        self.fps = fps
        self.size = size
        self.grace_frames = grace
        self.vehicle_type = vehicle_type
        self.class_id = class_id
        self.entry_time_dt = datetime.now()
        self.in_roi = True
        self.absent_frames = 0
        self.frame_count = 0
        self.best_crop = None
        self.best_area = 0.0
        self.best_blur_score = -1.0
        self.plate_crop = None
        self.plate_text = None
        self.plate_raw = None
        self.position_history = []
        self.entry_gate_info = None
        self.last_pos = None
        self.first_pos = None
        self.speed_kmh = None
        self.reported = False
        self.min_readings = PIPELINE_CONFIG["min_readings"]
        self.frame_buffer = []
        self.frame_buffer_ts = []
        # self._frame_buffer_bytes = 0
        self.video_path = None

    def buffer_frame(self, vis_frame, t=None):
        if len(self.frame_buffer) >= MAX_BUFFER_FRAMES:
            return
        h, w = vis_frame.shape[:2]
        # Store half-resolution copies instead of full annotated frames — the
        # output clip is the same size the writer produced before, but memory
        # per buffered frame drops ~4x and write_video no longer re-resizes.
        if h >= 480:
            scaled = cv2.resize(
                vis_frame, (w // 2, h // 2), interpolation=cv2.INTER_AREA
            )
        else:
            scaled = vis_frame.copy()
        self.frame_buffer.append(scaled)
        self.frame_buffer_ts.append(t if t is not None else time.time())

    def clear_buffer(self):
        self.frame_buffer.clear()
        self.frame_buffer_ts.clear()

    def write_video(self, output_dir):
        if len(self.frame_buffer) < 5:
            return None

        # Frames are already downscaled at buffer time — write them as-is.
        h, w = self.frame_buffer[0].shape[:2]
        nw, nh = w, h

        fname = f"vehicle_{self.name}_{get_timestamp()}.mp4"
        path = str(Path(output_dir) / fname)

        # Calculate actual time represented by buffered frames
        if len(self.frame_buffer_ts) >= 2:
            start_ts = self.frame_buffer_ts[0]
            end_ts = self.frame_buffer_ts[-1]
            duration = end_ts - start_ts

            if duration > 0:
                real_fps = (len(self.frame_buffer) - 1) / duration
            else:
                real_fps = self.fps or 25.0
        else:
            real_fps = self.fps or 25.0

        # Prevent extreme FPS values
        real_fps = max(1.0, min(real_fps, 30.0))

        print(
            f"[Video] Vehicle {self.name}: "
            f"frames={len(self.frame_buffer)}, "
            f"duration={duration:.2f}s, "
            f"fps={real_fps:.2f}"
        )

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")

        writer = cv2.VideoWriter(
            path,
            fourcc,
            real_fps,
            (nw, nh)
        )

        for frame in self.frame_buffer:
            resized = cv2.resize(frame, (nw, nh))
            writer.write(resized)

        writer.release()

        # Convert to H.264 (browsers can't play OpenCV's mp4v output).
        # _transcode_h264 logs why on failure and returns None, so the
        # mp4v clip is kept but operators see the reason it won't play.
        h264 = _transcode_h264(path)
        if h264:
            os.replace(h264, path)

        self.video_path = path

        # Clear both buffers
        self.frame_buffer.clear()
        self.frame_buffer_ts.clear()

        return path

    def mark_present(self, frame, area, x1, y1, x2, y2):
        """
        Track the best screenshot for this vehicle. 'Best' = largest area —
        this is the frame plate detection will run on later (once, at report
        time), so we also record its sharpness for logging/diagnostics.
        """
        self.in_roi = True
        self.absent_frames = 0
        self.frame_count += 1
        if area > self.best_area:
            h, w = frame.shape[:2]
            cx1, cy1 = max(0, x1), max(0, y1)
            cx2, cy2 = min(w, x2), min(h, y2)
            candidate = frame[cy1:cy2, cx1:cx2]
            if candidate.size > 0:
                self.best_area = area
                self.best_crop = candidate.copy()
                self.best_blur_score = blur_score(candidate)

    def update_speed(self, cx, cy, t, gates):
        curr = (cx, cy)
        if self.first_pos is None:
            self.first_pos = curr
        if self.position_history:
            prev = self.position_history[-1]
            for gi, gate in enumerate(gates):
                g1, g2 = extend_segment(gate[0], gate[1])
                if segments_intersect(prev, curr, g1, g2):
                    if self.entry_gate_info is None:
                        if gi == 0:
                            # Only gate 0 can open the timer. A crossing of
                            # gate 1 before gate 0 has been seen is ignored --
                            # this enforces the gate0 -> gate1 direction of
                            # travel instead of accepting either gate as the
                            # entry point.
                            self.entry_gate_info = {"t": t, "g": gi}
                    elif self.entry_gate_info["g"] != gi and self.speed_kmh is None:
                        dt = t - self.entry_gate_info["t"]
                        if dt > 0:
                            self.speed_kmh = (PIPELINE_CONFIG["gate_distance_meters"] / dt) * 3.6
        self.position_history.append(curr)
        if len(self.position_history) > 6:
            self.position_history.pop(0)
        self.last_pos = curr

    def mark_absent(self):
        self.in_roi = False
        self.absent_frames += 1
        return self.absent_frames >= self.grace_frames

# ---------------------------------------------------------------------------
# PIPELINE
# ---------------------------------------------------------------------------
def run_pipeline(roi_pts, speed_gates, camera_id=None, gate_distance_meters=None):
    # Explicit gate distance from the caller (orchestrator / DB) wins over the
    # import-time env default. Keeps speed calculation honest when the DB and
    # the .env disagree without mutating os.environ after import.
    if gate_distance_meters is not None:
        PIPELINE_CONFIG["gate_distance_meters"] = _clamp_gate_distance(gate_distance_meters)
        print(
            f"[Pipeline] Gate distance set to "
            f"{PIPELINE_CONFIG['gate_distance_meters']}m (from caller)"
        )

    out_dir = Path(PIPELINE_CONFIG["output_dir"])
    s_dir = out_dir / "screenshots"
    lp_dir = out_dir / "license_plates"
    v_dir = out_dir / "videos"
    for d in [s_dir, lp_dir, v_dir]:
        d.mkdir(parents=True, exist_ok=True)

    configure_shutter_speed()  # fixed shutter, set once, never touched again

    v_counter = get_last_vehicle_id(str(out_dir))
    print(f"[Pipeline] Starting from vehicle ID: {v_counter}")

    frame_q = queue.Queue(maxsize=PIPELINE_CONFIG["frame_queue_size"])
    write_q = queue.Queue(maxsize=PIPELINE_CONFIG["write_queue_size"])

    model = YOLO(MODEL_PATH)
    lp_model = YOLO(PLATE_MODEL_PATH)

    # ---------------------------------------------------------------
    # Build vehicle class map from config.py's VEHICLE_CLASSES,
    # resolved against the loaded model's own COCO id->name dict.
    # No hardcoded id table — edit VEHICLE_CLASSES in config.py to
    # change which vehicle types get tracked.
    # ---------------------------------------------------------------
    VEHICLE_CLASS_MAP = {
        cls_id: name for cls_id, name in model.names.items()
        if name in VEHICLE_CLASSES
    }
    if not VEHICLE_CLASS_MAP:
        raise ValueError(
            f"[Pipeline] None of VEHICLE_CLASSES={VEHICLE_CLASSES} "
            f"matched model.names={list(model.names.values())}"
        )
    print(f"[Pipeline] Vehicle classes: {list(VEHICLE_CLASS_MAP.values())}")

    plate_ocr = None
    try:
        plate_ocr = PlateOCR(
            PLATE_OCR_MODEL_PATH, PLATE_OCR_CONFIG_PATH, device=INFERENCE_DEVICE
        )
    except Exception as e:
        print(f"[Pipeline] Plate OCR unavailable, vehicle plates will be skipped: {e}")
    src = PIPELINE_CONFIG["source"]
    if isinstance(src, str) and src.isdigit():
        src = int(src)
    cap_thread = CaptureThread(src, frame_q)
    cap_thread.start()

    print("[Pipeline] Waiting for first frame...")
    if not cap_thread.connected.wait(timeout=30):
        print("[Pipeline] Timed out.")
        return
    print("[Pipeline] Connected.")

    fps = cap_thread.fps
    size = (int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap_thread._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

    from redis_client import RedisBroker
    redis_broker = RedisBroker()
    if camera_id:
        redis_broker.update_fps(camera_id, cap_thread.measured_fps)
        print(f"[Pipeline] Camera reported FPS: {fps:.1f}, measured: {cap_thread.measured_fps:.1f} (published to Redis)")

    writer_threads = [WriterThread(write_q) for _ in range(PIPELINE_CONFIG["num_writer_threads"])]
    for wt in writer_threads:
        wt.start()

    poly_pts = roi_to_np(roi_pts)
    gates = speed_gates
    print(
        f"[Pipeline] Frame size: {size[0]}x{size[1]}"
    )
    print(
        f"[Pipeline] ROI polygon points: {[tuple(p) for p in poly_pts.reshape(-1, 2).tolist()]}"
    )
    for gi, gate in enumerate(gates):
        print(f"[Pipeline] Gate {gi} endpoints: {tuple(gate[0])} -> {tuple(gate[1])}")
    active_tracks = {}
    pipeline_start = time.time()
    last_config_reload = 0
    CONFIG_RELOAD_INTERVAL = 5.0
    last_publish_time = 0.0
    PUBLISH_INTERVAL = 0.1
    last_heartbeat_time = 0.0
    HEARTBEAT_INTERVAL = 3.0  # well under Redis heartbeat TTL (30s)

    # ---------------------------------------------------------------
    # DAY/NIGHT LIGHTING CONTROLLER
    # Probe iris support + seed the correct starting mode using the
    # first available frame, before entering the main loop. Shutter
    # stays fixed (set above); only gain/iris flex from here on.
    # ---------------------------------------------------------------
    lighting = LightingController(ONVIF_CONFIG, LIGHTING_CONFIG)
    seed_frame = None
    try:
        seed_frame = frame_q.get(timeout=5)
    except queue.Empty:
        seed_frame = None
    lighting.initialize(initial_frame=seed_frame, poly_pts=poly_pts)

    # Backend client
    backend = BackendClient()
    try:
        backend.login()
        print(f"[Pipeline] Backend: {backend.base_url}")
    except Exception as e:
        print(f"[Pipeline] Backend login failed: {e}")

    while not cap_thread.stopped.is_set():
        try:
            frame = frame_q.get(timeout=5)
        except queue.Empty:
            if not cap_thread.is_alive():
                break
            continue
        if frame is None:
            break

        # Drain stale frames — always process the latest to stay real-time
        while not frame_q.empty() and not cap_thread.stopped.is_set():
            try:
                frame = frame_q.get_nowait()
            except queue.Empty:
                break

        t = time.time() - pipeline_start

        # Heartbeat — proves frames are actually flowing through the loop,
        # not just that the process/thread objects still exist. Orchestrator
        # treats a missing/expired key as "stuck", even if OS-level checks
        # say alive.
        if camera_id:
            now_hb = time.time()
            if now_hb - last_heartbeat_time >= HEARTBEAT_INTERVAL:
                try:
                    redis_broker.heartbeat(camera_id)
                except Exception:
                    pass
                last_heartbeat_time = now_hb

        try:
            vis = frame.copy()
            draw_polygon_roi(vis, poly_pts)
            draw_speed_gates(vis, gates)

            # Periodic brightness check -- self-throttled internally to
            # LIGHTING_CONFIG["check_interval_sec"], so calling every loop
            # iteration is cheap and safe. Only fires an ONVIF call on a
            # confirmed transition.
            lighting.check(frame, poly_pts)

            results = model.track(
                frame, persist=True, tracker=PIPELINE_CONFIG["tracker"],
                conf=PIPELINE_CONFIG["conf"],
                iou=PIPELINE_CONFIG["iou"], verbose=False, device=INFERENCE_DEVICE,
                classes=list(VEHICLE_CLASS_MAP.keys()),
            )
            detected_in_roi = set()
            class_map = VEHICLE_CLASS_MAP

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
                            v_type = class_map.get(cls_id, "unknown")
                            active_tracks[tid] = VehicleTrack(
                                tid, f"{v_counter:03d}", fps, size,
                                PIPELINE_CONFIG["grace_frames"], v_type, cls_id,
                            )

                        vt = active_tracks[tid]
                        vt.mark_present(frame, (x2 - x1) * (y2 - y1), x1, y1, x2, y2)

                        cx, cy = (x1 + x2) // 2, y2
                        vt.update_speed(cx, cy, t, gates)

                        # Defer all I/O (plate detection on the best screenshot,
                        # video write, backend submit, screenshot save) to the
                        # writer thread — nothing plate-related runs in this
                        # hot per-frame loop anymore.
                        if not vt.reported and vt.speed_kmh is not None and vt.frame_count >= vt.min_readings:
                            vt.reported = True
                            def _report_task(vt_ref=vt, b_ref=backend, v_ref=v_dir, cid=camera_id, lpm=lp_model, ocr=plate_ocr):
                                # Plate detection runs ONCE here, on the writer
                                # thread, against the vehicle's best (largest +
                                # sharpest-tracked) screenshot — not per-frame.
                                print(
                                    f"[Pipeline] Report task started for track {vt_ref.name} "
                                    f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h, "
                                    f"frame_count={vt_ref.frame_count})"
                                )
                                if vt_ref.best_crop is not None:
                                    vt_ref.plate_crop = detect_plate_on_crop(
                                        lpm, vt_ref.best_crop, CONFIDENCE_THRESHOLD, device=INFERENCE_DEVICE
                                    )
                                    print(
                                        f"[Plate] Track {vt_ref.name}: screenshot blur score "
                                        f"{vt_ref.best_blur_score:.1f} (higher = sharper), "
                                        f"plate {'found' if vt_ref.plate_crop is not None else 'not found'}"
                                    )
                                else:
                                    print(
                                        f"[Plate] Track {vt_ref.name}: no screenshot captured "
                                        "(best_crop is None) -- skipping plate detection"
                                    )
                                if vt_ref.plate_text is None and vt_ref.plate_crop is not None and ocr is not None:
                                    text, raw, probs = ocr.read(vt_ref.plate_crop)
                                    valid, plate, was_corrected = validate_plate(text, probs)
                                    if valid:
                                        vt_ref.plate_text = plate
                                        vt_ref.plate_raw = raw if was_corrected else None
                                    else:
                                        vt_ref.plate_text = None
                                        vt_ref.plate_raw = raw
                                    print(
                                        f"[Plate] Track {vt_ref.name}: fast OCR -> "
                                        f"'{vt_ref.plate_text or ''}'"
                                        f"{' (corrected)' if was_corrected else ''}"
                                        f"{'' if vt_ref.plate_text else ' (invalid format, skipped)'}"
                                    )
                                video_path = vt_ref.write_video(str(v_ref))
                                if video_path is None:
                                    print(
                                        f"[Pipeline] Track {vt_ref.name}: write_video returned None "
                                        f"(buffered frames={len(vt_ref.frame_buffer)}, need >= 5) "
                                        "-- record will be saved WITHOUT video"
                                    )
                                try:
                                    result = b_ref.create_vehicle_record(
                                        vehicle_type=vt_ref.vehicle_type,
                                        license_plate_text=vt_ref.plate_text or None,
                                        license_plate_raw_ocr=vt_ref.plate_raw or None,
                                        speed=vt_ref.speed_kmh,
                                        camera_id=cid,
                                        screenshot=vt_ref.best_crop,
                                        plate_crop=vt_ref.plate_crop,
                                        video_path=video_path,
                                    )
                                except Exception as e:
                                    print(f"[Pipeline] Failed to report track {vt_ref.name}: {e}")
                                    result = None
                                if result:
                                    print(
                                        f"[Pipeline] Reported track {vt_ref.name} "
                                        f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h, "
                                        f"plate='{vt_ref.plate_text}')"
                                    )
                                    if video_path and os.path.exists(video_path):
                                        os.remove(video_path)
                                else:
                                    # create_vehicle_record returned falsy WITHOUT raising --
                                    # this is the silent-failure case: no exception was thrown
                                    # above, so without this branch nothing is ever printed and
                                    # the vehicle record is simply not saved with no trace.
                                    print(
                                        f"[Pipeline] create_vehicle_record returned no result for "
                                        f"track {vt_ref.name} -- backend accepted the call but "
                                        f"reported nothing saved (result={result!r}). Record NOT "
                                        "saved to DB."
                                    )
                            try:
                                write_q.put(_report_task, timeout=WRITE_QUEUE_PUT_TIMEOUT)
                            except queue.Full:
                                print(
                                    f"[Pipeline] Write queue saturated for {WRITE_QUEUE_PUT_TIMEOUT}s; "
                                    f"dropping record for track {vt.name} to keep the detection "
                                    "loop from freezing"
                                )

                        label = f"ID {vt.name} [{vt.vehicle_type}]"
                        if vt.speed_kmh is not None:
                            label += f" {vt.speed_kmh:.1f} km/h"
                        if vt.plate_text:
                            label += f" [{vt.plate_text}]"
                        cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["active"], 2)
                        cv2.putText(vis, label, (x1, y1 - 8),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS["active"], 2)
                        vt.buffer_frame(vis, time.time())
                    else:
                        cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["box"], 1)

            # Clean up lost tracks
            for tid, vt in list(active_tracks.items()):
                if tid not in detected_in_roi and vt.mark_absent():
                    if not vt.reported and vt.speed_kmh is not None and vt.frame_count >= vt.min_readings:
                        vt.reported = True
                        def _report_lost_task(vt_ref=vt, b_ref=backend, v_ref=v_dir, cid=camera_id, lpm=lp_model, ocr=plate_ocr):
                            # Same deferred, once-only plate detection as the
                            # normal report path, run on the best screenshot.
                            print(
                                f"[Pipeline] Report task started for lost track {vt_ref.name} "
                                f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h, "
                                f"frame_count={vt_ref.frame_count})"
                            )
                            if vt_ref.best_crop is not None:
                                vt_ref.plate_crop = detect_plate_on_crop(
                                    lpm, vt_ref.best_crop, CONFIDENCE_THRESHOLD, device=INFERENCE_DEVICE
                                )
                                print(
                                    f"[Plate] Track {vt_ref.name}: screenshot blur score "
                                    f"{vt_ref.best_blur_score:.1f} (higher = sharper), "
                                    f"plate {'found' if vt_ref.plate_crop is not None else 'not found'}"
                                )
                                if vt_ref.plate_text is None and vt_ref.plate_crop is not None and ocr is not None:
                                    text, raw, probs = ocr.read(vt_ref.plate_crop)
                                    valid, plate, was_corrected = validate_plate(text, probs)
                                    if valid:
                                        vt_ref.plate_text = plate
                                        vt_ref.plate_raw = raw if was_corrected else None
                                    else:
                                        vt_ref.plate_text = None
                                        vt_ref.plate_raw = raw
                                    print(
                                        f"[Plate] Track {vt_ref.name}: fast OCR -> "
                                        f"'{vt_ref.plate_text or ''}'"
                                        f"{' (corrected)' if was_corrected else ''}"
                                        f"{'' if vt_ref.plate_text else ' (invalid format, skipped)'}"
                                    )
                            else:
                                print(
                                    f"[Plate] Track {vt_ref.name}: no screenshot captured "
                                    "(best_crop is None) -- skipping plate detection"
                                )
                            video_path = vt_ref.write_video(str(v_ref))
                            if video_path is None:
                                print(
                                    f"[Pipeline] Track {vt_ref.name}: write_video returned None "
                                    f"(buffered frames={len(vt_ref.frame_buffer)}, need >= 5) "
                                    "-- record will be saved WITHOUT video"
                                )
                            try:
                                result = b_ref.create_vehicle_record(
                                    vehicle_type=vt_ref.vehicle_type,
                                    license_plate_text=vt_ref.plate_text or None,
                                    license_plate_raw_ocr=vt_ref.plate_raw or None,
                                    speed=vt_ref.speed_kmh,
                                    camera_id=cid,
                                    screenshot=vt_ref.best_crop,
                                    plate_crop=vt_ref.plate_crop,
                                    video_path=video_path,
                                )
                                if result:
                                    print(
                                        f"[Pipeline] Reported lost track {vt_ref.name} "
                                        f"({vt_ref.vehicle_type}, {vt_ref.speed_kmh:.1f} km/h)"
                                    )
                                    if video_path and os.path.exists(video_path):
                                        os.remove(video_path)
                                else:
                                    # Same silent-failure case as the present-track report
                                    # path: no exception raised, but nothing was saved.
                                    print(
                                        f"[Pipeline] create_vehicle_record returned no result for "
                                        f"lost track {vt_ref.name} -- backend accepted the call "
                                        f"but reported nothing saved (result={result!r}). Record "
                                        "NOT saved to DB."
                                    )
                            except Exception as e:
                                print(f"[Pipeline] Failed to report lost track {vt_ref.name}: {e}")
                        try:
                            write_q.put(_report_lost_task, timeout=WRITE_QUEUE_PUT_TIMEOUT)
                        except queue.Full:
                            print(
                                f"[Pipeline] Write queue saturated for {WRITE_QUEUE_PUT_TIMEOUT}s; "
                                f"dropping record for lost track {vt_ref.name} to keep the "
                                "detection loop from freezing"
                            )
                    elif not vt.reported:
                        # Never crossed two distinct gates (or too few frames
                        # to trust) -- speed is required, so this track is not
                        # reportable.
                        gates_crossed = 0 if vt.entry_gate_info is None else 1
                        print(
                            f"[Pipeline] Dropping track {vt.name} ({vt.vehicle_type}): "
                            f"no speed computed after {vt.frame_count} frames -- "
                            f"gates_crossed={gates_crossed} "
                            f"(entry_gate_info={vt.entry_gate_info}), "
                            f"first_pos={vt.first_pos}, last_pos={vt.last_pos} -- not reportable"
                        )
                        vt.clear_buffer()
                    active_tracks.pop(tid)

            # Publish frame to Redis (for Live.jsx via backend WS) — throttled
            if camera_id:
                        now = time.time()
                        if now - last_publish_time >= PUBLISH_INTERVAL:
                            ph, pw = vis.shape[:2]
                            if pw > 960:
                                vis_pub = cv2.resize(vis, (960, int(ph * 960 / pw)),
                                                    interpolation=cv2.INTER_AREA)
                            else:
                                vis_pub = vis
                            _, buf = cv2.imencode(".jpg", vis_pub, [cv2.IMWRITE_JPEG_QUALITY, 50])
                            redis_broker.update_frame(camera_id, buf.tobytes())
                            last_publish_time = now

            # Periodically reload zone config from backend
            if time.time() - last_config_reload > CONFIG_RELOAD_INTERVAL:
                last_config_reload = time.time()
                try:
                    zones = backend.get_zones(active_only=True, camera_id=camera_id)
                    new_roi = None
                    new_gates = None
                    new_gate_distance = PIPELINE_CONFIG["gate_distance_meters"]
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
                        gate_changed = new_gates != gates
                        distance_changed = new_gate_distance != PIPELINE_CONFIG["gate_distance_meters"]
                        gates = new_gates
                        if distance_changed:
                            PIPELINE_CONFIG["gate_distance_meters"] = new_gate_distance
                        if gate_changed:
                            print(f"[Pipeline] Speed gates reloaded ({len(new_gates)} gates, {new_gate_distance}m)")
                        elif distance_changed:
                            print(f"[Pipeline] Gate distance updated to {new_gate_distance}m")
                except Exception:
                    pass

        except Exception:
            traceback.print_exc()
            continue
    cap_thread.close()
    print(f"[Pipeline] Done. Tracked {v_counter} vehicles.")

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--camera-id", help="Camera UUID (override auto-detect)")
    args = parser.parse_args()
    camera_id = args.camera_id

    # Connect directly to PostgreSQL
    from sqlalchemy import create_engine, text
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[Setup] DATABASE_URL not set, using local config only")
    else:
        engine = create_engine(db_url)
        conn = engine.connect()

        # Auto-detect first active camera if not specified
        if not camera_id:
            rows = conn.execute(text("SELECT id, name, rtsp_url FROM camera WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1")).fetchall()
            if rows:
                camera_id = str(rows[0][0])
                print(f"[Setup] Auto-detected camera: {rows[0][1]} ({camera_id})")
            else:
                print("[Setup] No active cameras found in DB")

        # Fetch RTSP URL for the camera
        if camera_id:
            row = conn.execute(text("SELECT name, rtsp_url FROM camera WHERE id = :cid"), {"cid": camera_id}).fetchone()
            if row:
                rtsp_url = row[1].strip('"')
                if rtsp_url:
                    PIPELINE_CONFIG["source"] = rtsp_url
                    print(f"[Setup] Using camera RTSP: {row[0]} ({rtsp_url})")

        conn.close()
        engine.dispose()

    roi_pts = None
    speed_gates = None
    db_gate_distance = None

    # Try loading zones from DB
    if camera_id and db_url:
        try:
            engine = create_engine(db_url)
            conn = engine.connect()
            rows = conn.execute(
                text("SELECT zone_type, coords, gate_distance_meters FROM zones WHERE camera_id = :cid AND is_active = TRUE"),
                {"cid": camera_id},
            ).fetchall()
            conn.close()
            engine.dispose()
            for zone_type, coords, gate_distance in rows:
                if zone_type == "ROI" and len(coords) >= 3:
                    roi_pts = coords
                elif zone_type == "SPEED_GATE" and len(coords) >= 2:
                    speed_gates = coords
                    if gate_distance:
                        db_gate_distance = float(gate_distance)
            if roi_pts and speed_gates:
                print(f"[Setup] Loaded zones from DB: ROI ({len(roi_pts)} pts), {len(speed_gates)} gates")
        except Exception as e:
            print(f"[Setup] DB zone load failed ({e}), trying config file...")

    # Fall back to local config file
    if roi_pts is None or speed_gates is None:
        config_path = PIPELINE_CONFIG["config_file"]
        roi_pts, speed_gates = load_config_json(config_path)

        if roi_pts is None or speed_gates is None:
            print("[Setup] No config — opening interactive drawing mode...")
            src = PIPELINE_CONFIG["source"]
            if isinstance(src, str) and src.isdigit():
                src = int(src)
            cap = cv2.VideoCapture(src)
            if not cap.isOpened():
                print(f"[Setup] Cannot open source '{src}'")
                return
            ret, first_frame = cap.read()
            cap.release()
            if not ret:
                print("[Setup] Cannot read first frame.")
                return
            drawer = SetupDrawer(first_frame)
            roi_pts, speed_gates = drawer.run()
            if roi_pts is None:
                print("[Setup] Aborted.")
                return
            save_config_json(config_path, roi_pts, speed_gates)
            print(f"\n[Setup] Config saved. Starting pipeline...\n")
        else:
            print(f"[Setup] Using saved config from {config_path}")

    run_pipeline(roi_pts, speed_gates, camera_id=camera_id, gate_distance_meters=db_gate_distance)


if __name__ == "__main__":
    main()