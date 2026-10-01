# Deployment

No Docker required: the API is a plain Node process and the web app is a
static bundle. PostgreSQL 16 runs as a normal service; Redis is optional.

## Artefacts

| Command                        | Output                              |
| ------------------------------ | ----------------------------------- |
| `cd apps/api && npm run build` | `apps/api/dist`                     |
| `cd apps/web && npm run build` | `apps/web/dist`                     |
| `cd apps/api && npm run db:deploy` | applies committed Prisma migrations |
| `cd apps/api && npm run db:seed`   | idempotent system-category seed     |

Each app is installed independently — there is no root install.

---

## Build & release

```bash
git clone <repo> /opt/expenditure-tracker && cd /opt/expenditure-tracker

# API
cd apps/api
npm ci
cp .env.example .env          # then fill in the values below
npm run build                 # Prisma client → NestJS
npm run db:deploy             # apply migrations
npm run db:seed               # first release only (idempotent)

# Web
cd ../web
npm ci
VITE_API_URL=https://api.example.com npm run build
```

`VITE_API_URL` is inlined into the web bundle at **build** time — set it for
the web build if the API origin differs from the dev default.

---

## Running the API

```bash
node apps/api/dist/main.js
```

Put the API behind the reverse proxy (it terminates TLS and forwards to
`127.0.0.1:4000`).

`systemd` unit (`/etc/systemd/system/expenditure-api.service`):

```ini
[Unit]
Description=Expenditure Tracker API
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/expenditure-tracker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=on-failure
RestartSec=3
User=expenditure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now expenditure-api
```

The app loads `/opt/expenditure-tracker/apps/api/.env` itself (existing
environment always wins), so secrets can also be injected from the unit file
or a `EnvironmentFile=`. The web client is static — its `VITE_API_URL` is
inlined at build time. **Never commit `.env`.**

---

## Serving the web bundle

`apps/web/dist` is static. Any web server works; with Caddy
(`https://app.example.com`):

```caddy
app.example.com {
    root * /opt/expenditure-tracker/apps/web/dist
    encode gzip
    header /assets/* Cache-Control "public, max-age=31536000, immutable"
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Permissions-Policy camera=(), microphone=(), geolocation=()
    }
    try_files {path} /index.html
    file_server
}

api.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

`try_files … /index.html` is the SPA fallback react-router needs.

---

## Topology

```text
:443  Caddy / Nginx (TLS terminator)
       ├── app.example.com  → apps/web/dist (static, SPA fallback)
       └── api.example.com  → 127.0.0.1:4000
                ├── /api/v1/*  → NestJS
                └── /docs*     → Swagger (consider blocking publicly)

postgresql  127.0.0.1:5432     redis  127.0.0.1:6379 (optional, Phase 6)
```

### Health checks

| Service  | Probe                                                           |
| -------- | --------------------------------------------------------------- |
| api      | `GET /api/v1/health/ready` (503 when PostgreSQL is unreachable) |
| web      | `GET /`                                                         |
| postgres | `pg_isready`                                                    |

---

## Required environment variables

### Always

| Variable             | Notes                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                                      |
| `JWT_ACCESS_SECRET`  | ≥ 32 random bytes                                                 |
| `JWT_REFRESH_SECRET` | ≥ 32 random bytes, **different** from the access secret           |
| `PUBLIC_API_URL`     | e.g. `https://api.example.com`                                    |
| `PUBLIC_WEB_URL`     | e.g. `https://app.example.com`                                    |
| `CORS_ORIGINS`       | Comma-separated allow-list — never `*`                            |
| `VITE_API_URL`       | Same as `PUBLIC_API_URL`, needed when **building** the web bundle |
| `COOKIE_SECURE`      | `true` in production (defaults to `false` for local dev)          |

### Optional (defaults in `env.validation.ts`)

`API_PORT`, `API_HOST`, `REDIS_URL`, `JWT_ACCESS_TTL` (`15m`),
`JWT_REFRESH_TTL` (`30d`), `JWT_ISSUER`, `JWT_AUDIENCE`, `COOKIE_DOMAIN`,
`DEFAULT_CURRENCY` (`BDT`), `DEFAULT_TIMEZONE` (`Asia/Dhaka`),
`MAX_REQUEST_BODY_SIZE` (`100kb`), `LOG_LEVEL`, `OTP_*`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.

Configuration is validated with Zod at boot — the process refuses to start with
an invalid or missing required value, and the message names the variable.

**Never commit `.env`.** Only `apps/api/.env.example` and
`apps/web/.env.example` are tracked.

### Google OAuth in production

```text
Authorized redirect URI:  https://api.example.com/api/v1/auth/google/callback
```

`GOOGLE_CALLBACK_URL` must match exactly.

---

## TLS

Terminate TLS at the reverse proxy (Caddy does this automatically with
Let's Encrypt; for Nginx use `certbot`):

```nginx
listen 443 ssl http2;
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
ssl_protocols       TLSv1.2 TLSv1.3;
```

Then set `COOKIE_SECURE=true` so refresh cookies are never sent over plain
HTTP. Add a port-80 → 443 redirect and HSTS once HTTPS is confirmed working.

---

## Migrations

```bash
cd apps/api && npm run db:deploy    # apply committed migrations (CI/production)
```

**Migration policy:** generate migrations in development, commit them, apply
with `db:deploy`. Never run `prisma migrate dev` in production.

**Backward compatibility:** every migration must be safe to run while the
_previous_ release is still serving traffic (add columns as nullable or with
defaults; drop columns only after the code that reads them is gone).

---

## CI/CD pipeline (recommended)

```yaml
stages: [verify, build, deploy]

verify:
  - (cd apps/api && npm ci && npm run typecheck && npm run lint && npm test)
  - (cd apps/web && npm ci && npm run typecheck && npm run lint && npm test)
  - flutter analyze && flutter test
  # needs DATABASE_URL; fails if someone edited the schema without a migration
  - (cd apps/api && npx prisma migrate diff
      --from-schema-drag --to-migrations prisma/migrations)

build:
  - (cd apps/api && npm run build)
  - (cd apps/web && VITE_API_URL=$PUBLIC_API_URL npm run build)

deploy:
  - rsync -a --delete --exclude .env --exclude node_modules \
      ./ $TARGET:/opt/expenditure-tracker/
  - ssh $TARGET 'cd /opt/expenditure-tracker/apps/api && npm ci && npm run db:deploy'
  - ssh $TARGET 'systemctl restart expenditure-api'
  - smoke: curl -fsS $PUBLIC_API_URL/api/v1/health/ready
  - rollback = redeploy the previous commit (migrations must be backward
    compatible: expand → migrate → contract)
```

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
- Request id (`X-Request-Id`) generated at the API and echoed in log lines.
- Metrics: request rate/latency/error rate, DB pool saturation, sync batch
  outcomes (`APPLIED`/`DUPLICATE`/`CONFLICT`/`REJECTED`).
- Alerting on readiness failures and 5xx spikes.

---

## Scaling notes

- API and web are stateless → the API can be replicated behind the reverse
  proxy (`upstream { server 127.0.0.1:4001; server 127.0.0.1:4002; }`).
- Redis holds OTPs and refresh-token denylists once those features land —
  these must be shared, not per-instance.
- PostgreSQL: connection pool sized for replicas × pool size; add read replicas
  for reports once volume demands it.
- SQLite on mobile is per-device; no coordination needed.
