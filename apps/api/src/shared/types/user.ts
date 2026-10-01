import type { CurrencyCode, IsoDateTime, Timezone } from './common';
import type { AuthProvider } from './auth';

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Only present immediately after OAuth linking flows; never re-fetched. */
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
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
