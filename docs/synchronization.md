# Synchronization

The mobile app is **offline-first**: SQLite is the source of truth for the UI,
and the network is an optimisation. The server is the source of truth for
concurrency (multi-device) and reporting.

> **Status:** protocol defined in Phase 1; client engine + `/sync` endpoint land
> in Phase 5. This document is the contract both sides implement.

---

## 1. Core principles

1. **Never block the UI on the network.** Write locally, render, enqueue.
2. **Every operation carries a client-generated UUID** (`operationId`) and the
   entity carries a client-generated UUID (`clientId`). The server never has to
   allocate an id before the client can show the row.
3. **The server must be able to process the same operation twice.** Replay is a
   no-op, not a duplicate.
4. **Deletes are tombstones**, not row removals, until every device has seen
   them.
5. **Conflicts are resolved deterministically** — last-write-wins on server
   version — never silently dropped.

---

## 2. Offline write path

```text
User taps Save
     │
     ├─▶ 1. INSERT into SQLite (status = PENDING)
     ├─▶ 2. INSERT into sync_operations (operationId = new UUID)
     └─▶ 3. Re-render the list IMMEDIATELY
                       │
        (no network involved anywhere above)
                       │
Connectivity returns ──┤
                       ▼
        4. SELECT pending operations ORDER BY createdAt LIMIT 200
        5. POST /sync { deviceId, cursor, operations[] }
        6. Server validates + applies (idempotently)
        7. Response: results[], changes[], cursor
        8. Mark acknowledged operations SYNCED (or FAILED + backoff)
        9. Apply `changes[]` to SQLite (UPSERT / DELETE)
```

---

## 3. `POST /sync` — push

```http
POST /api/v1/sync
Authorization: Bearer <access token>
Content-Type: application/json
```

```jsonc
{
  "deviceId": "8f1b6f3e-…",
  "cursor": "1042", // last pulled ChangeLog id (or null)
  "operations": [
    {
      "operationId": "0a9c…", // UUIDv4, stable across retries
      "entityId": "5d2f…", // Transaction.clientId
      "entityType": "TRANSACTION", // TRANSACTION | CATEGORY
      "operation": "CREATE", // CREATE | UPDATE | DELETE
      "timestamp": "2026-10-01T09:15:00.000Z", // client wall clock, advisory
      "baseVersion": 3, // version the client based its edit on
      "payload": {
        "clientId": "5d2f…",
        "deviceId": "8f1b6f3e-…",
        "type": "EXPENSE",
        "amount": "250.00",
        "currency": "BDT",
        "categoryId": "…",
        "title": "Lunch",
        "description": null,
        "transactionDate": "2026-10-01",
      },
    },
  ],
}
```

Limits: **≤ 200 operations per request** (`SYNC_DEFAULTS.maxOperationsPerBatch`).
Validation is shared — the API parses `syncRequestSchema` from
`src/shared/validation`, so the client can pre-validate locally and fail fast.

### Response

```jsonc
{
  "ok": true,
  "data": {
    "results": [
      {
        "operationId": "0a9c…",
        "entityId": "5d2f…",
        "entityType": "TRANSACTION",
        "operation": "CREATE",
        "status": "APPLIED",
        "entity": { "id": "<server uuid>", "version": 1, "updatedAt": "…" },
      },

      { "operationId": "3b7e…", "status": "DUPLICATE" },

      {
        "operationId": "9c11…",
        "status": "CONFLICT",
        "reason": "stale_version",
        "entity": { "id": "…", "version": 7, "title": "Newer server title" },
      },

      { "operationId": "77aa…", "status": "REJECTED", "reason": "category_not_found" },
    ],
    "changes": [
      {
        "entityId": "…",
        "entityType": "TRANSACTION",
        "operation": "UPSERT",
        "version": 4,
        "updatedAt": "…",
        "payload": {/* full row */},
      },
      {
        "entityId": "…",
        "entityType": "TRANSACTION",
        "operation": "DELETE",
        "version": 9,
        "updatedAt": "…",
      },
    ],
    "cursor": "1057",
    "serverTime": "2026-10-01T09:15:04.881Z",
  },
}
```

| `status`      | Meaning                       | Client action                                                          |
| ------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `APPLIED`     | Written to the database       | Mark `SYNCED`; adopt the returned server `entity` (server id, version) |
| `DUPLICATE`   | `operationId` already seen    | Mark `SYNCED` — **no second write**                                    |
| `CONFLICT`    | A newer server version exists | Mark `SYNCED`; overwrite local row with `entity` (LWW loser)           |
| `REJECTED`    | Semantically invalid          | Mark `FAILED`; surface to the user (do not retry blindly)              |
| (network/5xx) | Not processed                 | Keep `PENDING`; retry with backoff                                     |

Processing happens in a **single database transaction per batch**, and results
are reported per operation, so a partial batch is safe to retry.

### Idempotency mechanics

- `SyncOperation` has `@@unique([userId, operationId])`.
- The server inserts the ledger row **first**; if the insert conflicts, it
  returns `DUPLICATE` and does no other work.
- Therefore a retried request (timeout, crash after commit, duplicate send)
  can never create a second transaction.

---

## 4. `GET /sync/changes` — pull

```http
GET /api/v1/sync/changes?cursor=1042&limit=200
```

Returns `ChangeLog` rows with `id > cursor` for the authenticated user,
**excluding rows whose `deviceId` equals this device's** (you never receive
your own writes back), ordered by `id` ascending.

```jsonc
{
  "ok": true,
  "data": {
    "changes": [/* same shape as POST /sync */],
    "cursor": "1057",
    "hasMore": false,
    "serverTime": "…",
  },
}
```

The client stores `cursor` in `sync_metadata` and sends it on the next push, so
a single `POST /sync` both uploads and downloads — no separate round trip is
needed in the common case.

---

## 5. Conflict strategy: last-write-wins on server version

### Rules

1. **Version** is a monotonically increasing integer on each entity, bumped by
   the server on every committed write.
2. An `UPDATE` operation carries `baseVersion` — the version the client saw.
3. If `baseVersion == current version` → apply, `version += 1`.
4. If `baseVersion < current version` → **conflict**:
   - the incoming write **still wins** (client wall-clock/`timestamp` is later
     in the user's mental model), `version += 1`;
   - status is reported as `CONFLICT` and the response carries the authoritative
     entity so the client can reconcile;
   - if `payload` timestamps and server order disagree, the **server's latest
     version** is authoritative and the client's edit is discarded and reported.
5. **`clientTimestamp` is advisory only.** Device clocks lie; it is never the
   tie-breaker. Ordering always comes from server `version`.

> **Why "last-write-wins" and not CRDT/OT:** personal finance entries are
> independent rows. Two devices editing the _same_ transaction within a sync
> window is rare, and a deterministic, explainable winner beats a merge the user
> cannot predict. The design leaves room to add per-field merge later without
> changing the wire format.

### Special cases

| Case                                                   | Behaviour                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Duplicate CREATE** (same `clientId`)                 | `@@unique([userId, clientId])` → insert conflicts → `DUPLICATE`. No second row.                                       |
| **Duplicate operation** (same `operationId`)           | Ledger unique constraint → `DUPLICATE`, no work done.                                                                 |
| **CREATE vs server DELETE**                            | Server delete wins; operation reported `CONFLICT` with a `DELETE` change.                                             |
| **DELETE of an already-deleted row**                   | `APPLIED` (idempotent) — soft-deleted rows are simply re-tombstoned.                                                  |
| **UPDATE after local DELETE**                          | `CONFLICT`, server tombstone wins (deletes must not disappear).                                                       |
| **DELETE seen by another device**                      | Delivered as a `DELETE` change with a version; client hard-deletes locally **only after** the change is acknowledged. |
| **Category deleted while a transaction references it** | `REJECTED: category_not_found` (FK is `RESTRICT`), client offers re-categorisation.                                   |
| **Clock skew**                                         | Irrelevant — `version` and the `ChangeLog` cursor are server-authoritative.                                           |

### Why deletes are safe

Deletes write `deletedAt` (soft delete) **and** append a `ChangeLog` row with
`kind = DELETE`. A device that has been offline for a month still receives the
tombstone when it next pulls, because `ChangeLog` rows are only pruned after a
retention window (Phase 6: 90 days) — long past any realistic offline period.
A delete can therefore never be "lost" by a device missing the window.

---

## 6. Client sync engine (Flutter)

```text
lib/core/sync/
├── sync_config.dart       # mirrors the API SYNC_DEFAULTS (batch, pages, poll)
├── connectivity.dart      # connectivity_plus listener + online test hook
├── sync_engine.dart       # orchestration: push → apply → pull
└── backoff.dart           # exponential backoff with jitter
```

The queue itself is part of the SQLite DAO (`core/db/local_store.dart`:
enqueue on write, `nextPushBatch`, `completeOperations`, `rejectOperation`,
`resetFailedOperations`); the status constants live in
`lib/shared/models/sync.dart`.

### Triggers

- connectivity transitions (`offline → online`)
- app resume (foreground)
- immediately after a local write (best effort, never awaited by the UI)
- periodic timer while online (`SYNC_DEFAULTS.pollIntervalMs`)

### Retry & backoff

```text
delay = min(retryBaseDelayMs * 2^attempt, retryMaxDelayMs)
delay = delay * (1 ± retryJitterRatio)
```

Defaults: base 1 s, cap 5 min, jitter ±20 %, 8 attempts before `FAILED`
(still retryable manually or on the next trigger).

- **401** → refresh the access token once, then replay the batch; if the
  refresh fails, pause syncing and send the user to login — queued operations
  are **kept**, never dropped.
- **429** → honour `Retry-After`, otherwise use the backoff.
- **5xx / network** → exponential backoff.
- **4xx validation** → `REJECTED`, surfaced to the user, not retried.

### Durability

| Concern          | Handling                                                      |
| ---------------- | ------------------------------------------------------------- |
| App restart      | Queue lives in SQLite → survives                              |
| Device restart   | Same — SQLite is on disk                                      |
| Partial sync     | Results are per-operation; only acknowledged rows are cleared |
| Duplicate send   | Server de-duplicates on `operationId`                         |
| Concurrent edits | `baseVersion` + LWW                                           |
| Ordering         | Queue drains FIFO by `createdAt` within each entity           |

### Sync status in the UI

| Symbol | State     | Meaning                            |
| ------ | --------- | ---------------------------------- |
| ✓      | `SYNCED`  | Server confirmed                   |
| ⟳      | `SYNCING` | Batch in flight                    |
| ⚠      | `PENDING` | Waiting for connectivity / queued  |
| ✕      | `FAILED`  | Rejected or retry budget exhausted |

A transaction created offline shows **⚠ Pending sync** until the server
acknowledges it; the row itself is already fully usable (view, edit, delete,
include in reports) because everything is computed locally from SQLite.

---

## 7. Local schema (SQLite)

```sql
users            -- profile snapshot for offline display
categories       -- system + user categories (offline picker)
transactions     -- full row incl. clientId, version, sync_status
sync_operations  -- operationId, entityType, entityId, operation, payload,
                   -- status, attempts, last_error, created_at
sync_metadata    -- cursor, device_id, last_sync_at, last_error
```

All five support CRUD with no network.

---

## 8. Testing matrix (Phase 5)

| Test                                          | Expectation                                      |
| --------------------------------------------- | ------------------------------------------------ |
| Create offline → kill app → relaunch          | Row still present, still `PENDING`               |
| Create offline → reconnect                    | Exactly one server row; queue empty              |
| Send the same batch twice                     | Second returns all `DUPLICATE`, still one row    |
| Two devices create with the same `clientId`   | One row (`@@unique([userId, clientId])`)         |
| Two devices edit the same row                 | LWW; both converge to the server version         |
| Delete on device A, sync on device B          | B removes the row (tombstone)                    |
| Access token expires mid-batch                | Refresh, replay; no operations lost              |
| Server returns 500                            | Exponential backoff; queue intact                |
| Server returns 422 for one op                 | That op `REJECTED`, the rest `APPLIED`           |
| Offline create while another device is online | Reports computed locally match server after sync |
| Clock set 2 days in the past                  | Ordering unaffected (server `version` wins)      |

**Coverage.** `apps/mobile/test/local_store_test.dart` (schema, queue
durability across reopen), `sync_engine_test.dart` (adoption, `DUPLICATE`,
`CONFLICT`, partial `REJECTED`, network-failure backoff, cursor-less
bootstrap + paging, tombstones, connectivity gating, sign-in kick,
`syncNow` re-arm), `sync_ui_test.dart` (pending/failed chips, Profile sync
card), `local_reports_test.dart` (local reports match the contracts), and the
opt-in `LIVE_API=1` `live_api_smoke_test.dart` (live push drains the queue,
adopts the server id, stores the cursor). The API side is covered by
`apps/api/test/sync.spec.ts`.
