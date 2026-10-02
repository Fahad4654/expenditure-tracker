import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, sendEmailOtpSchema, toFieldErrors } from '../../shared/validation';
import { useAuth } from '../../auth/auth-context';
import { sendEmailOtp } from '../../auth/email-otp';
import type { EmailOtpChallenge } from '../../shared/types';
import AuthShell from '../../components/AuthShell/AuthShell';
import GoogleButton from '../../components/GoogleButton/GoogleButton';
import { Button, ErrorBanner, Field, TextInput } from '../../components/ui';
import { useGoogleAuthNotice } from '../../auth/google-notice';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { ROUTES } from '../../routes';

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({ name: '', email: '', password: '', code: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [challenge, setChallenge] = useState<EmailOtpChallenge | null>(null);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useGoogleAuthNotice(setBanner);

  // Counts the resend cooldown down once a second while the page is open.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFields({});
    setBanner(null);

    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      setFields(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      navigate(ROUTES.dashboard, { replace: true });
    } catch (error) {
      setFields(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendCode() {
    setFields({});
    setBanner(null);

    const parsed = sendEmailOtpSchema.safeParse({ email: values.email, purpose: 'REGISTER' });
    if (!parsed.success) {
      setFields(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setSending(true);
    try {
      const next = await sendEmailOtp(parsed.data);
      setChallenge(next);
      setResendIn(next.resendAfterSeconds);
    } catch (error) {
      setBanner(bannerFor(error));
    } finally {
      setSending(false);
    }
  }

  function update(key: keyof typeof values) {
    return (event: { target: { value: string } }) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  const codeHint = challenge
    ? `Code sent to ${challenge.email}.${challenge.devCode ? ` Dev code: ${challenge.devCode}` : ' Check your inbox (and spam folder).'} It expires in 10 minutes.`
    : 'Press “Send code” to get a 6-digit verification code by email.';

  return (
    <AuthShell
      title="Create your account"
      subtitle="Verify your email, then it syncs across every device."
      footer={
        <>
          Already have an account?{' '}
          <Link to={ROUTES.login} className="font-medium text-emerald-400 hover:text-emerald-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorBanner>{banner}</ErrorBanner>

        <GoogleButton label="Sign up with Google" />

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
          <span className="h-px flex-1 bg-slate-700" aria-hidden="true" />
          or
          <span className="h-px flex-1 bg-slate-700" aria-hidden="true" />
        </div>

        <Field label="Name" htmlFor="name" error={fields.name}>
          <TextInput
            id="name"
            name="name"
            autoComplete="name"
            required
            value={values.name}
            onChange={update('name')}
          />
        </Field>

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

        <Field label="Password" htmlFor="password" error={fields.password} hint={PASSWORD_HINT}>
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

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
