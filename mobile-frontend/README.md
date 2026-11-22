# Rich Apparel — Flutter Mobile Foundation (Phase 1)

Cross-platform Flutter client (Android-first) built on top of the existing Rich Apparel Express `/api/v1` backend.

## Architecture

- **State Management:** `flutter_riverpod` (`NotifierProvider` / `Provider`)
- **Routing:** `go_router` with reactive authentication guards (`/`, `/login`, `/register`, `/home`)
- **Networking:** Centralized `ApiClient` (`dio`) with `AuthInterceptor`
- **Token Persistence:** `flutter_secure_storage` via `TokenStorage` (`SecureTokenStorage`)

```text
lib/
├── app.dart
├── main.dart
├── core/
│   ├── config/       # Environment-aware AppConfig (development/staging/production)
│   ├── constants/    # Existing /api/v1 endpoint paths & backend error codes
│   ├── errors/       # ApiError, ApiFieldError, ApiErrorHandler
│   ├── network/      # ApiClient, AuthInterceptor (TOKEN_EXPIRED refresh lock), SessionEvents
│   ├── storage/      # TokenStorage & SecureTokenStorage
│   └── utils/        # FormValidators aligned with backend Zod schemas
├── features/
│   └── auth/
│       ├── data/          # AuthApiService, AuthRepository
│       ├── models/        # User, LoginRequest, RegisterRequest, TokenResponse, LoginResponse, AuthState
│       ├── providers/     # AuthNotifier & Riverpod providers
│       └── presentation/  # SplashScreen, LoginScreen, RegisterScreen, HomePlaceholderScreen
└── routing/
    └── app_router.dart    # GoRouter configuration & redirect guards
```

## Environment Configuration

No production or staging URLs are hardcoded in Dart source files. Configure the environment and API base URL via `--dart-define`:

| Environment | Command | Default Base URL (if `API_BASE_URL` omitted) |
| --- | --- | --- |
| **Development (Android Emulator)** | `flutter run --dart-define=APP_ENV=development` | `http://10.0.2.2:5001/api/v1` |
| **Development (Web / Desktop / iOS Simulator)** | `flutter run --dart-define=APP_ENV=development` | `http://localhost:5001/api/v1` |
| **Development (Physical Android Device)** | `flutter run --dart-define=APP_ENV=development --dart-define=API_BASE_URL=http://<YOUR_LAN_IP>:5001/api/v1` | Explicit override |
| **Staging** | `flutter run --dart-define=APP_ENV=staging --dart-define=API_BASE_URL=https://<staging-api>/api/v1` | Placeholder `https://<staging-api>/api/v1` |
| **Production** | `flutter build apk --release --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://<production-api>/api/v1` | Placeholder `https://<production-api>/api/v1` |

> **Android Cleartext HTTP Note:** Cleartext HTTP (`android:usesCleartextTraffic="true"`) is enabled **only** in `android/app/src/debug/AndroidManifest.xml` for local Express development. Release builds remain HTTPS-only.

## Backend Authentication Contract

- `POST /api/v1/auth/register` — Creates a Customer account (does **not** return tokens; UI navigates to `/login`)
- `POST /api/v1/auth/login` — Returns `{ token, refreshToken, expiresIn, user }`, stored securely, then verified via `GET /api/v1/auth/me`
- `GET /api/v1/auth/me` — Hydrates and validates the active user session
- `POST /api/v1/auth/refresh` — Triggered automatically **only** on `HTTP 401` with `errorCode == "TOKEN_EXPIRED"` (single-flight lock, retried once)
- `POST /api/v1/auth/logout` — Calls backend logout and clears stored tokens

## Verification Commands

```bash
cd mobile-frontend
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```
