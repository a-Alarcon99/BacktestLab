import os

import pytest

# Settings require a DATABASE_URL; unit tests never connect to it.
os.environ.setdefault("DATABASE_URL", "postgresql://test@localhost/test")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")


@pytest.fixture(autouse=True)
def no_warmup(monkeypatch):
    """`/health` schedules a warm-up that needs the DB and providers; tests never run it."""
    monkeypatch.setattr("app.api.routes.health.warm_market_data", lambda: None)
