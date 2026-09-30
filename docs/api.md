# API

Base URL: `http://localhost:4000/api/v1`
Interactive docs (Swagger/OpenAPI): `http://localhost:4000/docs`
OpenAPI JSON: `http://localhost:4000/docs-json`

The version prefix lives in `API_PREFIX` (`@exp/config`) and is applied by
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

`code` is a stable member of `API_ERROR_CODES` (`@exp/types`). Clients switch on
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

- **Auth:** `Authorization: Bearer <access token>` (Phase 2).
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

### Auth (Phase 2)

| Method | Path                    | Description                             |
| ------ | ----------------------- | --------------------------------------- |
| `POST` | `/auth/register`        | `{ name, email, password }`             |
| `POST` | `/auth/login`           | `{ email, password }` → tokens          |
| `POST` | `/auth/refresh`         | Rotate refresh token (HTTP-only cookie) |
| `POST` | `/auth/logout`          | Revoke refresh token family             |
| `POST` | `/auth/send-otp`        | `{ phone }` → OTP challenge             |
| `POST` | `/auth/verify-otp`      | `{ phone, code }` → tokens              |
| `GET`  | `/auth/google`          | Start Google OAuth                      |
| `GET`  | `/auth/google/callback` | OAuth callback                          |
| `POST` | `/auth/forgot-password` | Start password reset                    |
| `POST` | `/auth/reset-password`  | Complete password reset                 |

### Users (Phase 2)

| Method  | Path        | Description                              |
| ------- | ----------- | ---------------------------------------- |
| `GET`   | `/users/me` | Current profile                          |
| `PATCH` | `/users/me` | Update name / defaultCurrency / timezone |

### Transactions (Phase 2)

| Method   | Path                | Description                                 |
| -------- | ------------------- | ------------------------------------------- |
| `POST`   | `/transactions`     | Create (accepts `clientId` for idempotency) |
| `GET`    | `/transactions`     | List + search + filter + paginate           |
| `GET`    | `/transactions/:id` | Fetch one (404 if owned by another user)    |
| `PATCH`  | `/transactions/:id` | Update (accepts `baseVersion`)              |
| `DELETE` | `/transactions/:id` | Soft delete (tombstone for sync)            |

Query parameters: `page`, `limit`, `search`, `type`, `categoryId`, `from`, `to`,
`preset` (`today|week|month|year|custom`), `sort`, `order`.

### Categories (Phase 2)

| Method   | Path              | Description                                        |
| -------- | ----------------- | -------------------------------------------------- |
| `GET`    | `/categories`     | System + own categories                            |
| `POST`   | `/categories`     | Create a user category                             |
| `PATCH`  | `/categories/:id` | Update (own only)                                  |
| `DELETE` | `/categories/:id` | Soft delete (own only; system categories rejected) |

### Reports (Phase 2)

| Method | Path                  | Description                                          |
| ------ | --------------------- | ---------------------------------------------------- |
| `GET`  | `/reports/summary`    | `totalIncome`, `totalExpense`, `balance` for a range |
| `GET`  | `/reports/daily`      | Per-day income/expense series                        |
| `GET`  | `/reports/monthly`    | Per-month income/expense/balance series              |
| `GET`  | `/reports/categories` | Category-wise breakdown with percentages             |

All accept `preset` or `from`/`to` plus `timezone`.

### Sync (Phase 5)

| Method | Path            | Description                          |
| ------ | --------------- | ------------------------------------ |
| `POST` | `/sync`         | Push a batch of offline operations   |
| `GET`  | `/sync/changes` | Pull server changes after `?cursor=` |

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

## Rate limiting (edge + application)

| Zone      | Rate                   | Applies to          |
| --------- | ---------------------- | ------------------- |
| `general` | 30 r/s per IP          | `/api/*`            |
| `auth`    | 5 r/min per IP         | `/api/v1/auth/*`    |
| `sync`    | 5 r/s per IP, burst 40 | `POST /api/v1/sync` |

Nginx enforces these at the edge; `@nestjs/throttler` adds a second,
account-aware layer in Phase 6.
