import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../lib/api';
import { ROUTES } from '../../routes';

/* ------------------------------------------------------------------ atoms */

/** Four-across grid — used by the report preview cards. */
const SECTION_GRID =
  'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]';

/** Three-across grid — keeps six feature cards balanced as 3 + 3 on desktop. */
const FEATURE_GRID =
  'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]';

const primaryCta =
  'inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
        {lede ? <p className="mt-4 leading-relaxed text-slate-400">{lede}</p> : null}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-emerald-400">
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- icons */

function ZapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function InsightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="M7 15v-4" />
      <path d="M12 17V7" />
      <path d="M17 17v-7" />
    </svg>
  );
}

function DevicesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <rect x="2" y="4" width="14" height="10" rx="1.5" />
      <path d="M6 18h6" />
      <rect x="16" y="9" width="6" height="11" rx="1.5" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M5 12.5a7 7 0 0 1 9.5-6.6" />
      <path d="M8.5 16a4.5 4.5 0 0 1 5.7-4.3" />
      <path d="M12 20h.01" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12 3l7 3v5c0 4.5-3 7.9-7 9-4-1.1-7-4.5-7-9V6l7-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* ------------------------------------------------------------- features */

const FEATURES = [
  {
    icon: <ZapIcon />,
    title: 'Fast transaction entry',
    body: 'Record an expense in seconds — amount, category, done. Built for the moment you pay, not for later.',
  },
  {
    icon: <InsightIcon />,
    title: 'Spending insights',
    body: 'Daily and monthly reports plus category breakdowns turn your activity into clear answers.',
  },
  {
    icon: <DevicesIcon />,
    title: 'Web + mobile',
    body: 'Start an entry on your phone and review reports on your laptop — one account, both worlds.',
  },
  {
    icon: <OfflineIcon />,
    title: 'Offline capability',
    body: 'No signal, no problem. The mobile app keeps recording locally so nothing is ever lost.',
  },
  {
    icon: <SyncIcon />,
    title: 'Automatic synchronization',
    body: 'As soon as you are back online, changes sync across devices — no exports, no manual merges.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Secure personal data',
    body: 'HTTP-only session cookies, hashed passwords, and a private per-user workspace.',
  },
] as const;

export function FeaturesSection() {
  return (
    <Section
      id="features"
      eyebrow="Benefits"
      title="Everything you need to stay on top of your money"
      lede="Clear, fast, and private — the essentials of personal finance without the spreadsheet."
    >
      <div className={FEATURE_GRID}>
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-slate-700"
          >
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <h3 className="mt-4 font-semibold text-white">{feature.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{feature.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------- how it works */

const STEPS = [
  {
    n: '01',
    title: 'Add',
    body: 'Log income or an expense the moment it happens — on the web or on your phone.',
  },
  {
    n: '02',
    title: 'Understand',
    body: 'Balances, trends, and category breakdowns show exactly where your money is going.',
  },
  {
    n: '03',
    title: 'Sync',
    body: 'Every device stays current automatically, whether you are online or catching up later.',
  },
] as const;

export function HowItWorksSection() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Three steps to better money habits"
      lede="No setup marathon: create an account, start logging, and let the numbers do the talking."
    >
      <div className={FEATURE_GRID}>
        {STEPS.map((step) => (
          <article
            key={step.n}
            className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-6"
          >
            <span className="text-sm font-semibold tabular-nums text-emerald-400">{step.n}</span>
            <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- mobile section */

export function MobileSection() {
  return (
    <Section
      eyebrow="Mobile"
      title="Built for real life, not just a good connection"
      lede="The Flutter mobile app keeps up with your day — underground, in flight, or anywhere the signal drops."
    >
      <div className="grid items-center gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <div>
          <ul className="space-y-4">
            {[
              {
                title: 'Record without internet',
                body: 'Expenses you add offline are saved on your device immediately — nothing waits on a connection.',
              },
              {
                title: 'Sync returns automatically',
                body: 'When connectivity comes back, your changes synchronize across web and mobile on their own.',
              },
              {
                title: 'Same account everywhere',
                body: 'Sign in with the same account you use on the web and pick up right where you left off.',
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            Android · Coming Soon
          </p>
        </div>

        <div
          role="img"
          aria-label="Preview of adding a transaction in the mobile app while offline"
          className="mx-auto w-full max-w-xs rounded-[2rem] border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/40"
        >
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950 px-4 py-5">
            <div className="flex items-center justify-between text-[0.65rem] text-slate-500">
              <span>9:41</span>
              <span>offline</span>
            </div>
            <p className="mt-4 font-semibold text-white">Add transaction</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-[0.65rem] text-slate-500">Title</p>
                <p className="text-sm text-slate-200">Groceries</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-[0.65rem] text-slate-500">Amount</p>
                <p className="text-sm tabular-nums text-slate-200">৳1,250.00</p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
                  Food
                </span>
                <span className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-500">
                  Transport
                </span>
              </div>
              <div className="rounded-lg bg-emerald-500 py-2 text-center text-sm font-semibold text-slate-950">
                Save
              </div>
              <p className="text-center text-[0.65rem] text-amber-300/90">
                Saved on device · syncs when you are back online
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- reports section */

function MiniBars({ values, accent }: { values: readonly number[]; accent: string }) {
  return (
    <div className="mt-4 flex h-24 items-end gap-1.5">
      {values.map((height, index) => (
        <span
          key={index}
          className={`flex-1 rounded-sm ${accent}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

const DAILY = [45, 70, 38, 82, 55, 64, 48] as const;
const MONTHLY = [52, 66, 44, 78, 60, 86] as const;

const BREAKDOWN = [
  { label: 'Food', share: 42, bar: 'bg-emerald-400' },
  { label: 'Transport', share: 18, bar: 'bg-sky-400' },
  { label: 'Bills', share: 24, bar: 'bg-amber-400' },
  { label: 'Other', share: 16, bar: 'bg-slate-500' },
] as const;

const PAIRS = [
  { income: 74, expense: 52 },
  { income: 74, expense: 66 },
  { income: 82, expense: 47 },
  { income: 78, expense: 71 },
] as const;

export function ReportsSection() {
  return (
    <Section
      eyebrow="Reports"
      title="The insights that actually change behaviour"
      lede="Not charts for the sake of charts — just the views that answer everyday money questions."
    >
      <div className={SECTION_GRID}>
        <figure className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <figcaption>
            <p className="text-sm font-semibold text-white">Daily spending</p>
            <p className="mt-1 text-sm text-slate-400">
              Spot your heaviest days before they become a habit.
            </p>
          </figcaption>
          <div role="img" aria-label="Bar chart of daily spending for the last week">
            <MiniBars values={DAILY} accent="bg-emerald-500/70" />
            <div className="mt-2 flex justify-between text-[0.65rem] text-slate-600">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <span key={index} className="flex-1 text-center">
                  {day}
                </span>
              ))}
            </div>
          </div>
        </figure>

        <figure className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <figcaption>
            <p className="text-sm font-semibold text-white">Monthly spending</p>
            <p className="mt-1 text-sm text-slate-400">
              Compare months at a glance — no spreadsheet required.
            </p>
          </figcaption>
          <div role="img" aria-label="Bar chart of spending across the last six months">
            <MiniBars values={MONTHLY} accent="bg-emerald-500/70" />
            <div className="mt-2 flex justify-between text-[0.65rem] text-slate-600">
              {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((month, index) => (
                <span key={index} className="flex-1 text-center">
                  {month}
                </span>
              ))}
            </div>
          </div>
        </figure>

        <figure className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <figcaption>
            <p className="text-sm font-semibold text-white">Category breakdown</p>
            <p className="mt-1 text-sm text-slate-400">
              See which category is quietly eating the month.
            </p>
          </figcaption>
          <div
            role="img"
            aria-label="Category breakdown: Food 42 percent, Bills 24 percent, Transport 18 percent, Other 16 percent"
          >
            <ul className="mt-4 space-y-3">
              {BREAKDOWN.map((row) => (
                <li key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-slate-400">{row.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <span
                      className={`block h-full rounded-full ${row.bar}`}
                      style={{ width: `${row.share}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right tabular-nums text-slate-500">
                    {row.share}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </figure>

        <figure className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <figcaption>
            <p className="text-sm font-semibold text-white">Income vs expense</p>
            <p className="mt-1 text-sm text-slate-400">
              Confirm every month ends ahead, not behind.
            </p>
          </figcaption>
          <div role="img" aria-label="Paired bars comparing income and expense for four months">
            <div className="mt-4 flex h-24 items-end gap-4">
              {PAIRS.map((pair, index) => (
                <div key={index} className="flex h-full flex-1 items-end gap-1">
                  <span
                    className="flex-1 rounded-sm bg-emerald-400"
                    style={{ height: `${pair.income}%` }}
                  />
                  <span
                    className="flex-1 rounded-sm bg-rose-400/80"
                    style={{ height: `${pair.expense}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden /> Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" aria-hidden /> Expense
              </span>
            </div>
          </div>
        </figure>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- pricing */

const FREE_FEATURES = [
  'Unlimited income & expense entries',
  'Web app plus mobile access',
  'Offline capture with automatic sync',
  'Daily, monthly and category reports',
  'Your data private to your account',
] as const;

export function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Start free. Upgrade later if you need more."
      lede="The core tracker is free for individual use. Paid plans will arrive when they are ready — never before."
    >
      <div className="mx-auto grid max-w-3xl gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
        <article className="flex flex-col rounded-2xl border border-emerald-500/40 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Free</h3>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              Available
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            $0
            <span className="text-base font-normal text-slate-500"> / forever</span>
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-300">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {feature}
              </li>
            ))}
          </ul>
          <Link to={ROUTES.register} className={`${primaryCta} mt-6 w-full`}>
            Start Tracking — Free
          </Link>
        </article>

        <article className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-300">Pro</h3>
            <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              Coming soon
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-500">
            —<span className="text-base font-normal text-slate-600"> / month</span>
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-400">
            {['Budgets and spending alerts', 'CSV / PDF export', 'Shared household budgets'].map(
              (feature) => (
                <li key={feature} className="flex gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                  {feature}
                </li>
              ),
            )}
          </ul>
          <button
            type="button"
            disabled
            className="mt-6 w-full cursor-not-allowed rounded-lg border border-slate-800 px-5 py-2.5 text-sm font-medium text-slate-500"
          >
            Coming soon
          </button>
        </article>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">
        No credit card required for the Free plan. Pro is not available yet — nothing to buy today.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------- FAQ */

const FAQS = [
  {
    q: 'Can I use it without an internet connection?',
    a: 'Yes. The mobile app stores what you enter on your device first, so you can keep recording expenses offline — on a flight, underground, or anywhere signal drops. The web app needs a connection to load, but nothing you have already entered is ever blocked by a flaky network.',
  },
  {
    q: 'How does automatic synchronization work?',
    a: 'Every change you make is queued and sent as soon as a connection is available. Your devices pull the same data, so a transaction added on your phone shows up on the web app without you doing anything — no exports, no manual imports.',
  },
  {
    q: 'Can I use it on both web and mobile?',
    a: 'Yes — one account works everywhere. Record an expense on your phone during the day, then review reports on your laptop in the evening. The Android app is coming to the Play Store soon.',
  },
  {
    q: 'Does it track income as well as expenses?',
    a: 'Both. You can log salary, freelance income, or any other earnings alongside expenses, and see income versus expense, balances, and category spending in the reports.',
  },
  {
    q: 'Is my data secure?',
    a: 'Your session lives in an HTTP-only cookie, passwords are hashed with Argon2, and every record belongs to your account only. Financial data is never shared publicly, and the dashboard only ever shows your own numbers.',
  },
] as const;

export function FaqSection() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Questions, answered"
      lede="The things people usually want to know before signing up."
    >
      <div className="max-w-3xl space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 open:border-slate-700"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- final CTA */

export function FinalCtaSection() {
  return (
    <section className="border-t border-slate-800/70 bg-slate-900/30">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Start tracking your money today.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Free to start, ready in under a minute, and your data stays yours.
        </p>
        <Link to={ROUTES.register} className={`${primaryCta} mt-8 px-6 py-3 text-base`}>
          Create account
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

const FOOTER_PRODUCT = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Status', to: ROUTES.status },
] as const;

const FOOTER_RESOURCES = [
  { label: 'FAQ', href: '#faq' },
  { label: 'API documentation', href: `${API_BASE_URL}/docs`, external: true },
  { label: 'Sign in', to: ROUTES.login },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        <div>
          <p className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden className="text-emerald-400">
              ৳
            </span>
            Expenditure Tracker
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">
            Personal income and expense tracking that works on web and mobile — online or off.
          </p>
        </div>

        <nav aria-label="Product">
          <p className="text-sm font-semibold text-slate-300">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            {FOOTER_PRODUCT.map((item) => (
              <li key={item.label}>
                {'href' in item ? (
                  <a href={item.href} className="transition hover:text-slate-300">
                    {item.label}
                  </a>
                ) : (
                  <Link to={item.to} className="transition hover:text-slate-300">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Resources">
          <p className="text-sm font-semibold text-slate-300">Resources</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            {FOOTER_RESOURCES.map((item) =>
              'href' in item ? (
                <li key={item.label}>
                  <a
                    href={item.href}
                    {...('external' in item ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="transition hover:text-slate-300"
                  >
                    {item.label}
                  </a>
                </li>
              ) : (
                <li key={item.label}>
                  <Link to={item.to} className="transition hover:text-slate-300">
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold text-slate-300">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li className="flex items-center gap-2">
              Privacy
              <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-slate-600">
                Soon
              </span>
            </li>
            <li className="flex items-center gap-2">
              Terms
              <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-slate-600">
                Soon
              </span>
            </li>
            <li>
              <Link to={ROUTES.status} className="transition hover:text-slate-300">
                Status
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800/70 px-6 py-5 text-center text-xs text-slate-600">
        © {year} Expenditure Tracker. All rights reserved.
      </div>
    </footer>
  );
}
