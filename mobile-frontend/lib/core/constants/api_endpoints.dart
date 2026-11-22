/// Existing Express `/api/v1` endpoint paths used in Phase 1.
abstract final class ApiEndpoints {
  static const String authLogin = '/auth/login';
  static const String authRegister = '/auth/register';
  static const String authRefresh = '/auth/refresh';
  static const String authMe = '/auth/me';
  static const String authLogout = '/auth/logout';
}

/// Standardized error codes returned by the Express backend.
abstract final class ApiErrorCodes {
  // Triggers automatic token refresh ONLY when HTTP 401 + TOKEN_EXPIRED.
  static const String tokenExpired = 'TOKEN_EXPIRED';

  // Auth errors that must NOT trigger automatic token refresh.
  static const String authRequired = 'AUTH_REQUIRED';
  static const String invalidAuthHeader = 'INVALID_AUTH_HEADER';
  static const String invalidToken = 'INVALID_TOKEN';
  static const String accountInactive = 'ACCOUNT_INACTIVE';
  static const String invalidCredentials = 'INVALID_CREDENTIALS';

  // Refresh endpoint errors.
  static const String refreshTokenExpired = 'REFRESH_TOKEN_EXPIRED';
  static const String invalidRefreshToken = 'INVALID_REFRESH_TOKEN';

  // General / validation errors.
  static const String validationError = 'VALIDATION_ERROR';
  static const String userAlreadyExists = 'USER_ALREADY_EXISTS';
  static const String rateLimitExceeded = 'RATE_LIMIT_EXCEEDED';
  static const String internalServerError = 'INTERNAL_SERVER_ERROR';

  // Client-side normalized error codes.
  static const String networkError = 'NETWORK_ERROR';
  static const String networkTimeout = 'NETWORK_TIMEOUT';
  static const String requestCancelled = 'REQUEST_CANCELLED';
  static const String invalidResponse = 'INVALID_RESPONSE';
  static const String unknownError = 'UNKNOWN_ERROR';
}
