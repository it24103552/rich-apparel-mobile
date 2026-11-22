import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_client.dart';
import 'session_events.dart';

final appConfigProvider = Provider<AppConfig>((ref) {
  return AppConfig.fromEnvironment();
});

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return SecureTokenStorage();
});

final sessionEventsProvider = Provider<SessionEvents>((ref) {
  final events = SessionEvents();
  ref.onDispose(events.dispose);
  return events;
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final tokenStorage = ref.watch(tokenStorageProvider);
  final sessionEvents = ref.watch(sessionEventsProvider);

  return ApiClient(
    config: config,
    tokenStorage: tokenStorage,
    onSessionExpired: sessionEvents.notifySessionExpired,
  );
});
