"""SQLAlchemy 2.0 typed ORM models. Works on SQLite and Postgres."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now()


class Seller(Base):
    __tablename__ = "sellers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("seller_id", "order_id", name="uq_orders_seller_order"),
        Index("ix_orders_seller_hist_created", "seller_id", "is_historical", "created_at"),
        Index("ix_orders_seller_tier", "seller_id", "risk_tier"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[str] = mapped_column(String(64), ForeignKey("sellers.id"), index=True)
    order_id: Mapped[str] = mapped_column(String(128))
    order_date: Mapped[datetime] = mapped_column(DateTime, index=True)
    customer_id: Mapped[str] = mapped_column(String(128), index=True)
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pincode: Mapped[str] = mapped_column(String(6), index=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_value: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[str] = mapped_column(String(16))
    product_category: Mapped[str] = mapped_column(String(64), default="other")
    sku: Mapped[str | None] = mapped_column(String(128), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    channel: Mapped[str] = mapped_column(String(32), default="manual")
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True)

    status: Mapped[str] = mapped_column(String(32), default="NEW", index=True)
    is_historical: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    upload_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # denormalised latest scoring info (fast list filters)
    risk_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_tier: Mapped[str | None] = mapped_column(String(16), nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recommendation: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    experiment_group: Mapped[str | None] = mapped_column(String(16), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    outcome_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="Prediction.id"
    )
    actions: Mapped[list["Action"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="Action.id"
    )


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_pk: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    seller_id: Mapped[str] = mapped_column(String(64), index=True)
    probability: Mapped[float] = mapped_column(Float)
    tier: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[str] = mapped_column(String(16), default="medium")
    cold_start: Mapped[bool] = mapped_column(Boolean, default=False)
    model_version: Mapped[str] = mapped_column(String(64))
    reasons: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    pincode_share: Mapped[float] = mapped_column(Float, default=0.0)
    fairness_adjusted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    order: Mapped[Order] = relationship(back_populates="predictions")


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_pk: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    seller_id: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    response: Mapped[str | None] = mapped_column(String(64), nullable=True)
    response_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    experiment_group: Mapped[str] = mapped_column(String(16), default="treatment")
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    order: Mapped[Order] = relationship(back_populates="actions")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[str] = mapped_column(String(64), unique=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    algorithm: Mapped[str | None] = mapped_column(String(64), nullable=True)
    report: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    artifact_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    n_train: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[str] = mapped_column(String(64), index=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="csv")
    source_format: Mapped[str | None] = mapped_column(String(32), nullable=True)
    column_map: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    report: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    labelled_rows: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[str] = mapped_column(String(64), index=True)
    order_pk: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(48))
    text: Mapped[str] = mapped_column(Text)
    data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


Event = AuditLog
