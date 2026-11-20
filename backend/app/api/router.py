from fastapi import APIRouter

from app.api import dashboard, ingest, model, orders, public, score, system, webhooks

api_router = APIRouter(prefix="/api")
for r in (system.router, ingest.router, webhooks.router, model.router, score.router, orders.router,
          public.router, dashboard.router):
    api_router.include_router(r)
