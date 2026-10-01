import 'dart:async';

import 'package:flutter/widgets.dart';

import 'app.dart';
import 'core/db/database.dart';
import 'core/db/local_store.dart';
import 'core/network/api_client.dart';
import 'core/network/repositories.dart';
import 'core/storage/token_store.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final tokenStore = TokenStore(SecureTokenBackend());
  await tokenStore.load();

  final store = LocalStore(await AppDatabase.open());
  final api = HttpApiClient(tokenStore: tokenStore);
  final services = Services(api: api, store: store);
  final auth = AuthController(
    authRepository: services.auth,
    tokenStore: tokenStore,
  );
  api.onSessionExpired = auth.handleSessionExpired;

  unawaited(auth.restore());

  runApp(ExpenditureApp(auth: auth, services: services));
}
