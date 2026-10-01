import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/token_store.dart';
import 'api_error.dart';
import 'api_routes.dart';

typedef JsonDecoder<T> = T Function(Object? json);

/// Query string builder: empty values are dropped so filters stay tidy.
String queryString(Map<String, Object?> params) {
  final entries = <String, String>{};
  params.forEach((key, value) {
    if (value == null) return;
    if (value is String && value.isEmpty) return;
    entries[key] = value.toString();
  });
  if (entries.isEmpty) return '';
  return '?${Uri(queryParameters: entries).query}';
}

/// Single entry point for talking to the API. Understands the shared
/// `{ ok, data }` / `{ ok, error }` envelope and throws [ApiError] on failure.
abstract class ApiClient {
  Future<T> request<T>(
    String path, {
    String method = 'GET',
    Map<String, Object?>? query,
    Object? body,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  });

  Future<T> get<T>(
    String path, {
    Map<String, Object?>? query,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  }) =>
      request<T>(path,
          query: query,
          authenticated: authenticated,
          allowRefresh: allowRefresh,
          decode: decode);

  Future<T> post<T>(
    String path, {
    Map<String, Object?>? query,
    Object? body,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  }) =>
      request<T>(path,
          method: 'POST',
          query: query,
          body: body,
          authenticated: authenticated,
          allowRefresh: allowRefresh,
          decode: decode);

  Future<T> patch<T>(
    String path, {
    Map<String, Object?>? query,
    Object? body,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  }) =>
      request<T>(path,
          method: 'PATCH',
          query: query,
          body: body,
          authenticated: authenticated,
          allowRefresh: allowRefresh,
          decode: decode);

  Future<T> delete<T>(
    String path, {
    Map<String, Object?>? query,
    Object? body,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  }) =>
      request<T>(path,
          method: 'DELETE',
          query: query,
          body: body,
          authenticated: authenticated,
          allowRefresh: allowRefresh,
          decode: decode);
}

/// Registered by the auth layer: called when the session is gone for good so
/// the UI can drop back to the login screen exactly once.
typedef SessionExpiredHandler = void Function();

/// HTTP implementation.
///
/// Two things happen here that every call site benefits from:
///  * the bearer access token is attached automatically;
///  * a 401 on an authenticated path triggers exactly one silent refresh +
///    replay, so an expired 15-minute token never surfaces to the user.
class HttpApiClient extends ApiClient {
  HttpApiClient({
    required this.tokenStore,
    this.baseUrl = AppConfig.apiBaseUrl,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
  }) : _client = client ?? http.Client();

  final TokenStore tokenStore;
  final String baseUrl;
  final Duration timeout;
  final http.Client _client;

  SessionExpiredHandler? onSessionExpired;

  Future<bool>? _refreshInFlight;

  /// Access-token failures worth retrying after a refresh.
  static const Set<String> _authFailureCodes = {
    ApiErrorCodes.unauthorized,
    ApiErrorCodes.refreshInvalid,
  };

  @override
  Future<T> request<T>(
    String path, {
    String method = 'GET',
    Map<String, Object?>? query,
    Object? body,
    bool authenticated = true,
    bool allowRefresh = true,
    required JsonDecoder<T> decode,
  }) async {
    final canRefresh = authenticated && allowRefresh;

    for (var attempt = 0; ; attempt++) {
      final envelope = await _send(
        path: path,
        method: method,
        query: query,
        body: body,
        authenticated: authenticated,
      );

      if (envelope.error == null) return decode(envelope.data);

      final error = envelope.error!;
      final retryable = canRefresh &&
          attempt == 0 &&
          _authFailureCodes.contains(error.code);

      if (!retryable) throw error;

      if (await _refreshSession()) continue;

      // Refresh failed: `_refreshSession` has already cleared the session and
      // notified the auth layer when that was terminal.
      throw error;
    }
  }

  Future<_Envelope> _send({
    required String path,
    required String method,
    required Map<String, Object?>? query,
    required Object? body,
    required bool authenticated,
  }) async {
    final uri = Uri.parse('$baseUrl$path${query == null ? '' : queryString(query)}');

    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
    };
    if (authenticated) {
      final token = tokenStore.accessToken;
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }

    http.Response response;
    try {
      response = await _dispatch(method, uri, headers, body).timeout(timeout);
    } on TimeoutException {
      throw const ApiError(ApiErrorCodes.network, 'The server took too long to respond.');
    } on IOException {
      throw const ApiError(ApiErrorCodes.network, 'Cannot reach the server. Check your connection.');
    } on http.ClientException {
      throw const ApiError(ApiErrorCodes.network, 'Cannot reach the server. Check your connection.');
    }

    return _envelope(response);
  }

  Future<http.Response> _dispatch(
    String method,
    Uri uri,
    Map<String, String> headers,
    Object? body,
  ) {
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'POST':
        return _client.post(uri, headers: headers, body: encoded);
      case 'PATCH':
        return _client.patch(uri, headers: headers, body: encoded);
      case 'DELETE':
        return _client.delete(uri, headers: headers, body: encoded);
      default:
        return _client.get(uri, headers: headers);
    }
  }

  Future<_Envelope> _envelope(http.Response response) async {
    final status = response.statusCode;
    final raw = response.body;

    Object? decoded;
    if (raw.isNotEmpty) {
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        throw ApiError(
          ApiErrorCodes.internalError,
          'Unexpected non-JSON response ($status).',
        );
      }
    }

    if (decoded == null) {
      if (status >= 400) {
        throw ApiError(ApiErrorCodes.internalError, 'Request failed ($status).');
      }
      return _Envelope.empty();
    }

    if (decoded is! Map<String, dynamic>) {
      throw ApiError(ApiErrorCodes.internalError, 'Unexpected response shape ($status).');
    }

    final map = decoded;
    if (map['ok'] == true) return _Envelope.success(map['data']);

    final error = map['error'];
    if (error is Map<String, dynamic>) {
      final details = ((error['details'] as List<Object?>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map((d) => FieldError(
                path: (d['path'] ?? '').toString(),
                message: (d['message'] ?? '').toString(),
              ))
          .toList();
      return _Envelope.failure(ApiError(
        (error['code'] ?? ApiErrorCodes.internalError).toString(),
        (error['message'] ?? 'Request failed.').toString(),
        details,
      ));
    }

    throw ApiError(ApiErrorCodes.internalError, 'Unexpected response shape ($status).');
  }

  /// Rotates the refresh token. Concurrent 401s share a single in-flight call.
  Future<bool> _refreshSession() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    final future = _doRefresh().whenComplete(() => _refreshInFlight = null);
    _refreshInFlight = future;
    return future;
  }

  Future<bool> _doRefresh() async {
    final refreshToken = tokenStore.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      final envelope = await _send(
        path: ApiRoutes.refresh,
        method: 'POST',
        query: null,
        body: {'refreshToken': refreshToken},
        authenticated: false,
      );
      if (envelope.error != null) {
        final error = envelope.error!;
        if (!error.isNetwork) await _terminateSession();
        return false;
      }

      final session = envelope.data! as Map<String, dynamic>;
      await tokenStore.saveSession(
        accessToken: session['accessToken']! as String,
        refreshToken: session['refreshToken']! as String,
      );
      return true;
    } on ApiError catch (error) {
      if (!error.isNetwork) await _terminateSession();
      return false;
    }
  }

  Future<void> _terminateSession() async {
    await tokenStore.clear();
    onSessionExpired?.call();
  }

  void close() => _client.close();
}

class _Envelope {
  const _Envelope.success(this.data) : error = null;

  const _Envelope.failure(this.error) : data = null;

  const _Envelope.empty()
      : data = null,
        error = null;

  final Object? data;
  final ApiError? error;
}
