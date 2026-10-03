# API

Base URL: `http://localhost:4000/api/v1`
Interactive docs (Swagger/OpenAPI): `http://localhost:4000/docs`
OpenAPI JSON: `http://localhost:4000/docs-json`

The version prefix lives in `API_PREFIX` (`src/shared/config`) and is applied by
Nest's `setGlobalPrefix`. Client code never string-concatenates paths — it uses
`API_ROUTES`.

---

## Response envelope

Every response uses one of exactly two shapes:

```jsonc
// 2xx
{ "ok": true, "data": { /* endpoint payload */ } }

// non-2xx
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": "amount", "message": "Amount must be a positive decimal with up to 2 decimal places" }]
  }
}
```

`code` is a stable member of `API_ERROR_CODES` (`src/shared/types`). Clients switch on
`code`, never on `message`.

| HTTP      | `code`                                                                  |
| --------- | ----------------------------------------------------------------------- |
| 400 / 422 | `VALIDATION_ERROR`                                                      |
| 401       | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_INVALID`          |
| 403       | `FORBIDDEN`, `CSRF_INVALID`, `EMAIL_NOT_VERIFIED`, `PHONE_NOT_VERIFIED` |
| 404       | `NOT_FOUND`                                                             |
| 409       | `CONFLICT`                                                              |
| 429       | `RATE_LIMITED`, `OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_LOCKED`               |
| 500       | `INTERNAL_ERROR`                                                        |
| 503       | `SERVICE_UNAVAILABLE`                                                   |

`details[].path` is a dotted path into the submitted payload. Values that were
rejected are **never** echoed back (they may contain passwords or OTPs).

---

## Conventions

- **Auth:** `Authorization: Bearer <access token>`; `/auth/refresh` and
  `/auth/logout` also accept the HTTP-only refresh cookie + `X-CSRF-Token`.
- **Pagination:** `?page=1&limit=20` → `meta: { page, limit, total, totalPages }`.
- **Dates:** `YYYY-MM-DD` for `transactionDate`, ISO-8601 for instants.
- **Money:** decimal strings (`"250.00"`), never JSON numbers.
- **IDs:** UUID v4.
- **Idempotency:** `POST /transactions` and `POST /sync` accept a
  client-generated `clientId` / `operationId`.

---

## Endpoints

### Implemented in Phase 1

| Method | Path            | Description                                      |
| ------ | --------------- | ------------------------------------------------ |
| `GET`  | `/health/live`  | Liveness — process is running                    |
| `GET`  | `/health/ready` | Readiness — PostgreSQL reachable (503 otherwise) |
| `GET`  | `/docs`         | Swagger UI                                       |

```bash
curl http://localhost:4000/api/v1/health/live
# {"ok":true,"data":{"status":"ok","uptimeSeconds":26,"timestamp":"..."}}

curl http://localhost:4000/api/v1/health/ready
# {"ok":true,"data":{"status":"ok","checks":{"postgres":{"status":"up","latencyMs":13}}}}
```

### Auth

| Method | Path                | Description                                                                   |
| ------ | ------------------- | ----------------------------------------------------------------------------- |
| `POST` | `/auth/otp/send`    | `{ email, purpose }` → OTP challenge (`devCode` outside production, mail off) |
| `POST` | `/auth/register`    | `{ name, email, password, code }` → session, 201 (`code` = email OTP)         |
| `POST` | `/auth/login`       | `{ email, password }` → session, 200                                          |
| `POST` | `/auth/google`      | `{ idToken }` (Firebase) → session, 200                                       |
| `POST` | `/auth/forgot-password` | `{ email }` → OTP challenge (same shape for unknown emails)               |
| `POST` | `/auth/reset-password`  | `{ email, code, password }` → session, 200 (revokes all prior sessions)   |
| `POST` | `/auth/refresh`     | Rotate refresh token (cookie + `X-CSRF-Token`, or `refreshToken` in the body) |
| `POST` | `/auth/logout`      | Revoke refresh token family, clear cookies, 200                               |
| `GET`  | `/auth/me`          | Current profile (bearer)                                                      |

A session is `{ user, accessToken, expiresIn, refreshToken }`. `expiresIn` is
in seconds. Failures: `409 CONFLICT` (email taken), `401 INVALID_CREDENTIALS`
(wrong email **or** password — identical for both), `429 ACCOUNT_LOCKED`
(`LOGIN_MAX_FAILED_ATTEMPTS` reached within `LOGIN_LOCKOUT_SECONDS`),
`401 REFRESH_TOKEN_INVALID` (revoked/expired/replayed — a replay revokes the
whole family), `403 CSRF_INVALID` (cookie used without a matching
`X-CSRF-Token`), `400 OTP_INVALID` / `400 OTP_EXPIRED` /
`400 OTP_TOO_MANY_ATTEMPTS` (email OTP verification), `429 RATE_LIMITED`
(OTP resend cooldown), `401 UNAUTHORIZED` (bad Firebase ID token).

Email OTP rules: 6-digit code, Argon2-hashed at rest, TTL 10 minutes, 5
attempts, resend cooldown 60 seconds (a resend invalidates the previous code).
Registration verifies the code **inside** the create-user transaction; reset
revokes every refresh token before issuing the new session.

### Deferred auth endpoints

Designed in [authentication.md](authentication.md), not yet routed — they need
an SMS provider.

| Method | Path               | Description                 |
| ------ | ------------------ | --------------------------- |
| `POST` | `/auth/send-otp`   | `{ phone }` → OTP challenge |
| `POST` | `/auth/verify-otp` | `{ phone, code }` → tokens  |

### Users

| Method  | Path        | Description                              |
| ------- | ----------- | ---------------------------------------- |
| `GET`   | `/users/me` | Current profile                          |
| `PATCH` | `/users/me` | Update name / defaultCurrency / timezone |

### Transactions

| Method   | Path                | Description                                 |
| -------- | ------------------- | ------------------------------------------- |
| `POST`   | `/transactions`     | Create (accepts `clientId` for idempotency) |
| `GET`    | `/transactions`     | List + search + filter + paginate           |
| `GET`    | `/transactions/:id` | Fetch one (404 if owned by another user)    |
| `PATCH`  | `/transactions/:id` | Update (accepts `baseVersion`)              |
| `DELETE` | `/transactions/:id` | Soft delete (tombstone for sync)            |

Query parameters: `page`, `limit`, `search`, `type`, `categoryId`, `from`, `to`,
`preset` (`today|week|month|year|custom`), `sort`, `order`.

Behaviour:

- `POST` with a `clientId` the caller already used returns the existing row with
  **200** (not 201) — creation is idempotent for offline clients.
- `PATCH` accepts `baseVersion`; a mismatch is **409 CONFLICT**, never a silent
  overwrite. A successful write increments `version`.
- `DELETE` is a tombstone: the row keeps `deletedAt` and a bumped `version` so
  sync can announce the removal.
- Any id owned by another user is **404**, not 403 — existence is never
  disclosed.

### Categories

| Method   | Path              | Description                                        |
| -------- | ----------------- | -------------------------------------------------- |
| `GET`    | `/categories`     | System + own categories                            |
| `POST`   | `/categories`     | Create a user category                             |
| `PATCH`  | `/categories/:id` | Update (own only)                                  |
| `DELETE` | `/categories/:id` | Soft delete (own only; system categories rejected) |

Behaviour:

- A `categoryId` the caller cannot see (another user's, or deleted) is **404**.
- Mutating a system category is **403 FORBIDDEN**.
- Deleting a category that still has non-deleted transactions is **409
  CONFLICT** — move or delete them first.
- A duplicate `(userId, name)` is **409 CONFLICT**.

### Notes

| Method   | Path         | Description                                  |
| -------- | ------------ | -------------------------------------------- |
| `GET`    | `/notes`     | Own notes, newest `updatedAt` first          |
| `POST`   | `/notes`     | Create a note (`title`, optional `content`)  |
| `PATCH`  | `/notes/:id` | Update title/content (own only)              |
| `DELETE` | `/notes/:id` | Soft delete (own only)                       |

Behaviour:

- Notes are private to the caller; a foreign or deleted `noteId` is **404**
  (never 403 — existence is not disclosed).
- `title` is 1–120 chars, `content` up to 5000 chars (`null` allowed).
- Deletes are soft (`deletedAt`); the `version` counter bumps on every write so
  the sync feed can adopt notes later without a schema change. Notes are **not**
  part of the Phase 5 sync feed yet.
- Every mutation emits a `NOTE_CREATE` / `NOTE_UPDATE` / `NOTE_DELETE` audit
  line through `logEvent`.

### Reminders

| Method   | Path            | Description                                            |
| -------- | --------------- | ------------------------------------------------------ |
| `GET`    | `/reminders`    | Own reminders, earliest `dueDate` first                |
| `POST`   | `/reminders`    | Create (`title`, `dueDate`, optional `details`)        |
| `PATCH`  | `/reminders/:id` | Update fields, or toggle `completed` (own only)       |
| `DELETE` | `/reminders/:id` | Soft delete (own only)                                |

Behaviour:

- `dueDate` is a `YYYY-MM-DD` calendar date interpreted in the owner's
  timezone (DATE column, like `transactionDate`).
- `completed: true|false` on `PATCH` sets/clears `completedAt` server-side —
  the client never manufactures the completion timestamp.
- A foreign or deleted `reminderId` is **404**. Deletes are soft.
- Audited as `REMINDER_CREATE` / `REMINDER_UPDATE` / `REMINDER_COMPLETE` /
  `REMINDER_REOPEN` / `REMINDER_DELETE`.

### Reports

| Method | Path                  | Description                                          |
| ------ | --------------------- | ---------------------------------------------------- |
| `GET`  | `/reports/summary`    | `totalIncome`, `totalExpense`, `balance` for a range |
| `GET`  | `/reports/daily`      | Per-day income/expense series                        |
| `GET`  | `/reports/monthly`    | Per-month income/expense/balance series              |
| `GET`  | `/reports/categories` | Category-wise breakdown with percentages             |

All accept `preset` or `from`/`to` and are evaluated in the caller's
`timezone` (from their profile), so "today" and "this month" follow the user's
calendar rather than the server's. Every response echoes the resolved `range`.
Percentages in `/reports/categories` are rounded to 2dp and therefore sum to
within a cent of 100.

### Sync (Phase 5)

| Method | Path            | Description                          |
| ------ | --------------- | ------------------------------------ |
| `POST` | `/sync`         | Push a batch of offline operations   |
| `GET`  | `/sync/changes` | Pull server changes after `?cursor=` |

`POST /sync` body: `{ deviceId, cursor?, operations[≤200] }` where each
operation is `{ operationId, entityId, entityType, operation, timestamp,
baseVersion?, payload }`. It runs as one database transaction and returns:

```jsonc
{
  "results": [/* per-operation: APPLIED | DUPLICATE | CONFLICT | REJECTED (+ reason, entity) */],
  "changes": [/* rows with id > cursor, excluding this device's own writes */],
  "cursor": "1057",
  "serverTime": "…"
}
```

- A replayed `operationId` answers `DUPLICATE` from the `SyncOperation` ledger
  and performs no second write.
- A stale `baseVersion` still applies (last-write-wins) but is reported as
  `CONFLICT` with the authoritative entity; a server tombstone wins over a
  later `UPDATE`.
- `GET /sync/changes?cursor=&limit=&deviceId=` pages the `ChangeLog`
  (`hasMore` when the page is full). A null cursor starts from the beginning
  and includes the shared system categories.

See [synchronization.md](synchronization.md) for the full protocol.

---

## Error handling rules

- Controllers throw `HttpException` subclasses only; nothing else is caught at
  the edge, so unexpected errors always surface as `INTERNAL_ERROR` with the
  stack logged server-side and **not** returned.
- 5xx responses log `method path -> status` plus the stack; 4xx are logged at
  `warn` only when actionable (429, 503).
- Passwords, OTP codes and refresh tokens never appear in logs or responses.

---

## Rate limiting

Not implemented — there is currently no per-IP or per-endpoint quota. Planned
for Phase 6 (`RATE_LIMITED` stays in the error catalogue for when it lands).
