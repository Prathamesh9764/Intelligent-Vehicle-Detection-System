import asyncio
import base64
import time

import cv2
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.deps import get_current_user
from app.models import Camera
from app.security import decode_access_token
from app.routers import auth, users, vehicles, zones, cameras

app = FastAPI(title="Speed OCR API", version="1.0.0")

REDIS_HOST = settings.redis_host
REDIS_PORT = settings.redis_port
redis_client: aioredis.Redis | None = None

@app.get("/cameras/{camera_id}/snapshot")
def camera_snapshot(
    camera_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        return Response("Camera not found", status_code=404)
    src = cam.rtsp_url.strip('"')
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        return Response("Cannot open video source", status_code=502)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return Response("Cannot read frame", status_code=502)
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(content=buf.tobytes(), media_type="image/jpeg")

@app.on_event("startup")
async def startup():
    global redis_client
    redis_client = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)

@app.on_event("shutdown")
async def shutdown():
    if redis_client:
        await redis_client.aclose()

@app.websocket("/cameras/{camera_id}/ws")
async def camera_stream(camera_id: str, websocket: WebSocket, token: str = None):
    if not token or decode_access_token(token) is None:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    last_frame: bytes | None = None
    fps_raw = await redis_client.get(f"fps:{camera_id}")
    fps = float(fps_raw) if fps_raw else 30.0
    interval = 1.0 / fps
    try:
        while True:
            frame = await redis_client.get(f"frame:{camera_id}")
            if frame is not None and frame != last_frame:
                await websocket.send_bytes(frame)
                last_frame = frame
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass

@app.websocket("/cameras/ws/stream")
async def camera_stream_batch(websocket: WebSocket, token: str = None):
    if not token or decode_access_token(token) is None:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    last_fetch = 0.0
    cameras_cache = []
    try:
        while True:
            now = time.time()
            if now - last_fetch > 10:
                db = SessionLocal()
                try:
                    rows = db.query(Camera).filter(Camera.is_active == True).all()
                    cameras_cache = [{"id": str(r.id), "name": r.name} for r in rows]
                finally:
                    db.close()
                last_fetch = now

            tasks = []
            for cam in cameras_cache:
                tasks.append(asyncio.gather(
                    redis_client.get(f"frame:{cam['id']}"),
                    redis_client.get(f"fps:{cam['id']}"),
                ))
            results = await asyncio.gather(*tasks) if tasks else []

            data = []
            for cam, (frame_bytes, fps_raw) in zip(cameras_cache, results):
                if frame_bytes:
                    frame_b64 = base64.b64encode(frame_bytes).decode()
                else:
                    frame_b64 = None
                data.append({
                    "id": cam["id"],
                    "name": cam["name"],
                    "frame": frame_b64,
                    "fps": float(fps_raw) if fps_raw else 30.0,
                    "connected": frame_bytes is not None,
                })

            await websocket.send_json({"cameras": data})
            await asyncio.sleep(0.3)
    except WebSocketDisconnect:
        pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=settings.media_root), name="media")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(vehicles.router)
app.include_router(zones.router)
app.include_router(cameras.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "speed_ocr API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
