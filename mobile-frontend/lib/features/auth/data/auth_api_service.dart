import '../../../core/constants/api_endpoints.dart';
import '../../../core/errors/api_error.dart';
import '../../../core/network/api_client.dart';
import '../models/auth_models.dart';

/// Low-level service mapping the existing `/api/v1/auth/*` endpoints to typed
/// Dart models.
class AuthApiService {
  const AuthApiService(this._apiClient);

  final ApiClient _apiClient;

  Future<LoginResponse> login(LoginRequest request) async {
    final json = await _apiClient.post(
      ApiEndpoints.authLogin,
      data: request.toJson(),
      skipAuth: true,
    );

    final data = _requireDataMap(json);
    return LoginResponse.fromJson(data);
  }

  Future<RegisterResponse> register(RegisterRequest request) async {
    final json = await _apiClient.post(
      ApiEndpoints.authRegister,
      data: request.toJson(),
      skipAuth: true,
    );

    final data = _requireDataMap(json);
    final message =
        json['message']?.toString() ?? 'User registered successfully';
    return RegisterResponse(
      message: message,
      user: User.fromJson(data),
    );
  }

  Future<LoginResponse> refresh(String refreshToken) async {
    final json = await _apiClient.post(
      ApiEndpoints.authRefresh,
      data: {'refreshToken': refreshToken},
      skipAuth: true,
    );

    final data = _requireDataMap(json);
    return LoginResponse.fromJson(data);
  }

  Future<User> getCurrentUser() async {
    final json = await _apiClient.get(ApiEndpoints.authMe);
    final data = _requireDataMap(json);
    return User.fromJson(data);
  }

  Future<void> logout() async {
    await _apiClient.post(ApiEndpoints.authLogout);
  }

  Map<String, dynamic> _requireDataMap(Map<String, dynamic> envelope) {
    final raw = envelope['data'];
    if (raw is Map<String, dynamic>) {
      return raw;
    }
    if (raw is Map) {
      return Map<String, dynamic>.from(raw);
    }
    throw const ApiError(
      message: 'Unexpected response payload from server.',
      errorCode: ApiErrorCodes.invalidResponse,
    );
  }
}
