import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, toFieldErrors } from '../../shared/validation';
import { useAuth } from '../../auth/auth-context';
import AuthShell from '../../components/AuthShell';
import { Button, ErrorBanner, Field, TextInput } from '../../components/ui';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { ROUTES } from '../../routes';

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  function update(key: keyof typeof values) {
    return (event: { target: { value: string } }) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free, local-first and backed by a single API."
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

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
