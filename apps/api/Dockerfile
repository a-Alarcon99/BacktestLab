FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app
RUN pip install .

RUN useradd --create-home --uid 10001 appuser
USER appuser

# The platform injects $PORT (Render, Railway, Fly...). One worker: the in-process limiters and
# the concurrency cap are per process (see SECURITY.md); scale with instances instead.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header"]
