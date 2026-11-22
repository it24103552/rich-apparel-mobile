import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/core/constants/api_endpoints.dart';
import 'package:rich_apparel_mobile/core/errors/api_error.dart';
import 'package:rich_apparel_mobile/core/network/network_providers.dart';
import 'package:rich_apparel_mobile/core/network/session_events.dart';
import 'package:rich_apparel_mobile/core/storage/token_storage.dart';
import 'package:rich_apparel_mobile/features/auth/data/auth_repository.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_models.dart';
import 'package:rich_apparel_mobile/features/auth/models/auth_state.dart';
import 'package:rich_apparel_mobile/features/auth/providers/auth_provider.dart';

class _MemoryTokenStorage implements TokenStorage {
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
  Future<bool> hasTokens() async => accessToken != null && refreshToken != null;
}

class _FakeAuthRepository implements AuthRepository {
  _FakeAuthRepository(this.tokenStorage);

  final _MemoryTokenStorage tokenStorage;
  User? restoredUser;
  ApiError? loginError;
  ApiError? restoreError;
  bool logoutCalled = false;

  static const sampleUser = User(
    id: 'user-1',
    name: 'Amara Perera',
    email: 'amara@example.com',
    phone: '0771234567',
    role: 'Customer',
  );

  @override
  Future<User> login(LoginRequest request) async {
    if (loginError != null) {
      throw loginError!;
    }
    await tokenStorage.saveTokens(
      accessToken: 'jwt-access',
      refreshToken: 'jwt-refresh',
    );
    return sampleUser;
  }

  @override
  Future<RegisterResponse> register(RegisterRequest request) async {
    return RegisterResponse(
      message: 'User registered successfully',
      user: User(
        id: 'user-2',
        name: request.name,
        email: request.email,
        phone: request.phone,
        role: 'Customer',
      ),
    );
  }

  @override
  Future<User?> restoreSession() async {
    if (restoreError != null) {
      await tokenStorage.clearTokens();
      throw restoreError!;
    }
    if (!await tokenStorage.hasTokens()) {
      return null;
    }
    return restoredUser;
  }

  @override
  Future<User> getCurrentUser() async => sampleUser;

  @override
  Future<LoginResponse> refreshSession() async {
    return const LoginResponse(
      tokens: TokenResponse(
        token: 'jwt-access-2',
        refreshToken: 'jwt-refresh-2',
        expiresIn: '7d',
      ),
      user: sampleUser,
    );
  }

  @override
  Future<void> logout() async {
    logoutCalled = true;
    await tokenStorage.clearTokens();
  }
}

void main() {
  group('AuthNotifier state management', () {
    late _MemoryTokenStorage tokenStorage;
    late _FakeAuthRepository repository;
    late SessionEvents sessionEvents;
    late ProviderContainer container;

    setUp(() {
      tokenStorage = _MemoryTokenStorage();
      repository = _FakeAuthRepository(tokenStorage);
      sessionEvents = SessionEvents();

      container = ProviderContainer(
        overrides: [
          tokenStorageProvider.overrideWithValue(tokenStorage),
          sessionEventsProvider.overrideWithValue(sessionEvents),
          authRepositoryProvider.overrideWithValue(repository),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('restoreSession moves to unauthenticated when no tokens are stored',
        () async {
      expect(container.read(authStateProvider).status, AuthStatus.initial);

      await container.read(authStateProvider.notifier).restoreSession();

      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.isAuthenticated, isFalse);
      expect(state.user, isNull);
    });

    test('restoreSession authenticates when backend validates stored tokens',
        () async {
      await tokenStorage.saveTokens(
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
      );
      repository.restoredUser = _FakeAuthRepository.sampleUser;

      await container.read(authStateProvider.notifier).restoreSession();

      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.authenticated);
      expect(state.isAuthenticated, isTrue);
      expect(state.user?.email, 'amara@example.com');
    });

    test('restoreSession does NOT assume authenticated if validation fails',
        () async {
      await tokenStorage.saveTokens(
        accessToken: 'bad-access',
        refreshToken: 'bad-refresh',
      );
      repository.restoreError = const ApiError(
        message: 'Invalid token',
        errorCode: ApiErrorCodes.invalidToken,
        statusCode: 401,
      );

      await container.read(authStateProvider.notifier).restoreSession();

      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.isAuthenticated, isFalse);
      expect(await tokenStorage.hasTokens(), isFalse);
    });

    test('login transitions to authenticated and stores tokens', () async {
      final success = await container.read(authStateProvider.notifier).login(
            email: 'amara@example.com',
            password: 'password123',
          );

      expect(success, isTrue);
      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.authenticated);
      expect(state.user?.name, 'Amara Perera');
      expect(await tokenStorage.hasTokens(), isTrue);
    });

    test('login failure sets error state with clean message', () async {
      repository.loginError = const ApiError(
        message: 'Invalid credentials',
        errorCode: ApiErrorCodes.invalidCredentials,
        statusCode: 401,
      );

      final success = await container.read(authStateProvider.notifier).login(
            email: 'amara@example.com',
            password: 'wrong',
          );

      expect(success, isFalse);
      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.error);
      expect(state.errorMessage, 'Invalid credentials');
      expect(state.isAuthenticated, isFalse);
    });

    test('register keeps state unauthenticated and does not store tokens',
        () async {
      final response =
          await container.read(authStateProvider.notifier).register(
                name: 'New User',
                email: 'new@example.com',
                phone: '0779998888',
                password: 'password123',
              );

      expect(response, isNotNull);
      expect(response?.user.email, 'new@example.com');
      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.isAuthenticated, isFalse);
      expect(await tokenStorage.hasTokens(), isFalse);
    });

    test('logout clears tokens and transitions to unauthenticated', () async {
      await container.read(authStateProvider.notifier).login(
            email: 'amara@example.com',
            password: 'password123',
          );
      expect(container.read(authStateProvider).isAuthenticated, isTrue);

      await container.read(authStateProvider.notifier).logout();

      final state = container.read(authStateProvider);
      expect(repository.logoutCalled, isTrue);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.isAuthenticated, isFalse);
      expect(await tokenStorage.hasTokens(), isFalse);
    });

    test('session expired event forces unauthenticated state', () async {
      await container.read(authStateProvider.notifier).login(
            email: 'amara@example.com',
            password: 'password123',
          );

      sessionEvents.notifySessionExpired();
      await Future<void>.delayed(Duration.zero);

      final state = container.read(authStateProvider);
      expect(state.status, AuthStatus.unauthenticated);
      expect(state.isAuthenticated, isFalse);
      expect(state.errorMessage, contains('expired'));
    });
  });
}
