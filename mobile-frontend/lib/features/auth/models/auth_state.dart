import 'package:flutter/foundation.dart';

import 'auth_models.dart';

/// Lifecycle states for mobile authentication.
enum AuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

/// Immutable authentication state exposed by Riverpod.
@immutable
class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.errorMessage,
    this.isSubmitting = false,
  });

  const AuthState.initial()
      : status = AuthStatus.initial,
        user = null,
        errorMessage = null,
        isSubmitting = false;

  const AuthState.loading()
      : status = AuthStatus.loading,
        user = null,
        errorMessage = null,
        isSubmitting = false;

  const AuthState.authenticated(User this.user)
      : status = AuthStatus.authenticated,
        errorMessage = null,
        isSubmitting = false;

  const AuthState.unauthenticated({this.errorMessage})
      : status = AuthStatus.unauthenticated,
        user = null,
        isSubmitting = false;

  const AuthState.error(String this.errorMessage)
      : status = AuthStatus.error,
        user = null,
        isSubmitting = false;

  final AuthStatus status;
  final User? user;
  final String? errorMessage;
  final bool isSubmitting;

  bool get isAuthenticated =>
      status == AuthStatus.authenticated && user != null;

  bool get isRestoringSession =>
      status == AuthStatus.initial || status == AuthStatus.loading;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    bool clearUser = false,
    String? errorMessage,
    bool clearError = false,
    bool? isSubmitting,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: clearUser ? null : (user ?? this.user),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other is AuthState &&
            other.status == status &&
            other.user == user &&
            other.errorMessage == errorMessage &&
            other.isSubmitting == isSubmitting);
  }

  @override
  int get hashCode => Object.hash(status, user, errorMessage, isSubmitting);
}
