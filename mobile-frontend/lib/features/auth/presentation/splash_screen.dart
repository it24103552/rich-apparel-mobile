import 'package:flutter/material.dart';

/// Minimal startup screen displayed while verifying any stored session against
/// `GET /api/v1/auth/me`.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Checking session...'),
          ],
        ),
      ),
    );
  }
}
