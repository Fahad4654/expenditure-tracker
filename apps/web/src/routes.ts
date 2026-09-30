/**
 * Route manifest — single source of truth for client-side paths.
 *
 * Mirrors the server's `API_ROUTES` idea: pages link via these constants so a
 * path can never drift between navigation calls and the `<Routes>` table.
 *
 * Phase 3 wires auth + protected routes for every entry below.
 */
export const ROUTES = {
  home: '/',

  // Auth
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  verifyEmail: '/verify-email',
  verifyPhone: '/verify-phone',

  // App (protected in Phase 3)
  dashboard: '/dashboard',
  transactions: '/transactions',
  transactionNew: '/transactions/new',
  transactionDetailPattern: '/transactions/:id',
  categories: '/categories',
  reports: '/reports',
  settings: '/settings',
  profile: '/profile',
} as const;

/** Build the URL for a single transaction detail page. */
export function transactionPath(id: string): string {
  return `/transactions/${encodeURIComponent(id)}`;
}
