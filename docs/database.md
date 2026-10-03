# Database

PostgreSQL 16 + Prisma 6. Migration lives in
`apps/api/prisma/migrations/<timestamp>_init/`.

The mobile app keeps its own offline copy in SQLite; that local schema and
the `sync_operations` queue are documented in `docs/synchronization.md` §7.

---

## Conventions

| Rule                                  | Why                                                              |
| ------------------------------------- | ---------------------------------------------------------------- |
| UUID primary keys, app-generated      | Offline sync must create rows before it ever talks to the server |
| Money is `Decimal(18,2)`              | Floats silently corrupt balances                                 |
| Instants are `timestamptz` (UTC)      | Unambiguous across regions                                       |
| `transactionDate` is `date`           | Day bucketing happens in the **user's** timezone at query time   |
| Soft delete via `deletedAt`           | Sync needs tombstones so deletes propagate                       |
| Every user-owned row carries `userId` | Ownership is enforced in SQL, not in the UI                      |
| Every write bumps `version`           | Deterministic last-write-wins conflict resolution                |

---

## Entity relationship

```text
User 1──* RefreshToken
User 1──* OtpCode
User 1──* UserToken
User 1──* Device
User 1──* Category        (userId NULL ⇒ system category)
User 1──* Transaction ──* Category
User 1──* Note
User 1──* Reminder
User 1──* SyncOperation
User 1──* ChangeLog
```

---

## Tables

### `User`

| Column                                  | Type                    | Notes                                             |
| --------------------------------------- | ----------------------- | ------------------------------------------------- |
| `id`                                    | `uuid` PK               | `gen_random_uuid()`                               |
| `name`                                  | `text`                  |                                                   |
| `email`                                 | `text` NULL, **unique** | NULLs are distinct → multiple users without email |
| `phone`                                 | `text` NULL, **unique** | E.164                                             |
| `passwordHash`                          | `text` NULL             | Argon2id; NULL for OAuth-only accounts            |
| `googleId`                              | `text` NULL, **unique** | prevents duplicate Google accounts                |
| `avatarUrl`                             | `text` NULL             |                                                   |
| `emailVerified` / `phoneVerified`       | `boolean`               | default `false`                                   |
| `role`                                  | `UserRole`              | `USER` \| `ADMIN`                                 |
| `defaultCurrency`                       | `char(3)`               | default `BDT`                                     |
| `timezone`                              | `text`                  | default `Asia/Dhaka` (IANA)                       |
| `failedLogins` / `lockedUntil`          |                         | brute-force lockout                               |
| `createdAt` / `updatedAt` / `deletedAt` |                         |                                                   |

**Uniqueness:** `email`, `phone`, `googleId` are each unique. Because Postgres
treats `NULL` as distinct, a user may exist with no email _and_ another with no
phone — no partial indexes needed.

### `Category`

| Column          | Type              | Notes                                         |
| --------------- | ----------------- | --------------------------------------------- |
| `id`            | `uuid` PK         |                                               |
| `userId`        | `uuid` NULL       | `NULL` ⇒ shared **system** category           |
| `name`          | `text`            |                                               |
| `kind`          | `CategoryKind`    | `SYSTEM` \| `USER`                            |
| `isSystem`      | `boolean`         | system rows cannot be edited/deleted by users |
| `icon`, `color` | `text`            | presentation tokens, not rendered HTML        |
| `suggestedType` | `TransactionType` | `INCOME` \| `EXPENSE`                         |
| `deletedAt`     | `timestamp`       |                                               |

`@@unique([userId, name])` stops a user creating "Food" twice.
Seed data comes from `DEFAULT_SYSTEM_CATEGORIES` in `apps/api/src/shared/types` (11 categories:
Food, Transport, Shopping, Bills, Entertainment, Health, Education, Salary,
Business, Investment, Other) via the idempotent `db:seed` script (run from
`apps/api`).

> Because `userId` is `NULL` for system categories, Postgres does not enforce
> uniqueness across them. They are only ever created by the seed, which checks
> for existence first.

### `Transaction`

| Column                                  | Type                   | Notes                                                |
| --------------------------------------- | ---------------------- | ---------------------------------------------------- |
| `id`                                    | `uuid` PK              | server id                                            |
| `clientId`                              | `uuid`                 | **generated on the device**; sync idempotency anchor |
| `deviceId`                              | `text` NULL            | origin device                                        |
| `userId`                                | `uuid` FK → `User`     | ownership                                            |
| `type`                                  | `TransactionType`      | `INCOME` \| `EXPENSE`                                |
| `amount`                                | `numeric(18,2)`        | never float                                          |
| `currency`                              | `char(3)`              | default `BDT`                                        |
| `categoryId`                            | `uuid` FK → `Category` | `ON DELETE RESTRICT` — history is never orphaned     |
| `title`                                 | `text`                 |                                                      |
| `description`                           | `text` NULL            | notes                                                |
| `transactionDate`                       | `date`                 | in the owner's timezone                              |
| `version`                               | `int`                  | +1 on every write; LWW conflict key                  |
| `createdAt` / `updatedAt` / `deletedAt` |                        |                                                      |

**`@@unique([userId, clientId])`** is what makes a replayed `CREATE` a no-op:
the second insert violates the constraint and the operation is reported as
`DUPLICATE` rather than creating a second row.

### `Note`

| Column                               | Type       | Notes                                          |
| ------------------------------------ | ---------- | ---------------------------------------------- |
| `id`                                 | `uuid` PK  |                                                |
| `userId`                             | `uuid` FK  | cascade delete                                 |
| `title`                              | `text`     | 1–120 chars                                    |
| `content`                            | `text` NULL | up to 5000 chars                              |
| `version`                            | `int`      | +1 on every write; ready for a future sync feed |
| `createdAt` / `updatedAt` / `deletedAt` |          | soft delete                                     |

List order is `@@index([userId, updatedAt DESC])`. Notes carry `version` but are
not yet drained by the Phase 5 `ChangeLog` feed.

### `Reminder`

| Column                               | Type         | Notes                                       |
| ------------------------------------ | ------------ | ------------------------------------------- |
| `id`                                 | `uuid` PK    |                                             |
| `userId`                             | `uuid` FK    | cascade delete                              |
| `title`                              | `text`       | 1–120 chars                                 |
| `details`                            | `text` NULL  | optional note, up to 500 chars              |
| `dueDate`                            | `date`       | **DATE only** — owner's timezone, like `transactionDate` |
| `completedAt`                        | `ts` NULL    | set/cleared server-side by the `completed` toggle |
| `version`                            | `int`        | +1 on every write                           |
| `createdAt` / `updatedAt` / `deletedAt` |          | soft delete                                 |

Indexes: `@@index([userId, dueDate])` (list order + due-date filter) and
`@@index([userId, completedAt])` (pending vs completed).

### `RefreshToken`

Opaque tokens are stored **hashed** (SHA-256) only.

- `familyId` groups every rotation of one login chain → stealing an old token
  lets the server revoke the whole family.
- `rotationIndex` orders rotations.
- `replacedById` links a consumed token to its successor (audit trail).
- `revokedAt` / `expiresAt` gate use.

### `OtpCode`

`codeHash` (Argon2), `attempts`/`maxAttempts`, `expiresAt`, `consumedAt`,
`purpose` (`LOGIN` | `REGISTER` | `VERIFY_PHONE`). Raw codes are never stored.

### `UserToken`

Email-verification and password-reset tokens, again stored as hashes with an
expiry and a `consumedAt` single-use marker.

### `Device`

Client-supplied stable id, plus `lastCursor` and `lastSyncAt` so each device can
resume pulling changes where it left off.

### `SyncOperation`

Append-only audit + idempotency ledger.

| Column                                            | Notes                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `operationId`                                     | client UUID — **unique per user**                                |
| `deviceId`, `entityType`, `entityId`, `operation` | what happened                                                    |
| `status`                                          | `APPLIED` \| `DUPLICATE` \| `REJECTED` \| `CONFLICT` \| `FAILED` |
| `clientTimestamp`                                 | advisory only — **never** used for LWW                           |
| `receivedAt`                                      | server receive time                                              |
| `payload`                                         | original JSON for auditing                                       |
| `reason`                                          | rejection/conflict reason (no secrets)                           |

`@@unique([userId, operationId])` is the idempotency guarantee.

### `ChangeLog`

Server-side change feed drained by devices with a cursor.

| Column                           | Notes                                   |
| -------------------------------- | --------------------------------------- |
| `id`                             | `bigint` identity — **the sync cursor** |
| `deviceId`                       | origin device; never echoed back to it  |
| `entityType`, `entityId`, `kind` | `UPSERT` \| `DELETE`                    |
| `version`                        | entity version after the change         |

A monotonic `bigint` cursor is total, cheap to index (`@@index([userId, id])`)
and free of the timestamp-tie problems that `updatedAt` cursors suffer from.

---

## Indexes

```sql
-- User
"User" (createdAt)

-- Category
"Category" (userId), "Category" (kind), UNIQUE (userId, name)

-- Transaction — the hot paths
UNIQUE (userId, clientId)                      -- sync idempotency
(userId, transactionDate DESC)                 -- list "latest first"
(userId, categoryId, transactionDate)          -- category filter
(userId, type, transactionDate)                -- income vs expense
(userId, updatedAt)                            -- change detection

-- Notes & reminders
Note (userId, updatedAt DESC)                  -- list newest edit first
Reminder (userId, dueDate), (userId, completedAt)

-- Auth
RefreshToken UNIQUE (tokenHash), (userId), (familyId), (expiresAt)
OtpCode (phone, purpose, createdAt), (expiresAt)
UserToken UNIQUE (tokenHash), (userId, kind), (expiresAt)

-- Sync
SyncOperation UNIQUE (userId, operationId), (userId, receivedAt),
                    (userId, entityType, entityId), (userId, status, receivedAt)
ChangeLog (userId, id), (userId, entityType, entityId)
Device (userId)
```

---

## Money strategy

- Storage: `numeric(18, 2)`.
- Wire: decimal **string** (`"100.50"`), never a JSON number.
- Computation: `bigint` minor units (`toMinorUnits` / `fromMinorUnits` in
  `src/shared/types`), so `0.10 + 0.20 === 0.30` and values far beyond
  `Number.MAX_SAFE_INTEGER` stay exact.
- Display: `formatMoney` builds the string from `Intl.NumberFormat`
  `formatToParts` + integer grouping, so a JS `number` never participates.

`balance = totalIncome − totalExpense`, computed in minor units per period.

---

## Timezone strategy

1. `transactionDate` stores the **calendar date in the user's timezone**.
2. Report endpoints accept `timezone` (defaults to the user's stored value).
3. `today`, `this week`, `this month` are derived by converting the timezone's
   current instant to a local date, then comparing against the `date` column.
4. Server timezone never influences results.

---

## Migrations

```bash
cd apps/api

npm run db:migrate     # dev: creates + applies (prompts for a name)
npm run db:deploy      # CI/prod: applies pending migrations only
npm run db:studio      # browse data
npm run db:seed        # categories + demo users (dev only)
```

Migrations are committed. CI runs `db:deploy`, never `db:migrate` (the latter
can create new migrations, which is a developer action).

---

## Backup strategy (Phase 6 target)

```bash
# Daily logical backup
pg_dump --format=custom --no-owner "$DATABASE_URL" > "backup-$(date +%F).dump"

# Restore into a scratch database for verification
pg_restore --clean --if-exists --dbname="$RESTORE_URL" backup-2026-10-01.dump
```

- Nightly `pg_dump` to object storage with 30-day retention.
- Weekly automated **restore drill** into a throwaway database — an untested
  backup is not a backup.
- `pg_dumpall --globals-only` for roles/permissions.
- Point-in-time recovery via WAL archiving once traffic justifies it.
