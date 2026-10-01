import '../../shared/models/category.dart';
import '../../shared/models/common.dart';
import '../../shared/models/report.dart';
import '../../shared/models/transaction.dart';
import '../../shared/models/user.dart';
import 'api_client.dart';
import 'api_routes.dart';

/// Thin repositories over [ApiClient]: each owns one REST resource and the
/// wire-to-model decoding for it.
class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  Future<AuthSession> login({required String email, required String password}) => _api.post(
        ApiRoutes.login,
        body: {'email': email.trim().toLowerCase(), 'password': password},
        authenticated: false,
        allowRefresh: false,
        decode: AuthSession.fromJson,
      );

  Future<AuthSession> register({
    required String name,
    required String email,
    required String password,
  }) =>
      _api.post(
        ApiRoutes.register,
        body: {
          'name': name.trim(),
          'email': email.trim().toLowerCase(),
          'password': password,
        },
        authenticated: false,
        allowRefresh: false,
        decode: AuthSession.fromJson,
      );

  /// Mobile transport: the refresh token travels in the body, not a cookie.
  Future<AuthSession> refresh(String refreshToken) => _api.post(
        ApiRoutes.refresh,
        body: {'refreshToken': refreshToken},
        authenticated: false,
        allowRefresh: false,
        decode: AuthSession.fromJson,
      );

  Future<void> logout(String? refreshToken) => _api.post<void>(
        ApiRoutes.logout,
        body: {if (refreshToken != null && refreshToken.isNotEmpty) 'refreshToken': refreshToken},
        authenticated: false,
        allowRefresh: false,
        decode: (_) {},
      );

  Future<UserProfile> me() => _api.get(ApiRoutes.me, decode: UserProfile.fromJson);
}

class TransactionsRepository {
  TransactionsRepository(this._api);

  final ApiClient _api;

  Future<Paginated<Transaction>> list(TransactionQuery query) => _api.get(
        ApiRoutes.transactions,
        query: query.toQuery(),
        decode: (json) => Paginated.fromJson(json, Transaction.fromJson),
      );

  Future<Transaction> get(String id) =>
      _api.get(ApiRoutes.transaction(id), decode: Transaction.fromJson);

  Future<Transaction> create(TransactionInput input) => _api.post(
        ApiRoutes.transactions,
        body: input.toJson(),
        decode: Transaction.fromJson,
      );

  Future<Transaction> update(String id, TransactionInput input) {
    final body = <String, Object?>{...input.toJson()}..remove('clientId');
    return _api.patch(ApiRoutes.transaction(id), body: body, decode: Transaction.fromJson);
  }

  Future<Transaction> delete(String id) =>
      _api.delete(ApiRoutes.transaction(id), decode: Transaction.fromJson);
}

class CategoriesRepository {
  CategoriesRepository(this._api);

  final ApiClient _api;

  Future<List<Category>> list() => _api.get(
        ApiRoutes.categories,
        decode: (json) => (json! as List<Object?>).map(Category.fromJson).toList(),
      );

  Future<Category> create(CategoryInput input) => _api.post(
        ApiRoutes.categories,
        body: input.toJson(),
        decode: Category.fromJson,
      );

  Future<Category> update(String id, CategoryInput input) => _api.patch(
        ApiRoutes.category(id),
        body: input.toJson(),
        decode: Category.fromJson,
      );

  Future<Category> delete(String id) =>
      _api.delete(ApiRoutes.category(id), decode: Category.fromJson);
}

class ReportsRepository {
  ReportsRepository(this._api);

  final ApiClient _api;

  Future<SummaryResponse> summary({
    required DateRangePreset preset,
    String? timezone,
  }) =>
      _api.get(
        ApiRoutes.reportSummary,
        query: {'preset': preset.wire, 'timezone': timezone},
        decode: SummaryResponse.fromJson,
      );

  Future<DailyReport> daily({
    required DateRangePreset preset,
    int limit = 30,
    String? timezone,
  }) =>
      _api.get(
        ApiRoutes.reportDaily,
        query: {
          'preset': preset.wire,
          'limit': limit,
          'timezone': timezone,
        },
        decode: DailyReport.fromJson,
      );

  Future<MonthlyReport> monthly({required int year, String? timezone}) => _api.get(
        ApiRoutes.reportMonthly,
        query: {'year': year, 'timezone': timezone},
        decode: MonthlyReport.fromJson,
      );

  Future<CategoryReport> categories({
    required DateRangePreset preset,
    required TransactionType type,
    String? timezone,
  }) =>
      _api.get(
        ApiRoutes.reportCategories,
        query: {
          'preset': preset.wire,
          'type': type.wire,
          'timezone': timezone,
        },
        decode: CategoryReport.fromJson,
      );
}

class UsersRepository {
  UsersRepository(this._api);

  final ApiClient _api;

  Future<UserProfile> me() => _api.get(ApiRoutes.userMe, decode: UserProfile.fromJson);

  Future<UserProfile> update({
    String? name,
    String? defaultCurrency,
    String? timezone,
  }) =>
      _api.patch(
        ApiRoutes.userMe,
        body: {
          if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
          if (defaultCurrency != null && defaultCurrency.isNotEmpty)
            'defaultCurrency': defaultCurrency.toUpperCase(),
          if (timezone != null && timezone.isNotEmpty) 'timezone': timezone,
        },
        decode: UserProfile.fromJson,
      );
}

/// Bundle handed to every screen through [AppScope].
class Services {
  const Services({
    required this.auth,
    required this.transactions,
    required this.categories,
    required this.reports,
    required this.users,
  });

  factory Services.fromApiClient(ApiClient api) => Services(
        auth: AuthRepository(api),
        transactions: TransactionsRepository(api),
        categories: CategoriesRepository(api),
        reports: ReportsRepository(api),
        users: UsersRepository(api),
      );

  final AuthRepository auth;
  final TransactionsRepository transactions;
  final CategoriesRepository categories;
  final ReportsRepository reports;
  final UsersRepository users;
}
