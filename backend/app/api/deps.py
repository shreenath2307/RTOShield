from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.db.models import Seller
from app.db.session import get_db
from app.services.sellers import get_or_create_seller


def current_seller(
    db: Session = Depends(get_db),
    x_seller_id: str | None = Header(default=None, alias="X-Seller-Id"),
) -> Seller:
    """Single-tenant demo by default; multi-tenant ready via ``X-Seller-Id``."""
    return get_or_create_seller(db, x_seller_id)
