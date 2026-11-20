"""RTO Shield API — FastAPI application factory."""
from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

import app.core  # noqa: F401  (sets SQLAlchemy env before import)
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.events import broker
from app.core.logging import get_logger, setup_logging
from app.db.session import create_all, session_scope
from app.services.sellers import get_or_create_seller

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.log_level)
    broker.bind_loop(asyncio.get_running_loop())
    settings.artifact_dir.mkdir(parents=True, exist_ok=True)
    create_all()
    with session_scope() as db:
        get_or_create_seller(db)
    tasks: list[asyncio.Task] = []
    if settings.seed_demo:
        from app.services.seed import seed_demo

        tasks.append(asyncio.create_task(asyncio.to_thread(seed_demo)))
    if settings.scheduler_enabled:
        from app.services.scheduler import scheduler_loop

        tasks.append(asyncio.create_task(scheduler_loop()))
    log.info("RTO Shield API ready (db=%s, seed_demo=%s)", settings.database_url, settings.seed_demo)
    try:
        yield
    finally:
        from app.services.simulator import simulator

        await simulator.stop()
        for t in tasks:
            t.cancel()
            with contextlib.suppress(BaseException):
                await asyncio.wait_for(t, timeout=1)


def create_app() -> FastAPI:
    app = FastAPI(
        title="RTO Shield API",
        version="1.0.0",
        description="AI Return-to-Origin risk prediction and intervention engine for Indian D2C sellers.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errs = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e.get("loc", []) if p != "body")
            errs.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
        return JSONResponse(status_code=422, content={"detail": "; ".join(errs) or "Invalid request",
                                                      "errors": [{k: str(v) for k, v in e.items() if k != "ctx"} for e in exc.errors()]})

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error: %s", exc)
        return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}: {exc}"})

    app.include_router(api_router)

    @app.get("/")
    def root():
        return {"name": "RTO Shield API", "docs": "/docs", "health": "/api/health"}

    return app


app = create_app()
