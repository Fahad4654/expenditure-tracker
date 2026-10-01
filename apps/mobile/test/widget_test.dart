import 'package:expenditure_tracker/features/dashboard/dashboard_page.dart';
import 'package:expenditure_tracker/features/profile/profile_page.dart';
import 'package:expenditure_tracker/features/reports/reports_page.dart';
import 'package:expenditure_tracker/features/transactions/transactions_page.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/pump_app.dart';

void main() {
  testWidgets('signed-in shell switches between all four tabs',
      (tester) async {
    await pumpApp(tester, signedIn: true);

    expect(find.byType(DashboardPage), findsOneWidget);

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);
    expect(find.byType(TransactionsPage), findsOneWidget);

    await tester.tap(find.text('Reports'));
    await settle(tester, pumps: 10);
    expect(find.byType(ReportsPage), findsOneWidget);

    await tester.tap(find.text('Profile'));
    await settle(tester, pumps: 8);
    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.text('fahad@example.com'), findsWidgets);
  });
}
