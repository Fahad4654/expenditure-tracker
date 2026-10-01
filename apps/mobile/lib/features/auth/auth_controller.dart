import 'package:flutter/foundation.dart';

import '../../core/network/api_error.dart';
import '../../core/network/repositories.dart';
import '../../core/storage/token_store.dart';
import '../../shared/models/user.dart';

enum AuthStatus {
  /// Cold start: the persisted refresh token has not been replayed yet.
  restoring,

  authenticated,
  anonymous,
}

/// Owns the session lifecycle: restore, login, register, logout and profile
/// updates. The root widget rebuilds off [status], so auth failures raised by
/// the API client land the user on the login screen exactly once.
class AuthController extends ChangeNotifier {
  AuthController({required this.authRepository, required this.tokenStore});

  final AuthRepository authRepository;
  final TokenStore tokenStore;

  AuthStatus _status = AuthStatus.restoring;
  UserProfile? _user;

  AuthStatus get status => _status;

  UserProfile? get user => _user;

  bool get isAuthenticated => _status == AuthStatus.authenticated;

  /// Replays the stored refresh token to renew the session on cold start.
  ///
  /// A network failure keeps the tokens (so a later retry can succeed); only a
  /// rejected token clears the session.
  Future<void> restore() async {
    _status = AuthStatus.restoring;
    notifyListeners();

    if (!tokenStore.hasRefreshToken) {
      _status = AuthStatus.anonymous;
      _user = null;
      notifyListeners();
      return;
    }

    try {
      final session = await authRepository.refresh(tokenStore.refreshToken!);
      await tokenStore.saveSession(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      );
      _user = session.user;
      _status = AuthStatus.authenticated;
    } on ApiError catch (error) {
      if (!error.isNetwork) await tokenStore.clear();
      _user = null;
      _status = AuthStatus.anonymous;
    } catch (_) {
      _user = null;
      _status = AuthStatus.anonymous;
    }
    notifyListeners();
  }

  Future<void> login({required String email, required String password}) async {
    final session = await authRepository.login(email: email, password: password);
    await _applySession(session);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final session = await authRepository.register(
      name: name,
      email: email,
      password: password,
    );
    await _applySession(session);
  }

  /// Called by [HttpApiClient] when a refresh fails terminally.
  void handleSessionExpired() {
    if (_status != AuthStatus.authenticated) return;
    _user = null;
    _status = AuthStatus.anonymous;
    notifyListeners();
  }

  Future<void> logout() async {
    final refreshToken = tokenStore.refreshToken;
    try {
      await authRepository.logout(refreshToken);
    } on ApiError {
      // Best effort: local sign-out must not depend on the network.
    }
    await tokenStore.clear();
    _user = null;
    _status = AuthStatus.anonymous;
    notifyListeners();
  }

  /// Publishes a profile updated by another screen (e.g. settings).
  void applyProfile(UserProfile user) {
    _user = user;
    notifyListeners();
  }

  Future<void> _applySession(AuthSession session) async {
    await tokenStore.saveSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    _user = session.user;
    _status = AuthStatus.authenticated;
    notifyListeners();
  }
}
