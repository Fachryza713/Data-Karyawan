# syntax=docker/dockerfile:1

# Multi-stage:
#   dev   -> hot reload (dipakai docker-compose.yml, kode di-bind mount)
#   prod  -> image ramping: hanya dist + dependency produksi, user non-root
#
# Build manual:
#   docker build --target dev  -t hris-api:dev  backend
#   docker build --target prod -t hris-api      backend

ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
WORKDIR /app
# OpenSSL dibutuhkan schema engine Prisma (prisma migrate) di Alpine.
RUN apk add --no-cache openssl \
    && chown node:node /app
USER node

# ---------------------------------------------------------------------------
# Semua dependency (dev + prod). postinstall menjalankan `prisma generate`,
# jadi skema Prisma disalin lebih dulu.
FROM base AS deps
COPY --chown=node:node package.json package-lock.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npm ci && npm cache clean --force

# ---------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
COPY --chown=node:node . .
EXPOSE 3000
# Generate ulang karena src/ di-bind mount dari host (folder generated
# milik image tertutup mount).
CMD ["sh", "-c", "npx prisma generate && npm run start:dev"]

# ---------------------------------------------------------------------------
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
CMD ["node", "dist/main.js"]
