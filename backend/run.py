"""Run the RTO Shield API: ``python run.py`` (from the backend/ directory)."""
import os
import sys
from pathlib import Path

os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("RTO_HOST", "0.0.0.0"),
        port=int(os.environ.get("RTO_PORT", "8000")),
        reload=os.environ.get("RTO_RELOAD", "0") == "1",
        log_level="info",
    )
