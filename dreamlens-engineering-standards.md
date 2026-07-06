# DreamLens — Technical Engineering Standards & Practices
**Version:** 1.0  
**Companion to:** dreamlens-prd.md  
**Audience:** Fable 5 / AI coding agent / any engineer starting this build  
**Status:** Required reading before writing any code

---

## CRITICAL PRE-BUILD CORRECTION

**The PRD competitive table is wrong and must be updated.**

Research conducted July 2026 confirms:
- **DreamScript** (App Store, active) explicitly markets "cross-dream analysis, not one-off interpretation" and "compares entries over time to surface recurring motifs, emotional trajectories, and repeating life tensions." It uses long-form context memory and a Jungian archetype lens.
- **MyDream** (App Store, active) has a Multi-Dream Analysis feature: "select several past entries and generate one consolidated report... scans every symbol, emotion, place, and character to reveal recurring themes, emotional trends."

**The claim that DreamLens is "the only app" with longitudinal memory is false.** Do not build marketing or product copy around this.

**Revised differentiation:** DreamLens wins on **execution quality, not feature novelty.** Specifically:
1. Voice-first as the primary capture mechanic (competitors default to text)
2. RAG-backed knowledge base (competitors query LLMs with no grounding source — their interpretations are inconsistent)
3. Privacy-forward architecture (no audio stored, no dream content in logs)
4. Superior interpretation depth via a curated, authoritative symbol library

The PRD's product vision remains valid. The competitive framing needs to be honest.

---

## Table of Contents
1. [Language & Type Safety](#language)
2. [Project Structure](#structure)
3. [Testing Strategy](#testing)
4. [Security Requirements](#security) — incl. [4.7 OWASP Security Auditing](#owasp)
4A. [Authentication Setup (Google + Apple)](#auth-setup)
5. [Error Handling Strategy](#errors)
6. [CI/CD Pipeline](#cicd)
7. [Observability & Monitoring](#observability)
8. [Performance Budgets](#performance)
9. [Mobile-Specific Requirements](#mobile)
10. [App Store Compliance](#appstore)
11. [Accessibility Standards](#accessibility)
12. [Knowledge Base Build Plan](#knowledgebase)
13. [Environment & Secret Management](#secrets)
14. [Dependency Management](#dependencies)
15. [Database Practices](#database)
16. [API Design Standards](#api)
17. [The Complete Fable 5 Prompt](#fable)

---

## 1. Language & Type Safety {#language}

**Non-negotiable: TypeScript strict mode across the entire codebase.**

Both the React Native app and the Node.js API must be TypeScript. No JavaScript files. No `any` type without a comment explaining exactly why it's unavoidable.

**tsconfig.json (both projects):**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Why this matters here specifically:** The RAG pipeline has multiple async stages, each returning differently shaped data. Without strict types on DreamEntry, SymbolSearchResult, ClaudeInterpretationResponse, and UserPatternSummary, you will ship silent type errors that cause blank interpretation screens with no stack trace. This is a morning-use app — a broken interpretation at 6am is a churned user.

### Core Type Definitions (define these first, before any feature code)

```typescript
// types/domain.ts

export type DreamId = string & { readonly brand: 'DreamId' };
export type UserId = string & { readonly brand: 'UserId' };

export interface DreamEntry {
  id: DreamId;
  userId: UserId;
  recordedAt: Date;
  rawTranscript: string;
  editedTranscript: string | null;
  interpretation: DreamInterpretation | null;
  embedding: number[] | null;
  createdAt: Date;
}

export interface DreamInterpretation {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone: string;
  patternNote: string | null;
  questionsToReflectOn: string[];
  generatedAt: Date;
  modelVersion: string;
}

export interface SymbolInterpretation {
  symbol: string;
  interpretation: string;
}

export interface DreamSymbol {
  id: string;
  symbol: string;
  category: SymbolCategory;
  interpretation: string;
  source: string;
  embedding: number[] | null;
}

// Canonical category taxonomy — MUST match the CHECK constraint on dream_symbols
// (migration 0002) and the categories used by the Knowledge Vault export.
export type SymbolCategory =
  | 'jungian_archetype'
  | 'scenario'
  | 'environment'
  | 'animal'
  | 'object'
  | 'body'
  | 'nature'
  | 'color'
  | 'relationship'
  | 'somatic'
  | 'freudian'
  | 'cultural';

export interface UserPattern {
  userId: UserId;
  symbol: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface UserPatternSummary {
  totalDreams: number;
  recurringSymbols: Array<{ symbol: string; count: number }>;
  dominantThemes: string[];
  dominantEmotionalTone: string | null;
  recentDreamSummaries: string[];
}

// API types
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = 
  | { success: true; data: T }
  | { success: false; error: ApiError };
```

---

## 2. Project Structure {#structure}

```
dreamlens/
├── apps/
│   ├── mobile/                    # React Native / Expo app
│   │   ├── src/
│   │   │   ├── screens/           # One file per screen
│   │   │   │   ├── RecordScreen.tsx
│   │   │   │   ├── ReviewScreen.tsx
│   │   │   │   ├── InterpretationScreen.tsx
│   │   │   │   ├── JournalScreen.tsx
│   │   │   │   ├── EntryDetailScreen.tsx
│   │   │   │   ├── ProfileScreen.tsx
│   │   │   │   └── SettingsScreen.tsx
│   │   │   ├── components/        # Reusable UI components
│   │   │   │   ├── VoiceButton/
│   │   │   │   ├── DreamCard/
│   │   │   │   ├── InterpretationView/
│   │   │   │   ├── PatternBadge/
│   │   │   │   └── EmptyState/
│   │   │   ├── hooks/             # Custom hooks
│   │   │   │   ├── useAudioRecording.ts
│   │   │   │   ├── useDreams.ts
│   │   │   │   └── usePatterns.ts
│   │   │   ├── services/          # API calls, external services
│   │   │   │   ├── api.ts         # HTTP client wrapper
│   │   │   │   ├── dreams.ts      # Dream CRUD operations
│   │   │   │   └── auth.ts        # Auth operations
│   │   │   ├── store/             # State management (Zustand)
│   │   │   │   ├── dreamStore.ts
│   │   │   │   └── authStore.ts
│   │   │   ├── design/            # Design system tokens
│   │   │   │   ├── tokens.ts      # Colors, spacing, typography
│   │   │   │   ├── typography.ts  # Text styles
│   │   │   │   └── components.ts  # Shared component styles
│   │   │   ├── navigation/        # React Navigation config
│   │   │   └── types/             # App-specific types
│   │   ├── __tests__/
│   │   └── app.json
│   │
│   └── api/                       # Node.js backend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── dreams.ts
│       │   │   └── profile.ts
│       │   ├── services/
│       │   │   ├── rag.ts          # RAG pipeline
│       │   │   ├── claude.ts       # Claude API wrapper
│       │   │   ├── embeddings.ts   # OpenAI embedding wrapper
│       │   │   └── patterns.ts     # Pattern detection logic
│       │   ├── middleware/
│       │   │   ├── auth.ts         # JWT verification
│       │   │   ├── rateLimit.ts
│       │   │   ├── validate.ts     # Zod schema validation
│       │   │   └── logger.ts
│       │   ├── db/
│       │   │   ├── client.ts       # Supabase client singleton
│       │   │   ├── migrations/     # SQL migration files
│       │   │   └── queries/        # Typed query functions
│       │   └── types/              # Shared domain types (symlinked to ../../shared)
│       └── __tests__/
│           ├── unit/
│           ├── integration/
│           └── fixtures/
│
├── packages/
│   └── shared/                    # Shared types (both apps consume)
│       └── types/
│           └── domain.ts          # The types defined in section 1
│
├── supabase/
│   ├── migrations/                # All schema migrations
│   ├── seed/
│   │   └── dream_symbols.sql      # Initial knowledge base (500+ entries)
│   └── functions/                 # Supabase Edge Functions (if needed)
│
└── .github/
    └── workflows/
        ├── test.yml
        ├── deploy-api.yml
        └── security-scan.yml
```

---

## 3. Testing Strategy {#testing}

### Philosophy

Every external API call (Claude, OpenAI, Supabase) must be mockable. Do not write tests that call real APIs. The test suite must be runnable offline. Tests must run in under 60 seconds total for the unit/integration suite — if they're slow, they won't be run.

### Coverage Requirements

- **Business logic (RAG pipeline, pattern detection, Claude prompt builder):** 85% minimum
- **API routes:** 100% of happy paths, 80% of error paths
- **React Native components:** Snapshot tests for all screen components, interaction tests for the recording flow
- **Do not chase 100% coverage overall** — that way lies testing implementation details. Cover behavior, not lines.

### Test-per-feature is a merge gate (not a suggestion)

**A feature is not "done" until its test suite ships in the same PR.** No feature — API route, RAG stage, screen, hook, auth flow — merges without tests. This is enforced by CI, not by reviewer goodwill.

**Definition of done, by feature type:**

| Feature type | Required test suite (same PR) |
|---|---|
| API route | Integration tests: happy path (200/201), 401 no-auth, 400 invalid input, 403 wrong-user, 429 rate-limited (see the Section-3 route checklist) |
| Business logic (RAG stage, pattern detection, prompt builder, parser) | Unit tests incl. the failure/fallback path (e.g. malformed Claude JSON → safe default) |
| Auth flow (Section 4A) | Unit tests for token → session mapping, cancel path returns null, rejected-token path throws |
| React Native screen | Component tests: default render, loading state, error state, key interaction |
| Bug fix | A regression test that fails before the fix and passes after |

**CI enforcement — patch coverage:** the pipeline fails a PR when the *changed lines* fall below **85%** coverage, regardless of the global number. This is what actually forces "tests for each new feature" — you cannot add untested lines. See the `patch-coverage` step in Section 6.

**PR checklist (required, blocks merge):**
- [ ] New/changed behavior has tests in this PR
- [ ] Patch coverage ≥ 85% (CI green)
- [ ] Error and edge paths tested, not just the happy path
- [ ] For a bug fix: a test that reproduces the bug is included

### Test Stack

```
API:
- Jest + ts-jest
- supertest (HTTP route testing)
- @supabase/supabase-js mock (jest.mock)

Mobile:
- Jest + @testing-library/react-native
- jest-expo preset
- Detox (E2E, Phase 2 only — do not block MVP on E2E)
```

### Critical Tests to Write (in priority order)

#### RAG Pipeline Unit Tests
```typescript
// api/__tests__/unit/rag.test.ts

describe('RAG Pipeline', () => {
  describe('embedTranscript', () => {
    it('returns a 1536-dimension vector for valid input', async () => {...});
    it('throws RagError with code EMBED_FAILED when OpenAI is unavailable', async () => {...});
    it('throws RagError with code INPUT_TOO_LONG when transcript exceeds 5000 chars', async () => {...});
  });

  describe('retrieveSymbols', () => {
    it('returns top 15 symbols by cosine similarity', async () => {...});
    it('returns empty array (not throws) when no symbols match', async () => {...});
    it('never returns more than 15 symbols regardless of k parameter', async () => {...});
  });

  describe('buildClaudeContext', () => {
    it('includes symbol entries when retrieved', async () => {...});
    it('includes pattern summary when user has prior dreams', async () => {...});
    it('omits pattern_note instruction when user has fewer than 3 dreams', async () => {...});
    it('total context length stays under 4000 tokens', async () => {...});
  });

  describe('parseClaudeResponse', () => {
    it('parses valid JSON response into DreamInterpretation', async () => {...});
    it('falls back to safe default when response is malformed JSON', async () => {...});
    it('falls back to safe default when required fields are missing', async () => {...});
    it('rejects response with empty summary string', async () => {...});
  });
});
```

#### API Route Integration Tests
```typescript
// api/__tests__/integration/dreams.test.ts

describe('POST /api/dreams', () => {
  it('creates a dream entry and returns 201 with the entry', async () => {...});
  it('returns 401 when no auth token provided', async () => {...});
  it('returns 400 when transcript is empty string', async () => {...});
  it('returns 400 when transcript exceeds 5000 characters', async () => {...});
  it('returns 400 when editedTranscript exceeds 5000 characters', async () => {...});
});

describe('POST /api/dreams/:id/interpret', () => {
  it('returns 200 with interpretation when all services succeed', async () => {...});
  it('returns 200 with fallback interpretation when Claude returns malformed JSON', async () => {...});
  it('returns 200 with partial interpretation when embedding fails (skips RAG, uses general prompt)', async () => {...});
  it('returns 404 when dream does not belong to authenticated user', async () => {...});
  it('returns 409 when dream already has an interpretation', async () => {...});
  it('stores the interpretation in the database after success', async () => {...});
});

describe('Rate limiting', () => {
  it('returns 429 after 20 interpret requests per minute from same user', async () => {...});
  it('returns 429 after 100 general requests per 15 minutes from same IP', async () => {...});
});
```

#### Pattern Detection Unit Tests
```typescript
// api/__tests__/unit/patterns.test.ts

describe('Pattern Detection', () => {
  it('flags a symbol as recurring after 3 occurrences', async () => {...});
  it('does NOT flag a symbol with only 2 occurrences', async () => {...});
  it('builds correct pattern summary with top 5 symbols by frequency', async () => {...});
  it('returns empty summary for user with zero prior dreams', async () => {...});
  it('handles null symbol fields in dream records gracefully', async () => {...});
});
```

#### React Native Component Tests
```typescript
// mobile/__tests__/RecordScreen.test.tsx

describe('RecordScreen', () => {
  it('renders the microphone button on initial load', () => {...});
  it('shows "Listening..." hint text when recording starts', () => {...});
  it('shows "Recording complete" hint text when recording stops', () => {...});
  it('navigates to ReviewScreen when recording is stopped with content', () => {...});
  it('does NOT navigate when recording is stopped with no content', () => {...});
  it('displays microphone permission denied state correctly', () => {...});
});

describe('InterpretationScreen', () => {
  it('renders summary, themes, symbols, and questions from interpretation data', () => {...});
  it('shows skeleton loading state while interpretation is pending', () => {...});
  it('shows error state with retry button when interpretation fails', () => {...});
  it('renders pattern_note section only when patternNote is non-null', () => {...});
});
```

### What NOT to Test
- Supabase Auth internals (trust the SDK)
- RevenueCat receipt validation (trust the SDK)
- React Navigation transitions
- Network request timing

---

## 4. Security Requirements {#security}

### 4.1 Supabase Row Level Security (RLS)

**This is the most important security control.** Without RLS, a bug in the API layer could expose any user's dreams to any other user. These policies must be written before any API code.

```sql
-- Enable RLS on all user-data tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;

-- user_profiles: users can only read/write their own profile
CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- dreams: users can only access their own dreams
CREATE POLICY "users_own_dreams" ON dreams
  FOR ALL USING (auth.uid() = user_id);

-- user_patterns: users can only read their own patterns
CREATE POLICY "users_own_patterns" ON user_patterns
  FOR ALL USING (auth.uid() = user_id);

-- dream_symbols: public read (knowledge base), no user writes
CREATE POLICY "dream_symbols_public_read" ON dream_symbols
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy means only service_role can modify
```

**Test these policies explicitly.** Write a test that creates two users and verifies user A cannot read user B's dreams even with a valid auth token.

### 4.2 Rate Limiting

Install `express-rate-limit`. Apply at two levels:

```typescript
// middleware/rateLimit.ts

import rateLimit from 'express-rate-limit';

// General API rate limit — all routes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                    // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }
});

// Interpretation endpoint — this calls Claude and costs money
export const interpretLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,                // per IP — generous for normal use, blocks abuse
  keyGenerator: (req) => req.user?.id ?? req.ip,  // Rate by user ID when authenticated
  message: { code: 'RATE_LIMITED', message: 'Interpretation limit reached. Please wait a moment.' }
});

// Demo endpoint — public, no auth, must be very tight
export const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,                      // 3 demo interpretations per IP per hour
  message: { code: 'DEMO_LIMIT', message: 'Demo limit reached. Create an account for unlimited interpretations.' }
});
```

### 4.3 Input Validation with Zod

Every request body must be validated. No raw `req.body` access anywhere in route handlers.

```typescript
// validation/schemas.ts

import { z } from 'zod';

export const CreateDreamSchema = z.object({
  rawTranscript: z.string()
    .min(10, 'Transcript must be at least 10 characters')
    .max(5000, 'Transcript cannot exceed 5000 characters')
    .trim(),
  editedTranscript: z.string()
    .max(5000)
    .trim()
    .nullable()
    .optional(),
  recordedAt: z.string().datetime(),
});

export const UpdateTranscriptSchema = z.object({
  editedTranscript: z.string()
    .min(10)
    .max(5000)
    .trim(),
});

export const DemoInterpretSchema = z.object({
  transcript: z.string()
    .min(20, 'Please describe your dream in more detail')
    .max(1000, 'Demo is limited to 1000 characters. Create an account for longer dreams.')
    .trim(),
});

// Middleware factory
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: result.error.flatten().fieldErrors
      });
    }
    req.body = result.data;  // Replace with parsed/sanitized data
    next();
  };
}
```

### 4.4 Authentication Middleware

```typescript
// middleware/auth.ts

import { createClient } from '@supabase/supabase-js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }

  req.user = { id: user.id as UserId };
  next();
}
```

### 4.5 What Must NEVER Appear in Logs

Dream content is intimate. A senior engineer treats it like PII — stricter, actually, because medical/psychological content has additional sensitivity.

```typescript
// Logger configuration
// NEVER log:
// - raw dream transcripts
// - edited transcripts
// - interpretation text (summaries, symbols, themes)
// - any user-generated content

// DO log:
// - user_id (hashed — never raw UUID)
// - dream_id
// - endpoint, method, status_code
// - duration_ms
// - error codes (not messages that might contain user content)
// - token counts (for cost monitoring)

const hashUserId = (userId: string): string =>
  crypto.createHash('sha256').update(userId).digest('hex').substring(0, 12);
```

### 4.6 Dependency Vulnerability Scanning

Run on every CI build:
```bash
npm audit --audit-level=high
```

Fail the build if any high or critical severity vulnerabilities are found. Use `npm audit fix` to resolve. If a vulnerability has no fix available, document it explicitly and set a review date.

### 4.7 OWASP Security Auditing {#owasp}

Security is audited against three OWASP standards on every PR and on a weekly schedule. **A release cannot ship with an unresolved High/Critical finding.** The three standards, and why each applies here:

- **OWASP API Security Top 10 (2023)** — the backend is an API; this is the primary standard.
- **OWASP Mobile Top 10 / MASVS** — the React Native app stores intimate content on-device.
- **OWASP Top 10 (2021)** — general web/app coverage (injection, misconfig, logging).

#### API Security Top 10 → where the control lives here

| OWASP API risk | Control in this codebase | How it's verified |
|---|---|---|
| API1 Broken Object Level Auth (BOLA) | Supabase RLS (`auth.uid() = user_id`) on every user table (§4.1) | The mandatory two-user test: user A cannot read user B's dreams even with a valid token |
| API2 Broken Authentication | Supabase JWT verify in `requireAuth` (§4.4); native OAuth (§4A) | Auth unit tests; 401 integration test on every route |
| API3 Broken Object Property Level Auth / excessive data exposure | Zod schemas on input (§4.3); responses return only the caller's fields | Route tests assert response body shape; no `SELECT *` leaking other users |
| API4 Unrestricted Resource Consumption | `express-rate-limit` tiers (§4.2); 5000-char transcript cap; Claude cost cap + $50/day budget alert (§7) | 429 rate-limit integration tests; cost logging |
| API5 Broken Function Level Auth | `requireAuth` applied to all non-public routes; service_role never on client | Route tests; grep gate that service_role key never appears in `apps/mobile` |
| API6 Unrestricted Access to Sensitive Business Flows | `demoLimiter` (3/hr/IP) on the public demo endpoint | Demo rate-limit test |
| API7 SSRF | No user-supplied URLs are fetched server-side; web fetch is disabled | SAST rule; code review |
| API8 Security Misconfiguration | `helmet` security headers + CORS allowlist (add both — see below); RLS enabled by default | Semgrep config rules; ZAP header checks |
| API9 Improper Inventory Management | `/v1/` versioning from day one (§16); three-environment separation (§6) | — |
| API10 Unsafe Consumption of 3rd-party APIs | Typed, validated parsing of Claude/OpenAI responses with safe fallbacks (§5) | Parser unit tests (malformed JSON → default) |

**Add these two API dependencies** (currently missing — needed for API8): `helmet` (security headers) and `cors` (explicit origin allowlist — the mobile app origin + the landing-page domain only, never `*`).

#### Mobile Top 10 — the data-at-rest gap (fix required)

**Finding (M9 Insecure Data Storage): the offline queue writes dream transcripts to local SQLite in plaintext.** Section 9's `dream_queue` table stores `raw_transcript` unencrypted on the device. This directly contradicts the product's privacy-forward stance ("no audio stored, no dream content in logs") — the most sensitive content is sitting in cleartext on disk, readable from a device backup or a jailbroken/rooted device.

Required fixes:
1. **Encrypt the local database at rest.** Use an encrypted SQLite (SQLCipher via `op-sqlite`, or `expo-sqlite`'s encryption support) with the key stored in the device keystore.
2. **Store the encryption key and the Supabase session in the secure keystore**, not `AsyncStorage`: use `expo-secure-store` (iOS Keychain / Android Keystore). Session tokens in `AsyncStorage` are readable on a compromised device (M9) — configure the Supabase client's `storage` to a SecureStore adapter.
3. Purge queue rows once `sync_status = 'synced'` — don't retain interpreted dream text locally longer than needed.

Other Mobile Top 10 controls already in good shape: no hardcoded secrets in the bundle (M10 — only `EXPO_PUBLIC_` public IDs, §13), TLS-only network calls, native OAuth over web redirect (M3).

#### Tooling & cadence

| Layer | Tool | When | Gate |
|---|---|---|---|
| SCA (dependencies) | `npm audit --audit-level=high` + Trivy | Every PR | Fail on High/Critical |
| SAST (code) | Semgrep with `p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/react`, `p/secrets` | Every PR | Fail on High |
| Secrets | gitleaks | Every PR | Fail on any finding |
| DAST (running app) | OWASP ZAP baseline against **staging** | Weekly + manual | Fail on High |

**DAST safety rule:** ZAP runs against the **staging** API only — never production, and never against an environment holding real user dream data. Staging uses synthetic data.

**The rule:** an OWASP audit (the CI security jobs) must be green before merge, and the weekly ZAP scan's findings are triaged within one business day. High/Critical findings block release. This is not a periodic "security sprint" — it runs continuously in CI (Section 6).

---

## 4A. Authentication Setup (Google + Apple Sign-In) {#auth-setup}

The PRD lists "email/password + Apple Sign-In + Google Sign-In" as a requirement (F09) but specifies no setup. This section is that setup. Build all three; **Apple Sign-In is not optional** — see the App Store rule at the end.

### Approach: native ID-token flow (NOT web redirect)

For a native iOS-first app on Supabase, use each platform's **native** sign-in sheet to obtain an identity token, then hand that token to Supabase with `signInWithIdToken`. Do **not** use the `signInWithOAuth` web-redirect flow — it bounces the user through a browser, feels wrong at 6am, and needs deep-link plumbing you don't otherwise want.

```
[Native Google/Apple sheet] → idToken → supabase.auth.signInWithIdToken({ provider, token })
      → Supabase issues a session JWT → app stores session → every API call sends `Bearer <access_token>`
```

The backend needs **no changes**: `requireAuth` (Section 4.4) verifies the Supabase JWT via `supabase.auth.getUser(token)` and is provider-agnostic. Google, Apple, and email sessions all produce the same JWT.

### Prerequisite: custom dev client (not Expo Go)

Native Google/Apple auth uses native modules that are **not** in Expo Go. You must build a dev client:

```bash
npx expo prebuild
npx expo run:ios      # local dev client
# or: eas build --profile development --platform ios
```

State this in the README. A contributor who runs `expo start` and opens Expo Go will hit a "native module not found" crash and waste an afternoon.

### Dependencies to add

Add to `apps/mobile` (pinned — no `latest`):

```json
{
  "@react-native-google-signin/google-signin": "~13.1.0",
  "expo-apple-authentication": "~7.1.0"
}
```

Run `npx expo install expo-apple-authentication @react-native-google-signin/google-signin` so the versions resolve to the ones compatible with Expo SDK 53, then commit the resolved versions.

### Environment variables (add to `apps/mobile/.env.example`)

```bash
# Google OAuth client IDs (from Google Cloud Console → Credentials)
# iOS client ID: type "iOS", bundle ID = your app's bundle identifier
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
# Web client ID: type "Web application" — REQUIRED even on iOS; it is the audience
# Supabase validates the Google ID token against. Configure the SAME value in Supabase.
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Apple native sign-in needs **no** client-side secret. These are public client IDs (safe under the `EXPO_PUBLIC_` prefix); the Google **client secret** lives only in the Supabase dashboard, never in the app.

### `app.json` configuration

```jsonc
{
  "expo": {
    "ios": {
      "bundleIdentifier": "app.dreamlens.mobile",
      "usesAppleSignIn": true
    },
    "plugins": [
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        { "iosUrlScheme": "com.googleusercontent.apps.xxxxxxxx" }
      ]
    ]
  }
}
```

`iosUrlScheme` is the **reversed iOS client ID** (from the Google iOS credential). Re-run `npx expo prebuild` after editing plugins.

### Supabase provider configuration (dashboard, one-time)

**Authentication → Providers → Google:**
- Enable it.
- Client ID = the **Web** client ID; Client Secret = the Web client's secret.
- Under **Authorized Client IDs**, add BOTH the iOS client ID and the Web client ID (comma-separated). Native iOS tokens are issued to the iOS client ID — if it's not listed here, Supabase rejects the token with `Invalid audience`.

**Authentication → Providers → Apple:**
- Enable it.
- For the **native** flow, add your app's **Bundle ID** (`app.dreamlens.mobile`) to **Authorized Client IDs**. That alone is sufficient for native iOS Sign in with Apple.
- (Only if you later add a web/Android Apple flow do you also need the Services ID + Team ID + Key ID + `.p8` secret. Not required for native iOS.)

### Client implementation — Google

```typescript
// apps/mobile/src/services/auth.ts
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from './supabaseClient';
import { DreamLensError } from '../types/errors';

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // required as the token audience
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  try {
    const { data } = await GoogleSignin.signIn();
    const idToken = data?.idToken;
    if (!idToken) throw new DreamLensError('INVALID_TOKEN', 'Google returned no ID token');

    const { data: session, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw new DreamLensError('INVALID_TOKEN', 'Supabase rejected the Google token', error);
    return session;
  } catch (err: any) {
    if (err?.code === statusCodes.SIGN_IN_CANCELLED) return null; // user backed out — not an error
    throw err;
  }
}
```

### Client implementation — Apple

Apple's sheet is iOS-only. Render the button **only** when the API is available, or Apple rejects the build.

```typescript
// apps/mobile/src/services/auth.ts (continued)
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export const isAppleSignInSupported = () =>
  Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync();

export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const idToken = credential.identityToken;
    if (!idToken) throw new DreamLensError('INVALID_TOKEN', 'Apple returned no identity token');

    const { data: session, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    });
    if (error) throw new DreamLensError('INVALID_TOKEN', 'Supabase rejected the Apple token', error);

    // Apple returns the name ONLY on first authorization — capture it now or lose it.
    if (credential.fullName?.givenName && session.user) {
      await supabase.from('user_profiles')
        .update({ display_name: credential.fullName.givenName })
        .eq('id', session.user.id);
    }
    return session;
  } catch (err: any) {
    if (err?.code === 'ERR_REQUEST_CANCELED') return null; // user backed out
    throw err;
  }
}
```

> **Apple gotcha — name is first-time-only.** Apple sends `fullName`/`email` **only on the very first authorization** for a given Apple ID. On every subsequent sign-in those fields are null. If you don't persist them on first sign-in (as above), you can't recover them without the user revoking access in iOS Settings and re-authorizing. Never rely on Apple returning the name on a returning user.

Rendering the Apple button (use Apple's own component — a custom button fails review):

```tsx
{isAppleSupported && (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
    cornerRadius={12}
    style={{ width: '100%', height: 52 }}
    onPress={signInWithApple}
  />
)}
```

### Sign-out

```typescript
export async function signOut() {
  await GoogleSignin.signOut().catch(() => {}); // best-effort; ignore if not a Google session
  await supabase.auth.signOut();
}
```

### Account deletion + Apple token revocation (compliance)

The `DELETE /v1/account` endpoint (Section 10 / App Store requirement) already deletes the user's data and Supabase auth record. **If the user signed in with Apple, that is not enough.** Since June 2023 Apple requires that account deletion also **revokes the Sign in with Apple token**. Add a step to the deletion flow:

- On the client, before calling `DELETE /v1/account`, obtain the Apple `authorizationCode` from the stored credential and send it to the backend.
- The backend exchanges it and calls Apple's revoke endpoint `POST https://appleid.apple.com/auth/revoke` (with your Apple client secret JWT) to revoke the refresh token.
- Only then delete the Supabase user.

Skipping this is an App Store rejection reason for any app offering Sign in with Apple. Track it as a launch blocker, not a nice-to-have.

### App Store requirement (Guideline 4.8) — Apple Sign-In is mandatory here

Because DreamLens offers third-party social login (Google), Apple's Guideline 4.8 **requires** you to also offer a login option that (a) limits data collection to name + email, (b) lets users keep their email private, and (c) doesn't track. **Sign in with Apple satisfies this; Google alone does not.** This is why Apple Sign-In is a build requirement, not a preference — ship without it and the app is rejected.

---

## 5. Error Handling Strategy {#errors}

### The Rule

Every function that calls an external service must handle failure explicitly and deterministically. "Catch and rethrow" is not a strategy. "Log and swallow" is not a strategy. Every error path must produce a defined, typed outcome.

### Error Taxonomy

```typescript
// types/errors.ts

export class DreamLensError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'DreamLensError';
  }
}

export type ErrorCode =
  // RAG/Claude errors
  | 'EMBED_FAILED'
  | 'EMBED_TIMEOUT'
  | 'VECTOR_SEARCH_FAILED'
  | 'CLAUDE_UNAVAILABLE'
  | 'CLAUDE_MALFORMED_RESPONSE'
  | 'CLAUDE_CONTEXT_TOO_LONG'
  // Database errors
  | 'DB_WRITE_FAILED'
  | 'DB_READ_FAILED'
  | 'RECORD_NOT_FOUND'
  | 'UNAUTHORIZED_ACCESS'
  // Input errors
  | 'VALIDATION_ERROR'
  | 'INPUT_TOO_LONG'
  | 'RATE_LIMITED'
  // Auth errors
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN';
```

### Degraded Mode Strategy

The interpret endpoint calls three external services. Any of them can fail. Define degraded behavior for each:

| Failure | Degraded behavior | User sees |
|---|---|---|
| OpenAI embedding fails | Skip RAG, call Claude with general psychology prompt | "Interpreting without symbol reference..." (interpretation still delivered) |
| pgvector returns 0 results | Call Claude with general prompt, no symbol context | Normal interpretation, slightly less specific |
| Claude API down (5xx) | Return HTTP 503, store transcript, set `needs_interpretation: true` flag | "Your dream is saved. We'll interpret it shortly." |
| Claude returns malformed JSON | Parse what's recoverable, fill missing fields with safe defaults, log the raw response | Normal interpretation view, possibly less complete |
| Claude response missing required fields | Use safe defaults (empty themes array, generic emotional tone) | Gracefully degraded interpretation |
| Supabase write fails after interpretation | Attempt 3 retries with exponential backoff, then fail with 500 | "Something went wrong saving your interpretation. Please try again." |

### Retry Logic

```typescript
// services/retry.ts

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableErrors?: string[];
  }
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === options.maxAttempts) break;
      
      // Only retry on transient errors
      if (error instanceof DreamLensError && 
          options.retryableErrors && 
          !options.retryableErrors.includes(error.code)) {
        throw error;
      }
      
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1),
        options.maxDelayMs
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage: Supabase writes get 3 retries
// Claude calls get 1 retry (expensive; don't hammer on timeout)
// Embedding calls get 2 retries
```

### React Native Error Boundaries

Every screen must be wrapped in an ErrorBoundary. The app must never show a blank white screen.

```tsx
// components/ErrorBoundary.tsx

class ErrorBoundary extends React.Component<Props, State> {
  // On error: show the EmptyState component with a "Something went wrong" message
  // and a retry button. Log the error to Sentry.
  // Dream content must never appear in the error report.
}
```

---

## 6. CI/CD Pipeline {#cicd}

### GitHub Actions Workflows

#### test.yml — Runs on every push and pull request
```yaml
name: Test
on: [push, pull_request]

jobs:
  test-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd apps/api && npm ci
      - run: cd apps/api && npm run typecheck
      - run: cd apps/api && npm audit --audit-level=high
      - run: cd apps/api && npm test -- --coverage --coverageReporters=lcov --coverageReporters=text --coverageThreshold='{"global":{"lines":70}}'
      # Patch-coverage gate: changed lines must be >= 85% covered (this is what
      # enforces "tests for every new feature" — see Section 3).
      - name: Enforce patch coverage on changed lines
        run: |
          pip install diff-cover
          diff-cover apps/api/coverage/lcov.info \
            --compare-branch=origin/${{ github.base_ref || 'main' }} \
            --fail-under=85

  test-mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # diff-cover needs full history
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd apps/mobile && npm ci
      - run: cd apps/mobile && npm run typecheck
      - run: cd apps/mobile && npm test -- --coverage --coverageReporters=lcov
      - name: Enforce patch coverage on changed lines
        run: |
          pip install diff-cover
          diff-cover apps/mobile/coverage/lcov.info \
            --compare-branch=origin/${{ github.base_ref || 'main' }} \
            --fail-under=85

  # OWASP audit — runs on every PR (see Section 4.7). SCA + SAST + secrets.
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dependency scan (Trivy — SCA)
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
      - name: Static analysis (Semgrep — SAST, OWASP rulesets)
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten
            p/javascript
            p/typescript
            p/react
            p/secrets
      # gitleaks CLI directly (license-free) — the gitleaks-action wrapper requires a
      # paid GITLEAKS_LICENSE for orgs/private repos; the CLI does not.
      - name: Secret scan (gitleaks)
        run: |
          VERSION=8.21.2
          curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz" \
            | tar -xz gitleaks
          ./gitleaks detect --source . --redact --no-banner --exit-code 1
```

#### deploy-api.yml — Runs on merge to main
```yaml
name: Deploy API
on:
  push:
    branches: [main]
    paths: ['apps/api/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Must pass all tests first (test.yml must succeed)
      # Then deploy to Railway staging
      # Production deployment requires manual approval
```

#### security-dast.yml — OWASP ZAP scan (weekly + manual)
```yaml
name: DAST (OWASP ZAP)
on:
  schedule:
    - cron: '0 6 * * 1'   # Mondays 06:00 UTC
  workflow_dispatch: {}      # allow manual runs

jobs:
  zap-baseline:
    runs-on: ubuntu-latest
    steps:
      # Scans the STAGING API only — never production, never an env with real
      # dream data. Staging uses synthetic data (see Section 4.7 DAST safety rule).
      - name: OWASP ZAP baseline scan
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'https://staging-api.dreamlens.app'
          fail_action: true    # fail on High-severity alerts
```

### Environment Strategy

Three environments, no exceptions:

| Environment | Supabase | Claude | Railway | Purpose |
|---|---|---|---|---|
| Development | Local Supabase CLI | Real API, low limits | localhost | Daily dev |
| Staging | Separate Supabase project | Real API, production limits | Railway preview | PR review, QA |
| Production | Production Supabase | Real API | Railway production | Live users |

**Critical:** Staging must mirror production schema exactly. A migration that works on staging but fails on production is a 2am incident. Use `supabase db diff` before every deploy.

---

## 7. Observability & Monitoring {#observability}

### Sentry

Install in both the API and the mobile app. Configure before writing any feature code.

```typescript
// API — apps/api/src/index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of requests traced for performance
  beforeSend(event) {
    // Scrub any dream content from error reports
    if (event.extra) {
      delete event.extra.transcript;
      delete event.extra.interpretation;
    }
    return event;
  }
});

// Mobile — apps/mobile/src/index.ts
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Structured Logging

Every API request must produce a structured log line. Railway captures stdout. Logs must be queryable.

```typescript
// Format every log line as JSON:
{
  "timestamp": "2026-07-04T06:23:11Z",
  "level": "info",
  "endpoint": "POST /api/dreams/:id/interpret",
  "user_id_hash": "a3f9b2c1",  // First 12 chars of SHA-256
  "dream_id": "550e8400-e29b",
  "duration_ms": 3421,
  "claude_input_tokens": 2847,
  "claude_output_tokens": 412,
  "rag_symbols_retrieved": 14,
  "status": 200
}

// On error:
{
  "timestamp": "2026-07-04T06:23:11Z",
  "level": "error",
  "endpoint": "POST /api/dreams/:id/interpret",
  "user_id_hash": "a3f9b2c1",
  "error_code": "CLAUDE_UNAVAILABLE",
  "duration_ms": 8003,
  "status": 503
  // NOTE: Never include error.message if it could contain user content
}
```

### Uptime Monitoring

Set up UptimeRobot or Better Uptime before launch. Monitor:
- `GET /api/health` (API liveness)
- `POST /api/demo/interpret` (full stack smoke test, alerts if the core flow breaks)

Alert to email + SMS on any downtime. This app is used at 6am — downtime then is maximum damage.

### Cost Monitoring

Claude and OpenAI cost real money per call. Track this from day one.

```typescript
// Log token counts on every interpretation
logger.info({
  event: 'claude_call',
  input_tokens: response.usage.input_tokens,
  output_tokens: response.usage.output_tokens,
  cost_usd: (response.usage.input_tokens * 0.000003) + 
            (response.usage.output_tokens * 0.000015),
  user_id_hash,
  dream_id,
});
```

Set a Railway budget alert at $50/day. An abuse vector or bug in retry logic could run up a large bill very quickly.

---

## 8. Performance Budgets {#performance}

These are hard targets. If Fable's implementation doesn't meet them, the implementation needs to be revised, not the target.

| Metric | Target | Measurement method |
|---|---|---|
| App cold start to record screen | < 2 seconds | Measured on iPhone 12 (representative mid-range) |
| Voice recording start latency | < 200ms from button tap | Measured with React DevTools |
| Transcription display latency | Real-time during recording | N/A — streaming |
| Interpretation API p50 | < 4 seconds | Railway metrics |
| Interpretation API p95 | < 8 seconds | Railway metrics |
| Interpretation API p99 | < 12 seconds | Railway metrics |
| Journal list load (50 entries) | < 500ms | Measured with Flipper |
| Dream card memory footprint | < 2MB per card | React Native Profiler |

### Why 8 seconds at p95

Claude Sonnet 4.6 with 3,000 token input typically responds in 2–5 seconds. The extra margin covers:
- pgvector search (< 100ms)
- OpenAI embedding call (200–500ms)
- Network round trips (200–500ms mobile → Railway → Anthropic → back)
- JSON parsing and database write (< 100ms)

If p95 is exceeding 8 seconds in testing, investigate in this order: (1) Is Claude receiving too many tokens? Reduce history context. (2) Is the Railway instance cold-starting? Upgrade to paid tier. (3) Is the OpenAI embedding call slow? Switch to device-side embedding if available.

---

## 9. Mobile-Specific Requirements {#mobile}

### Offline Resilience

This app is used at 6am when cell signal is unreliable. The recording and transcription flow must work entirely offline. Interpretation requires network — that's acceptable — but losing a dream because the API was slow is not.

**Required: Local queue with Expo SQLite — encrypted at rest**

> **Security (OWASP Mobile M9 — see Section 4.7):** `raw_transcript` is intimate
> content. This database MUST be encrypted at rest (SQLCipher via `op-sqlite`, or
> `expo-sqlite` encryption) with the key held in the device keystore
> (`expo-secure-store`). Do NOT store dream text in plaintext SQLite, and purge rows
> once `sync_status = 'synced'`. Never persist transcripts on-device longer than needed.

```typescript
// Every dream entry is written to the ENCRYPTED local SQLite DB immediately on creation
// Sync to Supabase happens asynchronously
// UI shows local data first, cloud sync second

// Queue schema (SQLite):
CREATE TABLE dream_queue (
  local_id TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  raw_transcript TEXT NOT NULL,
  edited_transcript TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'synced', 'failed'
  synced_id TEXT,  -- server UUID after sync
  created_at TEXT NOT NULL
);
```

### Audio Recording Edge Cases

Every one of these will happen in production. Handle all of them:

1. **Incoming phone call during recording** — Recording must be pauseable. On iOS, `AVAudioSession` interruption handling required. Do not lose the transcript.
2. **App backgrounded during recording** — iOS kills background audio by default without `UIBackgroundModes: audio`. Expo AV requires explicit configuration. Test this on a real device, not simulator.
3. **Microphone permission denied** — Show a permission explanation screen with a "Go to Settings" deep link. Do not show the recording button in a broken state.
4. **Recording file too large** — Cap at 10 minutes. Show a "Recording limit reached" message at 9:00. Most dreams can be described in under 3 minutes; 10 minutes is generous.
5. **Device storage full** — Handle `AVAudioRecorder` write failure. Show a clear "Storage full" message, not a crash.

### Touch Targets

Apple HIG minimum: 44pt × 44pt. DreamLens is used in a half-awake state. All interactive elements should be **at minimum 56pt × 56pt** — larger than standard. The record button should be 88pt minimum.

### Dark Mode Only (v1)

This app is used in the dark, immediately upon waking. Do not implement a light mode for v1. The design system is dark-only. Future versions can add light mode as an option; forcing it for v1 doubles the design work for zero launch benefit.

### Haptic Feedback

Use `expo-haptics` on every meaningful interaction:
- Recording start: `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`
- Recording stop: `Haptics.notificationAsync(NotificationFeedbackType.Success)`
- Interpretation loaded: `Haptics.impactAsync(ImpactFeedbackStyle.Light)`
- Error state: `Haptics.notificationAsync(NotificationFeedbackType.Error)`

This is a 6am experience. Haptics confirm actions without requiring the user to look at the screen.

---

## 10. App Store Compliance {#appstore}

These are actual Apple requirements, not suggestions. Failure to address them causes rejection.

### Privacy Nutrition Label

You must declare every data type collected. For DreamLens:

| Data Type | Collected | Linked to Identity | Used for Tracking |
|---|---|---|---|
| Email address | Yes | Yes | No |
| User-generated content (dream transcripts) | Yes | Yes | No |
| Identifiers (user ID) | Yes | Yes | No |
| Usage data (app activity) | Yes | No | No |

**Audio recordings:** If you discard audio after transcription (recommended), you do not need to declare audio data as collected.

### Required Info.plist Strings

```plist
<key>NSMicrophoneUsageDescription</key>
<string>DreamLens uses your microphone to record your dream description immediately upon waking, before the memory fades. Recordings are transcribed on-device and not stored.</string>

<key>NSUserNotificationsUsageDescription</key>
<string>DreamLens can send you a morning reminder to log your dream before the memory fades.</string>
```

Apple will reject vague descriptions. "Used for app functionality" causes rejection.

### Account Deletion (Required by Apple since June 2023)

Users must be able to delete their account and all associated data from within the app. This must:
- Delete all dreams and transcripts from Supabase
- Delete user_patterns and user_profiles records
- Revoke Supabase Auth user
- Complete within a reasonable time (ideally immediate, or show status if async)
- Not require emailing support — must be done in-app
- **Revoke the Sign in with Apple token** if the user authenticated via Apple (Apple requirement since June 2023) — see Section 4A → "Account deletion + Apple token revocation"

```typescript
// DELETE /api/account — authenticated
// This is a required endpoint, not optional
async function deleteAccount(userId: UserId): Promise<void> {
  // 1. Delete all dreams (cascade handles related tables via FK)
  await supabase.from('dreams').delete().eq('user_id', userId);
  // 2. Delete user_patterns
  await supabase.from('user_patterns').delete().eq('user_id', userId);
  // 3. Delete user_profile
  await supabase.from('user_profiles').delete().eq('id', userId);
  // 4. Delete auth user (requires service_role key)
  await supabaseAdmin.auth.admin.deleteUser(userId);
}
```

### Mental Health Disclaimer

DreamLens is for reflection. It is not therapy. Apple's App Store review guidelines (section 5.1.3) require that apps handling sensitive personal information clearly disclose how data is used. Include this in:
1. Onboarding (screen 2 of 3, before any data is collected)
2. App Store description
3. Settings > About

Text: *"DreamLens is a journaling and reflection tool. It is not a substitute for professional mental health care. If you are experiencing distress, please contact a qualified professional."*

### GDPR/CCPA Compliance (Non-Optional)

If any user in the EU or California uses this app, these laws apply. Minimum requirements:
- Privacy policy URL in App Store listing (before launch, not after)
- In-app privacy policy link in Settings
- Data deletion capability (covered above)
- No third-party analytics that constitute "selling" data (Sentry is fine; Google Analytics on dreams is not)

---

## 11. Accessibility Standards {#accessibility}

### Minimum Requirements (WCAG 2.1 AA)

**Contrast ratios:**
- Normal text (< 18pt): 4.5:1 minimum against background
- Large text (≥ 18pt or 14pt bold): 3:1 minimum
- The gold (#C9A84C) on the base background (#070C1A, `Colors.bg.base`): ratio is ~8.2:1 ✓
- White (#FFFFFF) on the base background (#070C1A): ratio is ~21:1 ✓
- Muted text (rgba(255,255,255,0.55)) on midnight: ratio is ~4.8:1 ✓ (barely)
- **Warning:** Gold (#C9A84C) on indigo (#1E2A5A) must be checked — may fail at some sizes

**Screen reader support:**
- Every interactive element must have an `accessibilityLabel`
- The microphone button: `accessibilityLabel="Record dream"`, `accessibilityRole="button"`
- Recording state: `accessibilityLabel="Stop recording"` when active
- Interpretation result: marked as `accessibilityRole="text"`

**Reduced motion:**
- Use `useReducedMotion()` from React Native Reanimated
- All animations must be skippable when the user has enabled Reduce Motion in iOS settings
- The ambient particle effects on the record screen must be disabled under reduced motion

---

## 12. Knowledge Base Build Plan {#knowledgebase}

**This is the one thing Fable cannot do for you, and it is a real bottleneck.**

### The Copyright Reality

The primary academic sources for dream symbolism are NOT fully public domain in English:
- Freud's "The Interpretation of Dreams" (1899): Original German is public domain. Standard English translations (Strachey, 1953) are still under copyright in most jurisdictions.
- C.G. Jung's collected works: Copyright held by Princeton University Press. NOT public domain.
- Hall & Van de Castle (1953): Copyright still active.

What IS public domain or freely usable:
- Freud's pre-1928 work in English (older translations)
- Folk symbolism dictionaries predating 1928
- Academic papers on dream content analysis (many are open access)
- Your own original synthesis and commentary on commonly known symbols

### The Recommended Approach

Do not attempt to scrape or reproduce copyrighted interpretations. Instead:

**Option A (fastest, legally cleanest):** Generate the initial knowledge base using Claude as a synthesis tool. Claude can produce original interpretations of common dream symbols informed by Jungian and Freudian frameworks without reproducing copyrighted text. This is original content, not reproduction. Produce 500 entries before first build, 1000 by launch, 3000 by 90 days.

Example prompt for KB generation:
```
Write an original dream symbol interpretation for the symbol "{SYMBOL}" 
from the perspective of analytical psychology and cross-cultural symbolism.
Length: 100-150 words. Tone: scholarly but accessible.
Do not quote or reproduce any copyrighted text.
Output as JSON: { symbol, category, interpretation, source: "DreamLens Editorial" }
```

**Option B (highest quality, slowest):** Commission a consultant with a background in depth psychology to write interpretations. 500 entries at 100 words each is 50,000 words — approximately 3-4 weeks of professional writing work. Budget $5,000–$8,000.

**Option C (hybrid, recommended):** Use Option A to generate a working knowledge base for MVP. Commission Option B for v2 refinement after product-market fit is established.

### Minimum Viable KB (500 entries)

Prioritize in this order for the initial build:

1. **Universal scenarios (50 entries):** Falling, flying, teeth falling out, being chased, being late, appearing naked in public, exam/test, losing teeth, being unable to run, being paralyzed
2. **Common environments (60 entries):** Houses (generic), childhood home, school, office, water (ocean, river, lake, swimming pool), forest, city, unfamiliar building, airport, vehicle (car, train, plane)
3. **Common figures (60 entries):** Stranger/shadow figure, deceased relatives, celebrities, authority figures, children, animals (dog, cat, snake, spider, bird, horse, wolf)
4. **Jungian archetypes (30 entries):** Shadow, Anima, Animus, Self, Hero, Trickster, Great Mother, Wise Old Man, Persona, Puer Aeternus
5. **Emotional/somatic (50 entries):** Paralysis, falling sensation, flying, being watched, being lost, being followed, can't speak, can't scream
6. **Colors (15 entries):** Red, blue, black, white, gold, green, purple, gray, yellow
7. **Objects (100 entries):** Doors, windows, keys, mirrors, water, fire, weapons, vehicles, phones/technology, money, food, clothing
8. **Relationships (50 entries):** Romantic partner (known/unknown), parent figures, sibling, friend, enemy, teacher
9. **Body/somatic (50 entries):** Teeth, hands, eyes, wounds, illness, pregnancy, birth, death of self, transformation
10. **Nature/elements (35 entries):** Storm, earthquake, tsunami, flood, fire, drought, moon, sun, stars

---

## 13. Environment & Secret Management {#secrets}

### The Non-Negotiable Rule

**Secrets never appear in code, ever.** Not in comments. Not in test files. Not in git history. If a secret is committed to git, rotate it immediately regardless of whether the repo is private.

### Required Environment Variables

```bash
# apps/api/.env.example (commit this — it's a template, not a secret)
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # NEVER expose to client

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Monitoring
SENTRY_DSN=https://...@sentry.io/...

# Rate limiting
REDIS_URL=redis://...  # If using Redis for distributed rate limiting

# apps/mobile/.env.example
EXPO_PUBLIC_API_URL=https://api.dreamlens.app
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Google Sign-In (public client IDs — see Section 4A)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
# Apple Sign-In needs no client-side secret.
# Note: EXPO_PUBLIC_ prefix makes these bundled into the client app
# Never put service_role keys, the Google client secret, or the Apple .p8 key here
```

### Railway Secret Management

Store production secrets in Railway's environment variable UI. Never in a `.env` file committed to the repo. CI/CD pulls from Railway environment, not from files.

### .gitignore (verify before first commit)
```
.env
.env.local
.env.production
.env.staging
*.pem
*.key
```

---

## 14. Dependency Management {#dependencies}

### Approved Dependencies (use these, not alternatives)

```json
// API
{
  "dependencies": {
    "express": "^4.21",
    "express-rate-limit": "^7",
    "helmet": "^8",
    "cors": "^2",
    "zod": "^3",
    "@supabase/supabase-js": "^2",
    "@anthropic-ai/sdk": "^0.36",
    "openai": "^4",
    "@sentry/node": "^8",
    "winston": "^3"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "jest": "^29",
    "ts-jest": "^29",
    "supertest": "^7",
    "@types/express": "^4",
    "@types/supertest": "^6"
  }
}

// Mobile
{
  "dependencies": {
    "expo": "~53.0",
    "expo-av": "~15.0",
    "expo-speech-recognition": "~2.1.1",
    "expo-sqlite": "~15.0",
    "expo-secure-store": "~14.0",
    "expo-haptics": "~14.0",
    "expo-notifications": "~0.29",
    "expo-apple-authentication": "~7.1.0",
    "@react-native-google-signin/google-signin": "~13.1.0",
    "@react-navigation/native": "^6",
    "@react-navigation/stack": "^6",
    "@supabase/supabase-js": "^2",
    "zustand": "^5",
    "@sentry/react-native": "^6",
    "react-native-reanimated": "~3.16"
  }
}
```

> **Pin, don't float.** Every dependency above uses an exact or `~`-pinned range —
> `"latest"` is banned (it makes builds non-reproducible and violates this section's own
> rule). `expo-speech-recognition` is a community package versioned independently of the
> Expo SDK; confirm the exact release that supports Expo SDK 53 with
> `npx expo install expo-speech-recognition` and commit the resolved version.

### What NOT to Use

- **Redux:** Zustand is simpler and sufficient for this app's state complexity
- **React Query:** Fine library, but adds complexity when Zustand + direct Supabase queries are cleaner here
- **Axios:** The native `fetch` with a thin wrapper is sufficient
- **moment.js:** Use `date-fns` or native `Intl` — moment is 300kb and deprecated
- **Any library with < 1000 GitHub stars and < 6 months of maintenance**

### Keeping Dependencies Updated

Set up Dependabot in `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/apps/api"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "npm"
    directory: "/apps/mobile"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

---

## 15. Database Practices {#database}

### Migration Discipline

Every schema change is a migration file. No manual edits to the production database schema, ever.

```
supabase/migrations/
  20260704000001_initial_schema.sql
  20260704000002_add_rls_policies.sql
  20260704000003_seed_dream_symbols.sql
  20260710000001_add_needs_interpretation_flag.sql
```

Name convention: `YYYYMMDDHHMMSS_description.sql`

### Index Strategy

The queries that will run most often:

1. `SELECT * FROM dreams WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 20` — needs `idx_dreams_user_recorded`
2. `SELECT * FROM dreams WHERE user_id = ? AND embedding <=> ? ORDER BY distance LIMIT 10` — needs ivfflat index
3. `SELECT * FROM dream_symbols WHERE embedding <=> ? LIMIT 15` — needs ivfflat index
4. `SELECT symbol, occurrence_count FROM user_patterns WHERE user_id = ? ORDER BY occurrence_count DESC` — needs `idx_patterns_user_count`

```sql
-- Add these to the initial migration
CREATE INDEX idx_dreams_user_recorded 
  ON dreams(user_id, recorded_at DESC);

CREATE INDEX idx_dreams_embedding 
  ON dreams USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- 100 lists is appropriate for < 1M rows

CREATE INDEX idx_symbols_embedding 
  ON dream_symbols USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);  -- Smaller table needs fewer lists

CREATE INDEX idx_patterns_user_count 
  ON user_patterns(user_id, occurrence_count DESC);
```

### Never Do This

- Never run raw SQL queries with string interpolation (SQL injection risk)
- Never query Supabase with the service_role key from the mobile app
- Never disable RLS for convenience — write the policy correctly instead
- Never store computed values that could be derived from source data (except the embedding, which is expensive to recompute)

---

## 16. API Design Standards {#api}

### Response Format

Every API response must follow this shape. No exceptions. This allows the mobile app to handle all responses uniformly.

```typescript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { "field": ["error description"] }  // Optional, for validation errors
  }
}
```

### HTTP Status Codes

| Situation | Status |
|---|---|
| Successful creation | 201 |
| Successful read/update | 200 |
| Validation error | 400 |
| Unauthenticated | 401 |
| Unauthorized (authenticated but wrong user) | 403 |
| Not found | 404 |
| Conflict (duplicate, already exists) | 409 |
| Rate limited | 429 |
| External service unavailable (Claude down) | 503 |
| All other server errors | 500 |

### Versioning

Add `/v1/` prefix to all routes from the start:
- `POST /v1/dreams`
- `POST /v1/dreams/:id/interpret`
- `GET /v1/dreams`

When you make a breaking change, you add `/v2/` routes. The app version that uses `/v1/` keeps working until it's deprecated. Skipping this from the start is the most common API regret.

---

## 17. The Complete Fable 5 Build Prompt {#fable}

Copy this prompt in full. Do not summarize or paraphrase it. The specificity is intentional.

---

```
Build DreamLens: a voice-first dream journaling mobile app.

Read this entire prompt before writing any code. Every section matters.

═══════════════════════════════════════
SECTION 1: WHAT YOU ARE BUILDING
═══════════════════════════════════════

A React Native (Expo) mobile app + Node.js API backend that allows users to:
1. Record their dream by voice immediately upon waking
2. Review and optionally edit the auto-transcription
3. Receive an AI-powered interpretation via Claude
4. Build a searchable journal of all past dreams
5. Over time, see pattern analysis across their dream history

═══════════════════════════════════════
SECTION 2: TECH STACK (no deviations)
═══════════════════════════════════════

Mobile: React Native with Expo SDK 53, TypeScript strict mode
State: Zustand
Navigation: React Navigation v6 (Stack navigator)
Local storage: expo-sqlite (offline queue)
Audio: expo-av for recording, expo-speech-recognition for STT
Haptics: expo-haptics
Notifications: expo-notifications

Backend: Node.js with Express, TypeScript strict mode
Deployed to: Railway
Validation: Zod on all request bodies
Rate limiting: express-rate-limit
Logging: Winston (JSON structured output)
Error monitoring: Sentry (@sentry/node)

Database: Supabase (PostgreSQL + pgvector extension)
Auth: Supabase Auth (email/password + Apple Sign-In + Google Sign-In)
      Implement Google + Apple via the native ID-token flow in Section 4A — NOT web OAuth.
      Requires a custom dev client (expo prebuild), not Expo Go. Apple Sign-In is mandatory (Guideline 4.8).
File storage: None — audio is discarded after transcription

AI:
- Dream interpretation: Anthropic Claude (claude-sonnet-4-6)
- Embeddings: OpenAI text-embedding-3-small (1536 dimensions)

═══════════════════════════════════════
SECTION 3: BUILD ORDER (follow exactly)
═══════════════════════════════════════

Phase 0 — Foundation (do this before any feature code):
1. Initialize TypeScript monorepo with apps/mobile, apps/api, packages/shared
2. Configure tsconfig.json with strict mode on both apps
3. Set up Supabase project and run all migrations (see Section 5)
4. Write and run RLS policies (see Section 6)
5. Seed dream_symbols table with minimum 500 entries (see Section 9)
6. Write unit tests for domain type guards
7. Set up GitHub Actions CI (test on every push)
8. Configure Sentry in both apps

Phase 1 — Backend API:
1. Auth middleware (verify Supabase JWT)
2. Rate limiting middleware
3. Zod validation middleware
4. POST /v1/dreams endpoint
5. GET /v1/dreams endpoint (paginated)
6. GET /v1/dreams/:id endpoint
7. PUT /v1/dreams/:id endpoint (transcript edit only)
8. RAG pipeline service (embed → search → build context)
9. Claude integration service
10. POST /v1/dreams/:id/interpret endpoint
11. GET /v1/profile/patterns endpoint
12. DELETE /v1/account endpoint (required for App Store)
13. GET /v1/health endpoint
14. POST /v1/demo/interpret endpoint (public, heavily rate-limited)
15. Write integration tests for all endpoints

Phase 2 — Mobile App:
1. Design system tokens file (colors, typography, spacing — see Section 8)
2. Auth screens (Login, Register, ForgotPassword) — include Google + Apple sign-in buttons (Section 4A)
3. RecordScreen (the most important screen — see Section 10)
4. ReviewScreen
5. InterpretationScreen
6. JournalScreen (list)
7. EntryDetailScreen
8. ProfileScreen (pattern analysis)
9. SettingsScreen (notifications, account deletion)
10. Offline queue (expo-sqlite)
11. Morning reminder push notification
12. Write component tests for all screens

Phase 3 — Integration & Polish:
1. End-to-end flow testing
2. Offline behavior testing
3. Error states on all screens
4. Empty states on all screens
5. Loading states on all screens
6. RevenueCat integration stub (freemium gate at 10 dreams)
7. App Store metadata preparation

═══════════════════════════════════════
SECTION 4: TYPE DEFINITIONS
═══════════════════════════════════════

Create packages/shared/types/domain.ts with these exact types:

export type DreamId = string & { readonly brand: 'DreamId' };
export type UserId = string & { readonly brand: 'UserId' };

export interface DreamEntry {
  id: DreamId;
  userId: UserId;
  recordedAt: Date;
  rawTranscript: string;
  editedTranscript: string | null;
  interpretation: DreamInterpretation | null;
  needsInterpretation: boolean;
  createdAt: Date;
}

export interface DreamInterpretation {
  summary: string;
  themes: string[];
  symbols: SymbolInterpretation[];
  emotionalTone: string;
  patternNote: string | null;
  questionsToReflectOn: string[];
  generatedAt: Date;
  modelVersion: string;
}

export interface SymbolInterpretation {
  symbol: string;
  interpretation: string;
}

export interface DreamSymbol {
  id: string;
  symbol: string;
  category: SymbolCategory;
  interpretation: string;
  source: string;
}

export type SymbolCategory =
  | 'jungian_archetype' | 'scenario' | 'environment' | 'animal' | 'object'
  | 'body' | 'nature' | 'color' | 'relationship' | 'somatic' | 'freudian' | 'cultural';

export interface UserPattern {
  userId: UserId;
  symbol: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface UserPatternSummary {
  totalDreams: number;
  recurringSymbols: Array<{ symbol: string; count: number }>;
  dominantEmotionalTone: string | null;
  recentDreamSummaries: string[];
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

═══════════════════════════════════════
SECTION 5: DATABASE SCHEMA
═══════════════════════════════════════

Run these migrations in order in Supabase:

-- Migration 1: Enable extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- Migration 2: Core tables
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  reminder_time TIME,
  reminder_enabled BOOLEAN DEFAULT false,
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'annual')),
  dream_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  raw_transcript TEXT NOT NULL CHECK (char_length(raw_transcript) <= 5000),
  edited_transcript TEXT CHECK (char_length(edited_transcript) <= 5000),
  interpretation JSONB,
  emotional_tone TEXT,
  symbols JSONB,
  themes TEXT[],
  needs_interpretation BOOLEAN NOT NULL DEFAULT false,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dream_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'jungian_archetype','scenario','environment','animal','object',
    'body','nature','color','relationship','somatic','freudian','cultural'
  )),
  interpretation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'DreamLens Editorial',
  aliases TEXT[] NOT NULL DEFAULT '{}',      -- retrieval synonyms; folded into the embedding input
  traditions TEXT[] NOT NULL DEFAULT '{}',   -- which lens the entry draws on (transparency)
  content_hash TEXT,                          -- lets the seeder skip re-embedding unchanged rows
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The knowledge base is authored in the DreamLens Knowledge Vault and exported to
-- dream_symbols.clean.jsonl. Load + embed it with files/seed-dream-symbols.ts
-- (see §9). The similarity-search RPC match_dream_symbols() is defined in
-- migration 0002 (files/0002_dream_symbols_reference.sql) — the RAG pipeline (§7) calls it.

CREATE TABLE user_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Indexes
CREATE INDEX idx_dreams_user_recorded ON dreams(user_id, recorded_at DESC);
CREATE INDEX idx_dreams_needs_interp ON dreams(user_id) WHERE needs_interpretation = true;
CREATE INDEX idx_dreams_embedding ON dreams 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_symbols_embedding ON dream_symbols 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_patterns_user_count ON user_patterns(user_id, occurrence_count DESC);
CREATE INDEX idx_dreams_fts ON dreams 
  USING gin(to_tsvector('english', coalesce(raw_transcript,'') || ' ' || coalesce(edited_transcript,'')));

═══════════════════════════════════════
SECTION 6: ROW LEVEL SECURITY (required)
═══════════════════════════════════════

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "users_own_dreams" ON dreams
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_patterns" ON user_patterns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "dream_symbols_public_read" ON dream_symbols
  FOR SELECT USING (true);

═══════════════════════════════════════
SECTION 7: RAG PIPELINE (implement exactly)
═══════════════════════════════════════

When POST /v1/dreams/:id/interpret is called:

Step 1 — Embed transcript (with fallback):
  try {
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: dream.editedTranscript ?? dream.rawTranscript,
    });
    // Store embedding on dream record
  } catch (err) {
    // Log error with error code only, NOT transcript content
    // Continue to Step 3 without symbol retrieval (degraded mode)
    skipRag = true;
  }

Step 2 — Vector search (skip if Step 1 failed):
  const { data: symbols } = await supabase.rpc('match_dream_symbols', {
    query_embedding: embedding,
    match_count: 15,
    match_threshold: 0.7
  });
  // If symbols is empty array, that's fine — continue without symbol context

Step 3 — Get user pattern summary:
  const patterns = await getUserPatternSummary(userId);
  // Returns { totalDreams, recurringSymbols, dominantEmotionalTone, recentDreamSummaries }

Step 4 — Build Claude context:
  const symbolContext = symbols.map(s =>
    `SYMBOL: ${s.symbol}\nINTERPRETATION: ${s.interpretation}\nCATEGORY: ${s.category}`
  ).join('\n\n');

  const patternContext = patterns.totalDreams > 0 ? `
USER DREAM HISTORY (${patterns.totalDreams} total dreams):
Recurring symbols: ${patterns.recurringSymbols.slice(0,5).map(s => `${s.symbol} (${s.count}x)`).join(', ')}
Dominant emotional tone: ${patterns.dominantEmotionalTone ?? 'varied'}
Recent dream summaries (for context only):
${patterns.recentDreamSummaries.slice(0,3).join('\n')}
  ` : 'This is the user\'s first dream entry.';

Step 5 — Call Claude:
  The system prompt is specified in Section 7a below.
  Pass symbolContext and patternContext in the user message.
  Set max_tokens: 1000
  Set temperature: 0 (interpretations should be consistent, not random)

Step 6 — Parse response (with fallback):
  try {
    const parsed = JSON.parse(response.content[0].text);
    // Validate all required fields exist
    // If any field is missing, use safe defaults (see Section 7b)
  } catch {
    // Return safe default interpretation
    // Log the raw response text for debugging (truncated to 200 chars)
  }

Step 7 — Update database:
  UPDATE dreams SET
    interpretation = parsed,
    emotional_tone = parsed.emotionalTone,
    symbols = parsed.symbols,
    themes = parsed.themes,
    needs_interpretation = false,
    embedding = embedding  -- Store for future semantic search
  WHERE id = dreamId AND user_id = userId;

Step 8 — Update user_patterns:
  For each symbol in parsed.symbols:
    INSERT INTO user_patterns (user_id, symbol, occurrence_count, first_seen, last_seen)
    VALUES (userId, symbol.symbol, 1, NOW(), NOW())
    ON CONFLICT (user_id, symbol) DO UPDATE
    SET occurrence_count = user_patterns.occurrence_count + 1,
        last_seen = NOW();

═══════════════════════════════════════
SECTION 7a: CLAUDE SYSTEM PROMPT
═══════════════════════════════════════

Use this prompt exactly:

You are DreamLens, a thoughtful dream analyst grounded in analytical psychology and cross-cultural symbol traditions. Your tone is warm, curious, and non-prescriptive. You offer interpretations as possibilities, not diagnoses. You never claim to know definitively what a dream means. You do not give medical advice.

SYMBOL REFERENCE MATERIAL (use to inform, not to quote verbatim):
{symbolContext}

{patternContext}

THE DREAM:
{transcript}

Return ONLY a valid JSON object with exactly these fields and no other text:
{
  "summary": "2-3 sentence holistic interpretation of the dream as a complete experience",
  "themes": ["3-5 psychological or emotional themes present, as short phrases"],
  "symbols": [{"symbol": "name", "interpretation": "what this symbol might mean in context of THIS dream"}],
  "emotionalTone": "single dominant emotional quality (e.g. anxious, peaceful, surreal, melancholic, urgent)",
  "patternNote": "if recurring patterns exist in user history, reference them specifically here; otherwise null",
  "questionsToReflectOn": ["2-3 open questions to help the user connect dream to waking life"]
}

═══════════════════════════════════════
SECTION 7b: SAFE DEFAULT INTERPRETATION
═══════════════════════════════════════

When Claude fails or returns malformed JSON, return this:
{
  summary: "This dream contains imagery worth sitting with. Your subconscious may be working through something meaningful that hasn't yet resolved in waking life.",
  themes: ["Processing", "Inner exploration"],
  symbols: [],
  emotionalTone: "contemplative",
  patternNote: null,
  questionsToReflectOn: [
    "What emotions did this dream leave you with?",
    "Does anything in the dream connect to something happening in your life right now?"
  ]
}
Log the fallback occurrence with error code CLAUDE_MALFORMED_RESPONSE.

═══════════════════════════════════════
SECTION 8: DESIGN SYSTEM (implement as tokens)
═══════════════════════════════════════

Create this file as the ONLY source of design values.
Import from this file everywhere. Hard-code NOTHING.

// apps/mobile/src/design/tokens.ts

export const Colors = {
  // Backgrounds (darkest to lightest)
  bg: {
    base: '#070C1A',      // Screen background
    elevated: '#0D1628',  // Cards, modals
    overlay: '#141E3C',   // Bottom sheets
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
  },
  // Gold accent (the brand's single expressive color)
  gold: {
    primary: '#C9A84C',
    light: '#DFC27A',
    pale: '#EDD9A3',
    dim: 'rgba(201,168,76,0.15)',
    border: 'rgba(201,168,76,0.25)',
  },
  // Text
  text: {
    primary: '#F2EFEA',    // Main text — warm white, not pure white
    secondary: 'rgba(242,239,234,0.65)',  // Secondary labels
    muted: 'rgba(242,239,234,0.38)',      // Disabled, placeholder
    gold: '#C9A84C',       // Accented labels
  },
  // Semantic
  semantic: {
    error: '#E05C5C',
    success: '#5CB85C',
    warning: '#C9A84C',    // Gold doubles as warning
  },
  // Recording state
  recording: {
    active: '#E05C5C',
    pulse: 'rgba(224,92,92,0.25)',
  },
} as const;

export const Typography = {
  // Display — Cormorant Garamond, used sparingly for emotional moments
  display: {
    xl: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
    lg: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
    md: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
    sm: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 20, lineHeight: 26 },
  },
  // Body — Inter, used for all UI text
  body: {
    lg: { fontFamily: 'Inter_400Regular', fontSize: 17, lineHeight: 26 },
    md: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23 },
    sm: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
    xs: { fontFamily: 'Inter_300Light', fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },
  },
  // Labels — Inter Medium
  label: {
    lg: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 20 },
    md: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
    sm: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 14, letterSpacing: 0.08 },
  },
  // Eyebrow — Inter, uppercase, wide tracking
  eyebrow: {
    md: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 14, letterSpacing: 0.18, textTransform: 'uppercase' as const },
    sm: { fontFamily: 'Inter_500Medium', fontSize: 9, lineHeight: 12, letterSpacing: 0.16, textTransform: 'uppercase' as const },
  },
} as const;

export const Spacing = {
  // 8pt grid
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const TouchTargets = {
  minimum: 56,      // All interactive elements
  comfortable: 72,  // Most buttons
  record: 96,       // The record button specifically
} as const;

═══════════════════════════════════════
SECTION 9: KNOWLEDGE BASE SEED
═══════════════════════════════════════

The knowledge base is NOT generated ad hoc. It is authored in the **DreamLens Knowledge
Vault** (an Obsidian vault, see files/README.md) and exported to a machine-readable
JSONL that seeds the dream_symbols table. One source, one export — never hand-edit the DB.

**Seed pipeline (do this, in order):**
1. Take the vault export `files/dream_symbols.clean.jsonl` (wikilinks already flattened;
   fields: id, symbol, category, interpretation, source, aliases[], traditions[]).
2. Apply migration `files/0002_dream_symbols_reference.sql` (adds aliases/traditions/
   content_hash columns, the category CHECK, and the match_dream_symbols() RPC).
3. Run `files/seed-dream-symbols.ts` — it validates, upserts on id, and embeds each row.
   **Embedding input = symbol + aliases + interpretation** (aliases widen retrieval recall).
   Re-runs only re-embed rows whose content changed (content_hash), so it's cheap and idempotent.

**The vault's editorial stance (keep it):** entries do NOT assert "X means Y." They offer
interpretive lenses + reflective questions grounded in named traditions, and hand meaning
back to the dreamer — which is what Jung and Domhoff actually endorse, is legally safer
(original synthesis, not copyrighted reproduction), and is a stronger market position.
Reconcile the landing/PRD copy accordingly: drop "authoritative" for "grounded in depth
psychology and dream science" (see files/Positioning Notes.md).

**Content status (as of the current export): 113 core entries** — clears the 100-entry
bar and every per-category minimum below (scenario 20, environment 20, animal 15, object 15,
relationship 15, jungian_archetype 10, color 8, body+nature 10). Ready to seed. Continue
authoring in the vault post-launch toward the ~3,000-entry long-term target. Generation instruction for new entries: original interpretation
(100-150 words) informed by analytical psychology and the continuity hypothesis, offering
lenses + questions, never quoting copyrighted text.

Required categories and minimum entries (launch target):
- scenario: 20 (falling, flying, teeth, chased, late, naked in public, exam, paralysis, etc.)
- environment: 20 (house, childhood home, water, ocean, forest, school, airport, etc.)
- animal: 15 (snake, dog, cat, spider, bird, horse, wolf, bear, etc.)
- jungian_archetype: 10 (shadow, anima, animus, hero, trickster, self, wise old man, etc.)
- relationship: 15 (stranger, deceased relative, parent, romantic partner, etc.)
- object: 15 (door, mirror, key, window, fire, vehicle, phone, etc.)
- body / nature: 10 (teeth, hands, eyes; storm, flood, moon, etc.)
- color: 8 (red, black, white, gold, blue, green, purple, gray)

═══════════════════════════════════════
SECTION 10: RECORDSCREEN (most important screen)
═══════════════════════════════════════

This is the screen that determines whether the product succeeds. It must be:
- Reachable in ONE tap from the app icon (via a widget, OR as the default landing screen for returning users)
- Fully functional within 2 seconds of app open
- Usable with eyes half-closed in the dark

Layout (single screen, no scroll):
- Status bar area: transparent
- Safe area top: 16pt breathing room
- Screen title: "This morning's dream" — Typography.display.sm, Colors.text.secondary
- Current date: Typography.eyebrow.sm, Colors.text.muted (e.g. "FRIDAY, JULY 4")
- Large empty space (~30% of screen height) — intentional, not a placeholder
- Transcript preview area: If recording, shows live transcription text in Typography.body.lg italic
                          If not recording, shows "Speak when ready" in Colors.text.muted
- Record button: centered, 96pt diameter circle
  - Border: 2pt, Colors.gold.border
  - Background: Colors.bg.elevated
  - Icon: microphone SVG, 36pt, Colors.gold.primary
  - When recording: border becomes Colors.recording.active, pulse animation
  - Accessibility label: "Record dream" / "Stop recording"
  - Minimum touch target: 120pt (use a transparent press area around the 96pt button)
- Below button: hint text, Typography.body.sm, Colors.text.muted
  - Default: "Tap to begin"
  - Recording: "Listening... tap to stop"
  - Stopped: "Reviewing transcript"
- Bottom safe area: "Journal" text link, right-aligned, Typography.label.md, Colors.text.secondary

Recording behavior:
1. Tap button → requestMicrophonePermission() if not granted
2. If permission denied → navigate to PermissionExplainScreen
3. If permission granted → expo-speech-recognition starts
4. STT results stream into transcript preview in real time
5. Tap button again → stop recognition
6. Navigate to ReviewScreen with { rawTranscript, recordedAt }

Error states (all must be handled):
- Microphone permission denied: Show explanation screen with Settings deep link
- STT not available: Show "Type instead" option
- Recording interrupted (phone call): Save current transcript, pause state, resume prompt

═══════════════════════════════════════
SECTION 11: ERROR HANDLING RULES
═══════════════════════════════════════

Every screen must have three states: loading, content, error.
Never show a blank screen.

Error state component requirements:
- Icon: simple illustration (not red X — this is a wellness app)
- Title: explain what happened without technical jargon
- Body: tell the user what to do next
- Action: retry button (or specific action)

Example error states:
- "Couldn't interpret your dream" / "Your dream is saved. Tap to try again." / [Try Again]
- "Can't connect right now" / "Check your connection and try again." / [Retry]
- "Something went wrong" / "Your dream is saved. We'll be back shortly." / [View Journal]

═══════════════════════════════════════
SECTION 12: TESTING REQUIREMENTS
═══════════════════════════════════════

Write tests as you build, not after. Every feature ships its test suite in the SAME
commit/PR — a feature with no tests is not done, and CI fails the PR if changed lines
fall below 85% coverage (patch-coverage gate, Section 3).

After building the RAG pipeline, write unit tests for:
- embed → vector output
- pgvector search → symbol array
- context builder → string under 4000 tokens
- JSON parser → DreamInterpretation or fallback

After building each API route, write integration tests for:
- Happy path (201/200 with correct body)
- Missing auth (401)
- Invalid input (400 with field errors)
- Wrong user's resource (403)
- Rate limit exceeded (429)

After building each screen, write component tests for:
- Renders correctly in default state
- Handles loading state
- Handles error state
- Key user interactions

Do not test: Supabase internals, React Navigation transitions, RevenueCat

═══════════════════════════════════════
SECTION 13: SECURITY CHECKLIST
═══════════════════════════════════════

Before considering any feature "done," verify:
[ ] The feature ships with its test suite in this PR; patch coverage >= 85% (CI green)
[ ] RLS policies are in place for all new tables
[ ] All request bodies pass through Zod validation
[ ] No dream content appears in logs
[ ] Service role key is never referenced in mobile app code
[ ] Rate limiting applies to this endpoint
[ ] User can only access their own data (test with two users)
[ ] OWASP CI jobs pass: Trivy (SCA), Semgrep (SAST), gitleaks (secrets) — Section 4.7
[ ] Any on-device sensitive data (offline dream queue, session token) is stored
    encrypted / in SecureStore, never plaintext SQLite or AsyncStorage (Mobile M9)

═══════════════════════════════════════
SECTION 14: MONETIZATION GATE
═══════════════════════════════════════

Free tier: 10 dreams with full interpretation
Gate logic: On POST /v1/dreams, check user_profiles.dream_count
  If count >= 10 AND subscription_tier = 'free':
    Return 402 with { code: 'UPGRADE_REQUIRED', message: 'Upgrade to Pro for unlimited dreams' }
  Else:
    Create dream, increment dream_count

RevenueCat: Implement as a stub for now. The freemium gate must work. Payment flow can be a placeholder screen that shows the paywall UI without actual purchase flow. Label it clearly as a placeholder.

DO NOT delay the gate implementation. It must exist from Phase 1.
```

---

*End of DreamLens Technical Engineering Standards v1.0*
