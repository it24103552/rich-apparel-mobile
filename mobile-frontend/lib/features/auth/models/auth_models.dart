import 'package:flutter/foundation.dart';

/// Safe user profile returned by `/auth/register`, `/auth/login`,
/// `/auth/refresh`, and `/auth/me`.
@immutable
class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.role,
    this.roleId,
    this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final String? phone;
  final String? role;
  final String? roleId;
  final DateTime? createdAt;

  factory User.fromJson(Map<String, dynamic> json) {
    final createdAtRaw = json['createdAt'];
    return User(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      phone: json['phone']?.toString(),
      role: json['role']?.toString(),
      roleId: json['roleId']?.toString(),
      createdAt: createdAtRaw is String ? DateTime.tryParse(createdAtRaw) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'role': role,
        'roleId': roleId,
        'createdAt': createdAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other is User &&
            other.id == id &&
            other.name == name &&
            other.email == email &&
            other.phone == phone &&
            other.role == role &&
            other.roleId == roleId &&
            other.createdAt == createdAt);
  }

  @override
  int get hashCode =>
      Object.hash(id, name, email, phone, role, roleId, createdAt);
}

/// Request body for `POST /api/v1/auth/login`.
@immutable
class LoginRequest {
  const LoginRequest({
    required this.email,
    required this.password,
  });

  final String email;
  final String password;

  Map<String, dynamic> toJson() => {
        'email': email.trim(),
        'password': password,
      };
}

/// Request body for `POST /api/v1/auth/register`.
@immutable
class RegisterRequest {
  const RegisterRequest({
    required this.name,
    required this.email,
    required this.phone,
    required this.password,
  });

  final String name;
  final String email;
  final String phone;
  final String password;

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'email': email.trim(),
        'phone': phone.trim(),
        'password': password,
      };
}

/// Token pair issued by `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh`.
@immutable
class TokenResponse {
  const TokenResponse({
    required this.token,
    required this.refreshToken,
    required this.expiresIn,
  });

  final String token;
  final String refreshToken;
  final String expiresIn;

  factory TokenResponse.fromJson(Map<String, dynamic> json) {
    return TokenResponse(
      token: json['token']?.toString() ?? '',
      refreshToken: json['refreshToken']?.toString() ?? '',
      expiresIn: json['expiresIn']?.toString() ?? '',
    );
  }
}

/// Response `data` payload for `POST /api/v1/auth/login` and
/// `POST /api/v1/auth/refresh`.
@immutable
class LoginResponse {
  const LoginResponse({
    required this.tokens,
    required this.user,
  });

  final TokenResponse tokens;
  final User user;

  String get token => tokens.token;
  String get refreshToken => tokens.refreshToken;
  String get expiresIn => tokens.expiresIn;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final userRaw = json['user'];
    if (userRaw is! Map) {
      throw const FormatException('Missing user object in auth response');
    }

    return LoginResponse(
      tokens: TokenResponse.fromJson(json),
      user: User.fromJson(Map<String, dynamic>.from(userRaw)),
    );
  }
}

/// Response payload for `POST /api/v1/auth/register`.
///
/// The backend intentionally does not issue JWT tokens on registration; users
/// proceed to login after registering.
@immutable
class RegisterResponse {
  const RegisterResponse({
    required this.message,
    required this.user,
  });

  final String message;
  final User user;
}
