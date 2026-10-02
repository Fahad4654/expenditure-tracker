import 'common.dart';

/// Challenge returned by `POST /auth/otp/send` and `POST /auth/forgot-password`.
///
/// The server answers with the same shape even for unknown emails (password
/// reset), so the challenge never confirms whether an account exists.
class EmailOtpChallenge {
  const EmailOtpChallenge({
    required this.email,
    required this.expiresAt,
    required this.resendAfterSeconds,
    this.devCode,
  });

  final String email;
  final IsoDateTime expiresAt;

  /// Seconds until the next resend is allowed.
  final int resendAfterSeconds;

  /// Six-digit code — only present outside production while `MAIL_SEND=false`.
  final String? devCode;

  factory EmailOtpChallenge.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return EmailOtpChallenge(
      email: map['email']! as String,
      expiresAt: map['expiresAt']! as String,
      resendAfterSeconds: (map['resendAfterSeconds']! as num).toInt(),
      devCode: map['devCode'] as String?,
    );
  }
}
