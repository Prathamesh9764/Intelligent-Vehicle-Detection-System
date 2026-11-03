import json
import cv2

from config import CALIBRATION_POINTS_FILE, NUM_CALIBRATION_POINTS


class PointSelector:
    def __init__(self, display_frame, scale_x=1.0, scale_y=1.0):
        self.frame = display_frame.copy()
        self.display_frame = display_frame.copy()
        self.points = []
        self.scale_x = scale_x
        self.scale_y = scale_y
        self.window_name = "Calibration - Select 4 Road Points"

    def _mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            if len(self.points) < NUM_CALIBRATION_POINTS:
                orig_x = int(x * self.scale_x)
                orig_y = int(y * self.scale_y)
                self.points.append((orig_x, orig_y))
                self._redraw()

    def _redraw(self):
        self.display_frame = self.frame.copy()
        for i, pt in enumerate(self.points):
            dx = int(pt[0] / self.scale_x) if self.scale_x else pt[0]
            dy = int(pt[1] / self.scale_y) if self.scale_y else pt[1]
            cv2.circle(self.display_frame, (dx, dy), 6, (0, 0, 255), -1)
            cv2.putText(
                self.display_frame,
                str(i + 1),
                (dx + 10, dy - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2,
            )
        if len(self.points) > 1:
            for i in range(len(self.points) - 1):
                p1 = (int(self.points[i][0] / self.scale_x), int(self.points[i][1] / self.scale_y))
                p2 = (int(self.points[i + 1][0] / self.scale_x), int(self.points[i + 1][1] / self.scale_y))
                cv2.line(self.display_frame, p1, p2, (255, 0, 0), 2)
        if len(self.points) == NUM_CALIBRATION_POINTS:
            p1 = (int(self.points[-1][0] / self.scale_x), int(self.points[-1][1] / self.scale_y))
            p2 = (int(self.points[0][0] / self.scale_x), int(self.points[0][1] / self.scale_y))
            cv2.line(self.display_frame, p1, p2, (255, 0, 0), 2)

    def select_points(self):
        cv2.namedWindow(self.window_name)
        cv2.setMouseCallback(self.window_name, self._mouse_callback)
        print("Click 4 points on the road: top-left, top-right, bottom-right, bottom-left")
        print("Press 's' to save, 'r' to reset, 'q' to quit without saving")
        while True:
            cv2.imshow(self.window_name, self.display_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("r"):
                self.points = []
                self._redraw()
            elif key == ord("s"):
                if len(self.points) == NUM_CALIBRATION_POINTS:
                    self._save_points()
                    break
                else:
                    print(f"Need exactly {NUM_CALIBRATION_POINTS} points, you have {len(self.points)}.")
            elif key == ord("q"):
                cv2.destroyWindow(self.window_name)
                return None
        cv2.destroyWindow(self.window_name)
        return self.points

    def _save_points(self):
        data = {"pixel_points": self.points}
        with open(CALIBRATION_POINTS_FILE, "w") as f:
            json.dump(data, f, indent=4)
        print(f"Saved calibration points to {CALIBRATION_POINTS_FILE}")
