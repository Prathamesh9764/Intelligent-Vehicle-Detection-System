from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter(prefix="/cameras", tags=["cameras"])


@router.get("", response_model=list[schemas.CameraOut])
def list_cameras(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    active_only: bool = False,
):
    q = db.query(models.Camera)
    if active_only:
        q = q.filter(models.Camera.is_active == True)
    return q.order_by(models.Camera.created_at.desc()).all()


@router.get("/{camera_id}", response_model=schemas.CameraOut)
def get_camera(
    camera_id: str,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    return cam


@router.post("", response_model=schemas.CameraOut, status_code=201)
def create_camera(
    payload: schemas.CameraCreate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    cam = models.Camera(**payload.model_dump())
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return cam


@router.put("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: str,
    payload: schemas.CameraUpdate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cam, field, value)
    db.commit()
    db.refresh(cam)
    return cam


@router.delete("/{camera_id}", status_code=204)
def delete_camera(
    camera_id: str,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.delete(cam)
    db.commit()
