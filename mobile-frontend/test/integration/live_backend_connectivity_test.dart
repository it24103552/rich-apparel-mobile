import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/core/config/app_config.dart';
import 'package:rich_apparel_mobile/core/config/app_environment.dart';
import 'package:rich_apparel_mobile/core/constants/api_endpoints.dart';
import 'package:rich_apparel_mobile/core/errors/api_error.dart';
import 'package:rich_apparel_mobile/core/network/network_providers.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_models.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_state.dart';
import 'package:rich_apparel_mobile/features/auth/providers/auth_provider.dart';
import 'package:rich_apparel_mobile/routing/app_router.dart';

const String _liveApiUrl = String.fromEnvironment('LIVE_API_URL');
const String _testEmail = String.fromEnvironment('TEST_EMAIL');
const String _testPassword = String.fromEnvironment('TEST_PASSWORD');
const String _expiredAccessToken =
    String.fromEnvironment('EXPIRED_ACCESS_TOKEN');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final shouldSkip = _liveApiUrl.isEmpty ||
      _testEmail.isEmpty ||
      _testPassword.isEmpty;

  group(
    'Live Express Backend Integration',
    () {
      late ProviderContainer container;
      HttpOverrides? previousHttpOverrides;

      setUpAll(() {
        // TestWidgetsFlutterBinding overrides HttpClient to return HTTP 400.
        // Restore real sockets only for this opt-in live backend test.
        previousHttpOverrides = HttpOverrides.current;
        HttpOverrides.global = null;
      });

      tearDownAll(() {
        HttpOverrides.global = previousHttpOverrides;
      });

      setUp(() {
        FlutterSecureStorage.setMockInitialValues({});
        final config = AppConfig(
          environment: AppEnvironment.development,
          apiBaseUrl: _liveApiUrl,
        );
        container = ProviderContainer(
          overrides: [
            appConfigProvider.overrideWithValue(config),
          ],
        );
      });

      tearDown(() {
        container.dispose();
      });

      test(
        'Login -> SecureTokenStorage -> /auth/me -> 401 TOKEN_EXPIRED auto-refresh -> INVALID_TOKEN no-refresh -> Logout -> /home blocked',
        () async {
          final authNotifier = container.read(authStateProvider.notifier);
          final tokenStorage = container.read(tokenStorageProvider);
          final authRepo = container.read(authRepositoryProvider);

          // 1. Unauthenticated startup blocks /home.
          await authNotifier.restoreSession();
          expect(
            container.read(authStateProvider).status,
            AuthStatus.unauthenticated,
          );
          expect(
            resolveAuthRedirect(
              authState: container.read(authStateProvider),
              location: AppRoutes.home,
            ),
            AppRoutes.login,
          );

          // 2. Login against real Express API + hydrate user via real /auth/me.
          final loggedIn = await authNotifier.login(
            email: _testEmail,
            password: _testPassword,
          );
          expect(loggedIn, isTrue);

          final authedState = container.read(authStateProvider);
          expect(authedState.status, AuthStatus.authenticated);
          expect(authedState.user?.email.toLowerCase(), _testEmail.toLowerCase());
          expect(await tokenStorage.hasTokens(), isTrue);
          expect(
            resolveAuthRedirect(
              authState: authedState,
              location: AppRoutes.home,
            ),
            isNull,
          );

          final validRefreshToken = await tokenStorage.getRefreshToken();
          expect(validRefreshToken, isNotNull);

          // 3. Real 401 TOKEN_EXPIRED -> automatic POST /auth/refresh -> retry /auth/me once.
          if (_expiredAccessToken.isNotEmpty) {
            await tokenStorage.saveTokens(
              accessToken: _expiredAccessToken,
              refreshToken: validRefreshToken!,
            );

            final refreshedUser = await authRepo.getCurrentUser();
            expect(refreshedUser.email.toLowerCase(), _testEmail.toLowerCase());

            final rotatedAccessToken = await tokenStorage.getAccessToken();
            expect(rotatedAccessToken, isNotNull);
            expect(rotatedAccessToken, isNot(_expiredAccessToken));
          }

          // 4. Real 401 INVALID_TOKEN must NOT auto-refresh.
          final currentRefresh = await tokenStorage.getRefreshToken();
          await tokenStorage.saveTokens(
            accessToken: 'definitely.invalid.jwt',
            refreshToken: currentRefresh!,
          );
          await expectLater(
            () => authRepo.getCurrentUser(),
            throwsA(
              isA<ApiError>()
                  .having((e) => e.statusCode, 'statusCode', 401)
                  .having(
                    (e) => e.errorCode,
                    'errorCode',
                    ApiErrorCodes.invalidToken,
                  ),
            ),
          );
          // Token should still be the invalid one (no refresh attempted).
          expect(await tokenStorage.getAccessToken(), 'definitely.invalid.jwt');

          // 5. Structured backend error parsing on register validation & duplicate email.
          await expectLater(
            () => authRepo.register(
              RegisterRequest(
                name: 'T',
                email: 'not-an-email',
                phone: '123',
                password: '123',
              ),
            ),
            throwsA(
              isA<ApiError>()
                  .having((e) => e.statusCode, 'statusCode', 400)
                  .having(
                    (e) => e.errorCode,
                    'errorCode',
                    ApiErrorCodes.validationError,
                  )
                  .having((e) => e.errors.isNotEmpty, 'hasFieldErrors', isTrue),
            ),
          );

          await expectLater(
            () => authRepo.register(
              RegisterRequest(
                name: 'Existing User',
                email: _testEmail,
                phone: '0771234567',
                password: 'password123',
              ),
            ),
            throwsA(
              isA<ApiError>()
                  .having((e) => e.statusCode, 'statusCode', 409)
                  .having(
                    (e) => e.errorCode,
                    'errorCode',
                    ApiErrorCodes.userAlreadyExists,
                  ),
            ),
          );

          // 6. Re-login cleanly, then verify real POST /auth/logout clears tokens & blocks /home.
          expect(
            await authNotifier.login(email: _testEmail, password: _testPassword),
            isTrue,
          );
          await authNotifier.logout();

          expect(await tokenStorage.hasTokens(), isFalse);
          expect(
            container.read(authStateProvider).status,
            AuthStatus.unauthenticated,
          );
          expect(
            resolveAuthRedirect(
              authState: container.read(authStateProvider),
              location: AppRoutes.home,
            ),
            AppRoutes.login,
          );
        },
      );
    },
    skip: shouldSkip
        ? 'Opt-in live backend test. Pass --dart-define=LIVE_API_URL=http://127.0.0.1:5001/api/v1 --dart-define=TEST_EMAIL=... --dart-define=TEST_PASSWORD=...'
        : false,
  );
}
