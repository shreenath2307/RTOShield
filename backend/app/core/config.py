"""Application settings (env prefix ``RTO_``, ``.env`` supported)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RTO_",
        env_file=(str(BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "RTO Shield"
    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./rto_shield.db"
    artifact_dir: Path = BACKEND_DIR / "artifacts"

    # messaging
    messaging_provider: str = "mock"  # mock | twilio | meta_whatsapp | msg91
    public_base_url: str = "http://localhost:3000"
    twilio_sid: str | None = None
    twilio_token: str | None = None
    twilio_from: str | None = None
    meta_wa_token: str | None = None
    meta_wa_phone_id: str | None = None
    msg91_key: str | None = None

    # webhooks
    shopify_webhook_secret: str | None = None
    woo_webhook_secret: str | None = None

    # demo / seeding
    seed_demo: bool = True
    seed_historical_n: int = 8000
    seed_pilot_n: int = 2000  # resolved live orders across treatment/control (pilot period)
    seed_live_n: int = 150  # recent, unresolved live orders
    default_seller_id: str = "demo"
    default_store_name: str = "Demo Store"

    # background jobs
    scheduler_enabled: bool = True
    scheduler_interval_sec: int = 3600

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


settings = Settings()
