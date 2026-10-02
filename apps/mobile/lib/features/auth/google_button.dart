import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

/// "Continue with Google" using Firebase Auth's native provider flow.
///
/// The resulting Firebase ID token is handed to [onIdToken], which exchanges
/// it for a local session against the API. Firebase-side failures are
/// reported through [onError]; the API-side ones are the caller's banner.
class GoogleButton extends StatefulWidget {
  const GoogleButton({
    super.key,
    required this.onIdToken,
    this.onError,
    this.label = 'Continue with Google',
  });

  final Future<void> Function(String idToken) onIdToken;
  final void Function(String message)? onError;
  final String label;

  @override
  State<GoogleButton> createState() => _GoogleButtonState();
}

class _GoogleButtonState extends State<GoogleButton> {
  bool _pending = false;

  Future<void> _signIn() async {
    setState(() => _pending = true);
    try {
      if (Firebase.apps.isEmpty) {
        widget.onError?.call('Google sign-in is not configured on this device.');
        return;
      }
      final credential =
          await FirebaseAuth.instance.signInWithProvider(GoogleAuthProvider());
      final idToken = await credential.user?.getIdToken();
      if (idToken == null) {
        widget.onError?.call('Google sign-in returned no credential.');
        return;
      }
      await widget.onIdToken(idToken);
    } on FirebaseAuthException catch (error) {
      if (!_isCancellation(error)) widget.onError?.call(_messageFor(error));
    } catch (error) {
      // The user backing out of the native sheet is a cancel, not a failure.
      if (!_isCancellation(error)) {
        widget.onError?.call('Google sign-in failed. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  static bool _isCancellation(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('cancel') || text.contains('sign_in_canceled');
  }

  String _messageFor(FirebaseAuthException error) {
    switch (error.code) {
      case 'account-exists-with-different-credential':
        return 'An account with this email already exists. Sign in with your password first.';
      case 'network-request-failed':
        return 'No connection — check your network and try again.';
      default:
        return error.message ?? 'Google sign-in failed. Please try again.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _pending ? null : _signIn,
      icon: _pending
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.g_mobiledata_rounded, size: 28),
      label: Text(_pending ? 'Connecting…' : widget.label),
    );
  }
}
