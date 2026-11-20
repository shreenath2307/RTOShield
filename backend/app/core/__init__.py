import os

# Some Windows machines (Smart App Control / WDAC) block SQLAlchemy's compiled
# Cython extensions. The pure-Python fallback is functionally identical.
os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
