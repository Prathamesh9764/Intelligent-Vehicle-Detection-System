"""
Thin client for talking to the Speed OCR FastAPI backend.

Instead of writing to Postgres directly, this pipeline calls the
backend's REST API (same one the React frontend uses). That way every
insert goes through the same validation, image storage, and triggers
the same live WebSocket feed the dashboard is already watching -- no
duplicate DB logic to keep in sync.
"""
import io
import os
import time

import cv2
import requests


class BackendClient:
    def __init__(self, base_url=None, username=None, password=None):
        self.base_url = (base_url or os.environ.get("API_BASE")).rstrip("/")
        self.username = username or os.environ.get("API_USERNAME", "admin")
        self.password = password or os.environ.get("API_PASSWORD", "admin123")
        self.token = None

    def login(self):
        try:
            resp = requests.post(
                f"{self.base_url}/auth/login",
                data={"username": self.username, "password": self.password},
                timeout=10,
            )
            resp.raise_for_status()
            self.token = resp.json()["access_token"]
            return self.token
        except requests.RequestException as e:
            print(f"[BackendClient] Login request failed: {e}")
            self.token = None
            raise

    def _auth_headers(self):
        if not self.token:
            self.login()
        return {"Authorization": f"Bearer {self.token}"}

    def _request(self, method, url, label, **kwargs):
        """Send one request, transparently re-logging-in once on a 401
        (expired access token). Returns None on failure."""
        for attempt in range(2):
            try:
                resp = requests.request(
                    method,
                    url,
                    headers=self._auth_headers(),
                    timeout=kwargs.pop("timeout", 10),
                    **kwargs,
                )
                if resp.status_code == 401:
                    self.token = None  # force a fresh login on the next attempt
                    continue
                resp.raise_for_status()
                return resp
            except requests.RequestException as e:
                print(f"[BackendClient] {label}: {e}")
                return None
        return None

    @staticmethod
    def _encode_image(image_bgr, filename):
        """cv2 BGR ndarray -> (filename, bytes, mimetype) tuple for multipart upload."""
        ok, buf = cv2.imencode(".jpg", image_bgr)
        if not ok:
            return None
        return (filename, io.BytesIO(buf.tobytes()), "image/jpeg")

    def create_vehicle_record(
        self,
        vehicle_type=None,
        license_plate_text=None,
        license_plate_raw_ocr=None,
        speed=None,
        camera_id=None,
        screenshot=None,
        plate_crop=None,
        video_path=None,
    ):
        """
        Args:
            vehicle_type: e.g. "car", "truck"
            license_plate_text: cleaned OCR text
            license_plate_raw_ocr: raw OCR text before cleaning
            speed: float, km/h
            camera_id: str UUID of the camera
            screenshot: cv2 BGR ndarray of the full frame (or vehicle crop)
            plate_crop: cv2 BGR ndarray of just the plate region
            video_path: str, path to an mp4 video clip on disk

        Returns:
            dict: the created vehicle_data row as returned by the API,
                  or None if the request failed.
        """
        data = {}
        if vehicle_type is not None:
            data["vehicle_type"] = vehicle_type
        if license_plate_text:
            data["license_plate_text"] = license_plate_text
        if license_plate_raw_ocr:
            data["license_plate_raw_ocr"] = license_plate_raw_ocr
        if speed is not None:
            data["speed"] = round(float(speed), 2)
        if camera_id is not None:
            data["camera_id"] = camera_id

        files = {}
        if screenshot is not None:
            enc = self._encode_image(screenshot, "screenshot.jpg")
            if enc:
                files["screenshot"] = enc
        if plate_crop is not None:
            enc = self._encode_image(plate_crop, "plate.jpg")
            if enc:
                files["license_plate_image"] = enc
        if video_path is not None and os.path.exists(video_path):
            fname = os.path.basename(video_path)
            with open(video_path, "rb") as f:
                files["video"] = (fname, f.read(), "video/mp4")

        for attempt in range(3):
            try:
                resp = requests.post(
                    f"{self.base_url}/vehicles",
                    data=data,
                    files=files if files else None,
                    headers=self._auth_headers(),
                    timeout=60,
                )
                if resp.ok:
                    return resp.json()
                if resp.status_code == 401:
                    self.login()
                    continue
                print(f"[BackendClient] Attempt {attempt + 1} failed: {resp.status_code}")
                if attempt < 2:
                    time.sleep(2 ** attempt)
            except requests.RequestException as e:
                print(f"[BackendClient] Attempt {attempt + 1} network error: {e}")
                if attempt < 2:
                    time.sleep(2 ** attempt)
        return None

    def get_cameras(self, active_only=True):
        resp = self._request(
            "GET",
            f"{self.base_url}/cameras",
            "Failed to fetch cameras",
            params={"active_only": str(active_only).lower()},
        )
        return resp.json() if resp else []

    def get_camera(self, camera_id):
        resp = self._request(
            "GET",
            f"{self.base_url}/cameras/{camera_id}",
            f"Failed to fetch camera {camera_id}",
        )
        return resp.json() if resp else None

    def get_zones(self, active_only=True, camera_id=None):
        params = {"active_only": str(active_only).lower()}
        if camera_id:
            params["camera_id"] = camera_id
        resp = self._request(
            "GET",
            f"{self.base_url}/zones",
            "Failed to fetch zones",
            params=params,
        )
        return resp.json() if resp else []

    def create_zone(self, name, zone_type, coords, gate_distance_meters=None):
        data = {"name": name, "zone_type": zone_type, "coords": coords}
        if gate_distance_meters is not None:
            data["gate_distance_meters"] = gate_distance_meters
        resp = self._request(
            "POST",
            f"{self.base_url}/zones",
            "Failed to create zone",
            json=data,
        )
        return resp.json() if resp else None

    def update_zone(self, zone_id, **kwargs):
        resp = self._request(
            "PUT",
            f"{self.base_url}/zones/{zone_id}",
            "Failed to update zone",
            json=kwargs,
        )
        return resp.json() if resp else None

    def delete_zone(self, zone_id):
        resp = self._request("DELETE", f"{self.base_url}/zones/{zone_id}", "Failed to delete zone")
        return resp.ok if resp else False