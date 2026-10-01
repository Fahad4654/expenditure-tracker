import 'dart:io';

import 'package:expenditure_tracker/core/network/api_client.dart';
import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/core/storage/token_store.dart';
import 'package:expenditure_tracker/shared/models/common.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:expenditure_tracker/shared/utils/uuid.dart';
import 'package:flutter_test/flutter_test.dart';

/// Opt-in contract test against a running API:
///
/// ```sh
/// LIVE_API=1 flutter test test/live_api_smoke_test.dart
/// ```
///
/// Registers a throwaway user, exercises the repositories end to end (create,
/// idempotent replay, list, report, profile, delete, logout) and then cleans up
/// after itself. Skipped unless `LIVE_API=1`.
void main() {
  test('live API round trip through the mobile repositories', () async {
    if (Platform.environment['LIVE_API'] != '1') {
      markTestSkipped('Set LIVE_API=1 to run against a live API.');
      return;
    }

    final baseUrl = Platform.environment['LIVE_API_URL'] ?? 'http://localhost:4000';
    final tokenStore = TokenStore(InMemoryTokenBackend());
    final api = HttpApiClient(tokenStore: tokenStore, baseUrl: baseUrl);
    final services = Services.fromApiClient(api);

    final email = 'smoke+${DateTime.now().microsecondsSinceEpoch}@example.com';
    final session = await services.auth.register(
      name: 'Smoke Test',
      email: email,
      password: 'password123',
    );
    await tokenStore.saveSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    expect(session.user.email, email);

    final profile = await services.auth.me();
    expect(profile.id, session.user.id);

    final categories = await services.categories.list();
    expect(categories, isNotEmpty);
    final category = categories.first;

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

    // Replaying the same clientId must not create a second row.
    final replay = await services.transactions.create(input);
    expect(replay.id, created.id);

    final list = await services.transactions.list(
      const TransactionQuery(limit: 100),
    );
    expect(list.items.where((t) => t.id == created.id), hasLength(1));

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

    await services.transactions.delete(created.id);
    final afterDelete = await services.transactions.list(
      const TransactionQuery(limit: 100),
    );
    expect(afterDelete.items.where((t) => t.id == created.id), isEmpty);

    final revokedToken = tokenStore.refreshToken!;
    await services.auth.logout(revokedToken);
    await tokenStore.clear();
    expect(tokenStore.refreshToken, isNull);

    // A revoked refresh token must be rejected.
    await expectLater(
      services.auth.refresh(revokedToken),
      throwsA(isA<ApiError>()),
    );
  });
}
