import 'common.dart';

enum TransactionType {
  income('INCOME'),
  expense('EXPENSE');

  const TransactionType(this.wire);

  final String wire;

  static TransactionType parse(String value) => TransactionType.values
      .firstWhere((t) => t.wire == value, orElse: () => TransactionType.expense);
}

class Transaction {
  const Transaction({
    required this.id,
    required this.clientId,
    required this.deviceId,
    required this.userId,
    required this.type,
    required this.amount,
    required this.currency,
    required this.categoryId,
    required this.title,
    required this.description,
    required this.transactionDate,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
    required this.deletedAt,
    this.noteId,
    this.syncStatus = 'SYNCED',
  });

  final String id;
  final String clientId;

  /// Local-only sync state: `SYNCED`, `PENDING` or `FAILED`. Never sent over
  /// the wire — defaults to `SYNCED` for rows decoded from the API.
  final String syncStatus;
  final String? deviceId;
  final String userId;
  final TransactionType type;

  /// Decimal string, e.g. `250.00`.
  final DecimalString amount;
  final CurrencyCode currency;
  final String categoryId;
  final String title;
  final String? description;

  /// Calendar date in the owner's timezone: `YYYY-MM-DD`.
  final IsoDate transactionDate;

  /// Note this transaction is tagged on — the link lives on the transaction
  /// (one note per transaction), mirroring `Transaction.noteId` on the API.
  final String? noteId;

  final int version;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;
  final IsoDateTime? deletedAt;

  factory Transaction.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return Transaction(
      id: map['id']! as String,
      clientId: map['clientId']! as String,
      deviceId: map['deviceId'] as String?,
      userId: map['userId']! as String,
      type: TransactionType.parse(map['type']! as String),
      amount: map['amount']! as String,
      currency: map['currency']! as String,
      categoryId: map['categoryId']! as String,
      title: map['title']! as String,
      description: map['description'] as String?,
      transactionDate: map['transactionDate']! as String,
      noteId: map['noteId'] as String?,
      version: (map['version']! as num).toInt(),
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
      deletedAt: map['deletedAt'] as String?,
      syncStatus: map['syncStatus'] as String? ?? 'SYNCED',
    );
  }
}

/// Fields shared by `POST /transactions` and `PATCH /transactions/:id`.
class TransactionInput {
  const TransactionInput({
    required this.type,
    required this.amount,
    required this.categoryId,
    required this.title,
    required this.description,
    required this.transactionDate,
    this.noteId,
    this.clientId,
    this.baseVersion,
  });

  final TransactionType type;
  final DecimalString amount;
  final String categoryId;
  final String title;
  final String? description;
  final IsoDate transactionDate;

  /// Note to tag this transaction on. `null` clears an existing tag.
  final String? noteId;

  /// Client-generated UUID — makes create retries idempotent.
  final Uuid? clientId;

  /// Version observed by the client — enables optimistic concurrency.
  final int? baseVersion;

  Map<String, Object?> toJson() => {
        if (clientId != null) 'clientId': clientId,
        'type': type.wire,
        'amount': amount,
        'categoryId': categoryId,
        'title': title,
        'description': description,
        'transactionDate': transactionDate,
        'noteId': noteId,
        if (baseVersion != null) 'baseVersion': baseVersion,
      };
}

/// Query filters for `GET /transactions`. Empty values are dropped.
class TransactionQuery {
  const TransactionQuery({
    this.page = 1,
    this.limit = 20,
    this.search,
    this.type,
    this.categoryId,
    this.preset,
    this.from,
    this.to,
    this.sort = 'transactionDate',
    this.order = 'desc',
  });

  final int page;
  final int limit;
  final String? search;
  final TransactionType? type;
  final String? categoryId;
  final DateRangePreset? preset;
  final IsoDate? from;
  final IsoDate? to;
  final String sort;
  final String order;

  TransactionQuery copyWith({
    int? page,
    int? limit,
    String? search,
    TransactionType? type,
    String? categoryId,
    DateRangePreset? preset,
    String? sort,
    String? order,
  }) =>
      TransactionQuery(
        page: page ?? this.page,
        limit: limit ?? this.limit,
        search: search ?? this.search,
        type: type ?? this.type,
        categoryId: categoryId ?? this.categoryId,
        preset: preset ?? this.preset,
        from: from,
        to: to,
        sort: sort ?? this.sort,
        order: order ?? this.order,
      );

  Map<String, Object?> toQuery() => {
        'page': page,
        'limit': limit,
        if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
        if (type != null) 'type': type!.wire,
        if (categoryId != null) 'categoryId': categoryId,
        if (preset != null) 'preset': preset!.wire,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
        'sort': sort,
        'order': order,
      };
}
