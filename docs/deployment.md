# Deployment

## Artefacts

| File                                       | Purpose                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `infrastructure/docker/api.Dockerfile`     | Multi-stage production image for the NestJS API (non-root)      |
| `infrastructure/docker/web.Dockerfile`     | Multi-stage Vite build → static bundle served by nginx          |
| `infrastructure/docker/dev.Dockerfile`     | Dev image shared by the compose watch services                  |
| `infrastructure/nginx/nginx.conf`          | Main config: gzip, request limits, rate-limit zones             |
| `infrastructure/nginx/conf.d/default.conf` | Routing, security headers, per-location rate limits             |
| `infrastructure/nginx/web.conf`            | Baked into the web image: SPA fallback, immutable asset caching |
| `infrastructure/nginx/proxy_params`        | Shared reverse-proxy headers                                    |
| `docker-compose.prod.yml`                  | Full production stack                                           |

---

## Production stack

```bash
export POSTGRES_USER=...
export POSTGRES_PASSWORD=...          # generate: openssl rand -base64 32
export DATABASE_URL=postgresql://user:pass@postgres:5432/expenditure_tracker
export JWT_ACCESS_SECRET=...          # openssl rand -base64 48
export JWT_REFRESH_SECRET=...         # openssl rand -base64 48
export PUBLIC_API_URL=https://api.example.com
export PUBLIC_WEB_URL=https://app.example.com
export CORS_ORIGINS=https://app.example.com

docker compose -f docker-compose.prod.yml up --build -d
```

```text
:80  nginx (edge)
       ├── /           → web:3000   (nginx serving the static Vite bundle)
       ├── /api/*      → api:4000
       ├── /docs*      → api:4000   (consider blocking publicly)
       └── /healthz    → api:4000/api/v1/health/ready
```

The `web` container has no Node runtime at serve time — only `nginx` and
`apps/web/dist`. Because the bundle is static, `VITE_API_URL` is inlined at
**build** time (`--build-arg VITE_API_URL=…`); changing the API origin requires
rebuilding the image.

The `api` container runs `prisma migrate deploy` on start, then the server —
so a new release applies its own migrations.

### Health checks

| Service  | Probe                                                           |
| -------- | --------------------------------------------------------------- |
| api      | `GET /api/v1/health/ready` (503 when PostgreSQL is unreachable) |
| web      | `GET /`                                                         |
| nginx    | `GET /healthz`                                                  |
| postgres | `pg_isready`                                                    |
| redis    | `redis-cli ping`                                                |

---

## Required environment variables

### Always

| Variable                              | Notes                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                        | PostgreSQL connection string                            |
| `JWT_ACCESS_SECRET`                   | ≥ 32 random bytes                                       |
| `JWT_REFRESH_SECRET`                  | ≥ 32 random bytes, **different** from the access secret |
| `PUBLIC_API_URL`                      | e.g. `https://api.example.com`                          |
| `PUBLIC_WEB_URL`                      | e.g. `https://app.example.com`                          |
| `CORS_ORIGINS`                        | Comma-separated allow-list — never `*`                  |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Container database credentials                          |

### Optional (defaults in `env.validation.ts`)

`API_PORT`, `API_HOST`, `REDIS_URL`, `JWT_ACCESS_TTL` (`15m`),
`JWT_REFRESH_TTL` (`30d`), `JWT_ISSUER`, `JWT_AUDIENCE`, `COOKIE_DOMAIN`,
`DEFAULT_CURRENCY` (`BDT`), `DEFAULT_TIMEZONE` (`Asia/Dhaka`),
`MAX_REQUEST_BODY_SIZE` (`100kb`), `LOG_LEVEL`, `OTP_*`, `RATE_LIMIT_*`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.

Configuration is validated with Zod at boot — the process refuses to start with
an invalid or missing required value, and the message names the variable.

**Never commit `.env`.** Only `.env.example` is tracked.

### Google OAuth in production

```text
Authorized redirect URI:  https://api.example.com/api/v1/auth/google/callback
```

`GOOGLE_CALLBACK_URL` must match exactly.

---

## TLS

Terminate TLS at Nginx (or a fronting load balancer / Traefik / Caddy):

```nginx
listen 443 ssl http2;
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
ssl_protocols       TLSv1.2 TLSv1.3;
```

Then set `COOKIE_SECURE=true` (already the default in
`docker-compose.prod.yml`) so refresh cookies are never sent over plain HTTP.
Add a port-80 → 443 redirect and HSTS once HTTPS is confirmed working.

---

## Nginx edge controls

| Control                | Value                                                                 | Where                                   |
| ---------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| Request body size      | `100k`                                                                | `nginx.conf`                            |
| General rate           | 30 r/s per IP                                                         | `limit_req_zone general`                |
| Auth rate              | 5 r/min per IP                                                        | `limit_req_zone auth` → `/api/v1/auth/` |
| Sync rate              | 5 r/s, burst 40                                                       | `limit_req_zone sync` → `POST /sync`    |
| Concurrent connections | 60 per IP                                                             | `limit_conn perip`                      |
| Security headers       | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | `default.conf`                          |
| `server_tokens`        | `off`                                                                 | `nginx.conf`                            |

Validate changes with:

```bash
docker run --rm --add-host api:127.0.0.1 --add-host web:127.0.0.1 \
  -v "$PWD/infrastructure/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/infrastructure/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$PWD/infrastructure/nginx/proxy_params:/etc/nginx/proxy_params:ro" \
  nginx:1.27-alpine nginx -t
```

---

## CI/CD pipeline (recommended)

```yaml
stages: [verify, build, release, deploy]

verify:
  - npm ci
  - npm run typecheck
  - npm run lint
  - npm test
  - flutter analyze && flutter test
  - npx prisma migrate diff --from-schema-drag --to-migrations apps/api/prisma
      # fails if someone edited the schema without creating a migration

build:
  - docker build -f infrastructure/docker/api.Dockerfile  -t $API_IMAGE:$SHA .
  - docker build -f infrastructure/docker/web.Dockerfile  -t $WEB_IMAGE:$SHA .
      --build-arg VITE_API_URL=$PUBLIC_API_URL
  - docker push …

release:
  - docker compose -f docker-compose.prod.yml pull
  - docker compose -f docker-compose.prod.yml up -d --no-deps api web

deploy:
  - docker compose -f docker-compose.prod.yml run --rm api \
      node /app/node_modules/prisma/build/index.js migrate deploy \
      --schema prisma/schema.prisma
  - smoke: curl -fsS $PUBLIC_API_URL/api/v1/health/ready
  - rollback = redeploy previous image tag (migrations must be backward
    compatible: expand → migrate → contract)
```

**Migration policy:** generate migrations in development, commit them, apply
with `migrate deploy` in CI. Never run `prisma migrate dev` in production.

**Backward compatibility:** every migration must be safe to run while the
_previous_ image is still serving traffic (add columns as nullable or with
defaults; drop columns only after the code that reads them is gone).

---

## Backups

```bash
# Nightly
pg_dump --format=custom --no-owner "$DATABASE_URL" > "backup-$(date +%F).dump"

# Weekly restore drill into a scratch DB
pg_restore --clean --if-exists --dbname="$RESTORE_URL" backup-$(date +%F).dump
```

- Retain 30 days on object storage with versioning + server-side encryption.
- **Test restores** — an untested backup is not a backup.
- `pg_dumpall --globals-only` for roles.
- Add WAL archiving / PITR when the data justifies it.

---

## Observability (Phase 6)

- Structured JSON logs (`LOG_LEVEL`), with redaction for passwords, OTPs and
  tokens.
- Request id (`X-Request-Id`) propagated Nginx → API → log line.
- Metrics: request rate/latency/error rate, DB pool saturation, sync batch
  outcomes (`APPLIED`/`DUPLICATE`/`CONFLICT`/`REJECTED`).
- Alerting on readiness failures and 5xx spikes.

---

## Scaling notes

- API and web are stateless → horizontal replicas behind Nginx.
- Move the `upstream` blocks to a shared upstream.conf with `server api1:4000; server api2:4000;`.
- Redis holds rate-limit counters, OTPs and refresh-token denylists — these must
  be shared, not per-instance.
- PostgreSQL: connection pool sized for replicas × pool size; add read replicas
  for reports once volume demands it.
- SQLite on mobile is per-device; no coordination needed.
