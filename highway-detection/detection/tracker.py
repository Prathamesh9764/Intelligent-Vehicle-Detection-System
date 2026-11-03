import numpy as np
import supervision as sv

from models.detection import Detection


class VehicleTracker:
    """
    Assigns persistent track IDs to vehicle detections using ByteTrack.
    """

    def __init__(self, class_names):
        """
        Args:
            class_names (dict): mapping of class_id -> class_name,
                                 e.g. detector.class_names (COCO names)
        """
        self.tracker = sv.ByteTrack()
        self.class_names = class_names

    def update(self, detections):
        """
        Feed current frame's detections into ByteTrack and get back
        the same vehicles with persistent track_id attached.

        Args:
            detections (list[Detection])

        Returns:
            list[Detection]: new Detection objects, now with track_id set
        """

        if len(detections) == 0:
            # Still call update so the tracker ages out lost tracks
            self.tracker.update_with_detections(sv.Detections.empty())
            return []

        xyxy = np.array([d.bbox for d in detections], dtype=np.float32)
        confidence = np.array([d.confidence for d in detections], dtype=np.float32)
        class_id = np.array([d.class_id for d in detections], dtype=int)

        sv_detections = sv.Detections(
            xyxy=xyxy,
            confidence=confidence,
            class_id=class_id,
        )

        tracked = self.tracker.update_with_detections(sv_detections)

        tracked_detections = []

        for i in range(len(tracked)):
            x1, y1, x2, y2 = map(int, tracked.xyxy[i])
            cls_id = int(tracked.class_id[i])
            track_id = int(tracked.tracker_id[i])

            tracked_detections.append(
                Detection(
                    class_id=cls_id,
                    class_name=self.class_names[cls_id],
                    confidence=float(tracked.confidence[i]),
                    bbox=(x1, y1, x2, y2),
                    track_id=track_id,
                )
            )

        return tracked_detections