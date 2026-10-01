import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

void main() {
  testWidgets('shows today/month summaries and recent activity',
      (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);
    api.onGet(
      '/api/v1/reports/summary',
      (request) {
        if (request.query?['preset'] == 'today') {
          return summaryJson(
            income: '1000.00',
            expense: '250.00',
            balance: '750.00',
          );
        }
        return summaryJson(
          income: '50000.00',
          expense: '12000.00',
          balance: '38000.00',
          from: '2026-10-01',
          to: '2026-10-31',
        );
      },
    );
    api.onGet(
      '/api/v1/reports/categories',
      (_) => categoryReportJson(points: [
        {
          'categoryId': categoryId,
          'categoryName': 'Food',
          'color': '#F97316',
          'total': '4000.00',
          'percentage': '80.00',
        },
      ]),
    );
    api.onGet(
      '/api/v1/transactions',
      (_) => paginatedJson([transactionJson()], total: 1),
    );

    final app = await pumpApp(tester, signedIn: true, api: api);
    await settle(tester, pumps: 10);

    expect(app.auth.status, AuthStatus.authenticated);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);
    expect(find.text('৳1,000.00'), findsWidgets);
    expect(find.text('৳38,000.00'), findsWidgets);
    expect(find.text('Lunch with Sam'), findsOneWidget);
    expect(find.text('Top spending this month'), findsOneWidget);
    expect(find.text('80.0%'), findsOneWidget);
  });

  testWidgets('refreshes the dashboard after a transaction is added',
      (tester) async {
    final api = FakeApiClient();
    registerDefaultHandlers(api);

    final app = await pumpApp(tester, signedIn: true, api: api);
    await settle(tester, pumps: 10);

    final before = app.api.log.length;
    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextFormField).at(0), '40');
    await tester.enterText(find.byType(TextFormField).at(1), 'Bus fare');
    await tester.tap(find.widgetWithText(FilledButton, 'Add transaction'));
    await settle(tester, pumps: 10);

    // The shell bumps the refresh tick, which reloads dashboard sections.
    final afterCreate = app.api.log.length;
    expect(afterCreate, greaterThan(before));

    final summaryReloads = app.api.requestsWhere(
      (r) => r.path.endsWith('/reports/summary'),
    );
    expect(summaryReloads.length, greaterThan(2));
  });
}
