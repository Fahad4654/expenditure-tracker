/// Primitive aliases mirrored from `apps/web/src/shared/types/common.ts`.
///
/// Money is never a `double`. Amounts cross the wire as decimal strings
/// (e.g. `100.50`) and are parsed into integer minor units for arithmetic.
typedef DecimalString = String;

/// ISO-8601 UTC instant, e.g. `2026-10-01T12:00:00.000Z`.
typedef IsoDateTime = String;

/// Calendar date without time, `YYYY-MM-DD`, in the owner's timezone.
typedef IsoDate = String;

/// IANA timezone identifier, e.g. `Asia/Dhaka`.
typedef Timezone = String;

/// ISO-4217 currency code, e.g. `BDT`.
typedef CurrencyCode = String;

/// Client-generated UUID v4 used for idempotent writes.
typedef Uuid = String;

/// Predefined ranges the API understands. `custom` always ships with `from`/`to`.
enum DateRangePreset {
  today('today'),
  week('week'),
  month('month'),
  year('year'),
  custom('custom');

  const DateRangePreset(this.wire);

  final String wire;
}

/// Envelope wrapper for paginated list endpoints.
class Paginated<T> {
  const Paginated({required this.items, required this.meta});

  final List<T> items;
  final PageMeta meta;

  factory Paginated.fromJson(
    Object? json,
    T Function(Object? json) fromJson,
  ) {
    final map = json! as Map<String, dynamic>;
    final meta = map['meta']! as Map<String, dynamic>;
    return Paginated<T>(
      items: (map['items']! as List<Object?>).map(fromJson).toList(),
      meta: PageMeta.fromJson(meta),
    );
  }
}

class PageMeta {
  const PageMeta({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final int page;
  final int limit;
  final int total;
  final int totalPages;

  bool get hasNextPage => page < totalPages;

  factory PageMeta.fromJson(Map<String, dynamic> json) => PageMeta(
        page: json['page']! as int,
        limit: json['limit']! as int,
        total: json['total']! as int,
        totalPages: json['totalPages']! as int,
      );
}
