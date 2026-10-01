/// Compile-time application configuration.
///
/// Override at build/run time with `--dart-define`, e.g.:
///
/// ```sh
/// flutter run \
///   --dart-define=API_BASE_URL=http://192.168.1.20:4000 \
///   --dart-define=ENV=development
/// ```
///
/// Android emulators must use `http://10.0.2.2:4000` (the host loopback
/// alias); the iOS simulator can use `http://localhost:4000`.
abstract final class AppConfig {
  static const String appTitle = 'Expenditure Tracker';

  /// Base URL of the NestJS API (no trailing slash).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  static const String environment = String.fromEnvironment(
    'ENV',
    defaultValue: 'development',
  );

  static bool get isDevelopment => environment != 'production';

  /// Prefix shared by every REST endpoint (mirrors `API_PREFIX` in `apps/api/src/shared/config`).
  static const String apiPrefix = '/api/v1';
}
