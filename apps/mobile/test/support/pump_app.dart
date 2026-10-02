import 'dart:async';

import 'package:expenditure_tracker/app.dart';
import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/core/storage/token_store.dart';
import 'package:expenditure_tracker/core/sync/sync_engine.dart';
import 'package:expenditure_tracker/core/timezone.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'fixtures.dart';
import 'sqlite_setup.dart';

/// Everything a widget test needs to drive the real app tree against fakes:
/// a [FakeApiClient] for identity endpoints and a real SQLite [LocalStore]
/// for everything offline-first.
///
/// Construction performs real I/O (temp files, the tz database) — call it via
/// [pumpApp], which runs it inside `tester.runAsync` where the event loop
/// actually turns.
class TestApp {
  TestApp._(this.api, TestStore harness) : _harness = harness {
    registerDefaultHandlers(api);
    addTearDown(harness.cleanup);
  }

  static Future<TestApp> create({
    FakeApiClient? api,
    bool signedIn = false,
    Future<void> Function(LocalStore store)? seed,
  }) async {
    final harness = await TestStore.open();
    final app = TestApp._(api ?? FakeApiClient(), harness);
    // Real I/O — must happen inside `tester.runAsync` (see [Timezones]).
    await Timezones.preload();
    if (seed != null) await seed(app.store);
    if (signedIn) {
      await app.tokenStore.saveSession(
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      );
    }
    // Wire the (never-started: no timers, no connectivity plugin) engine to
    // auth so restore/login kick a real cycle against the fake API.
    app.sync.attachAuth(app.auth);
    return app;
  }

  final FakeApiClient api;
  final TestStore _harness;
  final TokenStore tokenStore = TokenStore(InMemoryTokenBackend());

  LocalStore get store => _harness.store;

  late final SyncEngine sync =
      SyncEngine(api: api, store: store, tokenStore: tokenStore);

  late final Services services = Services(api: api, store: store, sync: sync);

  late final AuthController auth = AuthController(
    authRepository: services.auth,
    tokenStore: tokenStore,
  );

  Widget build() => ExpenditureApp(auth: auth, services: services);
}

Future<TestApp> pumpApp(
  WidgetTester tester, {
  FakeApiClient? api,
  bool signedIn = false,
  Future<void> Function(LocalStore store)? seed,
}) async {
  final app = await tester.runAsync(
    () => TestApp.create(api: api, signedIn: signedIn, seed: seed),
  );
  unawaited(app!.auth.restore());
  await tester.pumpWidget(app.build());
  await settle(tester);
  return app;
}

/// Bounded pump loop — safe while a progress indicator animates (unlike
/// `pumpAndSettle`, which would never settle).
Future<void> settle(WidgetTester tester, {int pumps = 5}) async {
  for (var i = 0; i < pumps; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
