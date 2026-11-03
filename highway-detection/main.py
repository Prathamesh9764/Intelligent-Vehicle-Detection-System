import asyncio
import os
import queue
import threading
import time

from dotenv import load_dotenv

load_dotenv()

import cv2
import websockets

from config import VIDEO_PATH, WINDOW_NAME
from models import detection
from utils import video
from utils.video import VideoReader
from detection.detector import YOLODetector
from visualization.draw import ObjectDrawer
from detection.tracker import VehicleTracker
from speed.coordinate_mapper import CoordinateMapper
from speed.calculator import SpeedCalculator
from speed.smoother import SpeedSmoother

DISPLAY_WIDTH = 1200
DISPLAY_HEIGHT = 740
CAMERA_WS_URL = os.environ.get("CAMERA_WS_URL")
FRAME_INTERVAL = 0.05
FRAME_QUEUE_SIZE = 8


class CaptureThread(threading.Thread):
    def __init__(self, source, frame_q):
        super().__init__(daemon=True)
        self.source = source
        self.frame_q = frame_q
        self.stopped = threading.Event()
        self.connected = threading.Event()
        self.fps = 30.0

    def run(self):
        video = VideoReader(self.source)
        self.fps = video.fps if video.fps > 0 else 30.0
        self.connected.set()
        while not self.stopped.is_set():
            success, frame = video.read()
            if not success:
                break
            try:
                self.frame_q.put(frame, timeout=1)
            except queue.Full:
                pass
        video.release()

    def close(self):
        self.stopped.set()


def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        ws = loop.run_until_complete(websockets.connect(CAMERA_WS_URL))
        print(f"Camera stream connected to {CAMERA_WS_URL}")
    except Exception as e:
        print(f"Camera stream not available ({e}) — running without stream")
        ws = None

    video_source = os.environ.get("VIDEO_SOURCE", str(VIDEO_PATH))
    frame_q = queue.Queue(maxsize=FRAME_QUEUE_SIZE)
    cap_thread = CaptureThread(video_source, frame_q)
    cap_thread.start()
    cap_thread.connected.wait()

    detector = YOLODetector()
    drawer = ObjectDrawer()
    tracker = VehicleTracker(detector.class_names)
    mapper = CoordinateMapper()
    effective_fps = cap_thread.fps
    speed_calculator = SpeedCalculator(fps=effective_fps)
    speed_smoother = SpeedSmoother(alpha=0.3)

    print("===================================")
    print(" Highway Speed Detection System ")
    print("===================================")
    print(f"Source       : {video_source}")
    print(f"FPS          : {effective_fps}")
    print()

    frame_count = 0
    while not cap_thread.stopped.is_set():
        try:
            frame = frame_q.get(timeout=5)
        except queue.Empty:
            if not cap_thread.is_alive():
                break
            continue
        if frame is None:
            break
        frame_count += 1

        detections = detector.detect(frame, half=True)
        detections = tracker.update(detections)

        for detection in detections:
            world_position = mapper.get_world_position(detection)

            speed_kmh = speed_calculator.update(
                track_id=detection.track_id,
                world_position=world_position,
                frame_number=frame_count,
            )

            if speed_kmh is not None:
                smoothed_speed = speed_smoother.smooth(detection.track_id, speed_kmh)
                detection.speed_kmh = smoothed_speed

        drawer.draw_detections(frame, detections)

        display_frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT))
        cv2.imshow(WINDOW_NAME, display_frame)

        if ws and frame_count % max(1, int(effective_fps * FRAME_INTERVAL)) == 0:
            _, buf = cv2.imencode(".jpg", display_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            try:
                loop.run_until_complete(ws.send(buf.tobytes()))
            except Exception:
                pass

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

    cap_thread.close()
    cv2.destroyAllWindows()
    if ws:
        loop.run_until_complete(ws.close())


if __name__ == "__main__":
    main()
