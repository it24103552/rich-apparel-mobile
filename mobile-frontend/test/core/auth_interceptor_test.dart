import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/core/config/app_config.dart';
import 'package:rich_apparel_mobile/core/config/app_environment.dart';
import 'package:rich_apparel_mobile/core/constants/api_endpoints.dart';
import 'package:rich_apparel_mobile/core/errors/api_error.dart';
import 'package:rich_apparel_mobile/core/network/api_client.dart';
import 'package:rich_apparel_mobile/core/storage/token_storage.dart';

class _InMemoryTokenStorage implements TokenStorage {
  String? _access;
  String? _refresh;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _access = accessToken;
    _refresh = refreshToken;
  }

  @override
  Future<String?> getAccessToken() async => _access;

  @override
  Future<String?> getRefreshToken() async => _refresh;

  @override
  Future<void> clearTokens() async {
    _access = null;
    _refresh = null;
  }

  @override
  Future<bool> hasTokens() async =>
      _access != null &&
      _access!.isNotEmpty &&
      _refresh != null &&
      _refresh!.isNotEmpty;
}

typedef _AdapterHandler = Future<ResponseBody> Function(RequestOptions options);

class _FakeHttpClientAdapter implements HttpClientAdapter {
  _FakeHttpClientAdapter(this.handler);

  final _AdapterHandler handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonBody(Map<String, dynamic> data, int statusCode) {
  return ResponseBody.fromString(
    jsonEncode(data),
    statusCode,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

void main() {
  const config = AppConfig(
    environment: AppEnvironment.development,
    apiBaseUrl: 'http://localhost:5001/api/v1',
  );

  group('AuthInterceptor', () {
    test('refreshes once on 401 TOKEN_EXPIRED, saves tokens, and retries request',
        () async {
      final tokenStorage = _InMemoryTokenStorage();
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'valid-refresh',
      );

      var meCalls = 0;
      var refreshCalls = 0;

      final adapter = _FakeHttpClientAdapter((options) async {
        if (options.path == ApiEndpoints.authMe) {
          meCalls++;
          if (options.headers['Authorization'] == 'Bearer expired-access') {
            return _jsonBody(
              {
                'success': false,
                'message': 'Token has expired. Please login again.',
                'errorCode': ApiErrorCodes.tokenExpired,
              },
              401,
            );
          }
          if (options.headers['Authorization'] == 'Bearer fresh-access') {
            return _jsonBody(
              {
                'success': true,
                'message': 'Authenticated user fetched',
                'data': {
                  'id': 'u1',
                  'name': 'Jane Doe',
                  'email': 'jane@example.com',
                },
              },
              200,
            );
          }
        }

        if (options.path == ApiEndpoints.authRefresh) {
          refreshCalls++;
          expect(options.data, {'refreshToken': 'valid-refresh'});
          return _jsonBody(
            {
              'success': true,
              'message': 'Token refreshed',
              'data': {
                'token': 'fresh-access',
                'refreshToken': 'fresh-refresh',
                'expiresIn': '7d',
                'user': {
                  'id': 'u1',
                  'name': 'Jane Doe',
                  'email': 'jane@example.com',
                },
              },
            },
            200,
          );
        }

        return _jsonBody({'success': false, 'message': 'Unexpected'}, 500);
      });

      final client = ApiClient(
        config: config,
        tokenStorage: tokenStorage,
        httpClientAdapter: adapter,
      );

      final response = await client.get(ApiEndpoints.authMe);

      expect(response['success'], isTrue);
      expect(meCalls, 2);
      expect(refreshCalls, 1);
      expect(await tokenStorage.getAccessToken(), 'fresh-access');
      expect(await tokenStorage.getRefreshToken(), 'fresh-refresh');
    });

    test('deduplicates concurrent 401 TOKEN_EXPIRED requests into one refresh',
        () async {
      final tokenStorage = _InMemoryTokenStorage();
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'valid-refresh',
      );

      var refreshCalls = 0;

      final adapter = _FakeHttpClientAdapter((options) async {
        if (options.path == ApiEndpoints.authRefresh) {
          refreshCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 30));
          return _jsonBody(
            {
              'success': true,
              'message': 'Token refreshed',
              'data': {
                'token': 'rotated-access',
                'refreshToken': 'rotated-refresh',
                'expiresIn': '7d',
                'user': {'id': 'u1', 'name': 'Jane', 'email': 'j@e.com'},
              },
            },
            200,
          );
        }

        if (options.headers['Authorization'] == 'Bearer expired-access') {
          return _jsonBody(
            {
              'success': false,
              'message': 'Token has expired',
              'errorCode': ApiErrorCodes.tokenExpired,
            },
            401,
          );
        }

        return _jsonBody(
          {
            'success': true,
            'message': 'ok',
            'data': {'path': options.path},
          },
          200,
        );
      });

      final client = ApiClient(
        config: config,
        tokenStorage: tokenStorage,
        httpClientAdapter: adapter,
      );

      final results = await Future.wait([
        client.get(ApiEndpoints.authMe),
        client.get(ApiEndpoints.authMe),
        client.get(ApiEndpoints.authMe),
      ]);

      expect(results.every((r) => r['success'] == true), isTrue);
      expect(refreshCalls, 1);
    });

    test('retries at most once if refreshed token still fails with TOKEN_EXPIRED',
        () async {
      final tokenStorage = _InMemoryTokenStorage();
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'valid-refresh',
      );

      var meCalls = 0;
      var refreshCalls = 0;

      final adapter = _FakeHttpClientAdapter((options) async {
        if (options.path == ApiEndpoints.authRefresh) {
          refreshCalls++;
          return _jsonBody(
            {
              'success': true,
              'message': 'Token refreshed',
              'data': {
                'token': 'still-bad-access',
                'refreshToken': 'new-refresh',
                'expiresIn': '7d',
                'user': {'id': 'u1', 'name': 'Jane', 'email': 'j@e.com'},
              },
            },
            200,
          );
        }

        meCalls++;
        return _jsonBody(
          {
            'success': false,
            'message': 'Token has expired',
            'errorCode': ApiErrorCodes.tokenExpired,
          },
          401,
        );
      });

      final client = ApiClient(
        config: config,
        tokenStorage: tokenStorage,
        httpClientAdapter: adapter,
      );

      await expectLater(
        () => client.get(ApiEndpoints.authMe),
        throwsA(
          isA<ApiError>().having(
            (e) => e.errorCode,
            'errorCode',
            ApiErrorCodes.tokenExpired,
          ),
        ),
      );
      expect(refreshCalls, 1);
      expect(meCalls, 2);
    });

    for (final nonRefreshableCode in const [
      ApiErrorCodes.authRequired,
      ApiErrorCodes.invalidAuthHeader,
      ApiErrorCodes.invalidToken,
      ApiErrorCodes.accountInactive,
      ApiErrorCodes.invalidCredentials,
    ]) {
      test('does NOT auto-refresh for 401 $nonRefreshableCode', () async {
        final tokenStorage = _InMemoryTokenStorage();
        await tokenStorage.saveTokens(
          accessToken: 'some-token',
          refreshToken: 'valid-refresh',
        );

        var refreshCalls = 0;
        final adapter = _FakeHttpClientAdapter((options) async {
          if (options.path == ApiEndpoints.authRefresh) {
            refreshCalls++;
          }
          return _jsonBody(
            {
              'success': false,
              'message': 'Auth failure',
              'errorCode': nonRefreshableCode,
            },
            401,
          );
        });

        final client = ApiClient(
          config: config,
          tokenStorage: tokenStorage,
          httpClientAdapter: adapter,
        );

        await expectLater(
          () => client.get(ApiEndpoints.authMe),
          throwsA(
            isA<ApiError>().having(
              (e) => e.errorCode,
              'errorCode',
              nonRefreshableCode,
            ),
          ),
        );
        expect(refreshCalls, 0);
      });
    }

    test('clears tokens and triggers onSessionExpired when refresh fails',
        () async {
      final tokenStorage = _InMemoryTokenStorage();
      await tokenStorage.saveTokens(
        accessToken: 'expired-access',
        refreshToken: 'expired-refresh',
      );

      var sessionExpiredCalled = false;

      final adapter = _FakeHttpClientAdapter((options) async {
        if (options.path == ApiEndpoints.authRefresh) {
          return _jsonBody(
            {
              'success': false,
              'message': 'Refresh token has expired. Please login again.',
              'errorCode': ApiErrorCodes.refreshTokenExpired,
            },
            401,
          );
        }

        return _jsonBody(
          {
            'success': false,
            'message': 'Token has expired. Please login again.',
            'errorCode': ApiErrorCodes.tokenExpired,
          },
          401,
        );
      });

      final client = ApiClient(
        config: config,
        tokenStorage: tokenStorage,
        onSessionExpired: () => sessionExpiredCalled = true,
        httpClientAdapter: adapter,
      );

      await expectLater(
        () => client.get(ApiEndpoints.authMe),
        throwsA(isA<ApiError>()),
      );

      expect(sessionExpiredCalled, isTrue);
      expect(await tokenStorage.hasTokens(), isFalse);
      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
    });
  });
}
