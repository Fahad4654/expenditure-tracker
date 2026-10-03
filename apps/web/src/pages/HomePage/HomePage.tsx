import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FullPageLoading } from '../../components/ui';
import { useAuth } from '../../auth/auth-context';
import { healthState, useLiveHealth } from '../../lib/health';
import { ROUTES } from '../../routes';
import ProductPreview from './ProductPreview';
import {
  FaqSection,
  FeaturesSection,
  FinalCtaSection,
  HowItWorksSection,
  MobileSection,
  PricingSection,
  ReportsSection,
  SiteFooter,
} from './HomeSections';

const NAV_ANCHORS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

const TRUST_POINTS = ['Web + Mobile', 'Offline capable', 'Automatic sync', 'Secure'] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0 text-emerald-400"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Small `● All systems operational` pill linking to the dedicated /status page. */
function StatusPill({ state }: { state: 'loading' | 'up' | 'down' }) {
  const label =
    state === 'up'
      ? 'All systems operational'
      : state === 'down'
        ? 'Service disruption'
        : 'Checking status…';
  const dot =
    state === 'up' ? 'bg-emerald-400' : state === 'down' ? 'bg-rose-400' : 'bg-amber-400';
  return (
    <Link
      to={ROUTES.status}
      className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </Link>
  );
}

function LandingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
        <Link to={ROUTES.home} className="flex items-center gap-2 font-bold text-white text-base sm:text-lg">
          <span aria-hidden className="text-emerald-400">
            ৳
          </span>
          Expenditure Tracker
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm font-medium md:flex">
          {NAV_ANCHORS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-slate-400 transition hover:text-slate-100"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 text-sm md:flex">
          <Link
            to={ROUTES.login}
            className="rounded-xl px-3.5 py-2 font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            to={ROUTES.register}
            className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20"
          >
            Create account
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 md:hidden"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="border-b border-slate-800/80 bg-slate-950 px-4 py-4 md:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-3 font-medium text-sm">
            {NAV_ANCHORS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 pt-3 border-t border-slate-800/80">
            <Link
              to={ROUTES.login}
              onClick={() => setMenuOpen(false)}
              className="w-full text-center rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-200"
            >
              Sign in
            </Link>
            <Link
              to={ROUTES.register}
              onClick={() => setMenuOpen(false)}
              className="w-full text-center rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/20"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  const live = useLiveHealth();
  const state = healthState(live);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-14 text-center sm:pt-20">
      <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
        Know where your money goes — on every device
      </h1>
      <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-slate-400 sm:text-lg">
        Log income and expenses in seconds, understand your spending with clear reports, and keep
        everything synchronized across web and mobile — even when you are offline.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to={ROUTES.register}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          Start Tracking — Free
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-6 py-3 text-base font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          See How It Works
        </a>
      </div>

      <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
        {TRUST_POINTS.map((point) => (
          <li key={point} className="inline-flex items-center gap-1.5">
            <CheckIcon />
            {point}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex justify-center">
        <StatusPill state={state} />
      </div>
    </section>
  );
}

/**
 * Marketing landing page for signed-out visitors. An existing session is
 * sent straight to the dashboard, so this page never shows marketing to a
 * signed-in user.
 */
function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingNavbar />

      <main className="flex-1">
        <Hero />

        <div className="mt-14 sm:mt-16">
          <ProductPreview />
        </div>

        <FeaturesSection />
        <HowItWorksSection />
        <MobileSection />
        <ReportsSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <SiteFooter />
    </div>
  );
}

export default function HomePage() {
  const { status } = useAuth();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated') return <Navigate to={ROUTES.dashboard} replace />;
  return <LandingPage />;
}
