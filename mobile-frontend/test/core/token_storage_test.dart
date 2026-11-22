import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rich_apparel_mobile/core/storage/token_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SecureTokenStorage tokenStorage;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    tokenStorage = SecureTokenStorage();
  });

  group('SecureTokenStorage', () {
    test('returns null and hasTokens=false when empty', () async {
      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
      expect(await tokenStorage.hasTokens(), isFalse);
    });

    test('saves and retrieves access and refresh tokens', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access-jwt-123',
        refreshToken: 'refresh-jwt-456',
      );

      expect(await tokenStorage.getAccessToken(), 'access-jwt-123');
      expect(await tokenStorage.getRefreshToken(), 'refresh-jwt-456');
      expect(await tokenStorage.hasTokens(), isTrue);
    });

    test('clears stored tokens', () async {
      await tokenStorage.saveTokens(
        accessToken: 'access-jwt-123',
        refreshToken: 'refresh-jwt-456',
      );

      await tokenStorage.clearTokens();

      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
      expect(await tokenStorage.hasTokens(), isFalse);
    });
  });
}
