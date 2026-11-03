import cv2

from config import VIDEO_PATH
from calibration.point_selector import PointSelector

DISPLAY_WIDTH = 1200
DISPLAY_HEIGHT = 740


def main():
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    if not cap.isOpened():
        print(f"Could not open video: {VIDEO_PATH}")
        return

    for _ in range(10):
        success, frame = cap.read()
    cap.release()

    if not success or frame is None:
        print("Could not read a frame from the video.")
        return

    display_frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT))
    scale_x = frame.shape[1] / DISPLAY_WIDTH
    scale_y = frame.shape[0] / DISPLAY_HEIGHT

    selector = PointSelector(display_frame, scale_x, scale_y)
    points = selector.select_points()

    if points is None:
        print("Calibration cancelled.")
    else:
        print("Calibration points selected:")
        for i, p in enumerate(points, start=1):
            print(f"  Point {i}: {p}")


if __name__ == "__main__":
    main()
