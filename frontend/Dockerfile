# Standalone frontend build stage.
#
# This image only produces the compiled React app in /build/dist. It does NOT
# use nginx and does NOT run a server: the production deployment serves the
# static files from FastAPI. The dist is expected to be copied into the
# backend image at /app/frontend/dist (see ../backend/Dockerfile).
#
# docker build -f frontend/Dockerfile --target dist -t hifz-frontend-dist .

FROM node:22-alpine AS builder

WORKDIR /build

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN pnpm build

# Final stage: holds the compiled dist as the build artifact.
FROM node:22-alpine AS dist

WORKDIR /build
COPY --from=builder /build/dist ./dist
