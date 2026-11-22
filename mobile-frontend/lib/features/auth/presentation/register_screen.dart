import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/validators.dart';
import '../../../routing/app_router.dart';
import '../providers/auth_provider.dart';

/// Minimal Phase 1 registration screen matching `POST /api/v1/auth/register`.
///
/// Registration does not return tokens; upon success the user is navigated to
/// `/login` to sign in.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final email = _emailController.text.trim();
    final result = await ref.read(authStateProvider.notifier).register(
          name: _nameController.text.trim(),
          email: email,
          phone: _phoneController.text.trim(),
          password: _passwordController.text,
        );

    if (!mounted || result == null) {
      return;
    }

    context.go(
      AppRoutes.login,
      extra: LoginRouteArgs(
        initialEmail: email,
        infoMessage: 'Registration successful. Please sign in to continue.',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isSubmitting = authState.isSubmitting;
    final errorMessage = authState.errorMessage;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rich Apparel — Register'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Create your account',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    if (errorMessage != null && errorMessage.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          errorMessage,
                          style: TextStyle(color: colorScheme.onErrorContainer),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                      key: const Key('register_name_field'),
                      controller: _nameController,
                      enabled: !isSubmitting,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.name],
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        border: OutlineInputBorder(),
                      ),
                      validator: FormValidators.validateName,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('register_email_field'),
                      controller: _emailController,
                      enabled: !isSubmitting,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                      ),
                      validator: FormValidators.validateEmail,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('register_phone_field'),
                      controller: _phoneController,
                      enabled: !isSubmitting,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: const InputDecoration(
                        labelText: 'Phone Number',
                        border: OutlineInputBorder(),
                      ),
                      validator: FormValidators.validatePhone,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('register_password_field'),
                      controller: _passwordController,
                      enabled: !isSubmitting,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.newPassword],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          tooltip: _obscurePassword
                              ? 'Show password'
                              : 'Hide password',
                          onPressed: () {
                            setState(() {
                              _obscurePassword = !_obscurePassword;
                            });
                          },
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: FormValidators.validateRegisterPassword,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('register_submit_button'),
                      onPressed: isSubmitting ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: isSubmitting
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text('Register'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      key: const Key('go_to_login_button'),
                      onPressed: isSubmitting
                          ? null
                          : () {
                              ref.read(authStateProvider.notifier).clearError();
                              context.go(AppRoutes.login);
                            },
                      child: const Text('Already have an account? Sign In'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
