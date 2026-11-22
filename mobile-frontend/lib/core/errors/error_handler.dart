import 'package:dio/dio.dart';

import '../constants/api_endpoints.dart';
import 'api_error.dart';

/// Centralized conversion from Dio/network exceptions into safe [ApiError]s.
abstract final class ApiErrorHandler {
  static ApiError fromDioException(DioException error) {
    if (error.error is ApiError) {
      return error.error! as ApiError;
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiError(
          message: 'Connection timed out. Please try again.',
          errorCode: ApiErrorCodes.networkTimeout,
        );
      case DioExceptionType.connectionError:
        return const ApiError(
          message: 'Unable to connect to the server. Please check your internet connection.',
          errorCode: ApiErrorCodes.networkError,
        );
      case DioExceptionType.cancel:
        return const ApiError(
          message: 'Request was cancelled.',
          errorCode: ApiErrorCodes.requestCancelled,
        );
      case DioExceptionType.badCertificate:
        return const ApiError(
          message: 'Secure connection to the server could not be verified.',
          errorCode: ApiErrorCodes.networkError,
        );
      case DioExceptionType.badResponse:
        return ApiError.fromResponse(
          error.response?.data,
          statusCode: error.response?.statusCode,
        );
      case DioExceptionType.unknown:
        return const ApiError(
          message: 'Unable to reach the server. Please try again.',
          errorCode: ApiErrorCodes.networkError,
        );
    }
  }

  static ApiError fromObject(Object error) {
    if (error is ApiError) {
      return error;
    }
    if (error is DioException) {
      return fromDioException(error);
    }
    return const ApiError(
      message: 'An unexpected error occurred. Please try again.',
      errorCode: ApiErrorCodes.unknownError,
    );
  }
}
