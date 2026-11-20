"""Pydantic v2 request/response models mirroring CONTRACT.md section 4."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Tier = Literal["low", "medium", "high"]
PaymentMethod = Literal["COD", "PREPAID"]
Channel = Literal["shopify", "woocommerce", "whatsapp", "instagram", "website", "manual"]
ActionType = Literal[
    "NONE",
    "CONFIRM_WHATSAPP",
    "CONFIRM_SMS",
    "CONFIRM_CALL",
    "PREPAID_NUDGE",
    "ADDRESS_VERIFY",
    "MANUAL_REVIEW",
    "HOLDOUT_CONTROL",
]
ActionStatus = Literal[
    "PENDING", "SENT", "DELIVERED", "RESPONDED", "CONFIRMED", "CANCELLED",
    "CONVERTED_PREPAID", "ADDRESS_UPDATED", "EXPIRED", "FAILED",
]
OrderStatus = Literal[
    "NEW", "SCORED", "AWAITING_CUSTOMER", "CONFIRMED", "CONVERTED_PREPAID", "ON_HOLD",
    "APPROVED", "CANCELLED", "SHIPPED", "DELIVERED", "RTO",
]

_CHANNELS = {"shopify", "woocommerce", "whatsapp", "instagram", "website", "manual"}


def mask_phone(phone: str | None) -> str | None:
    """``9876543221`` -> ``98XXXXXX21``. Keeps first 2 and last 2 digits."""
    if not phone:
        return phone
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    if len(digits) < 5:
        return "X" * len(digits)
    return digits[:2] + "X" * (len(digits) - 4) + digits[-2:]


# --------------------------------------------------------------------- requests
class OrderIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    order_id: str | None = None
    order_date: datetime | None = None
    customer_id: str | None = None
    customer_phone: str | None = None
    customer_name: str | None = None
    pincode: str
    city: str | None = None
    state: str | None = None
    address: str | None = None
    order_value: float = Field(ge=0)
    payment_method: PaymentMethod
    product_category: str = "other"
    sku: str | None = None
    quantity: int = Field(default=1, ge=1)
    channel: Channel = "manual"

    @field_validator("pincode", mode="before")
    @classmethod
    def _pin(cls, v: Any) -> str:
        s = re.sub(r"\D", "", str(v or ""))
        if len(s) != 6 or s[0] == "0":
            raise ValueError("pincode must be a valid 6-digit Indian pincode")
        return s

    @field_validator("payment_method", mode="before")
    @classmethod
    def _pm(cls, v: Any) -> str:
        s = str(v or "").strip().upper()
        if s in {"COD", "CASH ON DELIVERY", "CASH_ON_DELIVERY"}:
            return "COD"
        if s in {"PREPAID", "ONLINE", "UPI", "CARD"}:
            return "PREPAID"
        return s

    @field_validator("channel", mode="before")
    @classmethod
    def _ch(cls, v: Any) -> str:
        s = str(v or "manual").strip().lower()
        return s if s in _CHANNELS else "manual"

    @field_validator("product_category", mode="before")
    @classmethod
    def _cat(cls, v: Any) -> str:
        return str(v or "other").strip().lower() or "other"

    @field_validator("order_date", mode="after")
    @classmethod
    def _naive(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is not None:
            from datetime import timedelta, timezone

            v = v.astimezone(timezone(timedelta(hours=5, minutes=30))).replace(tzinfo=None)
        return v


class WhatIfIn(BaseModel):
    order: OrderIn
    changes: dict[str, Any] = Field(default_factory=dict)


class OutcomeIn(BaseModel):
    outcome: Literal["DELIVERED", "RTO"]


class ActionIn(BaseModel):
    type: ActionType
    channel: Literal["whatsapp", "sms", "call"] | None = None


class DecisionIn(BaseModel):
    decision: Literal["approve", "hold", "cancel", "send_confirmation", "send_prepaid_nudge", "verify_address"]
    note: str | None = None


class PublicResponseIn(BaseModel):
    response: Literal["confirm", "cancel", "convert_prepaid", "update_address"]
    address: str | None = None
    pincode: str | None = None

    @model_validator(mode="after")
    def _addr(self) -> "PublicResponseIn":
        if self.response == "update_address":
            if not self.address or len(self.address.strip()) < 8:
                raise ValueError("Please provide the full address (at least 8 characters)")
            if self.pincode is not None:
                p = re.sub(r"\D", "", self.pincode)
                if len(p) != 6:
                    raise ValueError("pincode must be 6 digits")
                self.pincode = p
        return self


class ShopifySyncIn(BaseModel):
    store_url: str
    access_token: str


class WooSyncIn(BaseModel):
    store_url: str
    consumer_key: str
    consumer_secret: str


class SimulateIn(BaseModel):
    rate_per_min: float = Field(default=20, gt=0, le=600)
    resolve_outcomes: bool = True


# ----------------------------------------------------------------- settings
class Thresholds(BaseModel):
    medium: float = Field(0.18, ge=0, le=1)
    high: float = Field(0.35, ge=0, le=1)


class Costs(BaseModel):
    forward_shipping: float = Field(70, ge=0)
    return_shipping: float = Field(70, ge=0)
    packaging: float = Field(25, ge=0)
    turnover_cost_pct: float = Field(0.04, ge=0, le=1)
    margin_pct: float = Field(0.35, ge=0, le=1)
    whatsapp_msg: float = Field(0.8, ge=0)
    sms: float = Field(0.25, ge=0)
    call: float = Field(6, ge=0)


class ActionsCfg(BaseModel):
    low: ActionType = "NONE"
    medium: ActionType = "CONFIRM_WHATSAPP"
    high: ActionType = "PREPAID_NUDGE"
    auto_trigger: bool = True
    policy: Literal["cost_optimal", "tier_rules"] = "cost_optimal"


class MessagingCfg(BaseModel):
    provider: Literal["mock", "twilio", "meta_whatsapp", "msg91"] = "mock"
    default_channel: Literal["whatsapp", "sms"] = "whatsapp"
    language: Literal["en", "hi"] = "en"


class FairnessCfg(BaseModel):
    pincode_cap: float = Field(0.35, ge=0, le=1)
    enforce: bool = True


class RetrainCfg(BaseModel):
    schedule_days: float = Field(7, gt=0)
    drift_psi_threshold: float = Field(0.2, gt=0)
    auto: bool = True


class SellerSettings(BaseModel):
    store_name: str = "Demo Store"
    thresholds: Thresholds = Field(default_factory=Thresholds)
    costs: Costs = Field(default_factory=Costs)
    actions: ActionsCfg = Field(default_factory=ActionsCfg)
    holdout_pct: float = Field(0.1, ge=0, le=0.5)
    messaging: MessagingCfg = Field(default_factory=MessagingCfg)
    fairness: FairnessCfg = Field(default_factory=FairnessCfg)
    retrain: RetrainCfg = Field(default_factory=RetrainCfg)

    @model_validator(mode="after")
    def _thr(self) -> "SellerSettings":
        if self.thresholds.medium >= self.thresholds.high:
            raise ValueError("thresholds.medium must be lower than thresholds.high")
        return self


# ---------------------------------------------------------------- responses
class Reason(BaseModel):
    feature: str
    label: str
    value: str
    impact: float
    direction: Literal["up", "down"]


class PredictionOut(BaseModel):
    probability: float
    tier: Tier
    confidence: str
    cold_start: bool
    model_version: str
    reasons: list[dict[str, Any]]
    pincode_share: float
    fairness_adjusted: bool
    created_at: datetime | None = None


class Alternative(BaseModel):
    action: str
    net_value: float


class RecommendationOut(BaseModel):
    action: str
    reason: str
    expected_saving: float
    action_cost: float
    alternatives: list[Alternative]


class ActionOut(BaseModel):
    id: int
    order_id: int
    type: str
    status: str
    channel: str | None
    message: str | None
    response: str | None
    experiment_group: str
    cost: float
    token: str | None
    created_at: datetime
    updated_at: datetime


class OrderOut(BaseModel):
    id: int
    order_id: str
    order_date: datetime
    customer_id: str
    customer_name: str | None
    customer_phone: str | None
    pincode: str
    city: str | None
    state: str | None
    address: str | None
    order_value: float
    payment_method: str
    product_category: str
    sku: str | None
    quantity: int
    channel: str
    outcome: str | None
    status: str
    is_historical: bool
    prediction: PredictionOut | None
    recommendation: RecommendationOut | None


class ScoredOrderOut(BaseModel):
    order: OrderOut
    prediction: PredictionOut
    recommendation: RecommendationOut
    action: ActionOut | None


class Paged(BaseModel):
    items: list[OrderOut]
    total: int
    page: int
    page_size: int


__all__ = [n for n in dir() if not n.startswith("_")]
