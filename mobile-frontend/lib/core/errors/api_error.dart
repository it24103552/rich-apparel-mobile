import 'package:flutter/foundation.dart';

import '../constants/api_endpoints.dart';

/// Field-level validation error returned inside backend `errors` arrays.
@immutable
class ApiFieldError {
  const ApiFieldError({
    required this.path,
    required this.message,
  });

  final String path;
  final String message;

  factory ApiFieldError.fromJson(Map<String, dynamic> json) {
    return ApiFieldError(
      path: json['path']?.toString() ?? '',
      message: json['message']?.toString() ?? 'Invalid value',
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other is ApiFieldError &&
            other.path == path &&
            other.message == message);
  }

  @override
  int get hashCode => Object.hash(path, message);
}

/// Normalized application-level API error matching the backend contract:
/// ```json
/// {
///   "success": false,
///   "message": "...",
///   "errorCode": "...",
///   "errors": [{ "path": "...", "message": "..." }]
/// }
/// ```
@immutable
class ApiError implements Exception {
  const ApiError({
    required this.message,
    required this.errorCode,
    this.statusCode,
    this.errors = const [],
  });

  final String message;
  final String errorCode;
  final int? statusCode;
  final List<ApiFieldError> errors;

  bool get isTokenExpired =>
      statusCode == 401 && errorCode == ApiErrorCodes.tokenExpired;

  bool get isUnauthorized => statusCode == 401;

  bool get isValidationError => errorCode == ApiErrorCodes.validationError;

  String? fieldError(String fieldPath) {
    for (final error in errors) {
      if (error.path == fieldPath) {
        return error.message;
      }
    }
    return null;
  }

  /// Parses an error response body safely without exposing internal server
  /// details, stack traces, or Prisma/database messages.
  factory ApiError.fromResponse(dynamic data, {int? statusCode}) {
    final isServerError = statusCode != null && statusCode >= 500;

    if (data is Map<String, dynamic>) {
      final rawCode = data['errorCode']?.toString().trim();
      final errorCode = (rawCode != null && rawCode.isNotEmpty)
          ? rawCode
          : _defaultCodeForStatus(statusCode);

      final parsedErrors = <ApiFieldError>[];
      final rawErrors = data['errors'];
      if (rawErrors is List) {
        for (final item in rawErrors) {
          if (item is Map<String, dynamic>) {
            parsedErrors.add(ApiFieldError.fromJson(item));
          } else if (item is Map) {
            parsedErrors.add(
              ApiFieldError.fromJson(Map<String, dynamic>.from(item)),
            );
          }
        }
      }

      final rawMessage = data['message']?.toString().trim();
      final safeMessage = isServerError
          ? 'Something went wrong on the server. Please try again later.'
          : _sanitizeMessage(rawMessage, fallback: _defaultMessageForStatus(statusCode));

      return ApiError(
        message: safeMessage,
        errorCode: errorCode,
        statusCode: statusCode,
        errors: List.unmodifiable(parsedErrors),
      );
    }

    if (data is Map) {
      return ApiError.fromResponse(
        Map<String, dynamic>.from(data),
        statusCode: statusCode,
      );
    }

    return ApiError(
      message: _defaultMessageForStatus(statusCode),
      errorCode: _defaultCodeForStatus(statusCode),
      statusCode: statusCode,
    );
  }

  static String _sanitizeMessage(String? raw, {required String fallback}) {
    if (raw == null || raw.isEmpty) {
      return fallback;
    }

    final lower = raw.toLowerCase();
    final containsSensitiveInternals = lower.contains('prisma') ||
        lower.contains('mongodb') ||
        lower.contains('stack') ||
        lower.contains('econnrefused') ||
        lower.contains('c:\\') ||
        lower.contains('/src/') ||
        lower.contains('node_modules');

    if (containsSensitiveInternals) {
      return fallback;
    }

    return raw;
  }

  static String _defaultCodeForStatus(int? statusCode) {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return ApiErrorCodes.rateLimitExceeded;
      default:
        if (statusCode != null && statusCode >= 500) {
          return ApiErrorCodes.internalServerError;
        }
        return ApiErrorCodes.unknownError;
    }
  }

  static String _defaultMessageForStatus(int? statusCode) {
    switch (statusCode) {
      case 400:
        return 'Please check your input and try again.';
      case 401:
        return 'Authentication required. Please sign in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'This record already exists.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        if (statusCode != null && statusCode >= 500) {
          return 'Something went wrong on the server. Please try again later.';
        }
        return 'Request failed. Please try again.';
    }
  }

  @override
  String toString() =>
      'ApiError(statusCode: $statusCode, errorCode: $errorCode, message: $message)';
}
