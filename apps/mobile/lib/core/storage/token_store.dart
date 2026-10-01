import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persistence backend for the refresh token. Swappable so tests (and the
/// future offline layer) can run without platform channels.
abstract class TokenBackend {
  Future<String?> read(String key);

  Future<void> write(String key, String? value);
}

/// Android Keystore / iOS Keychain backed storage.
class SecureTokenBackend implements TokenBackend {
  const SecureTokenBackend([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String? value) =>
      value == null ? _storage.delete(key: key) : _storage.write(key: key, value: value);
}

/// Backend used by widget tests — nothing touches the platform.
class InMemoryTokenBackend implements TokenBackend {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String? value) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }
}

/// Owns the two halves of a session:
///
///  * the **access token** (15 min TTL) lives in memory only — it is re-minted
///    from the refresh token on every cold start;
///  * the **refresh token** (30 d TTL) is persisted in secure storage, which is
///    the mobile transport decided in Phase 1 (web keeps it in an HTTP-only
///    cookie).
class TokenStore {
  TokenStore(this._backend);

  static const String refreshKey = 'exp.refresh_token';

  final TokenBackend _backend;

  String? accessToken;
  String? _refreshToken;

  String? get refreshToken => _refreshToken;

  bool get hasRefreshToken => _refreshToken != null && _refreshToken!.isNotEmpty;

  Future<void> load() async {
    _refreshToken = await _backend.read(refreshKey);
  }

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
  }) async {
    this.accessToken = accessToken;
    _refreshToken = refreshToken;
    await _backend.write(refreshKey, refreshToken);
  }

  Future<void> clear() async {
    accessToken = null;
    _refreshToken = null;
    await _backend.write(refreshKey, null);
  }
}
