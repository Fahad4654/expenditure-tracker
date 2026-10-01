import 'common.dart';

class DateRange {
  const DateRange({required this.from, required this.to});

  final IsoDate from;
  final IsoDate to;

  factory DateRange.fromJson(Map<String, dynamic> json) =>
      DateRange(from: json['from']! as String, to: json['to']! as String);
}

/// `GET /reports/summary`.
class SummaryResponse {
  const SummaryResponse({
    required this.range,
    required this.timezone,
    required this.currency,
    required this.totalIncome,
    required this.totalExpense,
    required this.balance,
  });

  final DateRange range;
  final Timezone timezone;
  final CurrencyCode currency;
  final DecimalString totalIncome;
  final DecimalString totalExpense;
  final DecimalString balance;

  factory SummaryResponse.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return SummaryResponse(
      range: DateRange.fromJson(map['range']! as Map<String, dynamic>),
      timezone: map['timezone']! as String,
      currency: map['currency']! as String,
      totalIncome: map['totalIncome']! as String,
      totalExpense: map['totalExpense']! as String,
      balance: map['balance']! as String,
    );
  }
}

class DailyPoint {
  const DailyPoint({
    required this.date,
    required this.income,
    required this.expense,
  });

  final IsoDate date;
  final DecimalString income;
  final DecimalString expense;

  factory DailyPoint.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return DailyPoint(
      date: map['date']! as String,
      income: map['income']! as String,
      expense: map['expense']! as String,
    );
  }
}

/// `GET /reports/daily` — per-day income/expense series.
class DailyReport {
  const DailyReport({
    required this.range,
    required this.timezone,
    required this.currency,
    required this.points,
  });

  final DateRange range;
  final Timezone timezone;
  final CurrencyCode currency;
  final List<DailyPoint> points;

  factory DailyReport.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return DailyReport(
      range: DateRange.fromJson(map['range']! as Map<String, dynamic>),
      timezone: map['timezone']! as String,
      currency: map['currency']! as String,
      points: ((map['points'] as List<Object?>?) ?? const [])
          .map(DailyPoint.fromJson)
          .toList(),
    );
  }
}

class MonthlyPoint {
  const MonthlyPoint({
    required this.month,
    required this.year,
    required this.income,
    required this.expense,
    required this.balance,
  });

  /// `YYYY-MM`.
  final String month;
  final int year;
  final DecimalString income;
  final DecimalString expense;
  final DecimalString balance;

  factory MonthlyPoint.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return MonthlyPoint(
      month: map['month']! as String,
      year: (map['year']! as num).toInt(),
      income: map['income']! as String,
      expense: map['expense']! as String,
      balance: map['balance']! as String,
    );
  }
}

/// `GET /reports/monthly` — one year of income/expense/balance points.
class MonthlyReport {
  const MonthlyReport({
    required this.year,
    required this.timezone,
    required this.currency,
    required this.points,
  });

  final int year;
  final Timezone timezone;
  final CurrencyCode currency;
  final List<MonthlyPoint> points;

  factory MonthlyReport.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return MonthlyReport(
      year: (map['year']! as num).toInt(),
      timezone: map['timezone']! as String,
      currency: map['currency']! as String,
      points: ((map['points'] as List<Object?>?) ?? const [])
          .map(MonthlyPoint.fromJson)
          .toList(),
    );
  }
}

class CategoryBreakdownPoint {
  const CategoryBreakdownPoint({
    required this.categoryId,
    required this.categoryName,
    required this.color,
    required this.total,
    required this.percentage,
  });

  final String categoryId;
  final String categoryName;
  final String? color;
  final DecimalString total;

  /// 0–100 with 2 fraction digits.
  final DecimalString percentage;

  factory CategoryBreakdownPoint.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return CategoryBreakdownPoint(
      categoryId: map['categoryId']! as String,
      categoryName: map['categoryName']! as String,
      color: map['color'] as String?,
      total: map['total']! as String,
      percentage: map['percentage']! as String,
    );
  }
}

/// `GET /reports/categories` — category-wise breakdown with percentages.
class CategoryReport {
  const CategoryReport({
    required this.range,
    required this.timezone,
    required this.currency,
    required this.type,
    required this.points,
  });

  final DateRange range;
  final Timezone timezone;
  final CurrencyCode currency;
  final String type;
  final List<CategoryBreakdownPoint> points;

  factory CategoryReport.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return CategoryReport(
      range: DateRange.fromJson(map['range']! as Map<String, dynamic>),
      timezone: map['timezone']! as String,
      currency: map['currency']! as String,
      type: map['type']! as String,
      points: ((map['points'] as List<Object?>?) ?? const [])
          .map(CategoryBreakdownPoint.fromJson)
          .toList(),
    );
  }
}
