/// Stable machine-readable error codes. Clients switch on these, never on
/// human-readable messages (mirrors `API_ERROR_CODES` on the web client).
abstract final class ApiErrorCodes {
  static const String validationError = 'VALIDATION_ERROR';
  static const String unauthorized = 'UNAUTHORIZED';
  static const String forbidden = 'FORBIDDEN';
  static const String notFound = 'NOT_FOUND';
  static const String conflict = 'CONFLICT';
  static const String rateLimited = 'RATE_LIMITED';
  static const String invalidCredentials = 'INVALID_CREDENTIALS';
  static const String accountLocked = 'ACCOUNT_LOCKED';
  static const String refreshInvalid = 'REFRESH_TOKEN_INVALID';
  static const String csrfInvalid = 'CSRF_INVALID';
  static const String internalError = 'INTERNAL_ERROR';

  /// Client-side only: the request never reached the API (offline, DNS,
  /// timeout, non-JSON body).
  static const String network = 'NETWORK_ERROR';
}

class FieldError {
  const FieldError({required this.path, required this.message});

  final String path;
  final String message;
}

/// Thrown for every non-success response, including transport failures.
class ApiError implements Exception {
  const ApiError(this.code, this.message, [this.details = const []]);

  final String code;
  final String message;
  final List<FieldError> details;

  bool get isAuthFailure =>
      code == ApiErrorCodes.unauthorized || code == ApiErrorCodes.refreshInvalid;

  bool get isNetwork => code == ApiErrorCodes.network;

  bool get isConflict => code == ApiErrorCodes.conflict;

  /// Server-side validation message for a form field, if any.
  String? fieldMessage(String field) {
    for (final detail in details) {
      if (detail.path == field || detail.path.endsWith('.$field')) return detail.message;
    }
    return null;
  }

  @override
  String toString() => 'ApiError($code): $message';
}
