"""Seller lookup + settings (deep-merged with defaults)."""
from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.db.models import Seller
from app.schemas.api import SellerSettings


def default_settings() -> dict[str, Any]:
    s = SellerSettings(store_name=app_settings.default_store_name).model_dump()
    s["messaging"]["provider"] = app_settings.messaging_provider if app_settings.messaging_provider in {
        "mock", "twilio", "meta_whatsapp", "msg91"} else "mock"
    return s


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def get_or_create_seller(db: Session, seller_id: str | None = None) -> Seller:
    sid = seller_id or app_settings.default_seller_id
    seller = db.get(Seller, sid)
    if seller is None:
        seller = Seller(id=sid, name=app_settings.default_store_name, settings=default_settings())
        db.add(seller)
        try:
            db.commit()
        except Exception:
            db.rollback()
            seller = db.get(Seller, sid)
            assert seller is not None
    return seller


def seller_settings(seller: Seller) -> dict[str, Any]:
    merged = deep_merge(default_settings(), seller.settings or {})
    try:
        return SellerSettings.model_validate(merged).model_dump()
    except Exception:
        return default_settings()


def update_seller_settings(db: Session, seller: Seller, patch: dict[str, Any]) -> dict[str, Any]:
    merged = deep_merge(seller_settings(seller), patch or {})
    validated = SellerSettings.model_validate(merged).model_dump()  # raises ValidationError
    seller.settings = validated
    seller.name = validated.get("store_name") or seller.name
    db.commit()
    return validated
