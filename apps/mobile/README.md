# Expenditure Tracker — Mobile (Flutter)

Companion app for the Expenditure Tracker API.

## Phase 4 status ✅ (online-first)

The full Phase 4 feature set is implemented and tested:

- **Auth** — login, register, splash session restore, silent refresh with a
  single-flight lock, logout everywhere.
- **Shell** — bottom navigation (Home / Transactions / Reports / Profile) with
  a central FAB for "Add transaction"; tabs are created lazily and a shared
  `ValueNotifier` lets Add refresh both Home and Transactions.
- **Dashboard** — today/month summaries, spending-by-category bar list, recent
  transactions.
- **Transactions** — search/filter list (type, category, preset ranges), add
  form with idempotency `clientId` + optimistic-concurrency `baseVersion`,
  detail view, edit, delete (409 conflict → refresh-and-retry prompt).
- **Categories** — list, create, edit, archive/unarchive, system-category
  guards surfaced from the API.
- **Reports** — summary, daily/monthly/category charts (custom widgets, no
  chart package), preset/date-range/type filters.
- **Profile** — user details, default currency/timezone, change password,
  sign out.

Infrastructure: `core/network` (envelope parsing, `ApiError` mapping, bearer
injection, auto-refresh replay), `core/storage` (`TokenStore` with a
`TokenBackend` abstraction — secure storage in production, in-memory in
tests), Material 3 theming via `app_theme.dart` with an `AppPalette`
`ThemeExtension` for income/expense colors.

## Phase 5 status ✅ (offline-first)

Offline is implemented on top of the unchanged contracts below:

- **SQLite source of truth** — every screen reads local first; REST bootstrap
  and sync apply authoritative rows into the same tables
  (`core/db/local_store.dart`, migrations in `core/db/database.dart`).
- **Sync queue** — mutations append to `sync_operations`; entity
  `sync_status` (SYNCED / SYNCING / PENDING / FAILED) recomputes from open
  operations.
- **Sync engine** (`core/sync/sync_engine.dart`) — single-flight
  push → apply → pull cycle against `POST /sync` + `GET /sync/changes`, with
  exponential backoff + jitter, connectivity gating, app-resume and periodic
  triggers, fresh-device bootstrap (no cursor on first pull), and
  "Sync now" that waits for a full cycle.
- **Status UI** — pending/failed chips on transaction tiles, a Sync card on
  Profile (queue count, last sync time, manual sync).

## Configuration

The API base URL is injected at compile time:

```sh
# Android emulator (host loopback alias)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000

# iOS simulator
flutter run --dart-define=API_BASE_URL=http://localhost:4000

# Physical device on your LAN
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000
```

`ENV` (`development` by default) controls verbose logging and debug affordances.

## Project structure

```text
lib/
├── main.dart                     # entry point, DI bootstrap
├── app.dart                      # MaterialApp, theming, splash routing
├── app_scope.dart                # InheritedWidget (AuthController + Services)
├── core/
│   ├── config/app_config.dart    # compile-time configuration
│   ├── theme/app_theme.dart      # Material 3 light/dark themes + AppPalette
│   ├── network/                  # ApiClient, routes, errors, repositories
│   ├── db/                       # SQLite schema, migrations, DAO (queue too)
│   ├── sync/                     # sync engine, backoff, connectivity
│   └── storage/token_store.dart   # secure token storage (backend abstraction)
├── features/
│   ├── splash/                   # session restore → login or shell
│   ├── auth/                     # AuthController, Login, Register
│   ├── shell/                    # bottom navigation + FAB
│   ├── dashboard/                # summaries, category bars, recent activity
│   ├── transactions/             # list, form (add/edit), detail
│   ├── categories/               # CRUD + archive
│   ├── reports/                  # summary/daily/monthly/category + charts
│   └── profile/                  # profile, settings, change password
└── shared/                       # models, formatters, money, common widgets
```

## Checks

```sh
cd apps/mobile
flutter analyze
flutter test                              # 80 widget/unit tests, no network
LIVE_API=1 flutter test test/live_api_smoke_test.dart   # needs API on :4000
```

Building the Android APK requires JDK 17+:

```sh
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 flutter build apk --debug
```

## Offline-first contract (Phase 5)

- A transaction is written to SQLite **first** and rendered immediately; the UI
  never waits for the network.
- Every mutation is appended to `sync_operations` with a client-generated UUID
  (`operationId`) so replays are idempotent.
- Connectivity changes trigger a push of pending operations with exponential
  backoff; conflicts resolve last-write-wins using the server `version`.

Covered by `local_store_test.dart` (durability, queue),
`local_reports_test.dart` (local SQL reports), `sync_engine_test.dart`
(protocol: adoption, DUPLICATE/CONFLICT/REJECTED, backoff, bootstrap pull,
connectivity gating, re-arm), `sync_ui_test.dart` (chips + Sync card) and the
opt-in `LIVE_API=1` smoke (live push → queue drained → server id adopted).

See `docs/synchronization.md` for the full protocol.
