# Multi-stage build.
#
# Stage 1 (frontend-builder) builds the React/Vite frontend to /build/dist.
# Stage 2 (final) is a single Python image that serves both the FastAPI
# backend and the built frontend (via app.main StaticFiles mount).
#
# Container layout mirrors the repo layout so that FRONTEND_DIST resolves:
#   /app/backend/app/main.py -> parent.parent.parent == /app -> /app/frontend/dist

FROM node:22-alpine AS frontend-builder

WORKDIR /build

# pnpm-lock.yaml is lockfileVersion 9.0 -> pnpm 9.
RUN npm install -g pnpm@9

# Install dependencies first (better layer caching).
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Now the source, then build.
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
RUN pnpm build


FROM python:3.11-slim

WORKDIR /app

# The app uses zoneinfo-based scheduling (Europe/London by default); the
# tzdata package is required on slim images or ZoneInfo raises at startup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Backend code.
COPY backend/app ./backend/app

# Built frontend, placed at the repo-root-relative location the backend
# resolves (see FRONTEND_DIST in backend/app/main.py).
COPY --from=frontend-builder /build/dist ./frontend/dist

# Run uvicorn from /app/backend so `app.main:app` imports correctly.
WORKDIR /app/backend

EXPOSE 5101

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5101"]
