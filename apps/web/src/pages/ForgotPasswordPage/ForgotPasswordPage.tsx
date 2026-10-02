import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPasswordSchema, sendEmailOtpSchema, toFieldErrors } from '../../shared/validation';
import { useAuth } from '../../auth/auth-context';
import { requestPasswordReset } from '../../auth/email-otp';
import type { EmailOtpChallenge } from '../../shared/types';
import AuthShell from '../../components/AuthShell/AuthShell';
import { Button, ErrorBanner, Field, TextInput } from '../../components/ui';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { ROUTES } from '../../routes';

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({ email: '', code: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [challenge, setChallenge] = useState<EmailOtpChallenge | null>(null);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function handleSendCode() {
    setFields({});
    setBanner(null);

    const parsed = sendEmailOtpSchema.safeParse({
      email: values.email,
      purpose: 'PASSWORD_RESET',
    });
    if (!parsed.success) {
      setFields(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setSending(true);
    try {
      const next = await requestPasswordReset(parsed.data.email);
      setChallenge(next);
      setResendIn(next.resendAfterSeconds);
    } catch (error) {
      setBanner(bannerFor(error));
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFields({});
    setBanner(null);

    const parsed = resetPasswordSchema.safeParse(values);
    if (!parsed.success) {
      setFields(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(parsed.data);
      navigate(ROUTES.dashboard, { replace: true });
    } catch (error) {
      setFields(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  function update(key: keyof typeof values) {
    return (event: { target: { value: string } }) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  const codeHint = challenge
    ? `Code sent to ${challenge.email}.${challenge.devCode ? ` Dev code: ${challenge.devCode}` : ' Check your inbox (and spam folder).'} It expires in 10 minutes.`
    : 'Press “Send code” to get a 6-digit reset code by email.';

  return (
    <AuthShell
      title="Reset password"
      subtitle="We'll email you a 6-digit code — no reset links, no account probing."
      footer={
        <>
          Remembered it?{' '}
          <Link to={ROUTES.login} className="font-medium text-emerald-400 hover:text-emerald-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorBanner>{banner}</ErrorBanner>

        <Field label="Email" htmlFor="email" error={fields.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={update('email')}
          />
        </Field>

        <Field label="Verification code" htmlFor="code" error={fields.code} hint={codeHint}>
          <TextInput
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={values.code}
            onChange={update('code')}
          />
        </Field>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleSendCode}
          disabled={sending || resendIn > 0}
        >
          {sending
            ? 'Sending…'
            : resendIn > 0
              ? `Resend code in ${resendIn}s`
              : challenge
                ? 'Resend code'
                : 'Send code'}
        </Button>

        <Field
          label="New password"
          htmlFor="password"
          error={fields.password}
          hint={PASSWORD_HINT}
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            onChange={update('password')}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthShell>
  );
}
