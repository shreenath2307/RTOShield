"""Convert arbitrary python / numpy / pandas values into strict-JSON-safe values."""
from __future__ import annotations

import math
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

try:  # numpy is always installed, but keep this module import-light
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore


def json_safe(v: Any) -> Any:
    if v is None or isinstance(v, (str, bool)):
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, dict):
        return {str(k): json_safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [json_safe(x) for x in v]
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return json_safe(float(v))
    if isinstance(v, Path):
        return str(v)
    if np is not None:
        if isinstance(v, np.bool_):
            return bool(v)
        if isinstance(v, np.integer):
            return int(v)
        if isinstance(v, np.floating):
            return json_safe(float(v))
        if isinstance(v, np.ndarray):
            return [json_safe(x) for x in v.tolist()]
    if hasattr(v, "isoformat"):
        try:
            return v.isoformat()
        except Exception:
            pass
    try:
        import pandas as pd

        if v is pd.NaT or (not isinstance(v, (list, dict)) and pd.isna(v)):
            return None
    except Exception:
        pass
    if hasattr(v, "model_dump"):
        return json_safe(v.model_dump())
    return str(v)
