# syntax=docker/dockerfile:1.7

# ─── stage 1: build the UI ──────────────────────────────────────────────
FROM node:20-bookworm-slim AS ui-build
WORKDIR /src/ui

# Cache-friendly install — only re-run npm ci when lockfile changes.
COPY ui/package.json ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY ui/tsconfig.json ./
COPY ui/webpack.config.js ./
COPY ui/public ./public
COPY ui/src ./src
RUN npm run build && ls -lh dist-ladder/


# ─── stage 2: install python deps ───────────────────────────────────────
FROM python:3.12-slim-bookworm AS py-build
WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY ladderbot ./ladderbot
COPY scripts ./scripts

RUN pip install --no-cache-dir --upgrade pip \
 && pip wheel --no-cache-dir --no-deps -w /wheels . \
 && pip wheel --no-cache-dir -w /wheels '.[schwab,prod,yfinance]'


# ─── stage 3: runtime image ─────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

# Non-root user + writable state dir the API + persistence layer use.
RUN groupadd -r ladder && useradd -r -g ladder -d /var/lib/ladderbot ladder \
 && mkdir -p /var/lib/ladderbot/out/ladder_run \
 && chown -R ladder:ladder /var/lib/ladderbot

# Install prebuilt wheels
COPY --from=py-build /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

# Ship the built UI so the wsgi app can serve it in-process.
COPY --from=ui-build /src/ui/dist-ladder /srv/ladderbot-ui

ENV LADDER_DB_PATH=/var/lib/ladderbot/ladder.db \
    LADDER_REPORT_DIR=/var/lib/ladderbot/out/ladder_run \
    LADDER_UI_DIST_DIR=/srv/ladderbot-ui \
    LADDER_BAR_SOURCE=synthetic \
    GUNICORN_WORKERS=2 \
    GUNICORN_TIMEOUT=60 \
    PORT=5000

WORKDIR /var/lib/ladderbot
USER ladder
EXPOSE 5000

# Simple health check — Docker + orchestrators consume it.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+__import__('os').environ.get('PORT','5000')+'/api/ladder/health',timeout=3).status==200 else 1)"

CMD gunicorn \
    --workers "${GUNICORN_WORKERS}" \
    --timeout "${GUNICORN_TIMEOUT}" \
    --bind "0.0.0.0:${PORT}" \
    --access-logfile - \
    --error-logfile - \
    ladderbot.wsgi:app
