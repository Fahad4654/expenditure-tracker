import 'package:expenditure_tracker/core/network/api_client.dart';

class FakeRequest {
  const FakeRequest({
    required this.method,
    required this.path,
    this.query,
    this.body,
  });

  final String method;
  final String path;
  final Map<String, Object?>? query;
  final Object? body;
}

typedef FakeHandler = Object? Function(FakeRequest request);

/// In-memory [ApiClient]: tests register a handler per `METHOD /path` and the
/// fake records every request for assertions.
class FakeApiClient extends ApiClient {
  final Map<String, FakeHandler> handlers = {};
  final List<FakeRequest> log = [];

  void on(String method, String path, FakeHandler handler) {
    handlers['$method $path'] = handler;
  }

  void onGet(String path, FakeHandler handler) => on('GET', path, handler);
  void onPost(String path, FakeHandler handler) => on('POST', path, handler);
  void onPatch(String path, FakeHandler handler) => on('PATCH', path, handler);
  void onDelete(String path, FakeHandler handler) => on('DELETE', path, handler);

  List<FakeRequest> requestsWhere(bool Function(FakeRequest request) test) =>
      log.where(test).toList();

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
    final request = FakeRequest(
      method: method,
      path: path,
      query: query,
      body: body,
    );
    log.add(request);

    final handler = handlers['$method $path'];
    if (handler == null) {
      throw StateError('No fake handler registered for "$method $path"');
    }
    return decode(handler(request));
  }
}
