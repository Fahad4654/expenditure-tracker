import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Thin wrapper over `connectivity_plus`: tracks a boolean online/offline state
/// and reports transitions. The plugin is optional so unit tests can drive the
/// state directly through [debugSetOnline] without platform channels.
class ConnectivityMonitor {
  ConnectivityMonitor([this._connectivity]);

  final Connectivity? _connectivity;
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _online = true;

  /// Called on every transition (offline → online is the sync trigger).
  void Function(bool online)? onOnlineChanged;

  /// Optimistic default: assume online until the platform says otherwise, so a
  /// first sync can run before the initial check completes (or in tests where
  /// no plugin exists).
  bool get isOnline => _online;

  Future<void> start() async {
    final connectivity = _connectivity;
    if (connectivity == null || _subscription != null) return;
    _apply(await connectivity.checkConnectivity());
    _subscription = connectivity.onConnectivityChanged.listen(_apply);
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  /// Test hook: simulates a platform connectivity transition.
  @visibleForTesting
  void debugSetOnline(bool online) {
    if (online == _online) return;
    _online = online;
    onOnlineChanged?.call(online);
  }

  void _apply(List<ConnectivityResult> results) {
    final online = results.isNotEmpty && !results.every((r) => r == ConnectivityResult.none);
    if (online == _online) return;
    _online = online;
    onOnlineChanged?.call(online);
  }
}
