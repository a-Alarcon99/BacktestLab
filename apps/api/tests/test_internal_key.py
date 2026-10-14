import pytest
from fastapi.testclient import TestClient
from test_security import body

from app.core.config import get_settings
from app.core.db import get_conn
from app.core.security import limiter
from app.main import app


@pytest.fixture
def bare_client():
    limiter.reset()
    app.dependency_overrides[get_conn] = lambda: None
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
    limiter.reset()


def test_run_requires_the_internal_key(bare_client):
    assert bare_client.post("/backtests/run", json=body()).status_code == 401


def test_run_rejects_a_wrong_key(bare_client):
    res = bare_client.post("/backtests/run", json=body(), headers={"X-Internal-Key": "nope"})
    assert res.status_code == 401


def test_key_is_checked_before_the_payload(bare_client):
    res = bare_client.post("/backtests/run", json=body(symbol="!!"))
    assert res.status_code == 401


def test_valid_key_reaches_validation(bare_client):
    key = get_settings().internal_api_key
    res = bare_client.post(
        "/backtests/run", json=body(symbol="!!"), headers={"X-Internal-Key": key}
    )
    assert res.status_code == 422


def test_unconfigured_key_refuses_everyone(bare_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "internal_api_key", None)
    res = bare_client.post("/backtests/run", json=body(), headers={"X-Internal-Key": "x"})
    assert res.status_code == 503
