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

### Registration

```jsonc
POST /auth/register
{ "name": "Ayesha Rahman", "email": "ayesha@example.com", "password": "…" }
```

1. Validate with `registerSchema` (`src/shared/validation`): name 2–80 chars,
   valid email, password 8–72 chars containing a letter **and** a number.
2. Normalise email to lower case.
3. If the email exists → `409 CONFLICT` (constant-ish time: always run a hash
   operation before comparing so timing does not leak existence).
4. Hash with **Argon2id** (`ARGON2_MEMORY_COST=65536`, `ARGON2_TIME_COST=3`)
   or bcrypt (cost 12) — never plain text, never reversible.
5. Create the user with `defaultCurrency`/`timezone` defaults.
6. Return the token pair so the user can use the app immediately.
   Email-verification delivery is deferred with the other out-of-band channels;
   `emailVerified` stays `false` until then.

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

```text
GET  /auth/google                  → redirect to Google (state + PKCE)
GET  /auth/google/callback?code&state → validate, then issue tokens
```

- `state` is a random, short-lived, single-use value stored in a cookie;
  mismatch → `CSRF_INVALID`.
- The server exchanges `code` for tokens and fetches the profile with Google's
  `id_token` (signature and `aud` verified).

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

- **Existing account + Google login** → the same `User` row is used.
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

| Cookie        | Flags                                                            |
| ------------- | ---------------------------------------------------------------- |
| `exp_refresh` | `HttpOnly`, `SameSite=Lax`, `Secure` (prod), `Path=/api/v1/auth` |
| `exp_csrf`    | readable by JS (double-submit), `SameSite=Lax`, `Secure` (prod)  |

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
