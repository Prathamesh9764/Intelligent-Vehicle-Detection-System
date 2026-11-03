import math

from config import ROAD_WIDTH_METERS, ROAD_SEGMENT_LENGTH_METERS


class SpeedCalculator:
    """
    Calculates vehicle speed (km/h) based on displacement in
    real-world coordinates over time, using persistent track IDs.
    """

    def __init__(self, fps):
        """
        Args:
            fps (float): video frame rate, used to convert frame
                         differences into elapsed time.
        """
        self.fps = fps

        # track_id -> {"position": (X, Y), "frame": int}
        self.history = {}

    def _is_valid_position(self, position):
        """
        Checks if a world position lies within the calibrated
        road rectangle. Positions outside this are extrapolated
        by the homography and unreliable.
        """
        x, y = position

        return (0 <= x <= ROAD_WIDTH_METERS) and (0 <= y <= ROAD_SEGMENT_LENGTH_METERS)

    def update(self, track_id, world_position, frame_number):
        """
        Update history for this vehicle and compute its current speed.

        Args:
            track_id (int)
            world_position (tuple[float, float]): (X, Y) in meters
            frame_number (int): current video frame index

        Returns:
            float or None: speed in km/h, or None if speed can't be
                            computed yet (first sighting, or position
                            outside calibrated zone).
        """

        if not self._is_valid_position(world_position):
            # Don't compute speed outside the calibrated zone,
            # and don't let a bad position pollute future history.
            return None

        previous = self.history.get(track_id)

        # Always update history with the latest valid position
        self.history[track_id] = {
            "position": world_position,
            "frame": frame_number,
        }

        if previous is None:
            # First time we've seen this vehicle inside the calibrated zone
            return None

        frame_diff = frame_number - previous["frame"]

        if frame_diff <= 0:
            return None

        time_elapsed = frame_diff / self.fps

        distance = math.dist(world_position, previous["position"])

        speed_mps = distance / time_elapsed
        speed_kmh = speed_mps * 3.6

        return speed_kmh 