import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/models/auth_state.dart';
import '../features/auth/presentation/home_placeholder_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/auth/providers/auth_provider.dart';

/// Named route paths for Phase 1 Foundation.
abstract final class AppRoutes {
  static const String root = '/';
  static const String login = '/login';
  static const String register = '/register';
  static const String home = '/home';
}

/// Optional arguments passed when navigating to `/login` (e.g. after register).
@immutable
class LoginRouteArgs {
  const LoginRouteArgs({
    this.initialEmail,
    this.infoMessage,
  });

  final String? initialEmail;
  final String? infoMessage;
}

/// Pure route-guard resolver so routing rules are easy to reason about and test.
String? resolveAuthRedirect({
  required AuthState authState,
  required String location,
}) {
  final isPublicAuthRoute =
      location == AppRoutes.login || location == AppRoutes.register;

  if (authState.isRestoringSession) {
    return location == AppRoutes.root ? null : AppRoutes.root;
  }

  if (authState.isAuthenticated) {
    if (location == AppRoutes.root || isPublicAuthRoute) {
      return AppRoutes.home;
    }
    return null;
  }

  // Unauthenticated or error state: allow only login & register.
  if (isPublicAuthRoute) {
    return null;
  }
  return AppRoutes.login;
}

class _RouterRefreshNotifier extends ChangeNotifier {
  void refresh() => notifyListeners();
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier();

  ref.listen<AuthState>(authStateProvider, (previous, next) {
    if (previous?.status != next.status ||
        previous?.isAuthenticated != next.isAuthenticated) {
      refreshNotifier.refresh();
    }
  });

  ref.onDispose(refreshNotifier.dispose);

  final router = GoRouter(
    initialLocation: AppRoutes.root,
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authState = ref.read(authStateProvider);
      return resolveAuthRedirect(
        authState: authState,
        location: state.matchedLocation,
      );
    },
    routes: [
      GoRoute(
        path: AppRoutes.root,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) {
          final args = state.extra is LoginRouteArgs
              ? state.extra! as LoginRouteArgs
              : null;
          return LoginScreen(
            initialEmail: args?.initialEmail,
            infoMessage: args?.infoMessage,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomePlaceholderScreen(),
      ),
    ],
  );

  ref.onDispose(router.dispose);
  return router;
});
