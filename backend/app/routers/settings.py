from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, require_creator
from ..services.settings import get_settings_dict, update_setting

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=schemas.SettingsOut)
def read_settings(
    db: Session = Depends(get_db), _: models.User = Depends(require_creator)
):
    return get_settings_dict(db)


@router.patch("", response_model=schemas.SettingsOut)
def write_settings(
    payload: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_creator),
):
    for field, value in payload.model_dump(exclude_none=True).items():
        update_setting(db, field, value)
    return get_settings_dict(db)
