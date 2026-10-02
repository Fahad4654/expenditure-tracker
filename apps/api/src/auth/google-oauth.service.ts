import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleIdentity } from './google-token.service';

/** How long a start→callback round trip may take before the state expires. */
export const GOOGLE_STATE_TTL_SECONDS = 600;

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const STATE_ISSUER = 'expenditure-tracker-auth';

/**
 * Server-side Google sign-in for the web client (OAuth 2.0 authorization code
 * flow). The browser only ever follows two redirects — out to Google and back
 * to `google/callback` — while the code exchange and identity lookup happen
 * here, so no Google or Firebase SDK ships to the browser.
 *
 * The signed `state` carries the destination the browser started from plus a
 * one-shot nonce that must also be present in an HttpOnly cookie, which binds
 * the callback to the tab that began the flow (CSRF) and lets us restore the
 * intended landing page without trusting the query string.
 *
 * The mobile app keeps its native sign-in and posts the resulting Firebase ID
 * token to `POST /auth/google` instead — that path verifies the token itself.
 */
@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);

  constructor(private readonly config: ConfigService) {}

  /** Both halves of the OAuth client must be present before we send anyone. */
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  newNonce(): string {
    return randomBytes(16).toString('hex');
  }

  async signState(nonce: string, dest: string): Promise<string> {
    return new SignJWT({ nonce, dest, purpose: 'google-oauth' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(STATE_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${GOOGLE_STATE_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  /** Verifies the signed state; `null` means tampered, expired or malformed. */
  async verifyState(state: string | undefined): Promise<{ nonce: string; dest: string } | null> {
    if (typeof state !== 'string' || state.length === 0) return null;
    try {
      const { payload } = await jwtVerify(state, this.secret, { issuer: STATE_ISSUER });
      if (payload.purpose !== 'google-oauth') return null;
      if (typeof payload.nonce !== 'string' || payload.nonce.length === 0) return null;
      if (typeof payload.dest !== 'string' || payload.dest.length === 0) return null;
      return { nonce: payload.nonce, dest: payload.dest };
    } catch {
      return null;
    }
  }

  /** Constant-time compare of the state nonce against its cookie twin. */
  stateNonceMatches(cookieNonce: string | undefined, stateNonce: string): boolean {
    if (!cookieNonce) return false;
    const fromCookie = Buffer.from(cookieNonce);
    const fromState = Buffer.from(stateNonce);
    return fromCookie.length === fromState.length && timingSafeEqual(fromCookie, fromState);
  }

  buildAuthorizeUrl(state: string, nonce: string): string {
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  /**
   * The page to come back to after the callback. Absolute URLs are accepted
   * only on allowed origins; relative paths are joined onto `PUBLIC_WEB_URL`;
   * anything else falls back to `/login`. Never forwards to a foreign host.
   */
  resolveRedirectTarget(raw: string | undefined): string {
    const fallback = `${this.publicWebUrl}/login`;
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        if (this.allowedOrigins.has(url.origin)) return url.toString();
      } catch {
        // Malformed URL — fall through to the fallback.
      }
      return fallback;
    }
    // Relative path: reject protocol-relative (`//evil`) and `/\evil` tricks.
    if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) {
      return `${this.publicWebUrl}${raw}`;
    }
    return fallback;
  }

  /** Appends the machine-readable outcome (`unavailable|denied|failed`) param. */
  withGoogleParam(target: string, value: string): string {
    const url = new URL(target);
    url.searchParams.set('google', value);
    return url.toString();
  }

  /**
   * Trades the authorization code for tokens, then reads the identity from
   * Google's userinfo endpoint. Returns `null` on any failure (bad code,
   * unverified email, network trouble) — the caller decides how to report it.
   */
  async exchange(code: string): Promise<GoogleIdentity | null> {
    try {
      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenResponse.ok) {
        this.logger.warn(`Google token exchange failed (HTTP ${tokenResponse.status})`);
        return null;
      }
      const tokens = (await tokenResponse.json()) as { access_token?: string };
      if (!tokens.access_token) {
        this.logger.warn('Google token exchange returned no access token');
        return null;
      }

      const infoResponse = await fetch(USERINFO_ENDPOINT, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (!infoResponse.ok) {
        this.logger.warn(`Google userinfo request failed (HTTP ${infoResponse.status})`);
        return null;
      }
      const info = (await infoResponse.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      if (!info.sub || !info.email) {
        this.logger.warn('Google identity is missing subject or email');
        return null;
      }
      if (info.email_verified !== true) {
        this.logger.warn('Google identity has an unverified email — refusing to link accounts');
        return null;
      }
      return {
        sub: info.sub,
        email: info.email.toLowerCase(),
        emailVerified: true,
        name: info.name ?? null,
        picture: info.picture ?? null,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Google OAuth exchange errored: ${message}`);
      return null;
    }
  }

  // Config reads stay lazy so tests can flip values between requests.

  private get clientId(): string {
    return this.config.get<string>('google.clientId') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('google.clientSecret') ?? '';
  }

  private get callbackUrl(): string {
    return this.config.get<string>('google.callbackUrl') ?? '';
  }

  private get secret(): Uint8Array {
    return new TextEncoder().encode(this.config.get<string>('jwt.accessSecret') ?? '');
  }

  private get publicWebUrl(): string {
    return (this.config.get<string>('app.publicWebUrl') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  private get allowedOrigins(): Set<string> {
    const corsOrigins = this.config.get<string[]>('app.corsOrigins') ?? [];
    return new Set([...corsOrigins, this.publicWebUrl].filter((origin) => origin.length > 0));
  }
}
