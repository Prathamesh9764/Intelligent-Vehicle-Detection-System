import os
import time
import cv2

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"


class VideoReader:
    """
    Handles all video-related operations.
    """

    def __init__(self, video_path, max_retries=10):
        self._path = str(video_path)
        self._max_retries = max_retries
        self._is_rtsp = self._path.startswith(("rtsp://", "rtsps://"))
        self.cap = None
        self.current_frame = 0
        self.fps = 30.0
        self.width = 0
        self.height = 0
        self.total_frames = 0
        self._open()

    def _open(self):
        last_err = None
        for attempt in range(1, self._max_retries + 1):
            cap = cv2.VideoCapture(self._path)
            if cap.isOpened():
                self.cap = cap
                self.fps = cap.get(cv2.CAP_PROP_FPS)
                self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                if self.fps <= 0:
                    self.fps = 30.0
                if self._is_rtsp:
                    print(f"Connected to RTSP stream (attempt {attempt})")
                return
            cap.release()
            last_err = f"Attempt {attempt} failed"
            if self._is_rtsp:
                wait = min(2 ** attempt, 30)
                print(f"RTSP connection attempt {attempt}/{self._max_retries} failed, retrying in {wait}s...")
                time.sleep(wait)
        raise FileNotFoundError(
            f"Unable to open video after {self._max_retries} attempts: {self._path}"
        )

    def read(self):
        if self.cap is None:
            return False, None
        success, frame = self.cap.read()
        if not success and self._is_rtsp:
            for retry in range(3):
                time.sleep(1)
                success, frame = self.cap.read()
                if success:
                    break
        if success:
            self.current_frame += 1
        return success, frame

    def release(self):
        if self.cap:
            self.cap.release()
