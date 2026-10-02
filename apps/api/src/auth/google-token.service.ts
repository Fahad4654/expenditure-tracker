import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { errors } from '../common/http/api-error';

export interface GoogleIdentity {
  /** Firebase `sub` — stable across providers, stored as `User.googleId`. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Verifies Google sign-in ID tokens issued by Firebase Authentication.
 *
 * Tokens are signed by `securetoken@system.gserviceaccount.com`; the JWKS is
 * fetched from Google's public endpoint (overridable for tests via
 * `FIREBASE_JWKS_URL`), so no service-account key is required server-side.
 * `FIREBASE_PROJECT_ID` pins both `aud` and `iss`.
 */
@Injectable()
export class GoogleTokenService {
  private readonly projectId: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService) {
    this.projectId = config.get<string>('firebase.projectId') ?? '';
    const jwksUrl = config.get<string>('firebase.jwksUrl');
    this.jwks = createRemoteJWKSet(new URL(jwksUrl!), {
      cooldownDuration: 5 * 60_000,
      cacheMaxAge: 60 * 60_000,
    });
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
      });
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
      if (!payload.sub || !email) {
        throw errors.unauthorized('Google token is missing subject or email');
      }
      return {
        sub: payload.sub,
        email,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name : null,
        picture: typeof payload.picture === 'string' ? payload.picture : null,
      };
    } catch (caught) {
      if (caught instanceof Error && 'getStatus' in caught) throw caught; // HttpException
      throw errors.unauthorized('Google ID token is invalid or expired');
    }
  }
}
