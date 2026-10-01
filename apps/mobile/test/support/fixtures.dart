import 'fakes.dart';

const String userId = '11111111-1111-4111-8111-111111111111';
const String categoryId = '22222222-2222-4222-8222-222222222222';
const String transactionId = '33333333-3333-4333-8333-333333333333';

Map<String, Object?> userJson({
  String id = userId,
  String name = 'Fahad Rahman',
  String email = 'fahad@example.com',
}) =>
    {
      'id': id,
      'name': name,
      'email': email,
      'phone': null,
      'avatarUrl': null,
      'emailVerified': true,
      'phoneVerified': false,
      'providers': ['email'],
      'defaultCurrency': 'BDT',
      'timezone': 'Asia/Dhaka',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
    };

Map<String, Object?> sessionJson({String? refreshToken}) => {
      'user': userJson(),
      'accessToken': 'access-token',
      'expiresIn': 900,
      'refreshToken': refreshToken ?? 'refresh-token',
    };

Map<String, Object?> categoryJson({
  String id = categoryId,
  String name = 'Food',
  String color = '#F97316',
  String icon = 'utensils',
  String suggestedType = 'EXPENSE',
  String kind = 'SYSTEM',
  bool isSystem = true,
}) =>
    {
      'id': id,
      'userId': kind == 'USER' ? userId : null,
      'name': name,
      'kind': kind,
      'icon': icon,
      'color': color,
      'isSystem': isSystem,
      'suggestedType': suggestedType,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
    };

Map<String, Object?> transactionJson({
  String id = transactionId,
  String title = 'Lunch with Sam',
  String amount = '250.00',
  String type = 'EXPENSE',
  String categoryIdValue = categoryId,
  String date = '2026-10-01',
  String? description,
}) =>
    {
      'id': id,
      'clientId': '44444444-4444-4444-8444-444444444444',
      'deviceId': null,
      'userId': userId,
      'type': type,
      'amount': amount,
      'currency': 'BDT',
      'categoryId': categoryIdValue,
      'title': title,
      'description': description,
      'transactionDate': date,
      'version': 1,
      'createdAt': '2026-10-01T10:00:00.000Z',
      'updatedAt': '2026-10-01T10:00:00.000Z',
      'deletedAt': null,
    };

Map<String, Object?> paginatedJson(List<Map<String, Object?>> items, {int total = 1}) => {
      'items': items,
      'meta': {'page': 1, 'limit': 20, 'total': total, 'totalPages': 1},
    };

Map<String, Object?> summaryJson({
  String income = '0.00',
  String expense = '0.00',
  String balance = '0.00',
  String from = '2026-10-01',
  String to = '2026-10-01',
}) =>
    {
      'range': {'from': from, 'to': to},
      'timezone': 'Asia/Dhaka',
      'currency': 'BDT',
      'totalIncome': income,
      'totalExpense': expense,
      'balance': balance,
    };

Map<String, Object?> dailyJson({List<Map<String, Object?>> points = const []}) => {
      'range': {'from': '2026-09-02', 'to': '2026-10-01'},
      'timezone': 'Asia/Dhaka',
      'currency': 'BDT',
      'points': points,
    };

Map<String, Object?> monthlyJson({List<Map<String, Object?>> points = const []}) => {
      'year': 2026,
      'timezone': 'Asia/Dhaka',
      'currency': 'BDT',
      'points': points,
    };

Map<String, Object?> categoryReportJson({
  List<Map<String, Object?>> points = const [],
  String type = 'EXPENSE',
}) =>
    {
      'range': {'from': '2026-10-01', 'to': '2026-10-31'},
      'timezone': 'Asia/Dhaka',
      'currency': 'BDT',
      'type': type,
      'points': points,
    };

/// Registers a happy-path handler for every endpoint the UI can call.
/// Existing handlers (registered by a test) are never overwritten.
void registerDefaultHandlers(FakeApiClient api) {
  final defaults = <String, FakeHandler>{
    'POST /api/v1/auth/login': (_) => sessionJson(),
    'POST /api/v1/auth/register': (_) => sessionJson(),
    'POST /api/v1/auth/refresh': (_) => sessionJson(),
    'POST /api/v1/auth/logout': (_) => null,
    'GET /api/v1/auth/me': (_) => userJson(),
    'GET /api/v1/transactions': (_) => paginatedJson([]),
    'POST /api/v1/transactions': (_) => transactionJson(),
    'GET /api/v1/transactions/$transactionId': (_) => transactionJson(),
    'PATCH /api/v1/transactions/$transactionId': (_) => transactionJson(),
    'DELETE /api/v1/transactions/$transactionId': (_) => transactionJson(),
    'GET /api/v1/categories': (_) => [categoryJson()],
    'GET /api/v1/reports/summary': (_) => summaryJson(),
    'GET /api/v1/reports/daily': (_) => dailyJson(),
    'GET /api/v1/reports/monthly': (_) => monthlyJson(),
    'GET /api/v1/reports/categories': (_) => categoryReportJson(),
    'GET /api/v1/users/me': (_) => userJson(),
    'PATCH /api/v1/users/me': (_) => userJson(),
  };
  defaults.forEach((key, handler) {
    api.handlers.putIfAbsent(key, () => handler);
  });
}
