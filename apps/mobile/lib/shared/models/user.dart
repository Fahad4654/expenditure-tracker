import 'common.dart';

/// Identity providers a profile can be linked to.
enum AuthProvider {
  email('email'),
  phone('phone'),
  google('google');

  const AuthProvider(this.wire);

  final String wire;

  static AuthProvider parse(String value) =>
      AuthProvider.values.firstWhere((p) => p.wire == value, orElse: () => AuthProvider.email);
}

/// `GET /auth/me`, `GET /users/me` and the `user` field of every session.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.avatarUrl,
    required this.emailVerified,
    required this.phoneVerified,
    required this.providers,
    required this.defaultCurrency,
    required this.timezone,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final bool emailVerified;
  final bool phoneVerified;
  final List<AuthProvider> providers;
  final CurrencyCode defaultCurrency;
  final Timezone timezone;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;

  factory UserProfile.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return UserProfile(
      id: map['id']! as String,
      name: map['name']! as String,
      email: map['email'] as String?,
      phone: map['phone'] as String?,
      avatarUrl: map['avatarUrl'] as String?,
      emailVerified: map['emailVerified']! as bool,
      phoneVerified: map['phoneVerified']! as bool,
      providers: ((map['providers'] as List<Object?>?) ?? const [])
          .map((p) => AuthProvider.parse(p! as String))
          .toList(),
      defaultCurrency: map['defaultCurrency']! as String,
      timezone: map['timezone']! as String,
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
    );
  }

  UserProfile copyWith({String? name, CurrencyCode? defaultCurrency, Timezone? timezone}) =>
      UserProfile(
        id: id,
        name: name ?? this.name,
        email: email,
        phone: phone,
        avatarUrl: avatarUrl,
        emailVerified: emailVerified,
        phoneVerified: phoneVerified,
        providers: providers,
        defaultCurrency: defaultCurrency ?? this.defaultCurrency,
        timezone: timezone ?? this.timezone,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );

  /// Inverse of [fromJson] — used to persist the profile for offline reads.
  Map<String, Object?> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'avatarUrl': avatarUrl,
        'emailVerified': emailVerified,
        'phoneVerified': phoneVerified,
        'providers': providers.map((p) => p.wire).toList(),
        'defaultCurrency': defaultCurrency,
        'timezone': timezone,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

/// Payload of `POST /auth/{register,login,refresh}`.
///
/// The refresh token is carried in the body for mobile clients (web keeps it
/// in an HTTP-only cookie) and must be persisted by the caller.
class AuthSession {
  const AuthSession({
    required this.user,
    required this.accessToken,
    required this.expiresIn,
    required this.refreshToken,
  });

  final UserProfile user;
  final String accessToken;

  /// Seconds until `accessToken` expires.
  final int expiresIn;
  final String refreshToken;

  factory AuthSession.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return AuthSession(
      user: UserProfile.fromJson(map['user']),
      accessToken: map['accessToken']! as String,
      expiresIn: map['expiresIn']! as int,
      refreshToken: map['refreshToken']! as String,
    );
  }
}
