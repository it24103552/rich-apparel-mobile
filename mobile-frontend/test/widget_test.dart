import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/app.dart';
import 'package:rich_apparel_mobile/core/config/app_config.dart';
import 'package:rich_apparel_mobile/core/config/app_environment.dart';
import 'package:rich_apparel_mobile/core/constants/api_endpoints.dart';
import 'package:rich_apparel_mobile/core/network/api_client.dart';
import 'package:rich_apparel_mobile/core/network/network_providers.dart';
import 'package:rich_apparel_mobile/core/storage/token_storage.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_models.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_state.dart';
import 'package:rich_apparel_mobile/routing/app_router.dart';

class _TestTokenStorage implements TokenStorage {
  String? accessToken;
  String? refreshToken;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  @override
  Future<String?> getAccessToken() async => accessToken;

  @override
  Future<String?> getRefreshToken() async => refreshToken;

  @override
  Future<void> clearTokens() async {
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<bool> hasTokens() async =>
      accessToken != null &&
      accessToken!.isNotEmpty &&
      refreshToken != null &&
      refreshToken!.isNotEmpty;
}

class _MockBackendAdapter implements HttpClientAdapter {
  bool logoutCalled = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path == ApiEndpoints.authRegister) {
      final body = options.data as Map<String, dynamic>;
      return _json(
        {
          'success': true,
          'message': 'User registered successfully',
          'data': {
            'id': 'u-reg-1',
            'name': body['name'],
            'email': body['email'],
            'phone': body['phone'],
            'role': 'Customer',
            'roleId': 'r-cust',
            'createdAt': '2026-11-22T10:00:00.000Z',
          },
        },
        201,
      );
    }

    if (options.path == ApiEndpoints.authLogin) {
      return _json(
        {
          'success': true,
          'message': 'Login successful',
          'data': {
            'token': 'valid-access-token',
            'refreshToken': 'valid-refresh-token',
            'expiresIn': '7d',
            'user': {
              'id': 'u-1',
              'name': 'Test Customer',
              'email': 'customer@richapparel.com',
              'phone': '0771234567',
              'role': 'Customer',
            },
          },
        },
        200,
      );
    }

    if (options.path == ApiEndpoints.authMe) {
      if (options.headers['Authorization'] == 'Bearer valid-access-token') {
        return _json(
          {
            'success': true,
            'message': 'Authenticated user fetched',
            'data': {
              'id': 'u-1',
              'name': 'Test Customer',
              'email': 'customer@richapparel.com',
              'phone': '0771234567',
              'role': 'Customer',
            },
          },
          200,
        );
      }
      return _json(
        {
          'success': false,
          'message': 'Authentication required',
          'errorCode': ApiErrorCodes.authRequired,
        },
        401,
      );
    }

    if (options.path == ApiEndpoints.authLogout) {
      logoutCalled = true;
      return _json(
        {
          'success': true,
          'message': 'Logged out successfully',
        },
        200,
      );
    }

    return _json(
      {'success': false, 'message': 'Route not found', 'errorCode': 'NOT_FOUND'},
      404,
    );
  }

  ResponseBody _json(Map<String, dynamic> payload, int statusCode) {
    return ResponseBody.fromString(
      jsonEncode(payload),
      statusCode,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('Route protection logic', () {
    const user = User(
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
    );

    test('blocks /home when unauthenticated and redirects to /login', () {
      expect(
        resolveAuthRedirect(
          authState: const AuthState.unauthenticated(),
          location: AppRoutes.home,
        ),
        AppRoutes.login,
      );
      expect(
        resolveAuthRedirect(
          authState: const AuthState.unauthenticated(),
          location: AppRoutes.root,
        ),
        AppRoutes.login,
      );
      expect(
        resolveAuthRedirect(
          authState: const AuthState.unauthenticated(),
          location: AppRoutes.login,
        ),
        isNull,
      );
      expect(
        resolveAuthRedirect(
          authState: const AuthState.unauthenticated(),
          location: AppRoutes.register,
        ),
        isNull,
      );
    });

    test('redirects authenticated users away from /login and /register to /home',
        () {
      const authenticated = AuthState.authenticated(user);

      expect(
        resolveAuthRedirect(authState: authenticated, location: AppRoutes.root),
        AppRoutes.home,
      );
      expect(
        resolveAuthRedirect(
          authState: authenticated,
          location: AppRoutes.login,
        ),
        AppRoutes.home,
      );
      expect(
        resolveAuthRedirect(
          authState: authenticated,
          location: AppRoutes.register,
        ),
        AppRoutes.home,
      );
      expect(
        resolveAuthRedirect(authState: authenticated, location: AppRoutes.home),
        isNull,
      );
    });
  });

  group('End-to-end mocked auth widget flows', () {
    testWidgets(
      'unauthenticated launch -> register -> login -> home (/auth/me) -> logout -> protected route blocked',
      (tester) async {
        final tokenStorage = _TestTokenStorage();
        final adapter = _MockBackendAdapter();
        const config = AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: 'http://localhost:5001/api/v1',
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              appConfigProvider.overrideWithValue(config),
              tokenStorageProvider.overrideWithValue(tokenStorage),
              apiClientProvider.overrideWith((ref) {
                final events = ref.watch(sessionEventsProvider);
                return ApiClient(
                  config: config,
                  tokenStorage: tokenStorage,
                  onSessionExpired: events.notifySessionExpired,
                  httpClientAdapter: adapter,
                );
              }),
            ],
            child: const RichApparelApp(),
          ),
        );

        await tester.pumpAndSettle();

        // Starts unauthenticated -> redirected to Login screen.
        expect(find.text('Sign in to your account'), findsOneWidget);

        // Verify direct navigation to protected /home is blocked.
        final container = ProviderScope.containerOf(
          tester.element(find.byType(RichApparelApp)),
        );
        container.read(appRouterProvider).go(AppRoutes.home);
        await tester.pumpAndSettle();
        expect(find.text('Sign in to your account'), findsOneWidget);

        // Navigate to Register and complete registration (no tokens returned).
        await tester.tap(find.byKey(const Key('go_to_register_button')));
        await tester.pumpAndSettle();
        expect(find.text('Create your account'), findsOneWidget);

        await tester.enterText(
          find.byKey(const Key('register_name_field')),
          'Test Customer',
        );
        await tester.enterText(
          find.byKey(const Key('register_email_field')),
          'customer@richapparel.com',
        );
        await tester.enterText(
          find.byKey(const Key('register_phone_field')),
          '0771234567',
        );
        await tester.enterText(
          find.byKey(const Key('register_password_field')),
          'password123',
        );

        await tester.tap(find.byKey(const Key('register_submit_button')));
        await tester.pumpAndSettle();

        // After registration, routed back to Login with confirmation banner and no stored tokens.
        expect(find.text('Sign in to your account'), findsOneWidget);
        expect(
          find.text('Registration successful. Please sign in to continue.'),
          findsOneWidget,
        );
        expect(await tokenStorage.hasTokens(), isFalse);

        // Login with credentials -> stores tokens -> calls /auth/me -> Home placeholder.
        await tester.enterText(
          find.byKey(const Key('login_password_field')),
          'password123',
        );
        await tester.tap(find.byKey(const Key('login_submit_button')));
        await tester.pumpAndSettle();

        expect(find.text('Welcome, Test Customer'), findsOneWidget);
        expect(find.text('Authenticated successfully.'), findsOneWidget);
        expect(await tokenStorage.getAccessToken(), 'valid-access-token');
        expect(await tokenStorage.getRefreshToken(), 'valid-refresh-token');

        // Logout -> calls /auth/logout -> clears tokens -> redirects to Login.
        await tester.tap(find.byKey(const Key('logout_button')));
        await tester.pumpAndSettle();

        expect(adapter.logoutCalled, isTrue);
        expect(await tokenStorage.hasTokens(), isFalse);
        expect(find.text('Sign in to your account'), findsOneWidget);

        // Confirm /home is blocked again after logout.
        container.read(appRouterProvider).go(AppRoutes.home);
        await tester.pumpAndSettle();
        expect(find.text('Sign in to your account'), findsOneWidget);
      },
    );
  });
}
