import os
from pathlib import Path


def resolve_inference_device(default="cpu"):
    """Resolve the inference device, falling back to CPU when required.

    Reads INFERENCE_DEVICE env (aliases: cpu | cuda | cuda:0 | gpu | 0 | mps).
    Returns the requested device if it is actually available, otherwise CPU
    (with a logged reason) so the pipeline never crashes on a GPU-less host.
    """
    requested = os.environ.get("INFERENCE_DEVICE", "").strip().lower() or default
    try:
        import torch
    except Exception:
        print("[Device] torch unavailable - using CPU inference")
        return "cpu"

    # Normalize aliases
    if requested in ("gpu", "0"):
        requested = "cuda:0" if torch.cuda.is_available() else "cpu"
    elif requested.startswith("cuda"):  # cuda | cuda:1
        if not torch.cuda.is_available():
            print(
                f"[Device] INFERENCE_DEVICE={requested} requested but CUDA is "
                "unavailable - falling back to CPU"
            )
            requested = "cpu"
    elif requested == "mps" and not torch.backends.mps.is_available():
        print("[Device] INFERENCE_DEVICE=mps requested but MPS is unavailable "
              "- falling back to CPU")
        requested = "cpu"
    elif requested not in ("cpu", "mps"):
        print(
            f"[Device] INFERENCE_DEVICE={requested} unrecognized - "
            "falling back to CPU"
        )
        requested = "cpu"

    print(f"[Device] Using inference device: {requested}")
    return requested


# -----------------------------
# Project Paths
# -----------------------------

# Root directory of the project
BASE_DIR = Path(__file__).resolve().parent

# Assets
ASSETS_DIR = BASE_DIR / "assets"
VIDEO_DIR = ASSETS_DIR / "videos"
IMAGE_DIR = ASSETS_DIR / "images"

# Models
MODEL_DIR = BASE_DIR / "models"

# Default files
VIDEO_PATH = VIDEO_DIR / "speed.mp4"
MODEL_PATH = MODEL_DIR / f"yolov8{os.environ.get('YOLO_MODEL_SIZE', 's')}.pt"
PLATE_MODEL_PATH = MODEL_DIR / "license_plate.pt"
PLATE_OCR_MODEL_PATH = MODEL_DIR / "best.keras"
PLATE_OCR_CONFIG_PATH = MODEL_DIR / "plate_config.yaml"

# -----------------------------
# YOLO Settings
# -----------------------------

CONFIDENCE_THRESHOLD = 0.30
IOU_THRESHOLD = 0.45

# Vehicle classes in COCO dataset
VEHICLE_CLASSES = [
    "car",
    # "motorcycle",
    # "bus",
    # "truck"
]

# -----------------------------
# Display Settings
# -----------------------------

WINDOW_NAME = "Highway Speed Detection"

# -----------------------------
# Output
# -----------------------------

SAVE_OUTPUT = False

# -----------------------------
# Calibration / Homography
# -----------------------------

# -----------------------------
# Calibration / Homography
# -----------------------------

CALIBRATION_DIR = BASE_DIR / "calibration"
CALIBRATION_POINTS_FILE = CALIBRATION_DIR / "calibration_points.json"

# Number of points needed to define the road rectangle
NUM_CALIBRATION_POINTS = 4

# Real-world dimensions (meters)
LANE_WIDTH_METERS = 3.5
NUM_LANES_SELECTED = 4

# Total width covered by the selected calibration rectangle
ROAD_WIDTH_METERS = LANE_WIDTH_METERS * NUM_LANES_SELECTED

# Length of the calibration rectangle
ROAD_SEGMENT_LENGTH_METERS = 20.0
