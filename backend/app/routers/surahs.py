from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/surahs", tags=["surahs"])


@router.get("", response_model=list[schemas.SurahOut])
def list_surahs(
    db: Session = Depends(get_db), _: models.User = Depends(get_current_user)
):
    return db.query(models.Surah).order_by(models.Surah.number).all()
