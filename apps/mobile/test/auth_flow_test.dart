import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:expenditure_tracker/features/auth/login_page.dart';
import 'package:expenditure_tracker/features/auth/register_page.dart';
import 'package:expenditure_tracker/features/shell/shell_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

void main() {
  testWidgets('boots to the login screen when there is no session',
      (tester) async {
    final app = await pumpApp(tester);

    expect(find.byType(LoginPage), findsOneWidget);
    expect(app.auth.status, AuthStatus.anonymous);
    expect(
      app.api.requestsWhere((r) => r.path.endsWith('/auth/refresh')),
      isEmpty,
    );
  });

  testWidgets('signs in with email and password and lands on the shell',
      (tester) async {
    final app = await pumpApp(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'fahad@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'secret123');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester, pumps: 8);

    expect(find.byType(ShellPage), findsOneWidget);
    final login = app.api.requestsWhere((r) => r.path.endsWith('/auth/login')).single;
    expect(login.body, {'email': 'fahad@example.com', 'password': 'secret123'});
    expect(app.tokenStore.refreshToken, 'refresh-token');
  });

  testWidgets('surfaces invalid credentials from the server', (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    api.onPost('/api/v1/auth/login', (_) =>
        throw const ApiError(ApiErrorCodes.invalidCredentials, 'Invalid email or password'));

    final app = await pumpApp(tester, api: api);

    await tester.enterText(find.byType(TextFormField).at(0), 'fahad@example.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'wrongpass1');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester, pumps: 8);

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Invalid email or password'), findsWidgets);
    expect(app.auth.status, AuthStatus.anonymous);
  });

  testWidgets('validates the registration form', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('New here? Create an account'));
    await settle(tester);

    expect(find.byType(RegisterPage), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'Fahad');
    await tester.enterText(find.byType(TextFormField).at(1), 'fahad@example.com');
    await tester.enterText(find.byType(TextFormField).at(2), 'short');
    await tester.enterText(find.byType(TextFormField).at(3), 'short');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await settle(tester);

    expect(find.text('Use at least 8 characters'), findsOneWidget);
    expect(find.byType(RegisterPage), findsOneWidget);
  });
}
