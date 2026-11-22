import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../constants/api_endpoints.dart';
import '../errors/api_error.dart';
import '../errors/error_handler.dart';
import '../storage/token_storage.dart';
import 'auth_interceptor.dart';

/// Centralized HTTP client for all communication with the Express `/api/v1` API.
class ApiClient {
  ApiClient({
    required AppConfig config,
    required TokenStorage tokenStorage,
    VoidCallback? onSessionExpired,
    HttpClientAdapter? httpClientAdapter,
  }) : _config = config {
    final baseOptions = BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: config.connectTimeout,
      receiveTimeout: config.receiveTimeout,
      sendTimeout: config.sendTimeout,
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      responseType: ResponseType.json,
    );

    _dio = Dio(baseOptions);
    _refreshDio = Dio(baseOptions);

    if (httpClientAdapter != null) {
      _dio.httpClientAdapter = httpClientAdapter;
      _refreshDio.httpClientAdapter = httpClientAdapter;
    }

    _dio.interceptors.add(
      AuthInterceptor(
        tokenStorage: tokenStorage,
        refreshDio: _refreshDio,
        retryDio: _dio,
        onSessionExpired: onSessionExpired,
      ),
    );
  }

  final AppConfig _config;
  late final Dio _dio;
  late final Dio _refreshDio;

  AppConfig get config => _config;
  Dio get dio => _dio;

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    bool skipAuth = false,
  }) async {
    return _send(
      () => _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
        options: _buildOptions(skipAuth: skipAuth),
      ),
    );
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    bool skipAuth = false,
  }) async {
    return _send(
      () => _dio.post<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _buildOptions(skipAuth: skipAuth),
      ),
    );
  }

  Future<Map<String, dynamic>> put(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    bool skipAuth = false,
  }) async {
    return _send(
      () => _dio.put<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _buildOptions(skipAuth: skipAuth),
      ),
    );
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    bool skipAuth = false,
  }) async {
    return _send(
      () => _dio.patch<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _buildOptions(skipAuth: skipAuth),
      ),
    );
  }

  Future<Map<String, dynamic>> delete(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    bool skipAuth = false,
  }) async {
    return _send(
      () => _dio.delete<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _buildOptions(skipAuth: skipAuth),
      ),
    );
  }

  Options _buildOptions({required bool skipAuth}) {
    return Options(
      extra: {
        AuthInterceptor.skipAuthExtraKey: skipAuth,
      },
    );
  }

  Future<Map<String, dynamic>> _send(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      final response = await request();
      final body = response.data;
      if (body is Map<String, dynamic>) {
        if (body['success'] == false) {
          throw ApiError.fromResponse(body, statusCode: response.statusCode);
        }
        return body;
      }
      if (body is Map) {
        final mapped = Map<String, dynamic>.from(body);
        if (mapped['success'] == false) {
          throw ApiError.fromResponse(mapped, statusCode: response.statusCode);
        }
        return mapped;
      }

      throw ApiError(
        message: 'Unexpected response format from server.',
        errorCode: ApiErrorCodes.invalidResponse,
        statusCode: response.statusCode,
      );
    } on ApiError {
      rethrow;
    } on DioException catch (e) {
      throw ApiErrorHandler.fromDioException(e);
    } catch (e) {
      throw ApiErrorHandler.fromObject(e);
    }
  }
}
