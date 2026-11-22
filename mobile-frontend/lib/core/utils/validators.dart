/// Client-side form validators aligned with `backend/src/modules/auth/auth.validation.js`.
abstract final class FormValidators {
  static final RegExp _emailRegex = RegExp(
    r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
  );

  static String? validateName(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return 'Name is required';
    }
    if (trimmed.length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (trimmed.length > 100) {
      return 'Name is too long';
    }
    return null;
  }

  static String? validateEmail(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return 'Email is required';
    }
    if (trimmed.length > 255 || !_emailRegex.hasMatch(trimmed)) {
      return 'Invalid email format';
    }
    return null;
  }

  static String? validatePhone(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return 'Phone number is required';
    }
    if (trimmed.length < 10) {
      return 'Phone number must be at least 10 characters';
    }
    if (trimmed.length > 20) {
      return 'Phone number must be at most 20 characters';
    }
    return null;
  }

  static String? validateLoginPassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) {
      return 'Password is required';
    }
    if (password.length > 128) {
      return 'Password is too long';
    }
    return null;
  }

  static String? validateRegisterPassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) {
      return 'Password is required';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    if (password.length > 128) {
      return 'Password is too long';
    }
    return null;
  }
}
