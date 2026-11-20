"""Customer-facing (unauthenticated) confirmation endpoints, addressed by an unguessable token."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Action, Seller
from app.db.session import get_db
from app.schemas.api import PublicResponseIn
from app.services.actions import handle_response, public_view
from app.services.sellers import seller_settings

router = APIRouter(prefix="/public", tags=["public"])


def _action(db: Session, token: str) -> Action:
    if not token or len(token) > 64:
        raise HTTPException(404, "Link not found")
    a = db.scalar(select(Action).where(Action.token == token))
    if a is None:
        raise HTTPException(404, "This confirmation link is invalid")
    return a


@router.get("/confirm/{token}")
def get_confirm(token: str, db: Session = Depends(get_db)):
    a = _action(db, token)
    seller = db.get(Seller, a.seller_id)
    store = seller_settings(seller).get("store_name") if seller else "Store"
    return public_view(a, store or "Store")


@router.post("/confirm/{token}")
def post_confirm(token: str, body: PublicResponseIn, db: Session = Depends(get_db)):
    a = _action(db, token)
    kind_opts = public_view(a, "")["options"]
    if body.response not in kind_opts:
        raise HTTPException(422, f"Response '{body.response}' is not available for this request")
    res = handle_response(db, a, body.response, address=body.address, pincode=body.pincode)
    db.commit()
    return res
