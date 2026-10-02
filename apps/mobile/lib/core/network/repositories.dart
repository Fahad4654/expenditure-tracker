import '../../shared/models/category.dart';
import '../../shared/models/otp_challenge.dart';
import '../../shared/models/common.dart';
import '../../shared/models/report.dart';
import '../../shared/models/transaction.dart';
import '../../shared/models/user.dart';
import '../db/local_reports.dart';
import '../db/local_store.dart';
import '../sync/sync_engine.dart';
import 'api_client.dart';
import 'api_error.dart';
import 'api_routes.dart';

/// Auth + session persistence. Network for identity, [LocalStore] for the
/// offline snapshot: every session entry point adopts the profile locally,
/// and `seedFromServer` bootstraps an empty store after (re)connect.
class AuthRepository {
  AuthRepository(this._api, this._store);

  final ApiClient _api;
  final LocalStore _store;

  /// Profile from the last successful session — what an offline cold start
  /// restores from.
  UserProfile? get cachedUser => _store.getUser();

  Future<AuthSession> login({required String email, required String password}) async {
    final session = await _api.post(
      ApiRoutes.login,
      body: {'email': email.trim().toLowerCase(), 'password': password},
      authenticated: false,
      allowRefresh: false,
      decode: AuthSession.fromJson,
    );
    _adopt(session.user);
    return session;
  }

  Future<AuthSession> register({
    required String name,
    required String email,
    required String password,
    required String code,
  }) async {
    final session = await _api.post(
      ApiRoutes.register,
      body: {
        'name': name.trim(),
        'email': email.trim().toLowerCase(),
        'password': password,
        'code': code,
      },
      authenticated: false,
      allowRefresh: false,
      decode: AuthSession.fromJson,
    );
    _adopt(session.user);
    return session;
  }

  /// Sends a 6-digit email OTP; `devCode` arrives while mail delivery is off.
  Future<EmailOtpChallenge> sendEmailOtp({
    required String email,
    required String purpose,
  }) {
    return _api.post(
      ApiRoutes.otpSend,
      body: {'email': email.trim().toLowerCase(), 'purpose': purpose},
      authenticated: false,
      allowRefresh: false,
      decode: EmailOtpChallenge.fromJson,
    );
  }

  /// Enumeration-safe: the server answers with the same challenge shape
  /// whether or not an account exists for this email.
  Future<EmailOtpChallenge> forgotPassword(String email) {
    return _api.post(
      ApiRoutes.forgotPassword,
      body: {'email': email.trim().toLowerCase()},
      authenticated: false,
      allowRefresh: false,
      decode: EmailOtpChallenge.fromJson,
    );
  }

  /// Consumes the reset OTP, stores the new password and starts a session
  /// (the server revokes every earlier refresh token first).
  Future<AuthSession> resetPassword({
    required String email,
    required String code,
    required String password,
  }) async {
    final session = await _api.post(
      ApiRoutes.resetPassword,
      body: {
        'email': email.trim().toLowerCase(),
        'code': code,
        'password': password,
      },
      authenticated: false,
      allowRefresh: false,
      decode: AuthSession.fromJson,
    );
    _adopt(session.user);
    return session;
  }

  /// Exchanges a Firebase Google ID token for a local session.
  Future<AuthSession> googleSignIn(String idToken) async {
    final session = await _api.post(
      ApiRoutes.google,
      body: {'idToken': idToken},
      authenticated: false,
      allowRefresh: false,
      decode: AuthSession.fromJson,
    );
    _adopt(session.user);
    return session;
  }

  /// Mobile transport: the refresh token travels in the body, not a cookie.
  Future<AuthSession> refresh(String refreshToken) async {
    final session = await _api.post(
      ApiRoutes.refresh,
      body: {'refreshToken': refreshToken},
      authenticated: false,
      allowRefresh: false,
      decode: AuthSession.fromJson,
    );
    _adopt(session.user);
    return session;
  }

  /// Signs out remotely (best effort) and always wipes local data.
  Future<void> logout(String? refreshToken) async {
    try {
      await _api.post<void>(
        ApiRoutes.logout,
        body: {if (refreshToken != null && refreshToken.isNotEmpty) 'refreshToken': refreshToken},
        authenticated: false,
        allowRefresh: false,
        decode: (_) {},
      );
    } finally {
      _store.clearAll();
    }
  }

  Future<UserProfile> me() async {
    try {
      final profile = await _api.get(ApiRoutes.me, decode: UserProfile.fromJson);
      _adopt(profile);
      return profile;
    } on ApiError catch (error) {
      if (error.isNetwork) {
        final cached = _store.getUser();
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  /// Clears data belonging to a *different* account before adopting a new
  /// profile, then snapshots it for offline reads.
  void _adopt(UserProfile user) {
    final existing = _store.getUser();
    if (existing != null && existing.id != user.id) {
      _store.clearAll();
    }
    _store.upsertUser(user);
  }

  /// Fills an empty store from the REST API after login/restore — the first
  /// paint before the sync engine runs. Every row upserts by the same keys
  /// the pull path uses, so re-seeding can only converge.
  Future<void> seedFromServer() async {
    try {
      final profile = await _api.get(ApiRoutes.me, decode: UserProfile.fromJson);
      _adopt(profile);

      if (_store.listCategories().isEmpty) {
        final raw = await _api.get(ApiRoutes.categories, decode: _rawList);
        for (final json in raw) {
          _store.applyServerCategoryUpsert(json);
        }
      }

      if (_store.listTransactions(TransactionQuery(page: 1, limit: 50)).meta.total == 0) {
        var page = 1;
        while (page <= 50) {
          final items = await _api.get(
            ApiRoutes.transactions,
            query: TransactionQuery(page: page, limit: 50).toQuery(),
            decode: _rawItems,
          );
          for (final json in items) {
            _store.applyServerTransactionUpsert(json);
          }
          if (items.length < 50) break;
          page += 1;
        }
      }
    } on ApiError {
      // Background bootstrap: offline or any API failure simply means the
      // next successful start (or the sync engine) fills the store instead.
    }
  }
}

/// Local-first transactions: reads are SQL over SQLite, writes land in the
/// store together with their queued sync operation.
class TransactionsRepository {
  TransactionsRepository(this._store, [this._requestSync]);

  final LocalStore _store;
  final void Function()? _requestSync;

  Future<Paginated<Transaction>> list(TransactionQuery query) async =>
      _store.listTransactions(query);

  Future<Transaction> get(String id) async => _require(_store.resolveClientId(id));

  Future<Transaction> create(TransactionInput input) async {
    final clientId = _store.createTransaction(
      userId: _store.getUser()?.id ?? 'local',
      input: input,
      currency: _store.getUser()?.defaultCurrency ?? 'BDT',
    );
    _requestSync?.call();
    return _require(clientId);
  }

  Future<Transaction> update(String id, TransactionInput input) async {
    final clientId = _store.resolveClientId(id);
    if (clientId == null) throw _notFound;
    _store.updateTransaction(clientId, input);
    _requestSync?.call();
    return _require(clientId);
  }

  Future<void> delete(String id) async {
    final clientId = _store.resolveClientId(id);
    if (clientId == null) throw _notFound;
    _store.deleteTransaction(clientId);
    _requestSync?.call();
  }

  Transaction _require(String? clientId) {
    final row = clientId == null ? null : _store.getTransaction(clientId);
    if (row == null) throw _notFound;
    return row;
  }

  static const _notFound = ApiError(ApiErrorCodes.notFound, 'Transaction not found');
}

class CategoriesRepository {
  CategoriesRepository(this._store, [this._requestSync]);

  final LocalStore _store;
  final void Function()? _requestSync;

  Future<List<Category>> list() async => _store.listCategories();

  Future<Category> create(CategoryInput input) async {
    final id = _store.createCategory(
      userId: _store.getUser()?.id ?? 'local',
      name: input.name,
      suggestedType: input.suggestedType,
      icon: input.icon,
      color: input.color,
    );
    _requestSync?.call();
    return _require(id);
  }

  Future<Category> update(String id, CategoryInput input) async {
    if (_store.getCategory(id) == null) throw _notFound;
    _store.updateCategory(
      id,
      name: input.name,
      suggestedType: input.suggestedType,
      icon: input.icon,
      color: input.color,
    );
    _requestSync?.call();
    return _require(id);
  }

  Future<void> delete(String id) async {
    if (_store.getCategory(id) == null) throw _notFound;
    _store.deleteCategory(id);
    _requestSync?.call();
  }

  Category _require(String id) {
    final row = _store.getCategory(id);
    if (row == null) throw _notFound;
    return row;
  }

  static const _notFound = ApiError(ApiErrorCodes.notFound, 'Category not found');
}

/// Report endpoints answered by local SQL — no network.
class ReportsRepository {
  ReportsRepository(this._local);

  final LocalReports _local;

  Future<SummaryResponse> summary({required DateRangePreset preset, String? timezone}) =>
      _local.summary(preset: preset, timezone: timezone);

  Future<DailyReport> daily({
    required DateRangePreset preset,
    int limit = 30,
    String? timezone,
  }) =>
      _local.daily(preset: preset, limit: limit, timezone: timezone);

  Future<MonthlyReport> monthly({required int year, String? timezone}) =>
      _local.monthly(year: year, timezone: timezone);

  Future<CategoryReport> categories({
    required DateRangePreset preset,
    required TransactionType type,
    String? timezone,
  }) =>
      _local.categories(preset: preset, type: type, timezone: timezone);
}

/// Profile reads/writes: network when reachable, snapshot fallback when not.
class UsersRepository {
  UsersRepository(this._api, this._store);

  final ApiClient _api;
  final LocalStore _store;

  Future<UserProfile> me() async {
    try {
      final profile = await _api.get(ApiRoutes.userMe, decode: UserProfile.fromJson);
      _store.upsertUser(profile);
      return profile;
    } on ApiError catch (error) {
      if (error.isNetwork) {
        final cached = _store.getUser();
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  Future<UserProfile> update({
    String? name,
    String? defaultCurrency,
    String? timezone,
  }) async {
    final profile = await _api.patch(
      ApiRoutes.userMe,
      body: {
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
        if (defaultCurrency != null && defaultCurrency.isNotEmpty)
          'defaultCurrency': defaultCurrency.toUpperCase(),
        if (timezone != null && timezone.isNotEmpty) 'timezone': timezone,
      },
      decode: UserProfile.fromJson,
    );
    _store.upsertUser(profile);
    return profile;
  }
}

/// Bundle handed to every screen through [AppScope].
///
/// Identity (`auth`, `users`) and reports stay network-aware; transactions and
/// categories are local-first over SQLite, with `sync.requestSync` nudged
/// after every write so the sync engine can push in the background.
class Services {
  Services({
    required ApiClient api,
    required LocalStore store,
    required this.sync,
  })  : auth = AuthRepository(api, store),
        transactions = TransactionsRepository(store, sync.requestSync),
        categories = CategoriesRepository(store, sync.requestSync),
        reports = ReportsRepository(LocalReports(store)),
        users = UsersRepository(api, store);

  final AuthRepository auth;
  final TransactionsRepository transactions;
  final CategoriesRepository categories;
  final ReportsRepository reports;
  final UsersRepository users;
  final SyncEngine sync;
}

List<Map<String, Object?>> _rawList(Object? json) =>
    (json! as List<Object?>).cast<Map<String, Object?>>();

List<Map<String, Object?>> _rawItems(Object? json) =>
    ((json! as Map<String, dynamic>)['items']! as List<Object?>)
        .cast<Map<String, Object?>>();
