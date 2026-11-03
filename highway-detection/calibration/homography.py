import json
import numpy as np
import cv2

from config import (
    CALIBRATION_POINTS_FILE,
    ROAD_WIDTH_METERS,
    ROAD_SEGMENT_LENGTH_METERS,
)


class HomographyTransformer:
    """
    Computes and applies a homography transform that maps pixel
    coordinates (image space) to real-world ground-plane coordinates
    (in meters).
    """

    def __init__(self):
        self.matrix = None
        self._load_and_compute()

    def _load_pixel_points(self):
        with open(CALIBRATION_POINTS_FILE, "r") as f:
            data = json.load(f)

        pixel_points = data["pixel_points"]

        if len(pixel_points) != 4:
            raise ValueError(
                f"Expected 4 calibration points, found {len(pixel_points)}. "
                f"Re-run calibrate.py."
            )

        return np.array(pixel_points, dtype=np.float32)

    def _get_world_points(self):
        """
        Real-world coordinates (in meters) corresponding to the 4 pixel
        points, in the same order: top-left, top-right, bottom-right, bottom-left.

        Origin (0, 0) is the top-left of the calibration rectangle.
        """

        w = ROAD_WIDTH_METERS
        l = ROAD_SEGMENT_LENGTH_METERS

        world_points = np.array(
            [
                [0, 0],   # top-left
                [w, 0],   # top-right
                [w, l],   # bottom-right
                [0, l],   # bottom-left
            ],
            dtype=np.float32,
        )

        return world_points

    def _load_and_compute(self):
        pixel_points = self._load_pixel_points()
        world_points = self._get_world_points()

        self.matrix = cv2.getPerspectiveTransform(pixel_points, world_points)

        print("Homography matrix computed successfully.")

    def pixel_to_world(self, point):
        """
        Convert a single pixel point to world coordinates (meters).

        Args:
            point (tuple[int, int]): (x, y) in pixel space

        Returns:
            tuple[float, float]: (X, Y) in meters
        """

        pixel_array = np.array([[point]], dtype=np.float32)  # shape (1, 1, 2)

        world_array = cv2.perspectiveTransform(pixel_array, self.matrix)

        x_world, y_world = world_array[0][0]

        return float(x_world), float(y_world)