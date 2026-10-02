import 'package:flutter/material.dart';

import 'app_scope.dart';
import 'core/config/app_config.dart';
import 'core/network/repositories.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_page.dart';
import 'features/shell/shell_page.dart';
import 'features/splash/splash_page.dart';

class ExpenditureApp extends StatefulWidget {
  const ExpenditureApp({
    super.key,
    required this.auth,
    required this.services,
  });

  final AuthController auth;
  final Services services;

  @override
  State<ExpenditureApp> createState() => _ExpenditureAppState();
}

class _ExpenditureAppState extends State<ExpenditureApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Returning to the foreground is a sync trigger (docs §6).
    if (state == AppLifecycleState.resumed) widget.services.sync.requestSync();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      auth: widget.auth,
      services: widget.services,
      // Keying the app by auth status resets the navigator whenever the
      // session flips, so a screen pushed before signing in (register,
      // password reset) cannot stay on top of the shell afterwards.
      child: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) => MaterialApp(
          key: ValueKey<AuthStatus>(widget.auth.status),
          title: AppConfig.appTitle,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: ThemeMode.system,
          home: _RootRouter(auth: widget.auth),
        ),
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
