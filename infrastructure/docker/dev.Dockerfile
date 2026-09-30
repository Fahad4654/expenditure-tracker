# Development image shared by the `api` and `web` compose services.
# Dependencies are installed once at build time; source is bind-mounted at run
# time (see docker-compose.yml) so edits hot-reload without reinstalling.
FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/config/package.json packages/config/package.json

RUN npm ci

COPY . .

EXPOSE 4000 3000
CMD ["npm", "run", "dev"]
