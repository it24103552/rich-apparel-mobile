import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';

/// Minimal authenticated home placeholder used to verify Phase 1 session
/// hydration (`GET /api/v1/auth/me`) and logout.
class HomePlaceholderScreen extends ConsumerWidget {
  const HomePlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.user;
    final isSubmitting = authState.isSubmitting;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rich Apparel'),
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Welcome, ${user?.name ?? 'User'}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Authenticated successfully.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  if (user != null) ...[
                    const SizedBox(height: 20),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Email: ${user.email}'),
                            if (user.phone != null && user.phone!.isNotEmpty)
                              Text('Phone: ${user.phone}'),
                            if (user.role != null && user.role!.isNotEmpty)
                              Text('Role: ${user.role}'),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton.tonal(
                    key: const Key('logout_button'),
                    onPressed: isSubmitting
                        ? null
                        : () => ref.read(authStateProvider.notifier).logout(),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: isSubmitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Logout'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
