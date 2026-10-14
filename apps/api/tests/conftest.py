import os

# Settings require a DATABASE_URL; unit tests never connect to it.
os.environ.setdefault("DATABASE_URL", "postgresql://test@localhost/test")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
