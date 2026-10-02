import 'dart:async';

import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/otp_challenge.dart';
import '../../shared/widgets/error_banner.dart';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Password reset: request an OTP by email, then set a new password.
///
/// The server answer is identical for unknown addresses, so this screen can
/// never be used to probe for accounts.
class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _sending = false;
  bool _submitting = false;
  int _resendIn = 0;
  Timer? _resendTimer;
  EmailOtpChallenge? _challenge;
  String? _error;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim().toLowerCase();
    if (!_emailRe.hasMatch(email)) {
      setState(() => _error = 'Enter a valid email first');
      return;
    }

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      final challenge = await AppScope.read(context)
          .services
          .auth
          .forgotPassword(email);
      if (!mounted) return;
      setState(() {
        _challenge = challenge;
        if (challenge.devCode != null) _codeController.text = challenge.devCode!;
      });
      _startResendCountdown(challenge.resendAfterSeconds);
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not send the code. Please try again.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _startResendCountdown(int seconds) {
    _resendTimer?.cancel();
    var remaining = seconds;
    setState(() => _resendIn = remaining);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      remaining -= 1;
      setState(() => _resendIn = remaining);
      if (remaining <= 0) {
        timer.cancel();
        _resendTimer = null;
      }
    });
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final auth = AppScope.read(context).auth;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await auth.resetPassword(
        email: _emailController.text,
        code: _codeController.text.trim(),
        password: _passwordController.text,
      );
      // Success: the root router swaps in the shell.
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
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
                      'We’ll email you a 6-digit code — no reset links, no account probing.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.mail_outline),
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Email is required';
                        if (!_emailRe.hasMatch(text)) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _codeController,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      textInputAction: TextInputAction.next,
                      maxLength: 6,
                      decoration: InputDecoration(
                        labelText: 'Verification code',
                        counterText: '',
                        helperText: _challenge == null
                            ? 'Press “Send code” first'
                            : _challenge!.devCode != null
                                ? 'Dev code: ${_challenge!.devCode} (mail delivery is off)'
                                : 'Code sent to ${_challenge!.email} — expires in 10 minutes',
                        prefixIcon: const Icon(Icons.pin_outlined),
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (!RegExp(r'^\d{6}$').hasMatch(text)) {
                          return 'Enter the 6-digit code';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: _sending || _resendIn > 0 ? null : _sendCode,
                      child: _sending
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.4),
                            )
                          : Text(
                              _resendIn > 0
                                  ? 'Resend code in ${_resendIn}s'
                                  : _challenge == null
                                      ? 'Send code'
                                      : 'Resend code',
                            ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'New password',
                        helperText: 'At least 8 characters, with a letter and a number',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () =>
                              setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (value) {
                        final text = value ?? '';
                        if (text.length < 8) return 'Use at least 8 characters';
                        if (!text.contains(RegExp(r'[A-Za-z]'))) {
                          return 'Add at least one letter';
                        }
                        if (!text.contains(RegExp(r'[0-9]'))) {
                          return 'Add at least one number';
                        }
                        return null;
                      },
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      ErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.4),
                            )
                          : const Text('Reset password'),
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
