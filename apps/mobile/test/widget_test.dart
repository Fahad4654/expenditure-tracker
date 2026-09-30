import 'package:flutter_test/flutter_test.dart';

import 'package:expenditure_tracker/app.dart';

void main() {
  testWidgets('Phase 1 scaffold renders the home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ExpenditureApp());

    expect(find.text('Phase 1 — architecture scaffold'), findsOneWidget);
    expect(find.textContaining('API base URL'), findsOneWidget);

    // The sync-state vocabulary lives below the fold in the ListView.
    await tester.scrollUntilVisible(find.text('Sync status vocabulary'), 200);
    expect(find.text('Pending sync'), findsOneWidget);
    expect(find.text('Synced'), findsOneWidget);
  });
}
