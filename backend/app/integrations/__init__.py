"""External integrations: CSV import, Shopify, WooCommerce, messaging."""


class IntegrationError(Exception):
    """Raised when an external integration (store API, messaging provider) fails."""

    def __init__(self, msg: str = "integration error"):
        super().__init__(msg)
        self.msg = msg


def _setting(name: str, default=None):
    """Read ``app.core.config.settings.<name>`` lazily; fall back to env ``RTO_<NAME>``."""
    try:
        from app.core.config import settings  # noqa: WPS433 (lazy on purpose)

        val = getattr(settings, name, None)
        if val is not None and val != "":
            return val
    except Exception:
        pass
    import os

    return os.environ.get("RTO_" + name.upper(), default)


__all__ = ["IntegrationError"]
