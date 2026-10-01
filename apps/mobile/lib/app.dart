import 'package:flutter/material.dart';

import 'app_scope.dart';
import 'core/config/app_config.dart';
import 'core/network/repositories.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_page.dart';
import 'features/shell/shell_page.dart';
import 'features/splash/splash_page.dart';

class ExpenditureApp extends StatelessWidget {
  const ExpenditureApp({
    super.key,
    required this.auth,
    required this.services,
  });

  final AuthController auth;
  final Services services;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      auth: auth,
      services: services,
      child: MaterialApp(
        title: AppConfig.appTitle,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        home: _RootRouter(auth: auth),
      ),
    );
  }
}

/// Swaps between splash, login and the tab shell as the session changes.
class _RootRouter extends StatelessWidget {
  const _RootRouter({required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) => switch (auth.status) {
        AuthStatus.restoring => const SplashScreen(),
        AuthStatus.anonymous => const LoginPage(),
        AuthStatus.authenticated => const ShellPage(),
      },
    );
  }
}
