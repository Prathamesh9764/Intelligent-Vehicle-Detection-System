from calibration.homography import HomographyTransformer

transformer = HomographyTransformer()

# Load the same pixel points we calibrated with
import json
from config import CALIBRATION_POINTS_FILE

with open(CALIBRATION_POINTS_FILE, "r") as f:
    data = json.load(f)

pixel_points = data["pixel_points"]

print("\nSanity check: transforming calibration points back to world space")
print("Expected: (0,0), (14,0), (14,20), (0,20)\n")

for i, point in enumerate(pixel_points):
    world_point = transformer.pixel_to_world(tuple(point))
    print(f"Point {i+1}: pixel {tuple(point)} -> world ({world_point[0]:.2f}, {world_point[1]:.2f})")