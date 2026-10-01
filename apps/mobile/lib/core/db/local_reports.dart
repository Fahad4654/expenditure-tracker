import '../../shared/money.dart';
import '../../shared/models/common.dart';
import '../../shared/models/report.dart';
import '../../shared/models/transaction.dart';
import '../../shared/utils/dates.dart';
import '../timezone.dart';
import 'local_store.dart';

/// Local aggregation of the transaction table — the offline counterpart of
/// `ReportsService` (`apps/api/src/reports/reports.service.ts`).
///
/// Bucketing matches the server exactly: presets resolve in the *user's*
/// calendar, windows are bounded the same way, sums are integer minor units,
/// and percentages use truncating BigInt division.
class LocalReports {
  LocalReports(this._store);

  final LocalStore _store;

  Future<SummaryResponse> summary({
    required DateRangePreset preset,
    String? timezone,
    String? from,
    String? to,
  }) async {
    final context = await _context(timezone);
    final range = boundedRange(preset: preset.wire, from: from, to: to, today: context.today);
    final sums = _sumsByType(range);

    final income = sums['INCOME'] ?? BigInt.zero;
    final expense = sums['EXPENSE'] ?? BigInt.zero;
    return SummaryResponse(
      range: DateRange(from: range.from, to: range.to),
      timezone: context.timezone,
      currency: context.currency,
      totalIncome: fromMinorUnits(income),
      totalExpense: fromMinorUnits(expense),
      balance: fromMinorUnits(income - expense),
    );
  }

  /// Per-day series for the last [limit] days ending today — the server's
  /// daily endpoint ignores its preset and always works that window.
  Future<DailyReport> daily({
    required DateRangePreset preset,
    int limit = 30,
    String? timezone,
  }) async {
    final context = await _context(timezone);
    final range = dailyRange(limit: limit, today: context.today);

    final rows = _store.db.select(
      'SELECT transaction_date AS date, type, SUM(amount_minor) AS total '
      'FROM transactions WHERE transaction_date >= ? AND transaction_date <= ? '
      'GROUP BY transaction_date, type',
      [range.from, range.to],
    );
    final byDate = <String, Map<String, BigInt>>{};
    for (final row in rows) {
      final date = row['date']! as String;
      final bucket = byDate.putIfAbsent(date, () => {});
      bucket[row['type']! as String] = BigInt.from((row['total']! as num).toInt());
    }

    final points = <DailyPoint>[];
    for (var day = range.from; daysBetween(day, range.to) >= 0; day = addDays(day, 1)) {
      final bucket = byDate[day] ?? const <String, BigInt>{};
      points.add(DailyPoint(
        date: day,
        income: fromMinorUnits(bucket['INCOME'] ?? BigInt.zero),
        expense: fromMinorUnits(bucket['EXPENSE'] ?? BigInt.zero),
      ));
    }

    return DailyReport(
      range: DateRange(from: range.from, to: range.to),
      timezone: context.timezone,
      currency: context.currency,
      points: points,
    );
  }

  /// All twelve months of [year], zero-filled like the server.
  Future<MonthlyReport> monthly({required int year, String? timezone}) async {
    final context = await _context(timezone);

    final rows = _store.db.select(
      "SELECT substr(transaction_date, 1, 7) AS month, type, SUM(amount_minor) AS total "
      'FROM transactions WHERE transaction_date >= ? AND transaction_date <= ? '
      'GROUP BY month, type',
      ['$year-01-01', '$year-12-31'],
    );
    final byMonth = <String, Map<String, BigInt>>{};
    for (final row in rows) {
      final month = row['month']! as String;
      final bucket = byMonth.putIfAbsent(month, () => {});
      bucket[row['type']! as String] = BigInt.from((row['total']! as num).toInt());
    }

    final points = <MonthlyPoint>[];
    for (var month = 1; month <= 12; month += 1) {
      final key = '$year-${month.toString().padLeft(2, '0')}';
      final bucket = byMonth[key] ?? const <String, BigInt>{};
      final income = bucket['INCOME'] ?? BigInt.zero;
      final expense = bucket['EXPENSE'] ?? BigInt.zero;
      points.add(MonthlyPoint(
        month: key,
        year: year,
        income: fromMinorUnits(income),
        expense: fromMinorUnits(expense),
        balance: fromMinorUnits(income - expense),
      ));
    }

    return MonthlyReport(
      year: year,
      timezone: context.timezone,
      currency: context.currency,
      points: points,
    );
  }

  /// Category breakdown for one type over the preset window. Sorted by total
  /// descending with a stable tie-break; missing categories read
  /// "Deleted category" exactly like the server.
  Future<CategoryReport> categories({
    required DateRangePreset preset,
    required TransactionType type,
    String? timezone,
    String? from,
    String? to,
  }) async {
    final context = await _context(timezone);
    final range = boundedRange(preset: preset.wire, from: from, to: to, today: context.today);

    final rows = _store.db.select(
      'SELECT t.category_id AS category_id, SUM(t.amount_minor) AS total, '
      'c.name AS name, c.color AS color '
      'FROM transactions t LEFT JOIN categories c ON c.id = t.category_id '
      'WHERE t.type = ? AND t.transaction_date >= ? AND t.transaction_date <= ? '
      'GROUP BY t.category_id',
      [type.wire, range.from, range.to],
    );

    // Totals desc with a stable tie-break: JS Array.prototype.sort is stable,
    // Dart's List.sort is not.
    final totals = <BigInt>[
      for (final row in rows) BigInt.from((row['total']! as num).toInt()),
    ];
    final order = [for (var i = 0; i < rows.length; i++) i];
    order.sort((a, b) {
      final cmp = totals[b].compareTo(totals[a]);
      return cmp != 0 ? cmp : a - b;
    });

    var total = BigInt.zero;
    for (final value in totals) {
      total += value;
    }

    final points = <CategoryBreakdownPoint>[
      for (final i in order)
        CategoryBreakdownPoint(
          categoryId: rows[i]['category_id']! as String,
          categoryName: (rows[i]['name'] as String?) ?? 'Deleted category',
          color: rows[i]['color'] as String?,
          total: fromMinorUnits(totals[i]),
          percentage: _percentageOf(totals[i], total),
        ),
    ];

    return CategoryReport(
      range: DateRange(from: range.from, to: range.to),
      timezone: context.timezone,
      currency: context.currency,
      type: type.wire,
      points: points,
    );
  }

  // --- internals ------------------------------------------------------------

  Future<({String today, String timezone, String currency})> _context(String? timezone) async {
    await Timezones.ensureReady();
    final profile = _store.getUser();
    final tzName = timezone ?? profile?.timezone ?? 'UTC';
    return (
      today: Timezones.todayIn(tzName),
      timezone: tzName,
      currency: profile?.defaultCurrency ?? 'BDT',
    );
  }

  Map<String, BigInt> _sumsByType(({String from, String to}) range) {
    final rows = _store.db.select(
      'SELECT type, SUM(amount_minor) AS total FROM transactions '
      'WHERE transaction_date >= ? AND transaction_date <= ? GROUP BY type',
      [range.from, range.to],
    );
    return {
      for (final row in rows)
        row['type']! as String: BigInt.from((row['total']! as num).toInt()),
    };
  }
}

/// `(part / whole) * 100` with two decimals, truncating like JS BigInt
/// division (Dart's `~/` on BigInt also truncates toward zero).
String _percentageOf(BigInt part, BigInt whole) {
  if (whole == BigInt.zero) return '0.00';
  return fromMinorUnits((part * BigInt.from(10000)) ~/ whole);
}
