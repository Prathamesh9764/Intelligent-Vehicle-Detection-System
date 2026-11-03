from dataclasses import dataclass
from typing import Tuple


@dataclass
class Detection:
    """
    Represents a single vehicle detection.
    """

    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    
    bbox: Tuple[int, int, int, int]
    track_id: int = None
    speed_kmh: float = None
