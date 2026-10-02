import 'package:flutter/material.dart';

import '../features/auth/auth_controller.dart';
import '../core/network/repositories.dart';
import '../core/sync/sync_engine.dart';

/// Access point for everything shared by the widget tree: the session
/// controller and the resource repositories.
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.auth,
    required this.services,
    required super.child,
  });

  final AuthController auth;
  final Services services;

  TransactionsRepository get transactions => services.transactions;
  CategoriesRepository get categories => services.categories;
  ReportsRepository get reports => services.reports;
  UsersRepository get users => services.users;
  SyncEngine get sync => services.sync;

  /// Safe to call from `initState` (does not register a dependency).
  static AppScope read(BuildContext context) {
    final scope = context.getElementForInheritedWidgetOfExactType<AppScope>()?.widget;
    assert(scope is AppScope, 'AppScope is missing above this context');
    return scope! as AppScope;
  }

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing above this context');
    return scope!;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      auth != oldWidget.auth || services != oldWidget.services;
}
