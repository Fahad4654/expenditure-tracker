# Expenditure Tracker — Mobile (Flutter)

Offline-first companion app for the Expenditure Tracker API.

## Phase 1 status

Scaffold only: project created, theming, compile-time configuration and the
planned screen/sync-status contracts are in place. Feature work lands in
Phases 4 and 5.

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

## Target structure

```text
lib/
├── main.dart                     # entry point
├── app.dart                      # MaterialApp, theming, routing
├── core/
│   ├── config/app_config.dart    # compile-time configuration
│   ├── theme/app_theme.dart      # Material 3 light/dark themes
│   ├── network/                  # Phase 4 — HTTP client, interceptors, token refresh
│   ├── db/                       # Phase 5 — SQLite schema, DAOs, migrations
│   ├── sync/                     # Phase 5 — queue, connectivity, retry/backoff
│   └── storage/                  # Phase 4 — secure token storage
├── features/
│   ├── shell/                    # Phase 4 — bottom navigation (Home/Transactions/Add/Reports/Profile)
│   ├── auth/                     # Splash, Login, Register, OTP verification
│   ├── dashboard/                # Today/month summaries and charts
│   ├── transactions/             # List, add, detail, edit
│   ├── categories/
│   ├── reports/
│   └── profile/                  # Profile and settings
└── shared/                       # widgets and formatters reused across features
```

## Offline-first contract

- A transaction is written to SQLite **first** and rendered immediately; the UI
  never waits for the network.
- Every mutation is appended to `sync_operations` with a client-generated UUID
  (`operationId`) so replays are idempotent.
- Connectivity changes trigger a push of pending operations with exponential
  backoff; conflicts resolve last-write-wins using the server `version`.

See `docs/synchronization.md` for the full protocol.

## Tests

```sh
cd apps/mobile
flutter test
```
