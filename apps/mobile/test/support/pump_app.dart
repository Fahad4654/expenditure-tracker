import 'dart:async';

import 'package:expenditure_tracker/app.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/core/storage/token_store.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'fixtures.dart';

/// Everything a widget test needs to drive the real app tree against fakes.
class TestApp {
  TestApp._(this.api) {
    registerDefaultHandlers(api);
  }

  static Future<TestApp> create({
    FakeApiClient? api,
    bool signedIn = false,
  }) async {
    final app = TestApp._(api ?? FakeApiClient());
    if (signedIn) {
      await app.tokenStore.saveSession(
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      );
    }
    return app;
  }

  final FakeApiClient api;
  final TokenStore tokenStore = TokenStore(InMemoryTokenBackend());
  late final Services services = Services.fromApiClient(api);
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
}) async {
  final app = await TestApp.create(api: api, signedIn: signedIn);
  unawaited(app.auth.restore());
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
