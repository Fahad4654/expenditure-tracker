import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';

import 'app.dart';
import 'core/db/database.dart';
import 'core/db/local_store.dart';
import 'core/network/api_client.dart';
import 'core/network/repositories.dart';
import 'core/storage/token_store.dart';
import 'core/sync/sync_engine.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final tokenStore = TokenStore(SecureTokenBackend());
  await tokenStore.load();

  final store = LocalStore(await AppDatabase.open());
  final api = HttpApiClient(tokenStore: tokenStore);
  final sync = SyncEngine(api: api, store: store, tokenStore: tokenStore);
  final services = Services(api: api, store: store, sync: sync);
  final auth = AuthController(
    authRepository: services.auth,
    tokenStore: tokenStore,
  );
  api.onSessionExpired = auth.handleSessionExpired;
  sync.attachAuth(auth);

  // Google sign-in needs a Firebase app. A missing/broken google-services.json
  // degrades the button instead of crashing startup.
  try {
    await Firebase.initializeApp();
  } on Object catch (error) {
    debugPrint('Firebase unavailable — Google sign-in disabled: $error');
  }

  unawaited(auth.restore());
  unawaited(sync.start());

  runApp(ExpenditureApp(auth: auth, services: services));
}
