import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Text, JSON, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    username = Column(String(100), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="admin")
    is_active = Column(Boolean, nullable=False, default=True)
    token = Column(String(455), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Camera(Base):
    __tablename__ = "camera"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(String(255), nullable=False)
    rtsp_url = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    zones = relationship("Zone", backref="camera", cascade="all, delete-orphan")
    vehicle_data = relationship("VehicleData", backref="camera")


class VehicleData(Base):
    __tablename__ = "vehicle_data"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    camera_id = Column(UUID(as_uuid=True), ForeignKey("camera.id", ondelete="SET NULL"), nullable=True)
    vehicle_type = Column(String(50), nullable=True)
    entry_time = Column(DateTime, server_default=func.now())
    screenshot_path = Column(Text, nullable=True)
    license_plate_path = Column(Text, nullable=True)
    video_path = Column(Text, nullable=True)
    license_plate_text = Column(Text, nullable=True)
    license_plate_raw_ocr = Column(Text, nullable=True)
    speed = Column(Numeric(5, 2), nullable=True)

    @property
    def camera_name(self):
        return self.camera.name if self.camera else None


class Zone(Base):
    __tablename__ = "zones"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    camera_id = Column(UUID(as_uuid=True), ForeignKey("camera.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    zone_type = Column(String(20), default="ROI")
    coords = Column(JSON, nullable=False)
    gate_distance_meters = Column(Numeric(5, 2), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
