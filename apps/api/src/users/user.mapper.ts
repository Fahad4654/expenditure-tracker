import type { AuthProvider, UserProfile } from '../shared/types';

export interface UserRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  defaultCurrency: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Which identity methods this user can actually sign in with. */
export function providersOf(
  user: Pick<UserRecord, 'email' | 'phone' | 'googleId'>,
): AuthProvider[] {
  const providers: AuthProvider[] = [];
  if (user.email) providers.push('email');
  if (user.phone) providers.push('phone');
  if (user.googleId) providers.push('google');
  return providers;
}

export function toUserProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    providers: providersOf(user),
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
