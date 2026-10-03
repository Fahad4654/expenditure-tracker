# Architecture

## 1. System overview

```text
┌───────────────────────┐          ┌───────────────────────────┐
│  React + Vite (web)   │  HTTPS   │      NestJS (API)         │
│  static bundle        │─────────▶│  REST · OpenAPI · JWT     │
└───────────────────────┘  /api/*  │  Helmet security headers  │
┌───────────────────────┐          │                           │
│  Flutter mobile app   │─────────▶│                           │
│  SQLite (offline)     │          │                           │
│  sync queue           │          │                           │
└───────────────────────┘          └───────────┬───────────────┘
                                               │
                                               ▼
                                   ┌───────────────────────────┐
                                   │  Prisma → PostgreSQL      │
                                   │  Redis (cache · OTP)      │
                                   └───────────────────────────┘
```

Both clients speak the **same REST API**. There is no BFF: the web app calls
`/api/v1/*` directly, and the mobile app calls it through `POST /sync` when
online and directly when online-only features are needed.

### Request lifecycle (web)

1. `lib/api.ts` attaches the bearer access token, echoes the readable CSRF
   cookie on mutating requests, and on a 401 refreshes the session once before
   replaying the call.
2. Nest global middleware: Helmet → body-size limit → CORS allow-list.
3. Route-level Zod/class-validator DTO validation.
4. Guard resolves the authenticated user (`JwtAuthGuard`, with `@Public()`
   opting health and auth routes out).
5. Service contains the business logic; repositories/Prisma stay in the data layer.
6. `TransformInterceptor` wraps success as `{ ok: true, data }`;
   `HttpExceptionFilter` wraps failures as `{ ok: false, error }`.

### Request lifecycle (mobile, offline)

1. UI writes the transaction to SQLite **first** and renders it immediately.
2. A `CREATE` operation is appended to `sync_operations` with a client UUID.
3. Connectivity detection triggers the sync engine.
4. Pending operations are batched and `POST /sync`-ed with exponential backoff.
5. The server processes each operation **idempotently** and returns per-operation
   status plus server-side changes the device must download.

---

## 2. Apps & shared code

The frontend and backend are **fully independent npm projects** — each has its
own `package.json`, lockfile and `node_modules`, with no root install and no
common run/build commands (no Turborepo/Nx either — deliberate; see §6):

| Module                  | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `src/shared/types`      | Domain types, enums, route-independent constants, **money helpers** |
| `src/shared/validation` | Zod schemas — the _same_ rules run in the browser and on the API    |
| `src/shared/config`     | API route map, cookie/storage names, sync tuning, env helpers       |

Each app keeps its **own copy** of these modules under `src/shared/`
(`apps/api/src/shared/` and `apps/web/src/shared/`). The copies are
deliberately identical — there is no shared package, so a change to one copy
must be mirrored in the other.

**Rule:** business logic is never duplicated between web and mobile. Anything
both need (money math, validation, sync vocabulary) lives in each app's
`src/shared/`. Dart cannot import TypeScript, so the _protocol_ is shared by
contract (`docs/synchronization.md` + `src/shared/types`) and mirrored once
in Dart.

---

## 3. Backend module layout

```text
apps/api/src/
├── main.ts                    # env load, helmet, CORS, pipes, filters, Swagger
├── app.module.ts              # ConfigModule + PrismaModule + feature modules
├── config/                    # env schema (Zod), typed configuration, env loader
├── prisma/                    # PrismaService (global module)
├── common/
│   ├── filters/               # HttpExceptionFilter → shared error envelope
│   ├── interceptors/          # TransformInterceptor → shared success envelope
│   └── pipes/                 # ZodValidationPipe
├── health/                    # /health/live, /health/ready
├── auth/ users/ transactions/ categories/ reports/   # Phase 2
├── notes/ reminders/          # personal notes & dated reminders
└── (Phase 5) sync/
```

Each feature module follows: `*.controller.ts` (HTTP only) →
`*.service.ts` (business rules) → `*.repository.ts` (Prisma access, where the
logic warrants one) → `dto/` → `guards/` → `strategies/`. Controllers never
contain business logic.

---

## 4. Cross-cutting decisions

### Response envelope

```jsonc
// success
{ "ok": true, "data": { ... } }

// failure
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

One interceptor and one exception filter produce these, so clients only ever
branch on `ok` and switch on stable machine-readable `code` values
(`src/shared/types` → `API_ERROR_CODES`). Human-readable messages are never parsed.

### Money

PostgreSQL `Decimal(18,2)` → Prisma `Decimal` → JSON **decimal string**
(`"100.50"`). Arithmetic uses integer minor units (`bigint`) in
`src/shared/types/money.ts`. No `number` ever touches a monetary value — not for
storage, not for aggregation, not even for display formatting.

### Time & dates

- Instants (`createdAt`, `updatedAt`, `expiresAt`) are `timestamptz` (UTC).
- `transactionDate` is a plain `DATE`. Day bucketing is resolved in the
  **user's** timezone at query time, which removes the classic
  "yesterday/today" off-by-one bug entirely.
- Users carry a configurable `timezone` (default `Asia/Dhaka`); report
  endpoints accept an explicit `timezone` override.

### Identifiers

Every entity uses an application-generated UUID, never auto-increment.
`Transaction.clientId` is generated **on the device before any network I/O**,
which is what makes offline creation and replay safe (see
[synchronization.md](synchronization.md)).

### Data ownership

`userId` is stamped from the verified JWT `sub` on every write and added to
every `WHERE`. There is no endpoint that accepts a `userId` from the client.

---

## 5. Deviations & recommended changes to the original brief

These are deliberate departures (or clarifications) worth reviewing:

1. **Prisma 6, not 7/8.** Prisma 7+ makes driver adapters + an ESM-first
   generated client mandatory, which fights NestJS's CommonJS/decorator build.
   Prisma 6.19 is stable, well-supported and keeps the toolchain boring.
   _Migration path:_ the schema is provider-agnostic; moving to Prisma 7 is a
   mechanical `prisma migrate` + generator change when Nest's ESM story settles.

2. **TypeScript 5.9, not 6/7.** `@nestjs/swagger` declares
   `typescript: ^5.5 || ^6.0`, and `typescript-eslint` declares `<6.1`.
   TS 7 would break both peer ranges.

3. **`transactionDate` is a `DATE`, not a `timestamptz`.** The brief lists
   dates (today/yesterday/month) rather than times-of-day. Storing a date plus
   a user timezone is strictly simpler and correct; adding a time-of-day column
   later is additive.

4. **`ChangeLog` table added (not in the brief).** `GET /sync/changes` needs a
   total, stable order of server-side changes. A monotonic `BigInt` cursor is
   simpler and race-free than comparing `updatedAt` timestamps (which tie).
   This is the "latest synchronization cursor/version" the brief asks for.

5. **`SyncOperation` is persisted server-side.** The brief requires the server
   to "safely process the same operation more than once". A unique
   `(userId, operationId)` constraint is the only reliable way to enforce that
   under concurrency — a pure in-memory de-dup would not survive a restart.

6. **`Device` table.** Needed so changes can be routed _away_ from the device
   that produced them, and so each device keeps its own pull cursor.

7. **Auth transport was decided in Phase 1 and implemented in Phase 2:** bearer access
   token (15 min) in memory/localStorage on the web + rotating refresh token in
   an HTTP-only, `SameSite=Lax` cookie, protected by a double-submit CSRF
   cookie. This avoids putting the short-lived token where JS can read it on
   every request while keeping CSRF out of the way of `GET`s.

8. **Redis is optional and not yet wired.** It becomes load-bearing in
   Phase 6 (rate limiting, OTP storage, refresh-token denylist). Adding a
   client in Phase 1 would be speculative code.

9. **No GraphQL.** The brief specifies REST + OpenAPI; offline sync is a
   batch-REST problem, and REST keeps the mobile client trivial.

10. **No Turborepo/Nx.** Each app installs, runs and builds on its own — a
    task graph would be machinery without a payoff at this size.

---

## 6. Why the boring choices

| Decision                  | Reason                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Independent npm projects  | Each app stands alone: own install, own lockfile, no root tooling                     |
| Zod schemas (mirrored)    | One set of validation rules; the browser can pre-validate before a round-trip         |
| REST + envelope           | Trivial to reason about, trivial to test, easy to cache                              |
| UUID PKs                  | Required for offline-first sync; no ID negotiation round-trip                        |
| Soft delete (`deletedAt`) | Sync needs tombstones; "deletes must not accidentally disappear"                     |
| Monolith API (modular)    | One deployable, clear module boundaries; can be split later if needed                |

---

## 7. Planned module map (Phases 2–5)

```text
auth/         register, login, refresh rotation, logout      ✅ Phase 2
users/        profile read/update, timezone & currency        ✅ Phase 2
transactions/ CRUD + search + filter + pagination             ✅ Phase 2
categories/   system + user categories                        ✅ Phase 2
reports/      summary, daily, monthly, category breakdown     ✅ Phase 2
notes/        personal notes CRUD, soft delete                ✅
reminders/    dated reminders + completion toggle             ✅
health/       liveness + readiness                            ✅ Phase 1
sync/         POST /sync, GET /sync/changes                   Phase 5
otp, Google OAuth, password reset                             Phase 6
```
