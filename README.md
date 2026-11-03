# Speed OCR — Enforcement Console

Full-stack app on top of your existing `speed_ocr` Postgres schema (`users`, `vehicle_data`).

- **backend/** — FastAPI (Python), talks directly to your existing tables, no migrations needed.
- **frontend/** — React (Vite) console: login, dashboard with filters, capture detail (images + edit),
  live feed (WebSocket), and user admin.

## 1. Backend setup

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: set DATABASE_URL to your real speed_ocr connection string, and a real SECRET_KEY

# create the first admin login (users table is currently empty in your dump)
python seed_admin.py admin YourStrongPassword123

uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

Endpoints:
- `POST /auth/login` (form: username, password) → JWT
- `GET /auth/me`
- `GET /vehicles` — filters: `vehicle_type`, `license_plate`, `min_speed`, `max_speed`, `overspeed_only`, `date_from`, `date_to`, `page`, `page_size`
- `GET /vehicles/{id}`, `PATCH /vehicles/{id}`, `DELETE /vehicles/{id}`
- `POST /vehicles` — multipart form (vehicle_type, license_plate_text, license_plate_raw_ocr, speed, screenshot file, license_plate_image file) — this is the endpoint your OCR pipeline / camera script should call to insert a new capture.
- `GET /vehicles/stats` — totals + overspeed count (limit set by `SPEED_LIMIT_KMH` in `.env`)
- `WS /vehicles/ws/live?token=<jwt>` — pushes new rows as they're inserted (2s poll internally)
- `GET/POST/PATCH/DELETE /users` — admin only

Uploaded images are stored under `backend/media/` and served at `/media/...`.

## 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE if backend isn't on localhost:8000
npm run dev
```

Open http://localhost:5173, sign in with the admin user you seeded.

## 3. Roles

- **admin** — everything, including the Users screen
- **operator** — dashboard, live feed, edit/delete captures
- **viewer** — read-only dashboard + live feed

(Role is just a string column — enforcement is currently admin-only-gated for the Users screen; extend `require_admin`/checks in `backend/app/deps.py` if you want stricter per-role rules.)

## 4. Connecting your OCR pipeline

Whatever script currently writes rows into `vehicle_data`, point it at `POST /vehicles` instead of
(or in addition to) direct SQL — it'll get you validation, image storage under `media/`, and the
live feed will pick up the new row automatically within ~2 seconds.


# Until brach gate_dev4.1 is without redis and one rtsp url only

# Branch gate_dev5 is redis with multiple rtsp url work 