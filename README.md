# Intelligent-Vehicle-Detection-System — Enforcement Console

> Modern, AI-powered traffic surveillance, optical character recognition (ANPR), and automated speed violation enforcement console.

---

## System Demonstration

Watch the system in action below:

<div align="center">
  <video src="frontend/public/demo_speed_ocr.mp4" controls="controls" width="100%" style="max-height: 540px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
    Your browser does not support the video tag.
  </video>
  <p align="center">
    <a href="frontend/public/demo_speed_ocr.mp4">
      <b>▶ Click here to view / download the demo video (demo_speed_ocr.mp4)</b>
    </a>
  </p>
</div>

---

## Overview

The **Intelligent-Vehicle-Detection-System (IVDS)** is a full-stack production application built on top of the PostgreSQL schema (`users`, `vehicle_data`):

- **Backend (`backend/`)** — High-performance FastAPI (Python 3.11+) service with JWT authentication, WebSocket real-time broadcast, automated speed violation calculation, and RESTful APIs.
- **Frontend (`frontend/`)** — React 19 + Vite console featuring:
  - **Dynamic Theme Management**: 3-way toggle (**Light**, **Dark**, **System Mode**) with zero-flicker localStorage persistence.
  - **Full-Screen AI Vision Login**: Immersive 3D perspective highway simulation, real-time multi-vehicle tracking, optical laser ANPR scanner, and rotating Doppler radar.
  - **Collapsible Telemetry Filters**: Responsive click-to-expand/collapse filter deck with upward and downward indicators.
  - **Sign-Out Confirmation**: Protective modal dialog to prevent accidental session termination.
  - **Route & Page Transition Loader**: Dual-tier loading using NProgress glowing progress bar and code-split Suspense fallbacks.
  - **Live Camera Feeds**: Low-latency WebSocket streaming, ROI calibration, and speed zone management.

---

## 1. Backend Setup

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env: Set DATABASE_URL to your PostgreSQL connection string, and a secure SECRET_KEY

# Create the initial admin operator account:
python seed_admin.py admin YourStrongPassword123

# Run development server:
uvicorn app.main:app --reload --port 8000
```

- **Interactive API Documentation (Swagger)**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints:
- `POST /auth/login` — Authenticate operator credentials → returns JWT access token
- `GET /auth/me` — Retrieve active operator profile and permission role
- `GET /vehicles` — Filtered vehicle telemetry (`vehicle_type`, `license_plate`, `min_speed`, `max_speed`, `overspeed_only`, `date_from`, `date_to`, `page`, `page_size`)
- `GET /vehicles/{id}`, `PATCH /vehicles/{id}`, `DELETE /vehicles/{id}` — Inspection and management of capture records
- `POST /vehicles` — Multipart ingest endpoint for OCR cameras/scripts (vehicle type, license plate text, raw OCR, velocity, full-frame screenshot, cropped plate image)
- `GET /vehicles/stats` — Real-time telemetry summaries, daily totals, and speed violation count
- `WS /vehicles/ws/live?token=<jwt>` — Real-time WebSocket feed pushing newly ingested captures instantly
- `GET/POST/PATCH/DELETE /users` — Administrator user management

*Uploaded media captures are securely stored under `backend/media/` and served at `/media/...`.*

---

## 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env   # Set VITE_API_BASE if backend is not on localhost:8000
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser and sign in using your seeded operator credentials.

### Production Build:
```bash
npm --prefix frontend run build
```
Generates an optimized, code-split production bundle in `frontend/dist/`.

---

## 3. Role-Based Access Control (RBAC)

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full system control: User management, camera node setup, speed zone calibration, and telemetry management. |
| **Operator** | Telemetry inspection, live surveillance feeds, capture editing, export, and search. |
| **Viewer** | Read-only access to dashboard statistics, telemetry search, and live camera streams. |

---

## 4. Connecting Your Camera & OCR Pipeline

Any external detection script, camera node, or edge inference device (e.g. YOLO + PaddleOCR / EasyOCR) should send multipart POST requests to `/vehicles`:

```python
import requests

url = "http://localhost:8000/vehicles"
payload = {
    "vehicle_type": "Car",
    "license_plate_text": "MH12EQ8810",
    "license_plate_raw_ocr": "MH 12 EQ 8810",
    "speed": 118.4,
}
files = {
    "screenshot": open("frame_capture.jpg", "rb"),
    "license_plate_image": open("plate_crop.jpg", "rb"),
}

response = requests.post(url, data=payload, files=files)
print(response.json())
```
The console immediately ingests the detection, triggers compliance evaluation, and broadcasts the event over WebSocket to all active operator consoles.

---

## 5. Deployment Branches

- **`gate_dev4.1`**: Single RTSP stream deployment without Redis dependency.
- **`gate_dev5`**: Multi-camera RTSP ingestion cluster powered by Redis message broker and distributed pipeline workers.
