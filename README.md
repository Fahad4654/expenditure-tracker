# Expenditure Tracker

A personal income & expense tracking platform: **React + Vite web app**,
**Flutter mobile app** (offline-first), and a single **NestJS** API backed by
**PostgreSQL** + **Redis**.

> **Status: Phases 1–3 complete — architecture, API and the web application
> are built and tested.** Flutter (Phase 4), offline sync (Phase 5) and
> production hardening (Phase 6) are next.
> See [docs/development.md](docs/development.md) for the phase plan and current
> progress.

---

## What it will do

- Register / log in with **email + password**, **phone + OTP**, or **Google**
- Record, edit and delete income and expenses with categories, notes and dates
- Dashboard: today / this month income, expense and balance; recent transactions
- Reports: daily, weekly, monthly, yearly, income vs expense, category-wise spend
- Search and filter transactions
- Use the mobile app **completely offline** and **synchronise automatically**
  when connectivity returns

---

## Repository layout

```text
expenditure-tracker/
├── apps/
│   ├── api/          NestJS 12 REST API + Prisma
│   ├── web/          React 19 + Vite 8 + TypeScript + Tailwind 4
│   └── mobile/       Flutter (Android / iOS)
├── packages/
│   ├── types/        Shared domain types, constants, money helpers
│   ├── validation/   Shared Zod schemas (identical rules on web + API)
│   └── config/       Shared route map, sync tuning, env helpers
├── docs/             architecture, database, API, auth, sync, dev, deploy
├── .env.example
└── README.md
```

---

## Prerequisites

| Tool       | Version                  |
| ---------- | ------------------------ |
| Node.js    | ≥ 22.18 (24 recommended) |
| npm        | ≥ 11                     |
| PostgreSQL | 16 (local install)       |
| Flutter    | ≥ 3.44                   |
| Redis      | 7 (optional, Phase 6)    |

---

## Quick start (native, recommended for development)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env          # then edit DATABASE_URL and JWT secrets

# 3. Database: generate client, create tables, seed system categories
npm run db:generate
npm run db:migrate            # first time: `npx prisma migrate dev --name init`
npm run db:seed

# 4. Run API (:4000) + Web (:3000) together
npm run dev
```

`npm run dev` also builds the shared packages and keeps rebuilding them in
watch mode — there is no separate build step to remember.

Verify:

```bash
curl http://localhost:4000/api/v1/health/live
curl http://localhost:4000/api/v1/health/ready
open http://localhost:3000            # web app
open http://localhost:4000/docs       # Swagger / OpenAPI
```

---

## Useful commands

| Command                          | What it does                                        |
| -------------------------------- | --------------------------------------------------- |
| `npm run dev`                    | Build + watch shared packages, then run API + Web   |
| `npm run build`                  | Build packages → generate Prisma client → API → Web |
| `npm run typecheck`              | Strict TypeScript check across all workspaces       |
| `npm run lint`                   | ESLint across all workspaces                        |
| `npm test`                       | Vitest suites (API, web client, shared money math)  |
| `npm run db:migrate`             | Create/apply a new Prisma migration (dev)           |
| `npm run db:deploy`              | Apply pending migrations (CI/production)            |
| `npm run db:seed`                | Idempotent system-category seed                     |
| `npm run db:studio`              | Prisma Studio                                       |
| `cd apps/mobile && flutter run`  | Run the mobile app                                  |
| `cd apps/mobile && flutter test` | Mobile tests                                        |

### Mobile API base URL

```sh
# Android emulator (host loopback alias)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
# iOS simulator
flutter run --dart-define=API_BASE_URL=http://localhost:4000
# Physical device
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
```

---

## Documentation

| Document                                           | Contents                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)       | System shape, module layout, key decisions            |
| [docs/database.md](docs/database.md)               | Schema, indexes, money & timezone strategy            |
| [docs/api.md](docs/api.md)                         | Endpoint catalogue, envelope, errors                  |
| [docs/authentication.md](docs/authentication.md)   | Email / OTP / Google flows, token lifecycle, security |
| [docs/synchronization.md](docs/synchronization.md) | Offline-first protocol, conflict rules                |
| [docs/development.md](docs/development.md)         | Local setup, conventions, phase plan                  |
| [docs/deployment.md](docs/deployment.md)           | Build, systemd, env, backups, CI/CD                   |

---

## Security posture (summary)

- Argon2/bcrypt password hashing — plaintext passwords are never stored or logged
- Short-lived access JWTs + rotating refresh tokens in HTTP-only cookies,
  with token-family revocation
- CORS allow-list, Helmet security headers, request body size limits
- Login and OTP brute-force lockouts; OTPs are hashed, expiring and attempt-limited
- Zod/class-validator DTO validation on every external input
- Every query is scoped to `transaction.userId === authenticatedUser.id`
  on the server — never trusted from the client
- Money uses `Decimal(18,2)` end to end; never IEEE-754 floats

See [docs/authentication.md](docs/authentication.md) for details.
