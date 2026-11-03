import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


# ---------- Auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class LoginIn(BaseModel):
    username: str
    password: str


# ---------- Users ----------
class UserBase(BaseModel):
    username: str
    role: Optional[str] = "viewer"
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


Token.model_rebuild()


# ---------- Cameras ----------
class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    is_active: bool = True


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    is_active: Optional[bool] = None


class CameraOut(CameraBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------- Vehicle Data ----------
class VehicleDataBase(BaseModel):
    camera_id: Optional[uuid.UUID] = None
    vehicle_type: Optional[str] = None
    license_plate_text: Optional[str] = None
    license_plate_raw_ocr: Optional[str] = None
    speed: Optional[float] = None


class VehicleDataCreate(VehicleDataBase):
    pass


class VehicleDataUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    license_plate_text: Optional[str] = None
    license_plate_raw_ocr: Optional[str] = None
    speed: Optional[float] = None


class VehicleDataOut(VehicleDataBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    camera_name: Optional[str] = None
    entry_time: Optional[datetime] = None
    screenshot_path: Optional[str] = None
    license_plate_path: Optional[str] = None
    video_path: Optional[str] = None

    @field_validator("speed", mode="before")
    @classmethod
    def cast_speed(cls, v):
        return float(v) if v is not None else None


class VehicleDataPage(BaseModel):
    total: int
    items: list[VehicleDataOut]


# ---------- Zones ----------
class ZoneBase(BaseModel):
    name: str
    zone_type: str = "ROI"
    coords: list
    gate_distance_meters: Optional[float] = None
    is_active: bool = True

    @field_validator("coords")
    @classmethod
    def validate_coords(cls, v, info):
        zone_type = info.data.get("zone_type", "ROI")
        if zone_type == "ROI":
            if not isinstance(v, list) or len(v) < 3:
                raise ValueError("ROI must have at least 3 coordinate pairs")
            for pt in v:
                if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                    raise ValueError("Each ROI coord must be [x, y]")
        elif zone_type == "SPEED_GATE":
            if not isinstance(v, list) or len(v) != 2:
                raise ValueError("SPEED_GATE must have exactly 2 gate entries")
            for gate in v:
                if not isinstance(gate, list) or len(gate) != 2:
                    raise ValueError("Each gate must have 2 points")
                for pt in gate:
                    if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                        raise ValueError("Each gate point must be [x, y]")
        return v

    @field_validator("gate_distance_meters")
    @classmethod
    def validate_gate_distance(cls, v):
        if v is not None and (v < 1.0 or v > 100.0):
            raise ValueError("gate_distance_meters must be between 1 and 100")
        return v


class ZoneCreate(ZoneBase):
    camera_id: uuid.UUID


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    coords: Optional[list] = None
    gate_distance_meters: Optional[float] = None
    is_active: Optional[bool] = None


class ZoneOut(ZoneBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    camera_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
