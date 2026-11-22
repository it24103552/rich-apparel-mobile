import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error.dart';
import '../../../core/errors/error_handler.dart';
import '../../../core/network/network_providers.dart';
import '../data/auth_api_service.dart';
import '../data/auth_repository.dart';
import '../models/auth_models.dart';
import '../models/auth_state.dart';

final authApiServiceProvider = Provider<AuthApiService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthApiService(apiClient);
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final apiService = ref.watch(authApiServiceProvider);
  final tokenStorage = ref.watch(tokenStorageProvider);
  return AuthRepository(
    apiService: apiService,
    tokenStorage: tokenStorage,
  );
});

final authStateProvider = NotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

/// Riverpod notifier owning the application's authentication lifecycle.
class AuthNotifier extends Notifier<AuthState> {
  StreamSubscription<void>? _sessionExpiredSub;
  bool _restoring = false;

  @override
  AuthState build() {
    final sessionEvents = ref.watch(sessionEventsProvider);
    _sessionExpiredSub?.cancel();
    _sessionExpiredSub = sessionEvents.onSessionExpired.listen((_) {
      handleSessionExpired();
    });

    ref.onDispose(() {
      _sessionExpiredSub?.cancel();
    });

    return const AuthState.initial();
  }

  AuthRepository get _repository => ref.read(authRepositoryProvider);

  /// Restores and validates the session against `/api/v1/auth/me` on startup.
  Future<void> restoreSession() async {
    if (_restoring) return;
    _restoring = true;
    state = const AuthState.loading();

    try {
      final user = await _repository.restoreSession();
      if (user != null) {
        state = AuthState.authenticated(user);
      } else {
        state = const AuthState.unauthenticated();
      }
    } on ApiError catch (error) {
      state = AuthState.unauthenticated(errorMessage: error.message);
    } catch (error) {
      final apiError = ApiErrorHandler.fromObject(error);
      state = AuthState.unauthenticated(errorMessage: apiError.message);
    } finally {
      _restoring = false;
    }
  }

  /// Signs in with email and password, stores JWT tokens securely, and
  /// loads the authenticated user from `/api/v1/auth/me`.
  Future<bool> login({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);

    try {
      final user = await _repository.login(
        LoginRequest(email: email, password: password),
      );
      state = AuthState.authenticated(user);
      return true;
    } on ApiError catch (error) {
      state = AuthState.error(error.message);
      return false;
    } catch (error) {
      final apiError = ApiErrorHandler.fromObject(error);
      state = AuthState.error(apiError.message);
      return false;
    }
  }

  /// Registers a new user account. Because `POST /api/v1/auth/register` does
  /// not return tokens, authentication state remains unauthenticated so the UI
  /// navigates to Login.
  Future<RegisterResponse?> register({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);

    try {
      final response = await _repository.register(
        RegisterRequest(
          name: name,
          email: email,
          phone: phone,
          password: password,
        ),
      );
      state = const AuthState.unauthenticated();
      return response;
    } on ApiError catch (error) {
      state = AuthState.error(error.message);
      return null;
    } catch (error) {
      final apiError = ApiErrorHandler.fromObject(error);
      state = AuthState.error(apiError.message);
      return null;
    }
  }

  /// Logs out via the backend and clears all locally stored tokens.
  Future<void> logout() async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    await _repository.logout();
    state = const AuthState.unauthenticated();
  }

  /// Invoked when automatic token refresh fails and the user must sign in again.
  void handleSessionExpired() {
    state = const AuthState.unauthenticated(
      errorMessage: 'Your session has expired. Please sign in again.',
    );
  }

  void clearError() {
    if (state.status == AuthStatus.error || state.errorMessage != null) {
      state = state.isAuthenticated
          ? state.copyWith(clearError: true)
          : const AuthState.unauthenticated();
    }
  }
}
