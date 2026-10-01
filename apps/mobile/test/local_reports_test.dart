import 'package:expenditure_tracker/core/db/local_reports.dart';
import 'package:expenditure_tracker/core/timezone.dart';
import 'package:expenditure_tracker/shared/models/common.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:expenditure_tracker/shared/utils/dates.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fixtures.dart';
import 'support/sqlite_setup.dart';

/// The test window: everything is computed relative to the *same* "today" the
/// reports will use (`UTC`), so the suite cannot flake near midnight.
String get _today => Timezones.todayIn('UTC');
String get _year => _today.substring(0, 4);

Future<TestStore> _store() async {
  final harness = await TestStore.open();
  addTearDown(harness.cleanup);
  return harness;
}

Map<String, Object?> _tx({
  required String clientId,
  required String date,
  String amount = '10.00',
  String type = 'EXPENSE',
  String? categoryIdValue,
}) =>
    transactionJson(
      id: 'srv-$clientId',
      clientId: clientId,
      title: 't-$clientId',
      amount: amount,
      type: type,
      date: date,
      categoryIdValue: categoryIdValue ?? categoryId,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('date helpers mirror the server', () {
    test('addDays rolls over months and years', () {
      expect(addDays('2026-01-31', 1), '2026-02-01');
      expect(addDays('2026-12-31', 1), '2027-01-01');
      expect(addDays('2026-03-01', -1), '2026-02-28');
      expect(addDays('2026-10-05', -7), '2026-09-28');
    });

    test('daysBetween counts whole days both ways', () {
      expect(daysBetween('2026-10-01', '2026-10-01'), 0);
      expect(daysBetween('2026-10-01', '2026-10-08'), 7);
      expect(daysBetween('2026-10-08', '2026-10-01'), -7);
    });

    test('week runs Monday to Sunday; months and years are bounded', () {
      // 2026-10-01 is a Thursday → Monday is 2026-09-28.
      expect(startOfWeek('2026-10-01'), '2026-09-28');
      expect(startOfWeek('2026-09-28'), '2026-09-28');
      expect(endOfMonth('2026-02-10'), '2026-02-28');
      expect(endOfMonth('2028-02-10'), '2028-02-29');
      expect(monthOf('2026-10-15'), '2026-10');
    });

    test('boundedRange prefers the preset, then bounds defaults', () {
      expect(
        boundedRange(preset: 'today', today: '2026-10-05'),
        (from: '2026-10-05', to: '2026-10-05'),
      );
      expect(
        boundedRange(preset: 'week', today: '2026-10-01'),
        (from: '2026-09-28', to: '2026-10-04'),
      );
      expect(
        boundedRange(preset: 'month', today: '2026-10-05'),
        (from: '2026-10-01', to: '2026-10-31'),
      );
      expect(
        boundedRange(preset: 'year', today: '2026-10-05'),
        (from: '2026-01-01', to: '2026-12-31'),
      );
      expect(
        boundedRange(today: '2026-10-05'),
        (from: '2026-10-01', to: '2026-10-05'),
        reason: 'no preset → month-start through today',
      );
    });

    test('todayIn follows the requested timezone', () async {
      await Timezones.ensureReady();
      final utc = Timezones.todayIn('UTC', now: DateTime.utc(2026, 10, 1, 20));
      final dhaka = Timezones.todayIn('Asia/Dhaka', now: DateTime.utc(2026, 10, 1, 20));
      expect(utc, '2026-10-01');
      expect(dhaka, '2026-10-02', reason: 'Dhaka is UTC+6 — already tomorrow');
      expect(
        Timezones.todayIn('Not/AZone', now: DateTime.utc(2026, 10, 1, 20)),
        matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')),
        reason: 'unknown zones fall back to the device calendar',
      );
    });
  });

  group('summary', () {
    test('splits income and expense over the preset window', () async {
      final harness = await _store();
      final store = harness.store;
      final today = _today;
      // A second in-month day that is never "today" (fixed: today could be
      // any day of the month, including the 15th).
      final dayTwo = today.endsWith('-15')
          ? '${_today.substring(0, 7)}-16'
          : '${_today.substring(0, 7)}-15';
      store.applyServerTransactionUpsert(
          _tx(clientId: 'a', date: today, amount: '100.00'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 'b', date: today, amount: '40.00', type: 'INCOME'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 'c', date: dayTwo, amount: '25.00'));

      final reports = LocalReports(store);
      final todaySummary = await reports.summary(
          preset: DateRangePreset.today, timezone: 'UTC');
      expect(todaySummary.totalExpense, '100.00');
      expect(todaySummary.totalIncome, '40.00');
      expect(todaySummary.balance, '-60.00');
      expect(todaySummary.range.from, today);

      final month = await reports.summary(
          preset: DateRangePreset.month, timezone: 'UTC');
      expect(month.totalExpense, '125.00');
      expect(month.totalIncome, '40.00');
      expect(month.balance, '-85.00');
      expect(month.currency, 'BDT');
      expect(month.timezone, 'UTC');
    });

    test('an empty window reports zeroes, not nulls', () async {
      final harness = await _store();
      final reports = LocalReports(harness.store);
      final summary =
          await reports.summary(preset: DateRangePreset.today, timezone: 'UTC');
      expect(summary.totalIncome, '0.00');
      expect(summary.totalExpense, '0.00');
      expect(summary.balance, '0.00');
    });
  });

  group('daily', () {
    test('zero-fills every day of the limit window', () async {
      final harness = await _store();
      final store = harness.store;
      store.applyServerTransactionUpsert(
          _tx(clientId: 'a', date: _today, amount: '10.00'));

      final report = await LocalReports(store)
          .daily(preset: DateRangePreset.month, limit: 7, timezone: 'UTC');

      expect(report.points, hasLength(7));
      expect(report.points.last.date, _today);
      expect(report.points.last.expense, '10.00');
      expect(report.points.last.income, '0.00');
      expect(report.points.take(6).every((p) => p.expense == '0.00'), isTrue);
      final consecutive = daysBetween(report.points.first.date, report.points.last.date);
      expect(consecutive, 6);
    });
  });

  group('monthly', () {
    test('returns all twelve months with balances', () async {
      final harness = await _store();
      final store = harness.store;
      store.applyServerTransactionUpsert(
          _tx(clientId: 'jan', date: '$_year-01-15', amount: '500.00'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 'dec', date: '$_year-12-25', amount: '70.00', type: 'INCOME'));

      final report =
          await LocalReports(store).monthly(year: int.parse(_year), timezone: 'UTC');

      expect(report.points, hasLength(12));
      expect(report.points.first.month, '$_year-01');
      expect(report.points.first.expense, '500.00');
      expect(report.points.first.balance, '-500.00');
      expect(report.points.last.month, '$_year-12');
      expect(report.points.last.income, '70.00');
      expect(report.points.last.balance, '70.00');
      expect(report.points[1].expense, '0.00');
    });
  });

  group('category report', () {
    test('sorts by total, truncates percentages and names missing rows',
        () async {
      final harness = await _store();
      final store = harness.store;
      store.applyServerCategoryUpsert(categoryJson());
      store.applyServerCategoryUpsert(
        categoryJson(
          id: 'other-cat',
          name: 'Transport',
          color: '#3B82F6',
          isSystem: false,
          kind: 'USER',
        ),
      );
      // Food 3×10.00 = 30.00, Transport 10.00, orphan 10.00 → total 50.00.
      store.applyServerTransactionUpsert(
          _tx(clientId: 'f1', date: '$_year-01-10', amount: '10.00'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 'f2', date: '$_year-01-11', amount: '10.00'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 'f3', date: '$_year-01-12', amount: '10.00'));
      store.applyServerTransactionUpsert(
          _tx(clientId: 't1', date: '$_year-01-13', amount: '10.00',
              categoryIdValue: 'other-cat'));
      // Orphan category id → "Deleted category".
      store.applyServerTransactionUpsert(
          _tx(clientId: 'x1', date: '$_year-01-14', amount: '10.00',
              categoryIdValue: 'ghost-cat'));

      final report = await LocalReports(store).categories(
        preset: DateRangePreset.year,
        type: TransactionType.expense,
        timezone: 'UTC',
      );

      expect(report.points.first.categoryName, 'Food');
      expect(report.points.first.total, '30.00');
      expect(report.points.first.percentage, '60.00');
      expect(report.points.map((p) => p.total).toList(), ['30.00', '10.00', '10.00']);
      expect(
        report.points.map((p) => p.percentage).toList(),
        ['60.00', '20.00', '20.00'],
      );
      expect(
        report.points.map((p) => p.categoryName),
        contains('Deleted category'),
      );
      expect(report.type, 'EXPENSE');
      expect(report.range.from, '$_year-01-01');
    });

    test('thirds truncate to 33.33 (integer division, like the server)',
        () async {
      final harness = await _store();
      final store = harness.store;
      store.applyServerCategoryUpsert(categoryJson());
      store.applyServerCategoryUpsert(
        categoryJson(id: 'two', name: 'Transport', isSystem: false, kind: 'USER'),
      );
      store.applyServerCategoryUpsert(
        categoryJson(id: 'three', name: 'Bills', isSystem: false, kind: 'USER'),
      );
      for (final (i, cat) in [categoryId, 'two', 'three'].indexed) {
        store.applyServerTransactionUpsert(_tx(
          clientId: 'third-$i',
          date: '$_year-02-1${i + 1}',
          amount: '10.00',
          categoryIdValue: cat,
        ));
      }

      final report = await LocalReports(store).categories(
        preset: DateRangePreset.custom,
        from: '$_year-02-01',
        to: '$_year-02-28',
        type: TransactionType.expense,
        timezone: 'UTC',
      );

      expect(report.points, hasLength(3));
      expect(
        report.points.map((p) => p.percentage).toSet(),
        {'33.33'},
        reason: '10/30 truncates — 99.99 total, never rounds up',
      );
      expect(
        report.points.map((p) => p.total).toSet(),
        {'10.00'},
      );
    });
  });
}
