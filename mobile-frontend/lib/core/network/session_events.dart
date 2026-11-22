import 'dart:async';

/// Broadcast event hub allowing the networking layer to notify authentication
/// state when a session expires and cannot be refreshed.
class SessionEvents {
  final StreamController<void> _sessionExpiredController =
      StreamController<void>.broadcast();

  Stream<void> get onSessionExpired => _sessionExpiredController.stream;

  void notifySessionExpired() {
    if (!_sessionExpiredController.isClosed) {
      _sessionExpiredController.add(null);
    }
  }

  void dispose() {
    _sessionExpiredController.close();
  }
}
