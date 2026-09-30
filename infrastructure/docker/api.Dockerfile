# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Production image for the NestJS API (multi-stage, distroless-ish, non-root)
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
COPY . .
RUN npm run build:packages \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build:api \
 && npm prune --omit=dev

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# Apply pending migrations, then serve. `db:deploy` is a no-op when up to date.
CMD ["sh", "-c", "node /app/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node ../../apps/api/dist/main.js"]
