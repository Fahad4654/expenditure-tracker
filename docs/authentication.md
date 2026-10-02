# Authentication

Three sign-in methods, one identity table. Every path converges on the same
`User` row and the same token pair.

| Method           | Entry                                    | Verified field              |
| ---------------- | ---------------------------------------- | --------------------------- |
| Email + password | `/auth/register`, `/auth/login`          | `email` (+ `emailVerified`) |
| Phone + OTP      | `/auth/send-otp`, `/auth/verify-otp`     | `phone` (+ `phoneVerified`) |
| Google           | `/auth/google` → `/auth/google/callback` | `googleId` / `email`        |

> **Status:** email + password is implemented (Phase 2). Phone + OTP, Google
> OAuth and password reset are designed here but not yet implemented — they
> need an SMS provider, OAuth credentials and email delivery respectively.
> This document is the contract the implementation must satisfy.

---

## 1. Email + password

### Email OTP (registration & password reset)

```jsonc
POST /auth/otp/send
{ "email": "ayesha@example.com", "purpose": "REGISTER" }   // or PASSWORD_RESET
→ { "email", "expiresAt", "resendAfterSeconds", "devCode"? }
```

1. 6-digit code, Argon2-hashed at rest (`OtpCode` row), TTL 10 minutes,
   max 5 attempts, resend cooldown 60 seconds (`429 RATE_LIMITED`); a resend
   deletes the previous unconsumed code for that email + purpose.
2. Delivery is SMTP via `MailerService`. While `MAIL_SEND=false` **and**
   `NODE_ENV != production` the response carries `devCode` so local flows can
   complete without a mail server; production never emits it.
3. Verification (`OtpService.consumeEmailOtp`) runs inside the caller's
   transaction: newest unconsumed code only → expired → attempt budget →
   Argon2 compare → consume. Codes are single-use.

### Registration

```jsonc
POST /auth/register
{ "name": "Ayesha Rahman", "email": "ayesha@example.com", "password": "…", "code": "483920" }
```

1. Validate with `registerSchema` (`src/shared/validation`): name 2–80 chars,
   valid email, password 8–72 chars containing a letter **and** a number,
   6-digit `code`.
2. Normalise email to lower case.
3. If the email exists → `409 CONFLICT` (constant-ish time: always run a hash
   operation before comparing so timing does not leak existence).
4. Hash with **Argon2id** (`ARGON2_MEMORY_COST=65536`, `ARGON2_TIME_COST=3`)
   or bcrypt (cost 12) — never plain text, never reversible.
5. In one transaction: consume the REGISTER OTP, then create the user with
   `defaultCurrency`/`timezone` defaults and `emailVerified=true` (the code
   *is* the verification; a failed insert rolls the consume back).
6. Return the token pair so the user can use the app immediately.

### Password reset

```jsonc
POST /auth/forgot-password
{ "email": "ayesha@example.com" }
→ { "email", "expiresAt", "resendAfterSeconds", "devCode"? }   // same shape for unknown emails

POST /auth/reset-password
{ "email": "ayesha@example.com", "code": "483920", "password": "…" }
→ session (200)
```

- `forgot-password` is enumeration-safe: unknown emails get the same challenge
  shape with no side effects.
- `reset-password` consumes the OTP, stores the new Argon2 hash, clears the
  lockout counters, **revokes every refresh token the user owns**, then issues
  a fresh session.

### Login

```jsonc
POST /auth/login
{ "email": "ayesha@example.com", "password": "…" }
```

1. Look up by email. **Never** reveal whether the email or the password was
   wrong — same error (`INVALID_CREDENTIALS`), same shape, comparable timing.
2. Increment `failedLogins`; on `>= MAX` set `lockedUntil` →
   `ACCOUNT_LOCKED` (429).
3. Verify the Argon2 hash with `argon2.verify`.
4. On success: reset `failedLogins`, set `lastLoginAt`, issue tokens.

Passwords are never logged, never returned, never included in error details.

---

## 2. Phone + OTP

```jsonc
POST /auth/send-otp   { "phone": "+8801712345678" }
POST /auth/verify-otp { "phone": "+8801712345678", "code": "493820" }
```

### Generation

- `OTP_LENGTH` (default 6) digits from `crypto.randomInt` — a CSPRNG, never
  `Math.random()`.
- Stored as an **Argon2 hash** in `OtpCode.codeHash`. The raw code exists only
  in the SMS payload.
- `expiresAt = now + OTP_TTL_SECONDS` (default 300 s).

### Verification rules

| Control                     | Default | Behaviour                                 |
| --------------------------- | ------- | ----------------------------------------- |
| Expiry                      | 300 s   | `OTP_EXPIRED`                             |
| Max attempts per code       | 5       | `OTP_TOO_MANY_ATTEMPTS`; code invalidated |
| Resend cooldown             | 60 s    | `RATE_LIMITED`                            |
| Requests per phone per hour | 5       | `RATE_LIMITED`                            |

Each failed verification increments `attempts`; at `maxAttempts` the row is
marked consumed. Successful verification sets `consumedAt` (single-use) and, for
an existing user, `phoneVerified = true`.

A new `send-otp` invalidates any previous unconsumed code for that phone.

### Logging

Raw OTP values **never** appear in logs. In development, `OTP_DEBUG_LOG=true`
may print the code; it is hard-disabled whenever `NODE_ENV=production`.

---

## 3. Google sign-in

Two clients, one account model:

- **Web** — server-side OAuth (authorization code flow). The browser only
  follows redirects; no Google or Firebase SDK ships to the client.
- **Mobile (Flutter)** — native Firebase sign-in; the app sends the resulting
  **ID token** to the API:

```text
POST /auth/google  { "idToken": "<Firebase ID token>" }  → session (200)
```

- `GoogleTokenService` verifies the token against Google's public JWKS
  (`securetoken@system.gserviceaccount.com`), pinned to
  `FIREBASE_PROJECT_ID` for both `iss` and `aud` — no service-account key is
  needed server-side (`FIREBASE_JWKS_URL` is overridable for tests).
- Missing/invalid/expired signature → `401 UNAUTHORIZED`.

### Web flow (server-side code flow)

```text
GET /auth/google?redirect=/login
  ├── missing GOOGLE_CLIENT_ID/SECRET ─▶ 302 …/login?google=unavailable
  └── configured ─▶ HttpOnly state cookie + 302 to the Google consent screen
        └── GET /auth/google/callback?code&state
              ├── bad state / missing state cookie ─▶ 302 ?google=failed
              ├── error=access_denied (cancelled)  ─▶ 302 ?google=denied
              ├── code exchange + userinfo lookup
              │    └── sub + verified email ─▶ link/create (flow below)
              │        + refresh/CSRF cookies + 302 back to `redirect`
              └── exchange failure ─▶ 302 ?google=failed (logged server-side)
```

- The `state` is a signed JWT (HS256 with `JWT_ACCESS_SECRET`, 10-minute TTL)
  carrying the destination plus a one-shot nonce. The nonce must also be
  present in an HttpOnly cookie scoped to `/api/v1/auth/google` — that binds
  the callback to the tab which started it (CSRF) and makes `redirect`
  trustworthy without trusting the query string.
- `redirect` accepts only same-origin paths or absolute URLs on
  `PUBLIC_WEB_URL` / `CORS_ORIGINS`; anything else falls back to `/login`.
- Needs a Google Cloud **OAuth 2.0 client** whose authorized redirect URI
  equals `GOOGLE_CALLBACK_URL` (see deployment.md).

### Account resolution (no duplicate users ever)

```text
google.sub known?
├── yes ──────────────────────────────▶ sign in that user
└── no
    └── Google email verified?
        ├── yes
        │   ├── user with that email exists?
        │   │   ├── yes, no other googleId ─▶ LINK: set googleId
        │   │   ├── yes, different googleId ─▶ CONFLICT (409) — require an
        │   │   │                                explicit re-auth to unlink
        │   │   └── no ──────────────────────▶ CREATE user (emailVerified=true)
        │   └── (email not verified → create with a fresh, unverified email)
        └── no ───────────────────────────────▶ CREATE user, email unverified
```

Guarantees:

- **Existing account + Google login** → the same `User` row is used; an
  existing email+password row gains `googleId` on first Google login (linked,
  never duplicated).
- **Repeat Google logins** → matched on `googleId` (unique), so always the same row.
- **Email conflicts** → never silently overwrite or merge; `409 CONFLICT`.
- **No duplicate users** → `googleId` and `email` are both `UNIQUE`.

---

## 4. Token model

| Token         | Lifetime                  | Transport                                        | Storage                                                    |
| ------------- | ------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Access JWT    | `JWT_ACCESS_TTL` (15 min) | `Authorization: Bearer`                          | Web: memory + localStorage; Mobile: flutter_secure_storage |
| Refresh token | `JWT_REFRESH_TTL` (30 d)  | HTTP-only cookie (web) / secure storage (mobile) | Hashed server-side                                         |

### Access token claims

```jsonc
{
  "sub": "<user uuid>",
  "typ": "access",
  "iss": "expenditure-tracker",
  "aud": "expenditure-tracker-clients",
  "fid": "<refresh token family id>",
  "iat": 0,
  "exp": 0,
}
```

`sub` is the **only** source of the acting user id. No request may supply a
user id in a body or query for authorization purposes.

### Refresh rotation

```text
login ─▶ family fid, rotation 0
refresh ─▶ revoke old, issue rotation 1
refresh ─▶ revoke old, issue rotation 2
...
reuse of an already-rotated token ─▶ REVOKE THE WHOLE FAMILY + 401
```

- Tokens are stored as **SHA-256 hashes** (`RefreshToken.tokenHash`, unique).
- `familyId` groups rotations; `rotationIndex` orders them.
- Reuse of a consumed token is the signal that a token leaked → every token in
  that family is revoked and the user must log in again.

### Cookie / CSRF (web)

| Cookie        | Flags                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `exp_refresh` | `HttpOnly`, `SameSite=Lax`, `Secure` (prod), `Path=/api/v1/auth`                                                         |
| `exp_csrf`    | readable by JS (double-submit), `SameSite=Lax`, `Secure` (prod), `Path=/` (any page must read it to echo `X-CSRF-Token`) |

Mutating cookie-based endpoints (`/auth/refresh`, `/auth/logout`) require the
`X-CSRF-Token` header to equal the `exp_csrf` cookie → `CSRF_INVALID` otherwise.
Bearer-token requests are not CSRF-exposed (a cross-site form cannot set an
`Authorization` header).

### Logout

Revokes the refresh token **family** (`revokedAt`), clears cookies, and
returns `200 { "ok": true, "data": null }`. Access tokens remain
cryptographically valid until they expire (≤15 min) — short-lived access
tokens make server-side access-token denylists unnecessary. Logout is
idempotent: a missing or already-revoked token still succeeds.

---

## 5. Authorization & data ownership

- Every transaction/category/sync query includes `where: { userId: <jwt sub> }`.
- `GET /transactions/:id` of another user returns **404**, not 403 — existence
  itself is not disclosed.
- Category mutations reject `isSystem` categories.
- Sync operations are scoped by `userId`; an `operationId` is unique **per
  user**, so one user's replay cannot collide with another's.

---

## 6. Security checklist

- [x] Argon2id password hashing — no plaintext, ever
- [x] Short-lived access tokens (15 min)
- [x] Refresh token rotation + family revocation
- [x] Refresh tokens stored hashed; raw values never logged
- [x] HTTP-only cookies for web refresh tokens
- [x] Double-submit CSRF token on cookie-authenticated mutations
- [x] CORS allow-list (`CORS_ORIGINS`), credentials enabled, no `*`
- [x] Helmet security headers
- [x] Request body size limit (`MAX_REQUEST_BODY_SIZE`)
- [ ] Per-IP rate limits — not implemented yet (Phase 6)
- [x] Login lockout after repeated failures
- [ ] OTP expiry, attempt cap, resend cooldown, per-hour quota (blocked on an
      SMS provider)
- [x] DTO validation (Zod shared with the client)
- [x] Login lockout thresholds configurable (`LOGIN_MAX_FAILED_ATTEMPTS`,
      `LOGIN_LOCKOUT_SECONDS`)
- [x] SQL injection impossible by construction (Prisma parameterised queries)
- [x] No passwords/OTP/refresh tokens in logs or API responses
- [x] Stack traces never returned to clients
