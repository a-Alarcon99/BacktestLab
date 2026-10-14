import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout

from app.api.routes import assets, backtests, health
from app.core.config import get_settings
from app.core.db import pool
from app.core.security import BodySizeLimitMiddleware, make_rate_limit_middleware
from app.services.candles import InvalidRangeError
from app.services.market_data import ProviderBudgetError

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(
    title="BacktestLab API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

# Added last = outermost: CORS answers first, then the body cap, then rate limiting.
app.middleware("http")(make_rate_limit_middleware(settings))
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # The API uses no cookies or browser credentials.
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # The default handler echoes the rejected input, which can't be serialized for `Infinity`/`NaN`
    # (a 500) and would reflect attacker-controlled data. Only location and message are returned.
    errors = [
        {"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


@app.exception_handler(InvalidRangeError)
def invalid_range_handler(_: Request, exc: InvalidRangeError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(PoolTimeout)
def pool_timeout_handler(_: Request, __: PoolTimeout) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"detail": "Busy, try again shortly"}, headers={"Retry-After": "5"}
    )


@app.exception_handler(ProviderBudgetError)
def provider_budget_handler(_: Request, __: ProviderBudgetError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": "Market data provider budget exhausted, try again later"},
        headers={"Retry-After": "30"},
    )


@app.exception_handler(httpx.HTTPError)
def provider_error_handler(_: Request, exc: httpx.HTTPError) -> JSONResponse:
    logger.error("Market data provider error: %r", exc)
    return JSONResponse(status_code=502, content={"detail": "Market data provider unavailable"})


app.include_router(health.router)
app.include_router(assets.router)
app.include_router(backtests.router)
