import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/validators.dart';
import '../../../routing/app_router.dart';
import '../providers/auth_provider.dart';

/// Minimal Phase 1 login screen wired to `POST /api/v1/auth/login` and
/// `GET /api/v1/auth/me`.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({
    super.key,
    this.initialEmail,
    this.infoMessage,
  });

  final String? initialEmail;
  final String? infoMessage;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) {
      return;
    }

    await ref.read(authStateProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isSubmitting = authState.isSubmitting;
    final errorMessage = authState.errorMessage;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rich Apparel — Sign In'),
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
                      'Sign in to your account',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    if (widget.infoMessage != null &&
                        widget.infoMessage!.isNotEmpty) ...[
                      _StatusBanner(
                        message: widget.infoMessage!,
                        isError: false,
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (errorMessage != null && errorMessage.isNotEmpty) ...[
                      _StatusBanner(
                        message: errorMessage,
                        isError: true,
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                      key: const Key('login_email_field'),
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
                      key: const Key('login_password_field'),
                      controller: _passwordController,
                      enabled: !isSubmitting,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
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
                      validator: FormValidators.validateLoginPassword,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('login_submit_button'),
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
                            : const Text('Login'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      key: const Key('go_to_register_button'),
                      onPressed: isSubmitting
                          ? null
                          : () {
                              ref.read(authStateProvider.notifier).clearError();
                              context.go(AppRoutes.register);
                            },
                      child: const Text('Create an account'),
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

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.message,
    required this.isError,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final background =
        isError ? colorScheme.errorContainer : colorScheme.primaryContainer;
    final foreground =
        isError ? colorScheme.onErrorContainer : colorScheme.onPrimaryContainer;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: TextStyle(color: foreground),
      ),
    );
  }
}
