import type { CurrencyCode, IsoDateTime, Timezone } from './common';
import type { AuthProvider } from './auth';

/**
 * Account role. Only `ADMIN` may reach the admin surfaces (all bug reports,
 * triage status changes); everything else stays scoped to the caller.
 */
export type UserRole = 'USER' | 'ADMIN';

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Only present immediately after OAuth linking flows; never re-fetched. */
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  role: UserRole;
  providers: AuthProvider[];
  defaultCurrency: CurrencyCode;
  timezone: Timezone;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface UpdateProfileInput {
  name?: string;
  defaultCurrency?: CurrencyCode;
  timezone?: Timezone;
}
