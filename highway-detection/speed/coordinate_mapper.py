from calibration.homography import HomographyTransformer


class CoordinateMapper:
    """
    Maps a vehicle detection's bounding box to its real-world
    ground-plane position (in meters), using the calibrated homography.
    """

    def __init__(self):
        self.transformer = HomographyTransformer()

    def get_world_position(self, detection):
        """
        Args:
            detection (Detection): must have a valid bbox

        Returns:
            tuple[float, float]: (X, Y) world position in meters
        """

        x1, y1, x2, y2 = detection.bbox

        # Bottom-center of the bbox = point where vehicle touches the road
        pixel_point = ((x1 + x2) / 2, y2)

        world_position = self.transformer.pixel_to_world(pixel_point)

        return world_position