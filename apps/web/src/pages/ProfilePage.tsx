import { useState, type FormEvent } from 'react';
import type { UserProfile } from '../shared/types';
import { toFieldErrors, updateProfileSchema } from '../shared/validation';
import { useAuth } from '../auth/auth-context';
import { Button, Card, ErrorBanner, Field, PageHeader, Select, TextInput } from '../components/ui';
import { API_ROUTES, apiFetch } from '../lib/api';
import { bannerFor, indexByPath, parseFormError } from '../lib/errors';
import { formatInstant } from '../lib/format';

/** Curated so the control stays usable without shipping a full CLDR table. */
const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'PKR',
  'INR',
  'AED',
  'SAR',
  'TRY',
  'IDR',
  'BDT',
  'NGN',
  'EGP',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
] as const;

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Jakarta',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

function availableTimezones(): readonly string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?(key: string): string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return zones;
  } catch {
    /* older engines: fall through to the curated list */
  }
  return FALLBACK_TIMEZONES;
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [defaultCurrency, setDefaultCurrency] = useState(user?.defaultCurrency ?? 'USD');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const zones = availableTimezones();

  // The form seeds once from the session; a save writes both the response and
  // the context, so the two never drift. There is nothing external to sync.

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    setSuccess(null);

    const parsed = updateProfileSchema.safeParse({ name, defaultCurrency, timezone });
    if (!parsed.success) {
      setFieldErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const updated = await apiFetch<UserProfile>(API_ROUTES.users.me, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      // The context owns the cached profile the layout renders from.
      setUser(updated);
      setSuccess('Profile saved.');
    } catch (error) {
      setFieldErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader title="Settings" subtitle="Profile, locale and account details." />

      <ErrorBanner>{banner}</ErrorBanner>
      {success ? (
        <p className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          {success}
        </p>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">Profile</h2>
        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <Field label="Display name" htmlFor="profile-name" error={fieldErrors.name}>
              <TextInput
                id="profile-name"
                name="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Default currency"
            htmlFor="profile-currency"
            error={fieldErrors.defaultCurrency}
            hint="Used for new transactions and reports."
          >
            <Select
              id="profile-currency"
              name="defaultCurrency"
              value={defaultCurrency}
              onChange={(event) => setDefaultCurrency(event.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Timezone"
            htmlFor="profile-timezone"
            error={fieldErrors.timezone}
            hint="“Today” and “this month” are computed here."
          >
            <Select
              id="profile-timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {!zones.includes(timezone) ? <option value={timezone}>{timezone}</option> : null}
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-white">Account</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="mt-1 text-slate-200">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd className="mt-1 text-slate-200">{user.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sign-in methods</dt>
            <dd className="mt-1 text-slate-200">{user.providers.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="mt-1 text-slate-200">{formatInstant(user.createdAt)}</dd>
          </div>
        </dl>

        <p className="mt-5 rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-500">
          Email/phone verification, password reset, and OAuth sign-in are deferred until mail and
          SMS providers are configured — see <code>docs/authentication.md</code>.
        </p>
      </Card>
    </main>
  );
}
