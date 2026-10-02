import 'dart:io';

import 'package:expenditure_tracker/core/db/database.dart';
import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/api_client.dart';
import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/core/storage/token_store.dart';
import 'package:expenditure_tracker/core/sync/sync_engine.dart';
import 'package:expenditure_tracker/shared/models/common.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:expenditure_tracker/shared/utils/uuid.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/sqlite_setup.dart';

/// Opt-in contract test against a running API:
///
/// ```sh
/// LIVE_API=1 flutter test test/live_api_smoke_test.dart
/// ```
///
/// Registers a throwaway user, exercises the *identity* endpoints live
/// (register, me, profile update, logout/refresh-revocation) and the
/// local-first data path end to end (REST bootstrap → SQLite reads, local
/// writes + queue, local reports). Skipped unless `LIVE_API=1`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // flutter_test installs HttpClient overrides that answer 400 to every
  // request; the live smoke needs real sockets, so restore the system ones.
  HttpOverrides.global = null;

  test('live API round trip through the mobile repositories', () async {
    if (Platform.environment['LIVE_API'] != '1') {
      markTestSkipped('Set LIVE_API=1 to run against a live API.');
      return;
    }
    ensureHostSqlite();

    final baseUrl = Platform.environment['LIVE_API_URL'] ?? 'http://localhost:4000';
    final tokenStore = TokenStore(InMemoryTokenBackend());
    final api = HttpApiClient(tokenStore: tokenStore, baseUrl: baseUrl);
    final store = LocalStore(await AppDatabase.open(
      path: '${Directory.systemTemp.path}/live_smoke_${DateTime.now().microsecondsSinceEpoch}.db',
    ));
    addTearDown(() => store.clearAll());
    final sync = SyncEngine(api: api, store: store, tokenStore: tokenStore);
    final services = Services(api: api, store: store, sync: sync);

    final email = 'smoke+${DateTime.now().microsecondsSinceEpoch}@example.com';
    final challenge = await services.auth.sendEmailOtp(
      email: email,
      purpose: 'REGISTER',
    );
    expect(challenge.devCode, isNotNull,
        reason: 'MAIL_SEND=false exposes devCode outside production');
    final session = await services.auth.register(
      name: 'Smoke Test',
      email: email,
      password: 'password123',
      code: challenge.devCode!,
    );
    await tokenStore.saveSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    expect(session.user.email, email);

    final profile = await services.auth.me();
    expect(profile.id, session.user.id);

    // REST bootstrap fills the empty store from the live API.
    await services.auth.seedFromServer();
    final categories = await services.categories.list();
    expect(categories, isNotEmpty);
    expect(store.getUser()?.id, profile.id);
    final category = categories.first;

    // Local-first write: the row lands immediately with a queued operation.
    final clientId = generateUuidV4();
    final input = TransactionInput(
      clientId: clientId,
      type: TransactionType.expense,
      amount: '123.45',
      categoryId: category.id,
      title: 'Smoke test expense',
      description: 'Created by the live smoke test',
      transactionDate: '2026-10-01',
    );

    final created = await services.transactions.create(input);
    expect(created.amount, '123.45');
    expect(created.clientId, clientId);
    expect(created.syncStatus, 'PENDING');
    expect(store.nextPushBatch(), hasLength(1));

    final list = await services.transactions.list(
      const TransactionQuery(limit: 100),
    );
    expect(list.items.where((t) => t.clientId == clientId), hasLength(1));

    // The sync engine pushes the queued create and adopts the server id.
    await sync.syncNow();
    expect(store.nextPushBatch(), isEmpty, reason: 'the batch applied: lastError=${sync.lastError}');
    expect(store.entitySyncStatus('TRANSACTION', clientId), 'SYNCED');
    expect(store.cursor, isNotNull, reason: 'the pull stored its cursor');
    final synced = store
        .listTransactions(const TransactionQuery(limit: 100))
        .items
        .where((t) => t.clientId == clientId)
        .first;
    expect(synced.id, isNot(clientId), reason: 'server_id adopted after push');

    final summary = await services.reports.summary(
      preset: DateRangePreset.month,
      timezone: profile.timezone,
    );
    expect(double.parse(summary.totalExpense), greaterThanOrEqualTo(0));

    final categoryReport = await services.reports.categories(
      preset: DateRangePreset.month,
      type: TransactionType.expense,
      timezone: profile.timezone,
    );
    expect(categoryReport.points, isNotEmpty);

    final updated = await services.users.update(name: 'Smoke Test Updated');
    expect(updated.name, 'Smoke Test Updated');
    expect(store.getUser()?.name, 'Smoke Test Updated');

    await services.transactions.delete(created.id);
    final afterDelete = await services.transactions.list(
      const TransactionQuery(limit: 100),
    );
    expect(afterDelete.items.where((t) => t.clientId == clientId), isEmpty);

    final revokedToken = tokenStore.refreshToken!;
    await services.auth.logout(revokedToken);
    await tokenStore.clear();
    expect(tokenStore.refreshToken, isNull);
    expect(store.getUser(), isNull, reason: 'logout wipes local data');

    // A revoked refresh token must be rejected.
    await expectLater(
      services.auth.refresh(revokedToken),
      throwsA(isA<ApiError>()),
    );
  });
}
