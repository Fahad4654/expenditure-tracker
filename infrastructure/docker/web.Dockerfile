# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Production image for the React + Vite web app.
#
# Stage 1  deps    — install workspace dependencies (cached layer)
# Stage 2  build   — `vite build` → apps/web/dist
# Stage 3  runner  — nginx serving the static bundle with SPA fallback
# -----------------------------------------------------------------------------

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
# Vite inlines VITE_* variables at build time; only VITE_-prefixed keys are
# exposed to the browser.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build:packages && npm run build:web

FROM nginx:1.27-alpine AS runner
# The default conf.d/default.conf listens on 80 and serves the welcome page.
COPY infrastructure/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
