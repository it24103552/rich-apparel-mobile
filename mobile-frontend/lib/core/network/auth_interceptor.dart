import 'dart:async';

import 'package:dio/dio.dart';

import '../constants/api_endpoints.dart';
import '../storage/token_storage.dart';

/// Dio interceptor that:
/// 1. Attaches `Authorization: Bearer <accessToken>` to authenticated requests.
/// 2. Automatically refreshes tokens ONLY when the backend responds with
///    HTTP 401 AND `errorCode == "TOKEN_EXPIRED"`.
/// 3. Uses a single-flight lock so concurrent expired requests share one
///    refresh call instead of racing.
/// 4. Retries the original request at most once.
/// 5. Clears tokens and notifies [onSessionExpired] when refresh fails.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this._tokenStorage,
    required this._refreshDio,
    required this._retryDio,
    this.onSessionExpired,
  });

  static const String skipAuthExtraKey = 'skipAuth';
  static const String retriedExtraKey = 'retried';

  final TokenStorage _tokenStorage;
  final Dio _refreshDio;
  final Dio _retryDio;
  final VoidCallback? onSessionExpired;

  Completer<String?>? _refreshCompleter;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final skipAuth = options.extra[skipAuthExtraKey] == true;
    if (!skipAuth) {
      final accessToken = await _tokenStorage.getAccessToken();
      if (accessToken != null && accessToken.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $accessToken';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (!_shouldAttemptRefresh(err)) {
      handler.next(err);
      return;
    }

    final newAccessToken = await _refreshAccessToken();
    if (newAccessToken == null || newAccessToken.isEmpty) {
      handler.next(err);
      return;
    }

    try {
      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer $newAccessToken';
      retryOptions.extra[retriedExtraKey] = true;

      final response = await _retryDio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  bool _shouldAttemptRefresh(DioException err) {
    final statusCode = err.response?.statusCode;
    if (statusCode != 401) {
      return false;
    }

    final requestOptions = err.requestOptions;
    if (requestOptions.extra[retriedExtraKey] == true) {
      return false;
    }
    if (requestOptions.extra[skipAuthExtraKey] == true) {
      return false;
    }

    final path = requestOptions.path;
    if (path == ApiEndpoints.authRefresh ||
        path == ApiEndpoints.authLogin ||
        path == ApiEndpoints.authRegister) {
      return false;
    }

    final errorCode = _extractErrorCode(err.response?.data);
    // Strictly refresh ONLY for TOKEN_EXPIRED. Do NOT refresh for
    // AUTH_REQUIRED, INVALID_AUTH_HEADER, INVALID_TOKEN, ACCOUNT_INACTIVE,
    // or INVALID_CREDENTIALS.
    return errorCode == ApiErrorCodes.tokenExpired;
  }

  String? _extractErrorCode(dynamic responseData) {
    if (responseData is Map) {
      return responseData['errorCode']?.toString().trim();
    }
    return null;
  }

  Future<String?> _refreshAccessToken() async {
    final existingCompleter = _refreshCompleter;
    if (existingCompleter != null) {
      return existingCompleter.future;
    }

    final completer = Completer<String?>();
    _refreshCompleter = completer;

    try {
      final refreshToken = await _tokenStorage.getRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        await _handleRefreshFailure();
        completer.complete(null);
        return null;
      }

      final response = await _refreshDio.post<dynamic>(
        ApiEndpoints.authRefresh,
        data: {'refreshToken': refreshToken},
        options: Options(
          extra: const {skipAuthExtraKey: true},
        ),
      );

      final body = response.data;
      if (body is! Map || body['data'] is! Map) {
        await _handleRefreshFailure();
        completer.complete(null);
        return null;
      }

      final data = Map<String, dynamic>.from(body['data'] as Map);
      final newAccessToken = data['token']?.toString() ?? '';
      final newRefreshToken = data['refreshToken']?.toString() ?? '';

      if (newAccessToken.isEmpty || newRefreshToken.isEmpty) {
        await _handleRefreshFailure();
        completer.complete(null);
        return null;
      }

      await _tokenStorage.saveTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      );

      completer.complete(newAccessToken);
      return newAccessToken;
    } catch (_) {
      await _handleRefreshFailure();
      completer.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }

  Future<void> _handleRefreshFailure() async {
    await _tokenStorage.clearTokens();
    onSessionExpired?.call();
  }
}

typedef VoidCallback = void Function();
