/**
 * REST route map. Keeping every path in one place prevents the web client and
 * the NestJS controllers from drifting apart.
 */
export const API_PREFIX = '/api/v1';

export const API_ROUTES = {
  auth: {
    register: `${API_PREFIX}/auth/register`,
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    refresh: `${API_PREFIX}/auth/refresh`,
    me: `${API_PREFIX}/auth/me`,
    sendOtp: `${API_PREFIX}/auth/send-otp`,
    otpSend: `${API_PREFIX}/auth/otp/send`,
    verifyOtp: `${API_PREFIX}/auth/verify-otp`,
    forgotPassword: `${API_PREFIX}/auth/forgot-password`,
    resetPassword: `${API_PREFIX}/auth/reset-password`,
    google: `${API_PREFIX}/auth/google`,
    googleCallback: `${API_PREFIX}/auth/google/callback`,
  },
  users: {
    me: `${API_PREFIX}/users/me`,
  },
  transactions: {
    base: `${API_PREFIX}/transactions`,
    byId: (id: string) => `${API_PREFIX}/transactions/${id}`,
  },
  categories: {
    base: `${API_PREFIX}/categories`,
    byId: (id: string) => `${API_PREFIX}/categories/${id}`,
  },
  notes: {
    base: `${API_PREFIX}/notes`,
    byId: (id: string) => `${API_PREFIX}/notes/${id}`,
  },
  reminders: {
    base: `${API_PREFIX}/reminders`,
    byId: (id: string) => `${API_PREFIX}/reminders/${id}`,
  },
  bugReports: {
    base: `${API_PREFIX}/bug-reports`,
    byId: (id: string) => `${API_PREFIX}/bug-reports/${id}`,
  },
  reports: {
    summary: `${API_PREFIX}/reports/summary`,
    daily: `${API_PREFIX}/reports/daily`,
    monthly: `${API_PREFIX}/reports/monthly`,
    categories: `${API_PREFIX}/reports/categories`,
  },
  sync: {
    push: `${API_PREFIX}/sync`,
    changes: `${API_PREFIX}/sync/changes`,
  },
  health: {
    base: `${API_PREFIX}/health`,
    live: `${API_PREFIX}/health/live`,
    ready: `${API_PREFIX}/health/ready`,
  },
} as const;

/** Cookie names shared by API (writer) and web (reader). */
export const COOKIE_NAMES = {
  accessToken: 'exp_access',
  refreshToken: 'exp_refresh',
  csrfToken: 'exp_csrf',
} as const;

/** Browser storage keys used by the web PWA. */
export const STORAGE_KEYS = {
  accessToken: 'exp.access_token',
  refreshToken: 'exp.refresh_token',
  user: 'exp.user',
} as const;
