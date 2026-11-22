import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/core/config/app_config.dart';
import 'package:rich_apparel_mobile/core/config/app_environment.dart';
import 'package:rich_apparel_mobile/core/constants/api_endpoints.dart';
import 'package:rich_apparel_mobile/core/errors/api_error.dart';
import 'package:rich_apparel_mobile/core/errors/error_handler.dart';

void main() {
  group('ApiError parsing', () {
    test('parses structured backend validation error with field errors', () {
      final error = ApiError.fromResponse(
        {
          'success': false,
          'message': 'Phone number must be at least 10 characters',
          'errorCode': 'VALIDATION_ERROR',
          'errors': [
            {
              'path': 'phone',
              'message': 'Phone number must be at least 10 characters',
            },
            {
              'path': 'email',
              'message': 'Invalid email format',
            },
          ],
        },
        statusCode: 400,
      );

      expect(error.statusCode, 400);
      expect(error.errorCode, ApiErrorCodes.validationError);
      expect(error.isValidationError, isTrue);
      expect(error.isTokenExpired, isFalse);
      expect(error.errors.length, 2);
      expect(
        error.fieldError('phone'),
        'Phone number must be at least 10 characters',
      );
      expect(error.fieldError('email'), 'Invalid email format');
    });

    test('identifies TOKEN_EXPIRED only on HTTP 401 + TOKEN_EXPIRED', () {
      final expired = ApiError.fromResponse(
        {
          'success': false,
          'message': 'Token has expired. Please login again.',
          'errorCode': 'TOKEN_EXPIRED',
        },
        statusCode: 401,
      );
      expect(expired.isTokenExpired, isTrue);

      final invalidToken = ApiError.fromResponse(
        {
          'success': false,
          'message': 'Invalid token',
          'errorCode': 'INVALID_TOKEN',
        },
        statusCode: 401,
      );
      expect(invalidToken.isTokenExpired, isFalse);
    });

    test('masks internal 500 server messages and Prisma/DB internals', () {
      final serverError = ApiError.fromResponse(
        {
          'success': false,
          'message': 'PrismaClientKnownRequestError at /src/app.js',
          'errorCode': 'INTERNAL_SERVER_ERROR',
        },
        statusCode: 500,
      );

      expect(serverError.message, isNot(contains('Prisma')));
      expect(serverError.message, isNot(contains('/src/')));
      expect(serverError.errorCode, ApiErrorCodes.internalServerError);

      final leaked400 = ApiError.fromResponse(
        {
          'success': false,
          'message': 'MongoDB ECONNREFUSED at C:\\backend\\src\\db.js',
          'errorCode': 'BAD_REQUEST',
        },
        statusCode: 400,
      );
      expect(leaked400.message, isNot(contains('MongoDB')));
      expect(leaked400.message, isNot(contains('C:\\')));
    });

    test('converts DioException network and timeout errors safely', () {
      final requestOptions = RequestOptions(path: '/auth/login');

      final timeout = ApiErrorHandler.fromDioException(
        DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(timeout.errorCode, ApiErrorCodes.networkTimeout);

      final offline = ApiErrorHandler.fromDioException(
        DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.connectionError,
        ),
      );
      expect(offline.errorCode, ApiErrorCodes.networkError);
    });
  });

  group('AppConfig environment resolution', () {
    test('uses 10.0.2.2 for Android development emulator by default', () {
      final config = AppConfig.fromEnvironment(
        envOverride: 'development',
        apiBaseUrlOverride: '',
        platformOverride: TargetPlatform.android,
        isWebOverride: false,
      );

      expect(config.environment, AppEnvironment.development);
      expect(config.apiBaseUrl, 'http://10.0.2.2:5001/api/v1');
    });

    test('uses localhost for non-Android development by default', () {
      final config = AppConfig.fromEnvironment(
        envOverride: 'development',
        apiBaseUrlOverride: '',
        platformOverride: TargetPlatform.iOS,
        isWebOverride: false,
      );

      expect(config.apiBaseUrl, 'http://localhost:5001/api/v1');
    });

    test('uses explicit API_BASE_URL override and strips trailing slash', () {
      final config = AppConfig.fromEnvironment(
        envOverride: 'staging',
        apiBaseUrlOverride: 'https://staging.example.com/api/v1/',
        platformOverride: TargetPlatform.android,
        isWebOverride: false,
      );

      expect(config.environment, AppEnvironment.staging);
      expect(config.apiBaseUrl, 'https://staging.example.com/api/v1');
    });

    test('uses documented placeholder for staging/production when omitted', () {
      final staging = AppConfig.fromEnvironment(
        envOverride: 'staging',
        apiBaseUrlOverride: '',
      );
      final prod = AppConfig.fromEnvironment(
        envOverride: 'production',
        apiBaseUrlOverride: '',
      );

      expect(staging.apiBaseUrl, AppConfig.stagingUrlPlaceholder);
      expect(prod.apiBaseUrl, AppConfig.productionUrlPlaceholder);
    });
  });
}
