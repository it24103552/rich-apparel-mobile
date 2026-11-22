import '../../../core/errors/api_error.dart';
import '../../../core/storage/token_storage.dart';
import '../models/auth_models.dart';
import 'auth_api_service.dart';

/// Coordinates authentication API calls with secure token persistence.
class AuthRepository {
  const AuthRepository({
    required this._apiService,
    required this._tokenStorage,
  });

  final AuthApiService _apiService;
  final TokenStorage _tokenStorage;

  /// Logs in, securely persists the returned access + refresh tokens, and
  /// verifies the active session against `GET /api/v1/auth/me`.
  Future<User> login(LoginRequest request) async {
    final loginResponse = await _apiService.login(request);

    await _tokenStorage.saveTokens(
      accessToken: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
    );

    try {
      return await _apiService.getCurrentUser();
    } catch (_) {
      await _tokenStorage.clearTokens();
      rethrow;
    }
  }

  /// Registers a new Customer account. Per the backend contract, registration
  /// does not return JWT tokens, so no tokens are persisted here.
  Future<RegisterResponse> register(RegisterRequest request) {
    return _apiService.register(request);
  }

  /// Validates any locally stored tokens against `GET /api/v1/auth/me`.
  /// Never assumes local token presence alone implies an authenticated session.
  Future<User?> restoreSession() async {
    final accessToken = await _tokenStorage.getAccessToken();
    final refreshToken = await _tokenStorage.getRefreshToken();

    if (accessToken == null && refreshToken == null) {
      return null;
    }

    try {
      if (accessToken == null && refreshToken != null) {
        final refreshed = await _apiService.refresh(refreshToken);
        await _tokenStorage.saveTokens(
          accessToken: refreshed.token,
          refreshToken: refreshed.refreshToken,
        );
      }

      // If accessToken is expired, AuthInterceptor handles 401 TOKEN_EXPIRED,
      // refreshes the tokens, and retries /auth/me once.
      return await _apiService.getCurrentUser();
    } on ApiError catch (error) {
      if (error.isUnauthorized) {
        await _tokenStorage.clearTokens();
        return null;
      }
      rethrow;
    }
  }

  Future<User> getCurrentUser() => _apiService.getCurrentUser();

  Future<LoginResponse> refreshSession() async {
    final refreshToken = await _tokenStorage.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      await _tokenStorage.clearTokens();
      throw const ApiError(
        message: 'Session expired. Please sign in again.',
        errorCode: 'REFRESH_TOKEN_MISSING',
        statusCode: 401,
      );
    }

    final refreshed = await _apiService.refresh(refreshToken);
    await _tokenStorage.saveTokens(
      accessToken: refreshed.token,
      refreshToken: refreshed.refreshToken,
    );
    return refreshed;
  }

  /// Calls `POST /api/v1/auth/logout` when a token is present and always clears
  /// locally stored tokens so the device is logged out reliably.
  Future<void> logout() async {
    try {
      final accessToken = await _tokenStorage.getAccessToken();
      if (accessToken != null && accessToken.isNotEmpty) {
        await _apiService.logout();
      }
    } catch (_) {
      // Local logout must succeed even if the server is unreachable or token expired.
    } finally {
      await _tokenStorage.clearTokens();
    }
  }
}
