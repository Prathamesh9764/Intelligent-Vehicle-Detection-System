from ultralytics import YOLO
from models.detection import Detection

from config import (
    MODEL_PATH,
    CONFIDENCE_THRESHOLD,
    IOU_THRESHOLD,
    VEHICLE_CLASSES,
)


class YOLODetector:
    """
    Handles vehicle detection using YOLOv8.
    """

    def __init__(self):
        """
        Load the YOLO model.
        """

        self.model = YOLO(MODEL_PATH)

        # COCO class names
        self.class_names = self.model.names

    def detect(self, frame, half=False):
        results = self.model(
            frame, conf=CONFIDENCE_THRESHOLD, iou=IOU_THRESHOLD, verbose=False, half=half
        )

        detections = []

        for result in results:

            for box in result.boxes:

                class_id = int(box.cls[0])

                class_name = self.class_names[class_id]

                if class_name not in VEHICLE_CLASSES:
                    continue

                confidence = float(box.conf[0])

                x1, y1, x2, y2 = map(int, box.xyxy[0])

                detections.append(
                    Detection(
                        class_id=class_id,
                        class_name=class_name,
                        confidence=confidence,
                        bbox=(x1, y1, x2, y2),
                    )
                )

        return detections
                 