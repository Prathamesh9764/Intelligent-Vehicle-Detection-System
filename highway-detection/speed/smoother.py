class SpeedSmoother:
    """
    Smooths noisy per-frame speed readings per vehicle using
    Exponential Moving Average (EMA).
    """

    def __init__(self, alpha=0.3):
        """
        Args:
            alpha (float): smoothing factor, between 0 and 1.
                            Higher = less smoothing, more responsive.
                            Lower  = more smoothing, slower to react.
        """
        self.alpha = alpha

        # track_id -> last smoothed speed (km/h)
        self.smoothed_speeds = {}

    def smooth(self, track_id, new_speed):
        """
        Args:
            track_id (int)
            new_speed (float): latest raw speed reading (km/h)

        Returns:
            float: smoothed speed (km/h)
        """

        previous_smoothed = self.smoothed_speeds.get(track_id)

        if previous_smoothed is None:
            # First reading for this vehicle — nothing to smooth against yet
            smoothed = new_speed
        else:
            smoothed = (
                self.alpha * new_speed
                + (1 - self.alpha) * previous_smoothed
            )

        self.smoothed_speeds[track_id] = smoothed

        return smoothed