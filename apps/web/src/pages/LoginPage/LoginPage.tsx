import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, toFieldErrors } from '../../shared/validation';
import { useAuth } from '../../auth/auth-context';
import AuthShell from '../../components/AuthShell/AuthShell';
import { Button, ErrorBanner, Field, TextInput } from '../../components/ui';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { ROUTES } from '../../routes';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { from?: string } | null)?.from ?? ROUTES.dashboard;

  const [values, setValues] = useState({ email: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFields({});
    setBanner(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFields(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      navigate(returnTo, { replace: true });
    } catch (error) {
      setFields(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Track income and expenses across every device."
      footer={
        <>
          No account yet?{' '}
          <Link
            to={ROUTES.register}
            className="font-medium text-emerald-400 hover:text-emerald-300"
          >
            Create one
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
            onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fields.password}
          hint={
            <Link
              to={ROUTES.forgotPassword}
              className="text-slate-400 underline underline-offset-2 hover:text-slate-200"
            >
              Forgot password?
            </Link>
          }
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={values.password}
            onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
