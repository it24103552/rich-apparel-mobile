import 'package:flutter/foundation.dart';

import 'app_environment.dart';

/// Environment-aware runtime configuration for the Flutter mobile app.
///
/// Configure via `--dart-define`:
/// - `APP_ENV`: `development` (default), `staging`, or `production`
/// - `API_BASE_URL`: Explicit `/api/v1` base URL override
///
/// For local Android emulator development, when `API_BASE_URL` is omitted and
/// `APP_ENV=development`, Android automatically resolves the host loopback
/// address `10.0.2.2` instead of `localhost`.
@immutable
class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    this.connectTimeout = const Duration(seconds: 15),
    this.receiveTimeout = const Duration(seconds: 20),
    this.sendTimeout = const Duration(seconds: 20),
  });

  static const String _envDefine = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'development',
  );

  static const String _apiBaseUrlDefine = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// Documented placeholders for environments whose deployment URLs are
  /// provided at build/run time via `--dart-define=API_BASE_URL=...`.
  static const String stagingUrlPlaceholder = 'https://<staging-api>/api/v1';
  static const String productionUrlPlaceholder =
      'https://<production-api>/api/v1';

  final AppEnvironment environment;
  final String apiBaseUrl;
  final Duration connectTimeout;
  final Duration receiveTimeout;
  final Duration sendTimeout;

  factory AppConfig.fromEnvironment({
    String? envOverride,
    String? apiBaseUrlOverride,
    TargetPlatform? platformOverride,
    bool? isWebOverride,
  }) {
    final environment = AppEnvironment.fromString(envOverride ?? _envDefine);
    final configuredUrl = (apiBaseUrlOverride ?? _apiBaseUrlDefine).trim();

    final resolvedBaseUrl = configuredUrl.isNotEmpty
        ? _stripTrailingSlash(configuredUrl)
        : _defaultBaseUrlFor(
            environment: environment,
            platform: platformOverride ?? defaultTargetPlatform,
            isWeb: isWebOverride ?? kIsWeb,
          );

    return AppConfig(
      environment: environment,
      apiBaseUrl: resolvedBaseUrl,
    );
  }

  static String _defaultBaseUrlFor({
    required AppEnvironment environment,
    required TargetPlatform platform,
    required bool isWeb,
  }) {
    switch (environment) {
      case AppEnvironment.development:
        if (!isWeb && platform == TargetPlatform.android) {
          // Android emulator maps 10.0.2.2 to the host development machine.
          return 'http://10.0.2.2:5001/api/v1';
        }
        return 'http://localhost:5001/api/v1';
      case AppEnvironment.staging:
        return stagingUrlPlaceholder;
      case AppEnvironment.production:
        return productionUrlPlaceholder;
    }
  }

  static String _stripTrailingSlash(String url) {
    return url.replaceFirst(RegExp(r'/+$'), '');
  }

  bool get isDevelopment => environment == AppEnvironment.development;
  bool get isStaging => environment == AppEnvironment.staging;
  bool get isProduction => environment == AppEnvironment.production;
}
