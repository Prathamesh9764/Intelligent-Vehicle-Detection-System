import asyncio
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.config import settings
from app.database import get_db, SessionLocal
from app.deps import get_current_user

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

HSRP_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,2}\d{4}$")
BH_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")

VALID_STATES = {
    "AP", "AR", "AS", "BR", "CG", "GA", "GJ", "HR", "HP", "JH",
    "KA", "KL", "MP", "MH", "MN", "ML", "MZ", "NL", "OD", "PB",
    "RJ", "SK", "TN", "TS", "TR", "UP", "UK", "WB",
    "AN", "CH", "DD", "DL", "JK", "LA", "LD", "PY",
}


def _vehicle_query(
    db,
    camera_id=None,
    vehicle_type=None,
    license_plate=None,
    min_speed=None,
    max_speed=None,
    overspeed_only=False,
    date_from=None,
    date_to=None,
):
    """Shared base query for the list and XLSX-export endpoints so the
    exported rows always match what the Dashboard shows."""
    q = db.query(models.VehicleData).options(joinedload(models.VehicleData.camera))
    if camera_id:
        q = q.filter(models.VehicleData.camera_id == camera_id)
    if vehicle_type:
        q = q.filter(models.VehicleData.vehicle_type == vehicle_type)
    if license_plate:
        q = q.filter(models.VehicleData.license_plate_text.ilike(f"%{license_plate}%"))
    if min_speed is not None:
        q = q.filter(models.VehicleData.speed >= min_speed)
    if max_speed is not None:
        q = q.filter(models.VehicleData.speed <= max_speed)
    if overspeed_only:
        q = q.filter(models.VehicleData.speed > settings.speed_limit_kmh)
    if date_from:
        q = q.filter(models.VehicleData.entry_time >= date_from)
    if date_to:
        q = q.filter(models.VehicleData.entry_time <= date_to)
    return q


def _valid_plate(text: Optional[str]) -> bool:
    if not text:
        return False
    text = re.sub(r"[^A-Z0-9]", "", str(text).upper())
    if BH_PATTERN.match(text):
        return True
    return bool(HSRP_PATTERN.match(text) and text[:2] in VALID_STATES)


def _save_upload(file: UploadFile, subfolder: str) -> str:
    ext = Path(file.filename or "").suffix or ".jpg"
    name = f"{uuid.uuid4()}{ext}"
    dest = Path(settings.media_root) / subfolder / name
    with open(dest, "wb") as f:
        while chunk := file.file.read(1024 * 1024):
            f.write(chunk)
    file.file.close()
    return f"/media/{subfolder}/{name}"


@router.get("", response_model=schemas.VehicleDataPage)
def list_vehicles(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    license_plate: Optional[str] = None,
    min_speed: Optional[float] = None,
    max_speed: Optional[float] = None,
    overspeed_only: bool = False,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    q = _vehicle_query(
        db,
        camera_id=camera_id,
        vehicle_type=vehicle_type,
        license_plate=license_plate,
        min_speed=min_speed,
        max_speed=max_speed,
        overspeed_only=overspeed_only,
        date_from=date_from,
        date_to=date_to,
    )

    total = q.count()
    items = (
        q.order_by(models.VehicleData.entry_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return schemas.VehicleDataPage(total=total, items=items)


@router.get("/analysis")
def analysis(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = Query(None),
    vehicle_type: Optional[str] = Query(None),
    min_speed: Optional[float] = Query(None),
    max_speed: Optional[float] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    def _apply_filters(q):
        if camera_id:
            q = q.filter(models.VehicleData.camera_id == camera_id)
        if vehicle_type:
            q = q.filter(models.VehicleData.vehicle_type == vehicle_type)
        if min_speed is not None:
            q = q.filter(models.VehicleData.speed >= min_speed)
        if max_speed is not None:
            q = q.filter(models.VehicleData.speed <= max_speed)
        if date_from:
            q = q.filter(models.VehicleData.entry_time >= date_from)
        if date_to:
            q = q.filter(models.VehicleData.entry_time <= date_to)
        return q

    base = _apply_filters(db.query(models.VehicleData))

    total = base.count()
    speed_stats = _apply_filters(db.query(
        func.avg(models.VehicleData.speed).label("avg"),
        func.max(models.VehicleData.speed).label("max"),
    )).first()
    avg_speed = round(float(speed_stats.avg), 1) if speed_stats and speed_stats.avg else 0
    max_speed = round(float(speed_stats.max), 1) if speed_stats and speed_stats.max else 0

    overspeed_count = base.filter(
        models.VehicleData.speed > settings.speed_limit_kmh
    ).count()

    by_type = (
        _apply_filters(db.query(models.VehicleData.vehicle_type, func.count().label("count")))
        .filter(models.VehicleData.vehicle_type.isnot(None))
        .group_by(models.VehicleData.vehicle_type)
        .order_by(func.count().desc())
        .all()
    )

    speed_cases = [
        (models.VehicleData.speed.between(0, 10), "0-10"),
        (models.VehicleData.speed.between(10, 20), "10-20"),
        (models.VehicleData.speed.between(20, 40), "20-40"),
        (models.VehicleData.speed.between(40, 60), "40-60"),
        (models.VehicleData.speed.between(60, 80), "60-80"),
        (models.VehicleData.speed.between(80, 100), "80-100"),
        (models.VehicleData.speed >= 100, "100+"),
    ]
    by_speed_range = []
    for cond, label in speed_cases:
        c = _apply_filters(db.query(models.VehicleData).filter(cond)).count()
        by_speed_range.append({"range": label, "count": c})

    by_day = (
        _apply_filters(db.query(
            func.date(models.VehicleData.entry_time).label("date"),
            func.count().label("count"),
        ))
        .filter(models.VehicleData.entry_time.isnot(None))
        .group_by(func.date(models.VehicleData.entry_time))
        .order_by(func.date(models.VehicleData.entry_time).desc())
        .limit(14)
        .all()
    )
    by_day = [{"date": str(r.date), "count": r.count} for r in reversed(by_day)]

    filtered_cameras = _apply_filters(
        db.query(models.VehicleData.camera_id.label("cid"))
    ).subquery()
    by_camera = (
        db.query(
            models.Camera.name.label("camera_name"),
            func.count(filtered_cameras.c.cid).label("count"),
        )
        .outerjoin(filtered_cameras, models.Camera.id == filtered_cameras.c.cid)
        .group_by(models.Camera.name)
        .order_by(func.count().desc())
        .all()
    )
    by_camera = [{"camera_name": r.camera_name or "Unknown", "count": r.count} for r in by_camera]

    return {
        "total": total,
        "avg_speed": avg_speed,
        "max_speed": max_speed,
        "overspeed_count": overspeed_count,
        "speed_limit_kmh": settings.speed_limit_kmh,
        "by_type": [{"vehicle_type": r.vehicle_type, "count": r.count} for r in by_type],
        "by_speed_range": by_speed_range,
        "by_day": by_day,
        "by_camera": by_camera,
    }


@router.get("/types")
def vehicle_types(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    types = (
        db.query(models.VehicleData.vehicle_type)
        .filter(models.VehicleData.vehicle_type.isnot(None))
        .distinct()
        .order_by(models.VehicleData.vehicle_type)
        .all()
    )
    return [t[0] for t in types]


@router.get("/camera-counts")
def camera_counts(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = Query(None),
    vehicle_type: Optional[str] = Query(None),
    min_speed: Optional[float] = Query(None),
    max_speed: Optional[float] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    q = (
        db.query(models.Camera.name, func.count(models.VehicleData.id))
        .outerjoin(models.VehicleData, models.VehicleData.camera_id == models.Camera.id)
    )
    if camera_id:
        q = q.filter(models.VehicleData.camera_id == camera_id)
    if vehicle_type:
        q = q.filter(models.VehicleData.vehicle_type == vehicle_type)
    if min_speed is not None:
        q = q.filter(models.VehicleData.speed >= min_speed)
    if max_speed is not None:
        q = q.filter(models.VehicleData.speed <= max_speed)
    if date_from:
        q = q.filter(models.VehicleData.entry_time >= date_from)
    if date_to:
        q = q.filter(models.VehicleData.entry_time <= date_to)
    rows = q.group_by(models.Camera.id, models.Camera.name).order_by(models.Camera.name).all()
    return [{"camera_name": name, "count": count} for name, count in rows]


@router.get("/stats")
def stats(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    total = db.query(models.VehicleData).count()
    overspeed = (
        db.query(models.VehicleData)
        .filter(models.VehicleData.speed > settings.speed_limit_kmh)
        .count()
    )
    return {"total": total, "overspeed": overspeed, "speed_limit_kmh": settings.speed_limit_kmh}


@router.get("/export")
def export_vehicles(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    license_plate: Optional[str] = None,
    min_speed: Optional[float] = None,
    max_speed: Optional[float] = None,
    overspeed_only: bool = False,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    """XLSX export of the Dashboard results — applies exactly the same
    filters as /vehicles so the downloaded file matches the UI."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    rows = (
        _vehicle_query(
            db,
            camera_id=camera_id,
            vehicle_type=vehicle_type,
            license_plate=license_plate,
            min_speed=min_speed,
            max_speed=max_speed,
            overspeed_only=overspeed_only,
            date_from=date_from,
            date_to=date_to,
        )
        .order_by(models.VehicleData.entry_time.desc())
        .all()
    )

    headers = [
        "Entry Time",
        "Camera",
        "Vehicle Type",
        "License Plate",
        "Speed (km/h)",
    ]
    widths = [22, 20, 15, 17, 13]

    wb = Workbook()
    ws = wb.active
    ws.title = "Vehicle Detection Report"

    lane_fill = PatternFill("solid", fgColor="D946EF")
    header_fill = PatternFill("solid", fgColor="1E293B")
    alt_fill = PatternFill("solid", fgColor="F8FAFC")
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    title_font = Font(bold=True, size=15, color="FFFFFF")
    meta_font = Font(italic=True, size=10, color="475569")
    header_font = Font(bold=True, size=11, color="FFFFFF")
    body_font = Font(size=11, color="0F172A")
    center = Alignment(horizontal="center", vertical="center")

    # Report title
    ws.merge_cells("A1:E1")
    title = ws["A1"]
    title.value = "Vehicle Detection Report"
    title.font = title_font
    title.fill = lane_fill
    title.alignment = center
    ws.row_dimensions[1].height = 28

    # Applied filters summary
    filters_meta = []
    if camera_id:
        filters_meta.append(f"Camera: {camera_id}")
    if vehicle_type:
        filters_meta.append(f"Type: {vehicle_type}")
    if license_plate:
        filters_meta.append(f"Plate: {license_plate}")
    if min_speed is not None or max_speed is not None:
        lo = min_speed if min_speed is not None else "?"
        hi = max_speed if max_speed is not None else "?"
        filters_meta.append(f"Speed: {lo}-{hi} km/h")
    if date_from:
        filters_meta.append(f"From: {date_from.isoformat(sep=' ')}")
    if date_to:
        filters_meta.append(f"To: {date_to.isoformat(sep=' ')}")

    ws.merge_cells("A2:E2")
    meta = ws["A2"]
    meta.value = "Filters: " + (", ".join(filters_meta) if filters_meta else "None")
    meta.font = meta_font
    meta.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 18

    # Header row
    header_row = 3
    for col, (name, width) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=header_row, column=col, value=name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = border
    ws.row_dimensions[header_row].height = 20

    def _text(cell, val):
        # Store as a plain string so plate/OCR text can never be
        # interpreted as a formula by Excel.
        cell.value = val if val is not None else ""
        cell.data_type = "s"
        return cell

    # Data rows
    for i, v in enumerate(rows, start=1):
        r = header_row + i
        fill = alt_fill if i % 2 == 0 else None
        dt_cell = ws.cell(row=r, column=1, value=v.entry_time)
        dt_cell.number_format = "dd-mmm-yyyy hh:mm AM/PM"
        ws.cell(row=r, column=2, value=v.camera_name or "")
        _text(ws.cell(row=r, column=3), v.vehicle_type or "")
        _text(ws.cell(row=r, column=4), v.license_plate_text or "")
        sp_cell = ws.cell(row=r, column=5, value=float(v.speed) if v.speed is not None else None)
        sp_cell.number_format = "0.00"

        for col in range(1, len(headers) + 1):
            cell = ws.cell(row=r, column=col)
            cell.font = body_font
            cell.border = border
            if fill:
                cell.fill = fill

    for col, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width

    last_data_row = header_row + len(rows)
    if rows:
        ws.auto_filter.ref = f"A{header_row}:E{last_data_row}"
    ws.freeze_panes = f"A{header_row + 1}"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"vehicle_detection_report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{vehicle_id}", response_model=schemas.VehicleDataOut)
def get_vehicle(
    vehicle_id: str, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)
):
    v = db.query(models.VehicleData).options(joinedload(models.VehicleData.camera)).filter(models.VehicleData.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle record not found")
    return v

@router.post("", response_model=schemas.VehicleDataOut, status_code=201)
def create_vehicle(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = Form(None),
    vehicle_type: Optional[str] = Form(None),
    license_plate_text: Optional[str] = Form(None),
    license_plate_raw_ocr: Optional[str] = Form(None),
    speed: Optional[float] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    license_plate_image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
):
    if license_plate_text and not _valid_plate(license_plate_text):
        license_plate_text = None
    elif license_plate_text:
        license_plate_raw_ocr = None

    if camera_id is not None:
        try:
            uuid.UUID(camera_id)
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(status_code=422, detail="Invalid camera_id")
        cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
        if cam is None:
            raise HTTPException(status_code=404, detail="Camera not found")

    v = models.VehicleData(
        camera_id=camera_id,
        vehicle_type=vehicle_type,
        license_plate_text=license_plate_text,
        license_plate_raw_ocr=license_plate_raw_ocr,
        speed=speed,
    )
    saved_paths: list[str] = []
    try:
        if screenshot is not None:
            v.screenshot_path = _save_upload(screenshot, "screenshots")
            saved_paths.append(v.screenshot_path)
        if license_plate_image is not None:
            v.license_plate_path = _save_upload(license_plate_image, "plates")
            saved_paths.append(v.license_plate_path)
        if video is not None:
            v.video_path = _save_upload(video, "videos")
            saved_paths.append(v.video_path)
        db.add(v)
        db.commit()
        db.refresh(v)
    except Exception:
        db.rollback()
        for p in saved_paths:
            try:
                Path(p).unlink(missing_ok=True)
            except OSError:
                pass
        raise
    return v


@router.patch("/{vehicle_id}", response_model=schemas.VehicleDataOut)
def update_vehicle(
    vehicle_id: str,
    payload: schemas.VehicleDataUpdate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    v = db.query(models.VehicleData).filter(models.VehicleData.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle record not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(v, field, value)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{vehicle_id}", status_code=204)
def delete_vehicle(
    vehicle_id: str, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)
):
    v = db.query(models.VehicleData).filter(models.VehicleData.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle record not found")
    db.delete(v)
    db.commit()


# ---------- Live feed via WebSocket (polls DB for new rows) ----------
@router.websocket("/ws/live")
async def live_feed(websocket: WebSocket, token: Optional[str] = None):
    from app.security import decode_access_token

    if not token or decode_access_token(token) is None:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    # Composite keyset cursor on (entry_time, id). entry_time alone is not a
    # safe cursor: rows inserted in the same transaction share an identical
    # timestamp, so a bare "entry_time > last_seen" cursor skips the overflow
    # rows of the .limit(100) batch below. Ordering by a unique tiebreaker
    # (id) makes every row delivered exactly once, even under same-timestamp
    # bursts.
    zero_uuid = uuid.UUID(int=0)
    cursor_time: datetime = datetime.now(timezone.utc).replace(tzinfo=None)
    cursor_id: uuid.UUID = zero_uuid
    try:
        while True:
            db = SessionLocal()
            try:
                q = (
                    db.query(models.VehicleData)
                    .order_by(
                        models.VehicleData.entry_time.asc(),
                        models.VehicleData.id.asc(),
                    )
                )
                q = q.filter(
                    or_(
                        models.VehicleData.entry_time > cursor_time,
                        and_(
                            models.VehicleData.entry_time == cursor_time,
                            models.VehicleData.id > cursor_id,
                        ),
                    )
                )
                # Ascending order + generous cap, not a hard "last N":
                # backlog rows older than the newest batch can't be silently
                # skipped, and a burst doesn't flood the client.
                new_rows = q.limit(100).all()
            finally:
                db.close()

            if new_rows:
                # Advance the cursor to the last row with a usable timestamp
                # (ORDER BY asc... puts NULL timestamps last, defensively skip
                # them so the cursor never becomes NULL).
                last_row = None
                for r in reversed(new_rows):
                    if r.entry_time is not None:
                        last_row = r
                        break
                if last_row is not None:
                    cursor_time = last_row.entry_time
                    cursor_id = last_row.id
                for r in new_rows:
                    data = schemas.VehicleDataOut.model_validate(r).model_dump(mode="json")
                    await websocket.send_json(data)

            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
