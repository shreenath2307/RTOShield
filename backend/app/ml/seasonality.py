"""Indian retail seasonality: festival windows, sale periods and monsoon.

Dates for lunar festivals are approximate (±2 days) and padded with a
shopping window, which is what matters for RTO behaviour (impulse COD
orders spike before festivals; delivery networks are congested).
"""
from __future__ import annotations

from datetime import date, datetime
from functools import lru_cache

# (name, start, end) inclusive windows. Pre-festival shopping windows included.
_FESTIVALS: dict[int, list[tuple[str, tuple[int, int], tuple[int, int]]]] = {
    2024: [
        ("Holi", (3, 18), (3, 26)),
        ("Eid al-Fitr", (4, 5), (4, 11)),
        ("Raksha Bandhan", (8, 12), (8, 19)),
        ("Navratri & Dussehra", (10, 3), (10, 13)),
        ("Diwali", (10, 20), (11, 3)),
        ("Christmas & New Year", (12, 20), (12, 31)),
    ],
    2025: [
        ("New Year", (1, 1), (1, 2)),
        ("Holi", (3, 8), (3, 15)),
        ("Eid al-Fitr", (3, 27), (4, 1)),
        ("Raksha Bandhan", (8, 4), (8, 9)),
        ("Navratri & Dussehra", (9, 22), (10, 2)),
        ("Diwali", (10, 10), (10, 23)),
        ("Christmas & New Year", (12, 20), (12, 31)),
    ],
    2026: [
        ("New Year", (1, 1), (1, 2)),
        ("Holi", (2, 26), (3, 4)),
        ("Eid al-Fitr", (3, 16), (3, 21)),
        ("Raksha Bandhan", (8, 22), (8, 28)),
        ("Navratri & Dussehra", (10, 11), (10, 20)),
        ("Diwali", (10, 29), (11, 10)),
        ("Christmas & New Year", (12, 20), (12, 31)),
    ],
    2027: [
        ("New Year", (1, 1), (1, 2)),
        ("Holi", (3, 16), (3, 22)),
        ("Eid al-Fitr", (3, 6), (3, 11)),
        ("Raksha Bandhan", (8, 12), (8, 17)),
        ("Navratri & Dussehra", (9, 30), (10, 9)),
        ("Diwali", (10, 19), (10, 31)),
        ("Christmas & New Year", (12, 20), (12, 31)),
    ],
}

# Big Billion Days / Great Indian Festival / End-of-season sales (approx.)
_SALES: dict[int, list[tuple[str, tuple[int, int], tuple[int, int]]]] = {
    2024: [("Republic Day Sale", (1, 13), (1, 20)), ("Prime Day / Big Saving Days", (7, 18), (7, 24)),
           ("Big Billion Days / Great Indian Festival", (9, 26), (10, 6))],
    2025: [("Republic Day Sale", (1, 13), (1, 20)), ("Prime Day / Big Saving Days", (7, 11), (7, 16)),
           ("Big Billion Days / Great Indian Festival", (9, 22), (10, 2))],
    2026: [("Republic Day Sale", (1, 13), (1, 20)), ("Prime Day / Big Saving Days", (7, 10), (7, 16)),
           ("Big Billion Days / Great Indian Festival", (9, 25), (10, 5))],
    2027: [("Republic Day Sale", (1, 13), (1, 20)), ("Prime Day / Big Saving Days", (7, 9), (7, 15)),
           ("Big Billion Days / Great Indian Festival", (9, 23), (10, 3))],
}

# Fallback for years outside the table (rough Gregorian approximations)
_GENERIC_FESTIVALS = [
    ("Holi", (3, 5), (3, 20)),
    ("Navratri & Dussehra", (9, 28), (10, 15)),
    ("Diwali", (10, 15), (11, 10)),
    ("Christmas & New Year", (12, 20), (12, 31)),
]
_GENERIC_SALES = [("Big Billion Days / Great Indian Festival", (9, 24), (10, 4))]


def _in(d: date, start: tuple[int, int], end: tuple[int, int]) -> bool:
    return date(d.year, *start) <= d <= date(d.year, *end)


@lru_cache(maxsize=4096)
def _flags_for_date(d: date) -> tuple[bool, str | None, bool, bool]:
    fest_name = None
    for name, s, e in _FESTIVALS.get(d.year, _GENERIC_FESTIVALS):
        if _in(d, s, e):
            fest_name = name
            break
    sale = False
    for name, s, e in _SALES.get(d.year, _GENERIC_SALES):
        if _in(d, s, e):
            sale = True
            if fest_name is None:
                fest_name = name
            break
    monsoon = 6 <= d.month <= 9
    return fest_name is not None, fest_name, monsoon, sale


def season_flags(dt: datetime | date | None = None) -> dict:
    """Return {is_festival_window, festival_name, is_monsoon, is_sale_period}."""
    if dt is None:
        dt = datetime.now()
    d = dt.date() if isinstance(dt, datetime) else dt
    try:
        import pandas as pd  # local import; handles pd.Timestamp
        if isinstance(dt, pd.Timestamp):
            d = dt.to_pydatetime().date()
    except Exception:  # pragma: no cover
        pass
    is_fest, name, monsoon, sale = _flags_for_date(d)
    return {
        "is_festival_window": bool(is_fest),
        "festival_name": name,
        "is_monsoon": bool(monsoon),
        "is_sale_period": bool(sale),
    }
