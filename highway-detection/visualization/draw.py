import json
import cv2
import numpy as np
from models.detection import Detection
from config import CALIBRATION_POINTS_FILE, ROAD_WIDTH_METERS, ROAD_SEGMENT_LENGTH_METERS


class ObjectDrawer:
    """
    Draws detection results on a frame.
    """

    def __init__(self):
        self.box_color = (0, 255, 0)
        self.text_color = (255, 255, 255)
        self.box_thickness = 2
        self.font = cv2.FONT_HERSHEY_SIMPLEX
        self.font_scale = 0.6
        self.font_thickness = 2
        self.roi_color = (255, 200, 0)
        self.roi_points = self._load_roi_points()

    def _load_roi_points(self):
        try:
            with open(CALIBRATION_POINTS_FILE) as f:
                data = json.load(f)
            pts = np.array(data["pixel_points"], dtype=np.int32)
            if len(pts) == 4:
                return pts
        except Exception:
            pass
        return None

    def draw_roi(self, frame):
        if self.roi_points is None:
            return frame
        cv2.polylines(frame, [self.roi_points], isClosed=True, color=self.roi_color, thickness=2)
        for pt in self.roi_points:
            cv2.circle(frame, tuple(pt), 5, self.roi_color, -1)
        label = f"ROI: {ROAD_WIDTH_METERS:.0f}m x {ROAD_SEGMENT_LENGTH_METERS:.0f}m"
        x, y = int(self.roi_points[0][0]), int(self.roi_points[0][1] - 12)
        cv2.putText(frame, label, (x, y), self.font, 0.5, self.roi_color, 2)
        return frame

    def draw_detection(self, frame, detection: Detection):
        x1, y1, x2, y2 = detection.bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), self.box_color, self.box_thickness)
        if detection.speed_kmh is not None:
            label = f"{detection.class_name} {detection.speed_kmh:.0f} km/h"
        else:
            label = f"{detection.class_name}"
        (text_width, text_height), baseline = cv2.getTextSize(label, self.font, self.font_scale, self.font_thickness)
        label_y = max(y1 - 10, text_height + 10)
        cv2.rectangle(frame, (x1, label_y - text_height - 5), (x1 + text_width + 8, label_y + baseline - 5), self.box_color, -1)
        cv2.putText(frame, label, (x1 + 4, label_y - 4), self.font, self.font_scale, self.text_color, self.font_thickness)

    def draw_detections(self, frame, detections):
        self.draw_roi(frame)
        for detection in detections:
            self.draw_detection(frame, detection)
        return frame
