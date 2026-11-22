import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/providers/auth_provider.dart';
import 'routing/app_router.dart';

/// Root Flutter application widget for Rich Apparel Mobile (Phase 1 Foundation).
class RichApparelApp extends ConsumerStatefulWidget {
  const RichApparelApp({super.key});

  @override
  ConsumerState<RichApparelApp> createState() => _RichApparelAppState();
}

class _RichApparelAppState extends ConsumerState<RichApparelApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(authStateProvider.notifier).restoreSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'Rich Apparel',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blueGrey),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
