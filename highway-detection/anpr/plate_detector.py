import cv2
import numpy as np
from ultralytics import YOLO
from config import PLATE_MODEL_PATH, CONFIDENCE_THRESHOLD


class PlateDetector:
    def __init__(self):
        self.model = YOLO(str(PLATE_MODEL_PATH))

    def detect(self, vehicle_crop: np.ndarray):
        if vehicle_crop is None or vehicle_crop.size == 0:
            return None

        h, w = vehicle_crop.shape[:2]

        results = self.model(vehicle_crop, conf=CONFIDENCE_THRESHOLD, verbose=False)
        if len(results) > 0 and len(results[0].boxes) > 0:
            box = results[0].boxes[0]
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(w, x2)
            y2 = min(h, y2)
            if x2 > x1 and y2 > y1:
                return vehicle_crop[y1:y2, x1:x2]

        y1 = int(h * 0.5)
        x1 = int(w * 0.1)
        x2 = int(w * 0.9)
        fallback = vehicle_crop[y1:h, x1:x2]
        return fallback if fallback.size > 0 else None
