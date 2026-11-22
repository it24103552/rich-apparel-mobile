import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Abstraction for secure persistence of JWT access and refresh tokens.
abstract class TokenStorage {
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  });

  Future<String?> getAccessToken();

  Future<String?> getRefreshToken();

  Future<void> clearTokens();

  Future<bool> hasTokens();
}

/// Secure token storage backed by `flutter_secure_storage` (Android Keystore,
/// iOS Keychain, etc.). Token values are never logged or stored in plain text.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const String accessTokenKey = 'rich_apparel_access_token';
  static const String refreshTokenKey = 'rich_apparel_refresh_token';

  final FlutterSecureStorage _storage;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(key: accessTokenKey, value: accessToken),
      _storage.write(key: refreshTokenKey, value: refreshToken),
    ]);
  }

  @override
  Future<String?> getAccessToken() async {
    final token = await _storage.read(key: accessTokenKey);
    if (token == null || token.isEmpty) {
      return null;
    }
    return token;
  }

  @override
  Future<String?> getRefreshToken() async {
    final token = await _storage.read(key: refreshTokenKey);
    if (token == null || token.isEmpty) {
      return null;
    }
    return token;
  }

  @override
  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: accessTokenKey),
      _storage.delete(key: refreshTokenKey),
    ]);
  }

  @override
  Future<bool> hasTokens() async {
    final results = await Future.wait([
      getAccessToken(),
      getRefreshToken(),
    ]);
    return results[0] != null && results[1] != null;
  }
}
