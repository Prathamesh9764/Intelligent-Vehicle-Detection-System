from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("", response_model=list[schemas.ZoneOut])
def list_zones(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
    camera_id: Optional[str] = None,
    active_only: bool = False,
):
    q = db.query(models.Zone)
    if camera_id:
        q = q.filter(models.Zone.camera_id == camera_id)
    if active_only:
        q = q.filter(models.Zone.is_active == True)
    return q.order_by(models.Zone.created_at.desc()).all()


@router.get("/{zone_id}", response_model=schemas.ZoneOut)
def get_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    z = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")
    return z


@router.post("", response_model=schemas.ZoneOut, status_code=201)
def create_zone(
    payload: schemas.ZoneCreate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    z = models.Zone(**payload.model_dump())
    db.add(z)
    db.commit()
    db.refresh(z)
    return z


@router.put("/{zone_id}", response_model=schemas.ZoneOut)
def update_zone(
    zone_id: str,
    payload: schemas.ZoneUpdate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    z = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(z, field, value)
    db.commit()
    db.refresh(z)
    return z


@router.delete("/{zone_id}", status_code=204)
def delete_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    z = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")
    db.delete(z)
    db.commit()
