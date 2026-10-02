import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:expenditure_tracker/features/auth/forgot_password_page.dart';
import 'package:expenditure_tracker/features/auth/login_page.dart';
import 'package:expenditure_tracker/features/auth/register_page.dart';
import 'package:expenditure_tracker/features/shell/shell_page.dart';
import 'package:expenditure_tracker/shared/models/user.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

/// Register-page fields only: the login page below the push route is still
/// in the tree, so an unscoped finder would type into the wrong inputs.
Finder registerField(int index) => find
    .descendant(of: find.byType(RegisterPage), matching: find.byType(TextFormField))
    .at(index);

/// The auth pages grew (Google button + OTP fields); scroll before tapping.
Future<void> openRegisterPage(WidgetTester tester) async {
  final link = find.text('New here? Create an account');
  await tester.ensureVisible(link);
  await tester.tap(link);
  await settle(tester);
}

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

  testWidgets('offline cold start restores from the local snapshot',
      (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    api.onPost(
      '/api/v1/auth/refresh',
      (_) => throw const ApiError(ApiErrorCodes.network, 'No connection.'),
    );

    final app = await pumpApp(tester, api: api, signedIn: true, seed: (store) async {
      store.upsertUser(UserProfile.fromJson(userJson()));
    });
    await settle(tester);

    expect(app.auth.status, AuthStatus.authenticated);
    expect(app.auth.user?.email, 'fahad@example.com');
    expect(
      app.tokenStore.refreshToken,
      'refresh-token',
      reason: 'network failures keep the tokens for a later retry',
    );
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

  testWidgets('sends an email OTP on register and shows the dev code',
      (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    await pumpApp(tester, api: api);
    await openRegisterPage(tester);

    await tester.enterText(registerField(1), 'fahad@example.com');
    final sendCode = find.widgetWithText(OutlinedButton, 'Send code');
    await tester.ensureVisible(sendCode);
    await tester.tap(sendCode);
    await settle(tester);

    expect(find.textContaining('Dev code: 123456'), findsOneWidget);
    expect(find.text('123456'), findsOneWidget,
        reason: 'the dev code auto-fills the code field');

    final send = api.requestsWhere((r) => r.path.endsWith('/auth/otp/send')).single;
    expect(send.body, {'email': 'fahad@example.com', 'purpose': 'REGISTER'});

    // Unmount so the resend countdown timer does not outlive the test.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('registers with the verification code and lands on the shell',
      (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    await pumpApp(tester, api: api);
    await openRegisterPage(tester);

    await tester.enterText(registerField(0), 'Fahad');
    await tester.enterText(registerField(1), 'fahad@example.com');
    await tester.enterText(registerField(2), 'secret123');
    await tester.enterText(registerField(3), 'secret123');
    await tester.enterText(registerField(4), '123456');
    final create = find.widgetWithText(FilledButton, 'Create account');
    await tester.ensureVisible(create);
    await tester.tap(create);
    await settle(tester, pumps: 8);

    expect(find.byType(ShellPage), findsOneWidget);
    final register = api.requestsWhere((r) => r.path.endsWith('/auth/register')).single;
    expect(register.body, {
      'name': 'Fahad',
      'email': 'fahad@example.com',
      'password': 'secret123',
      'code': '123456',
    });
  });

  testWidgets('resets the password with an emailed OTP', (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    await pumpApp(tester, api: api);

    final forgotLink = find.text('Forgot password?');
    await tester.ensureVisible(forgotLink);
    await tester.tap(forgotLink);
    await settle(tester);
    expect(find.byType(ForgotPasswordPage), findsOneWidget);

    Finder field(int index) => find
        .descendant(
          of: find.byType(ForgotPasswordPage),
          matching: find.byType(TextFormField),
        )
        .at(index);

    await tester.enterText(field(0), 'fahad@example.com');
    final sendCode = find.widgetWithText(OutlinedButton, 'Send code');
    await tester.ensureVisible(sendCode);
    await tester.tap(sendCode);
    await settle(tester);
    expect(find.textContaining('Dev code: 123456'), findsOneWidget);

    await tester.enterText(field(1), '123456');
    await tester.enterText(field(2), 'BrandNew-456');
    final submit = find.widgetWithText(FilledButton, 'Reset password');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await settle(tester, pumps: 8);

    expect(find.byType(ShellPage), findsOneWidget);
    final reset = api.requestsWhere((r) => r.path.endsWith('/auth/reset-password')).single;
    expect(reset.body, {
      'email': 'fahad@example.com',
      'code': '123456',
      'password': 'BrandNew-456',
    });
  });

  testWidgets('validates the registration form', (tester) async {
    await pumpApp(tester);
    await openRegisterPage(tester);

    expect(find.byType(RegisterPage), findsOneWidget);

    await tester.enterText(registerField(0), 'Fahad');
    await tester.enterText(registerField(1), 'fahad@example.com');
    await tester.enterText(registerField(2), 'short');
    await tester.enterText(registerField(3), 'short');
    await tester.enterText(registerField(4), '123456');
    final create = find.widgetWithText(FilledButton, 'Create account');
    await tester.ensureVisible(create);
    await tester.tap(create);
    await settle(tester);

    expect(find.text('Use at least 8 characters'), findsOneWidget);
    expect(find.byType(RegisterPage), findsOneWidget);
  });
}
