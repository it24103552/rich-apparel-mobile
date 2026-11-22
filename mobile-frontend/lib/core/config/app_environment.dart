/// Supported runtime environments for the Rich Apparel mobile app.
enum AppEnvironment {
  development,
  staging,
  production;

  static AppEnvironment fromString(String value) {
    switch (value.trim().toLowerCase()) {
      case 'staging':
      case 'stage':
        return AppEnvironment.staging;
      case 'production':
      case 'prod':
        return AppEnvironment.production;
      case 'development':
      case 'dev':
      default:
        return AppEnvironment.development;
    }
  }
}
