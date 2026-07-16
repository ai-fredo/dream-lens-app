# DreamLens Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DreamLens deployable and App-Store-submittable: a production runtime + deploy artifacts for the API, Apple Sign-In token revocation on account deletion (Apple requirement since June 2023), mobile crash reporting with dream-content redaction, and EAS build configuration with a launch checklist.

**Architecture:** The API gains a `tsx`-based production start (no compile step — mirrors how dev/tests already run TS source across the `@dreamlens/shared` workspace boundary) plus a workspace-aware Dockerfile and provider docs. Apple revocation follows the standard capture-then-revoke pattern: the mobile app POSTs the short-lived `authorizationCode` it receives at sign-in to a new authed endpoint; the API exchanges it at `appleid.apple.com/auth/token` for a long-lived `refresh_token`, stores it in a service-role-only table, and revokes it at `appleid.apple.com/auth/revoke` during account deletion. Mobile Sentry mirrors the API's existing env-gated, content-scrubbing setup.

**Tech Stack:** Express 5 + TypeScript (strict), tsx runtime, jsonwebtoken (ES256 Apple client secret), Supabase, Expo / React Native, @sentry/react-native, EAS.

## Global Constraints

- **No dream content in any log or telemetry, ever.** Transcripts, interpretations, notes — never logged, never sent to Sentry. Redaction must strip keys: `transcript`, `rawTranscript`, `editedTranscript`, `interpretation`, `notes`, `summary`.
- **Secrets only via env.** Never hardcode keys. Service-role key and Apple private key exist only server-side; nothing secret in the mobile bundle (`EXPO_PUBLIC_*` vars are public by definition — only the publishable anon key and DSN-style values belong there).
- **TypeScript strict** everywhere, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (use conditional spreads for optional keys, e.g. `...(x !== undefined ? { x } : {})`).
- **All commands from repo root** using npm workspaces: `npm test --workspace apps/api`, `npm run typecheck --workspace apps/mobile`, etc. ONE root `package-lock.json`.
- **API error envelope**: `{ success: false, error: { code, message } }`; mobile unwraps only in `api.ts` `request<T>`.
- **Mobile UI uses design tokens only** — no hex literals outside `src/design/` (a jest guard test enforces this).
- **Do not touch the Claude model id** (`claude-sonnet-4-6`) or any interpretation logic.
- **Never put real credentials in committed files.** Docs use placeholders like `<your-team-id>`.
- Apple endpoints: token exchange `https://appleid.apple.com/auth/token`, revocation `https://appleid.apple.com/auth/revoke`. Client secret is an ES256 JWT: header `{ alg: "ES256", kid: APPLE_KEY_ID }`, payload `{ iss: APPLE_TEAM_ID, iat, exp (≤15 min), aud: "https://appleid.apple.com", sub: APPLE_BUNDLE_ID }`.
- Apple env vars (all four required to enable the feature; absence = graceful no-op): `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PEM, `\n`-escaped), `APPLE_BUNDLE_ID` (`com.dreamlens.app`).

---

### Task 1: API production runtime + deploy artifacts

**Files:**
- Modify: `apps/api/package.json` (add `start` script + `tsx` dependency)
- Create: `Dockerfile` (repo root)
- Create: `.dockerignore` (repo root)
- Create: `render.yaml` (repo root)
- Create: `docs/deploy.md`
- Modify: `.env.example` (add SENTRY_DSN + APPLE_* placeholders if not present)

**Interfaces:**
- Produces: `npm start --workspace apps/api` boots the API from TS source in production; `docker build .` produces a runnable image; later tasks' env vars (`APPLE_*`) are documented in `docs/deploy.md`'s env table.

- [ ] **Step 1: Add tsx runtime + start script**

In `apps/api/package.json`, add to `"dependencies"`: `"tsx": "^4.19.2"` and to `"scripts"`: `"start": "tsx src/index.ts"`. Run `npm install` at repo root (updates the single root lockfile).

- [ ] **Step 2: Verify boot locally**

Run from repo root (loads live env without echoing values):
```bash
set -a; source .env; set +a
npm start --workspace apps/api &
sleep 3
curl -s http://localhost:3000/health
kill %1
```
Expected: `{"success":true,...}` (health envelope) — confirm HTTP 200.

- [ ] **Step 3: Write Dockerfile + .dockerignore**

`Dockerfile` (repo root — workspace-aware; runs TS source under tsx, so `packages/shared` needs no build):
```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install with the root lockfile; only manifests first for layer caching.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false

# App source (mobile app and tests are excluded via .dockerignore).
COPY apps/api apps/api
COPY packages/shared packages/shared

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start", "--workspace", "apps/api"]
```

`.dockerignore`:
```
node_modules
**/node_modules
apps/mobile
supabase
docs
.git
.github
.env
.env.*
coverage
**/__tests__
**/*.test.ts
.superpowers
.claude
*.md
```

Note: Docker is not installed on this machine — the image cannot be built locally. Keep the Dockerfile to the exact shape above (it is the standard npm-workspaces pattern); Render/Railway will build it. `npm ci --omit=dev --workspace apps/api` must be verified locally in a temp dir if in doubt about flag support.

- [ ] **Step 4: Write render.yaml**

```yaml
services:
  - type: web
    name: dreamlens-api
    runtime: docker
    plan: starter
    healthCheckPath: /health
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: CORS_ALLOWLIST
        sync: false
      - key: SENTRY_DSN
        sync: false
      - key: APPLE_TEAM_ID
        sync: false
      - key: APPLE_KEY_ID
        sync: false
      - key: APPLE_PRIVATE_KEY
        sync: false
      - key: APPLE_BUNDLE_ID
        value: com.dreamlens.app
      - key: LOG_LEVEL
        value: info
```

- [ ] **Step 5: Write docs/deploy.md**

Sections: (1) What gets deployed (the API only — Supabase is already live; mobile ships via EAS). (2) Env var table: every var above with one-line description and where to get it; note `PORT` is injected by the platform and `CORS_ALLOWLIST` only matters for browser origins (native apps send no Origin header) — set it to the landing-page origin(s), comma-separated, when a web client exists. (3) Render path: "Blueprint → connect repo → render.yaml is picked up → fill env vars → deploy", health check is `/health`. (4) Railway path: "New project → Deploy from GitHub repo → Railway auto-detects the Dockerfile → set env vars → generate domain". (5) Post-deploy smoke: `curl https://<host>/health`, then a `POST /v1/demo/interpret` example (no auth needed). (6) Reminder: set `EXPO_PUBLIC_API_URL` in the mobile build env to the deployed URL.

- [ ] **Step 6: Update .env.example**

Append (with comments): `SENTRY_DSN=` (optional, API crash reporting), `APPLE_TEAM_ID=`, `APPLE_KEY_ID=`, `APPLE_PRIVATE_KEY=`, `APPLE_BUNDLE_ID=com.dreamlens.app` (optional; enables Apple token revocation on account deletion — all four required).

- [ ] **Step 7: Run API suite + typecheck, commit**

```bash
npm test --workspace apps/api && npm run typecheck --workspace apps/api
git add -A && git commit -m "feat(api): production start script, Dockerfile, render.yaml, deploy docs"
```

---

### Task 2: Apple token exchange + revocation (API)

**Files:**
- Create: `supabase/migrations/20260709090000_apple_credentials.sql`
- Create: `apps/api/src/services/appleAuth.ts`
- Create: `apps/api/src/routes/appleAuth.ts`
- Modify: `apps/api/src/routes/account.ts` (revoke during deletion; fix stale NOTE comment)
- Modify: `apps/api/src/app.ts` (mount new router, extend AccountDeps wiring)
- Modify: `apps/api/package.json` (add `jsonwebtoken` + `@types/jsonwebtoken`)
- Test: `apps/api/__tests__/integration/appleAuth.test.ts`, extend `apps/api/__tests__/integration/account.test.ts`
- Modify: `apps/api/__tests__/helpers/fakeSupabase.ts` (support `apple_credentials` table)

**Interfaces:**
- Consumes: `makeRequireAuth`, `generalLimiter`, `DreamLensError`, fakeSupabase helper patterns, lazy-proxy prod-deps pattern from `app.ts`.
- Produces: `POST /v1/auth/apple/authorization` (authed) — body `{ authorizationCode: string }`, responds `{ success: true, data: { stored: boolean } }` (`stored: false` when Apple env is not configured). Service functions: `isAppleConfigured(): boolean`, `makeAppleClientSecret(): string`, `exchangeAuthorizationCode(code: string, fetchImpl?: typeof fetch): Promise<string>` (returns refresh_token), `revokeAppleToken(refreshToken: string, fetchImpl?: typeof fetch): Promise<void>`. Task 3's mobile client calls the endpoint.

- [ ] **Step 1: Migration**

`supabase/migrations/20260709090000_apple_credentials.sql`:
```sql
-- Apple Sign-In refresh tokens, captured at sign-in so account deletion can
-- revoke them (Apple App Store requirement since June 2023). RLS is enabled
-- with NO policies on purpose: only the service-role client may read or
-- write this table — the token must never be visible to the user's own
-- RLS-scoped client. user_profiles is user-readable, hence a separate table.
CREATE TABLE apple_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE apple_credentials ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Write failing tests for the service**

`apps/api/__tests__/integration/appleAuth.test.ts` — service-level cases (set/unset `APPLE_*` env per test with save/restore in beforeEach/afterEach):
- `isAppleConfigured()` false when any of the four vars is missing; true when all set.
- `makeAppleClientSecret()` returns a JWT whose decoded header has `alg: 'ES256'`, `kid: APPLE_KEY_ID` and payload has `iss`, `sub`, `aud: 'https://appleid.apple.com'`, `exp` within 15 min. Generate a throwaway EC P-256 key in the test via `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })` and export PEM into env (escape newlines as `\\n` to also cover the unescaping path).
- `exchangeAuthorizationCode('code', fakeFetch)` posts form-encoded `grant_type=authorization_code`, `code`, `client_id`, `client_secret` to the token URL and returns `refresh_token` from the JSON body; throws `DreamLensError('APPLE_EXCHANGE_FAILED', ...)` on non-200.
- `revokeAppleToken('rt', fakeFetch)` posts form-encoded `token=rt`, `token_type_hint=refresh_token`, `client_id`, `client_secret` to the revoke URL; throws on non-200.

Run: `npm test --workspace apps/api -- appleAuth` — expected: FAIL (module not found).

- [ ] **Step 3: Implement the service**

`apps/api/src/services/appleAuth.ts`:
```typescript
// apps/api/src/services/appleAuth.ts
import jwt from 'jsonwebtoken';
import { DreamLensError } from '@dreamlens/shared/types/errors';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** All four Apple env vars present → revocation feature is enabled. */
export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY &&
      process.env.APPLE_BUNDLE_ID
  );
}

/**
 * Apple client secret: an ES256 JWT signed with the "Sign in with Apple" key
 * from the developer portal. Short-lived — minted per request (Apple allows
 * up to 6 months; we never need more than one call's lifetime).
 */
export function makeAppleClientSecret(): string {
  const privateKey = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: process.env.APPLE_KEY_ID,
    issuer: process.env.APPLE_TEAM_ID,
    subject: process.env.APPLE_BUNDLE_ID,
    audience: 'https://appleid.apple.com',
    expiresIn: '15m',
  });
}

/** Exchange the sign-in authorizationCode for Apple's long-lived refresh_token. */
export async function exchangeAuthorizationCode(
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.APPLE_BUNDLE_ID ?? '',
      client_secret: makeAppleClientSecret(),
    }).toString(),
  });
  if (!res.ok) {
    // Never log the code or response body — treat everything Apple-side as opaque.
    throw new DreamLensError('APPLE_EXCHANGE_FAILED', 'Apple token exchange failed');
  }
  const body = (await res.json()) as { refresh_token?: string };
  if (!body.refresh_token) {
    throw new DreamLensError('APPLE_EXCHANGE_FAILED', 'Apple token exchange returned no refresh token');
  }
  return body.refresh_token;
}

/** Revoke a stored refresh token (called during account deletion). */
export async function revokeAppleToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: process.env.APPLE_BUNDLE_ID ?? '',
      client_secret: makeAppleClientSecret(),
    }).toString(),
  });
  if (!res.ok) {
    throw new DreamLensError('APPLE_REVOKE_FAILED', 'Apple token revocation failed');
  }
}
```

If `DreamLensError`'s code union does not include `APPLE_EXCHANGE_FAILED` / `APPLE_REVOKE_FAILED`, extend the union in `packages/shared/types/errors.ts` (additive only). Check how existing codes map to HTTP status in the error handler — if codes carry a status, use 502 for both.

- [ ] **Step 4: Run service tests**

`npm test --workspace apps/api -- appleAuth` — expected: PASS.

- [ ] **Step 5: Write failing route + deletion tests**

Route cases (supertest against `makeApp` with injected deps, following the existing integration-test pattern):
- `POST /v1/auth/apple/authorization` without bearer → 401 envelope.
- With auth, Apple env NOT configured → 200 `{ success: true, data: { stored: false } }`, and no fetch call was made.
- With auth + configured env + fakeFetch returning `{ refresh_token: 'rt_abc' }` → 200 `{ stored: true }` and fakeSupabase `apple_credentials` contains a row for the user (upsert semantics: second call replaces the token).
- With auth + configured env + fakeFetch returning 400 → 502 envelope with code `APPLE_EXCHANGE_FAILED`.
- Zod: missing/empty `authorizationCode` → 400 `VALIDATION_ERROR`.

Deletion cases (extend `account.test.ts`):
- Configured + stored token → DELETE /v1/account calls the revoke URL with the stored token, then deletes tables + auth user as before → 200.
- Configured + revoke fetch fails → deletion STILL succeeds (200); revocation is best-effort (a dead Apple endpoint must not make accounts undeletable).
- No stored token → no revoke call, deletion proceeds.

Run: expected FAIL.

- [ ] **Step 6: Implement route + deletion wiring**

`apps/api/src/routes/appleAuth.ts` — `makeAppleAuthRouter(deps: AppleAuthDeps)` where `AppleAuthDeps = { authClient: SupabaseClient; adminClient: SupabaseClient; fetchImpl?: typeof fetch }`. Zod schema `{ authorizationCode: z.string().min(1).max(4096) }`. Flow: requireAuth → if `!isAppleConfigured()` respond `{ stored: false }` → else `exchangeAuthorizationCode` → `adminClient.from('apple_credentials').upsert({ user_id, refresh_token, updated_at: new Date().toISOString() })` → `{ stored: true }`. Upsert error → `DreamLensError('DB_WRITE_FAILED', ...)`.

`account.ts` `deleteAccount`: first, `select refresh_token from apple_credentials` for the user (via adminClient, `.maybeSingle()`); if a token exists and `isAppleConfigured()`, `try { await revokeAppleToken(token, fetchImpl) } catch { logger.warn('apple token revocation failed during account deletion') }` (no token value, no user content in the log). Then delete `apple_credentials` row explicitly (belt-and-braces alongside the FK cascade), then the existing sequence unchanged. Replace the stale `NOTE (§4A)` comment with one line pointing at the implemented flow. Thread `fetchImpl?: typeof fetch` through `AccountDeps` for tests.

`app.ts`: add `prodAppleAuthDeps()` following the existing lazy-proxy pattern; mount `makeAppleAuthRouter` alongside the other routers; extend `MakeAppOptions` with `appleAuthDeps?`.

`fakeSupabase.ts`: add `apple_credentials` storage supporting `.upsert()`, `.select().eq().maybeSingle()`, `.delete().eq()` following the existing table patterns.

- [ ] **Step 7: Run full API suite + typecheck**

`npm test --workspace apps/api && npm run typecheck --workspace apps/api` — expected: ALL PASS (including all pre-existing tests).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(api): Apple sign-in token capture + revocation on account deletion"
```

**Post-task (controller, not implementer):** apply the migration to the live project via the Supabase MCP.

---

### Task 3: Mobile — send Apple authorizationCode to the API

**Files:**
- Modify: `apps/mobile/src/services/socialAuth.ts`
- Test: extend `apps/mobile/__tests__/socialAuth.test.ts`

**Interfaces:**
- Consumes: Task 2's `POST /v1/auth/apple/authorization`; existing `request<T>` from `src/services/api.ts` (check its exact signature before use — auth token passing follows the same pattern as other authed calls in the codebase); `AppleAuthentication.AppleAuthenticationCredential.authorizationCode` (string | null).
- Produces: after a successful Apple `signInWithIdToken`, the app fire-and-forgets the code to the API. Sign-in NEVER fails or blocks because of this call.

- [ ] **Step 1: Write failing tests**

Extend `socialAuth.test.ts` (existing mocks for expo-apple-authentication and supabase are already there):
- After successful Apple sign-in with `authorizationCode: 'ac_123'` and a session in the supabase response, the API client is called with path `/v1/auth/apple/authorization`, method POST, body `{ authorizationCode: 'ac_123' }`, and the session's access token.
- If the API call rejects, `signInWithApple()` still resolves successfully (await a tick to let the floating promise settle; assert no unhandled rejection).
- If `credential.authorizationCode` is `null`, no API call is made.

Run: `npm test --workspace apps/mobile -- socialAuth` — expected: FAIL.

- [ ] **Step 2: Implement**

In the Apple flow of `socialAuth.ts`, after `signInWithIdToken` succeeds: if `credential.authorizationCode` and `data.session?.access_token`, fire-and-forget the POST via the existing api client, with `.catch(() => {})` and a comment explaining Apple revocation capture (and why failure is deliberately swallowed: revocation capture must never break sign-in).

- [ ] **Step 3: Run suite + typecheck, commit**

```bash
npm test --workspace apps/mobile -- socialAuth && npm run typecheck --workspace apps/mobile
git add -A && git commit -m "feat(mobile): capture Apple authorizationCode for revocation on deletion"
```

---

### Task 4: Mobile Sentry with content redaction

**Files:**
- Create: `apps/mobile/src/services/telemetry.ts`
- Modify: `apps/mobile/App.tsx` (init call)
- Modify: `apps/mobile/src/components/ErrorBoundary.tsx` (report caught errors via telemetry)
- Modify: `apps/mobile/package.json` (add `@sentry/react-native`)
- Create: `apps/mobile/__mocks__/@sentry/react-native.ts`
- Test: `apps/mobile/__tests__/telemetry.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `initTelemetry(): void` (no-op unless `EXPO_PUBLIC_SENTRY_DSN` is set), `captureError(error: unknown): void` (no-op when uninitialized), `scrubEvent<T>(event: T): T` (exported for tests).

- [ ] **Step 1: Write failing tests**

`telemetry.test.ts`:
- `scrubEvent` recursively replaces values for keys `transcript`, `rawTranscript`, `editedTranscript`, `interpretation`, `notes`, `summary` with `'[REDACTED]'` at any nesting depth (objects and arrays), leaves other keys untouched, and handles primitives/null without throwing.
- `scrubEvent` redacts inside `event.breadcrumbs[].data` and `event.extra` (these are just nested objects — the recursion covers them; assert it explicitly).
- With `EXPO_PUBLIC_SENTRY_DSN` unset, `initTelemetry()` does NOT call `Sentry.init`, and `captureError(new Error('x'))` does not call `Sentry.captureException`.
- With the env var set, `initTelemetry()` calls `Sentry.init` once with `dsn`, `sendDefaultPii: false`, and a `beforeSend` that is the scrubber (invoke the captured `beforeSend` with an event containing `extra.transcript` and assert redaction); `captureError` forwards to `Sentry.captureException`.

Run: expected FAIL.

- [ ] **Step 2: Implement**

`telemetry.ts`: module-level `initialized = false`. `initTelemetry()` reads `process.env.EXPO_PUBLIC_SENTRY_DSN`; when present calls `Sentry.init({ dsn, sendDefaultPii: false, beforeSend: (event) => scrubEvent(event) })` and sets `initialized = true`. `scrubEvent` mirrors the API's scrubber in `apps/api/src/index.ts` but with the mobile key list from Global Constraints. `captureError(error)` calls `Sentry.captureException(error)` only when initialized. Mock file exports jest.fn()s for `init` and `captureException`.

`App.tsx`: call `initTelemetry()` at module scope (before the component renders). `ErrorBoundary.componentDidCatch`: add `captureError(error)` — the boundary must continue to never log children's props/state; only the Error object is reported (its message is our own code's, not dream content).

- [ ] **Step 3: Full mobile suite + typecheck**

`npm test --workspace apps/mobile && npm run typecheck --workspace apps/mobile` — expected: ALL PASS (App.test and ErrorBoundary tests must still pass with the mock in place; jest-expo auto-uses `__mocks__` for node_modules packages).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): env-gated Sentry with dream-content redaction"
```

Native-build notes (sourcemap upload plugin, org/project/auth token) belong in Task 5's checklist, NOT in app.json — do not add the Sentry Expo plugin to app.json in this task (it requires real org/project values and would break `expo config` with placeholders).

---

### Task 5: EAS build config + launch checklist

**Files:**
- Create: `apps/mobile/eas.json`
- Create: `docs/launch-checklist.md`

**Interfaces:**
- Consumes: `docs/deploy.md` (Task 1) — linked, not duplicated.
- Produces: build profiles for `eas build`; the single ordered doc a human follows to go from this repo to TestFlight.

- [ ] **Step 1: Write eas.json**

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 2: Write docs/launch-checklist.md**

Ordered sections with concrete steps and exact env var names:
1. **Apple Developer account**: register bundle ID `com.dreamlens.app` with the Sign in with Apple capability; create a "Sign in with Apple" key (Certificates → Keys) → download `.p8` once; record `APPLE_TEAM_ID` (Membership page), `APPLE_KEY_ID` (key page), `APPLE_PRIVATE_KEY` (the `.p8` contents, newline-escaped for env), `APPLE_BUNDLE_ID=com.dreamlens.app`. Set all four on the API host (enables revocation-on-deletion; without them deletion still works but skips Apple revocation, which fails App Review).
2. **Supabase auth providers**: dashboard → Authentication → Providers: enable Apple (Services ID + the same key) and Google (paste the Web client ID as authorized client ID).
3. **Google OAuth**: Cloud Console credentials — iOS client ID (bundle `com.dreamlens.app`) and Web client ID; fill `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; replace the placeholder `iosUrlScheme` in `app.json` with the reversed iOS client ID.
4. **Deploy the API**: follow `docs/deploy.md`; then set `CORS_ALLOWLIST` (browser origins only) and confirm `/health`.
5. **Sentry (optional but recommended)**: create org/project ×2 (api, mobile); set `SENTRY_DSN` on the API host and `EXPO_PUBLIC_SENTRY_DSN` in the mobile build env; for native symbolication add the `@sentry/react-native/expo` plugin to `app.json` with real org/project and a `SENTRY_AUTH_TOKEN` in EAS secrets (deliberately not committed with placeholders).
6. **Mobile env for builds**: EAS env vars / `.env` for `EXPO_PUBLIC_API_URL` (deployed URL), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key only).
7. **Build**: `npx eas init` (links `projectId` into app.json), `npx eas build --profile development --platform ios`, install on device.
8. **On-device verification checklist** (checkboxes): mic permission prompt shows the exact §10 string; STT transcribes; dream saves offline in airplane mode and syncs when back online; SQLCipher DB unreadable (file is not plaintext SQLite); interpretation renders; patterns after 5+ dreams; reminders notification arrives; Apple sign-in (real device), Google sign-in; account deletion removes server data and revokes Apple token; paywall appears at the free-tier limit.
9. **Store prep**: privacy policy URL (replace placeholder in `app.json`), App Privacy questionnaire notes (audio processed on-device, transcripts stored encrypted, no tracking), TestFlight → review.

- [ ] **Step 3: Sanity check + commit**

`npx expo config apps/mobile --json > /dev/null` should still succeed from repo root (eas.json must not break config resolution; run and confirm exit 0).
```bash
git add -A && git commit -m "chore(mobile): EAS build profiles + launch checklist"
```
