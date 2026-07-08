# DreamLens Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React Native (Expo) mobile app — voice-first dream capture, interpretation display, journal, patterns profile, settings — consuming the existing DreamLens API on `main`.

**Architecture:** A new `apps/mobile` npm workspace (Expo + TypeScript strict). Screens are thin; logic lives in hooks/stores/services. All server data flows through one `api.ts` client that unwraps the `{success,data}|{success:false,error}` envelope. Dreams are written to an encrypted local SQLite queue first and synced to the API asynchronously (offline-first capture). Auth is Supabase (email/password now, Apple/Google in Task 13); the Supabase access token is sent as `Authorization: Bearer` to the API. Design values come exclusively from `src/design/tokens.ts`.

**Tech Stack:** Expo (latest SDK), TypeScript strict, jest-expo + @testing-library/react-native, Zustand, @react-navigation/native-stack, @supabase/supabase-js, expo-sqlite (SQLCipher), expo-secure-store, expo-speech-recognition, expo-notifications, expo-haptics, react-native-svg, @expo-google-fonts (Cormorant Garamond + Inter).

## Binding source documents (implementers: your brief quotes what you need; controllers: these govern)

- `dreamlens-ui-design-spec.md` — **binding** visual spec (screens, components, copy, animations, a11y).
- `dreamlens-engineering-standards.md` — §2 structure, §3 testing, §4.7 Mobile M9, **§4A auth (complete Apple/Google code)**, §5 errors, §9 mobile requirements, §10 App Store compliance, §11 a11y, and the Fable build prompt's SECTION 8 (tokens.ts — copy verbatim), SECTION 10 (RecordScreen), SECTION 11 (error rules), SECTION 14 (monetization gate).
- `dreamlens-pattern-engine-plan.md` Task 9 (lines 894–992) — the deferred Profile-surfaces task, absorbed here as Task 11.

## Global Constraints

- Every color/spacing/type value comes from `apps/mobile/src/design/tokens.ts` — hard-code NOTHING. tokens.ts is copied **verbatim** from engineering-standards Fable-prompt SECTION 8 (the `Colors`/`Typography`/`Spacing`/`Radius`/`TouchTargets` objects, lines 2063–2156). Where the UI design spec's prose values differ, **tokens.ts wins**.
- Two typefaces only: Cormorant Garamond (300/400, never bold — dream content and emotional moments only) and Inter (all UI). Never mixed in one text block.
- API responses are the envelope `{success:true,data}|{success:false,error:{code,message,details?}}`; all routes under `/v1`. The client unwraps once, in `api.ts`.
- No dream content (transcripts, interpretations, notes) in logs or error reports. No secrets in the mobile bundle beyond the Supabase publishable/anon key. Service-role key must never appear in `apps/mobile`.
- On-device sensitive data (dream queue, session tokens) is encrypted: SQLCipher for SQLite, expo-secure-store for keys/sessions. Never plaintext AsyncStorage for dream text or tokens (Mobile M9).
- Every screen has loading / content / error states; never a blank screen. Error states name the recovery action.
- Copy rules: sentence case, no exclamation marks, no "we/our", counts are specific. Use the exact microcopy from the design spec's COPY STYLE GUIDE where defined.
- Touch targets ≥ 56dp; record button 96dp visible / 128dp tap area. Interactive elements have `accessibilityLabel`s. Reduced motion: translateY animations become opacity-only; sequential reveals collapse.
- No gradients, no drop shadows, no spinners (breathing circle instead), no celebration animations, no streak flames or gamification (this overrides PRD F15), no avatar placeholders. The ✦ glyph appears only in the pattern-note card header.
- Tests ship in the same commit as the feature (TDD: failing test first). CI patch coverage ≥ 85% on changed lines. Component tests cover default/loading/error states + key interactions. Do not test Supabase internals, React Navigation transitions, or RevenueCat.
- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, matching `apps/api/tsconfig.json`.
- All commands run from repo root using `--workspace apps/mobile` (single root lockfile; matches CI).

---

### Task 1: Expo scaffold, design tokens, fonts, jest, CI

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/app.json`, `apps/mobile/App.tsx`, `apps/mobile/index.ts`, `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.ts`, `apps/mobile/src/design/tokens.ts`, `apps/mobile/.env.example`
- Modify: `.github/workflows/test.yml` (test-mobile job → root-workspace install pattern)
- Test: `apps/mobile/__tests__/tokens.test.ts`, `apps/mobile/__tests__/App.test.tsx`

**Interfaces:**
- Produces: `Colors`, `Typography`, `Spacing`, `Radius`, `TouchTargets` exported from `src/design/tokens.ts` (verbatim from engineering-standards SECTION 8); an `App` that loads fonts (blank `Colors.bg.base` screen while loading — never system fonts) and renders a placeholder root. Every later task depends on this workspace compiling and testing via `npm test --workspace apps/mobile`.

- [ ] **Step 1: Scaffold the workspace**

```bash
cd apps && npx create-expo-app@latest mobile --template blank-typescript && cd ..
npm install   # re-link workspaces from root
```

Then edit `apps/mobile/package.json`: set `"name": "@dreamlens/mobile"`, add scripts `"typecheck": "tsc --noEmit"`, `"test": "jest"`, and devDependencies `jest`, `jest-expo`, `@testing-library/react-native`, `react-test-renderer` (match the React version Expo installed). Add dependencies used across the app now so later tasks don't churn the lockfile: `@expo-google-fonts/cormorant-garamond`, `@expo-google-fonts/inter`, `expo-font`, `expo-splash-screen`, `zustand`.

`apps/mobile/tsconfig.json` extends Expo's base and adds the strict flags:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["jest"]
  }
}
```

`apps/mobile/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|zustand)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
```

- [ ] **Step 2: Write failing token/App tests**

```typescript
// apps/mobile/__tests__/tokens.test.ts
import { Colors, Typography, Spacing, Radius, TouchTargets } from '../src/design/tokens';

it('matches the binding SECTION 8 values', () => {
  expect(Colors.bg.base).toBe('#070C1A');
  expect(Colors.gold.primary).toBe('#C9A84C');
  expect(Colors.text.primary).toBe('#F2EFEA');
  expect(Colors.recording.active).toBe('#E05C5C');
  expect(Typography.display.md.fontFamily).toBe('CormorantGaramond_400Regular');
  expect(Typography.body.lg.fontSize).toBe(17);
  expect(Typography.eyebrow.md.textTransform).toBe('uppercase');
  expect(Spacing[8]).toBe(32);
  expect(Radius.full).toBe(9999);
  expect(TouchTargets.record).toBe(96);
});
```

```tsx
// apps/mobile/__tests__/App.test.tsx
import { render } from '@testing-library/react-native';
import App from '../App';

jest.mock('@expo-google-fonts/cormorant-garamond', () => ({
  useFonts: () => [true, null],
  CormorantGaramond_300Light: 1, CormorantGaramond_300Light_Italic: 1,
  CormorantGaramond_400Regular: 1, CormorantGaramond_400Regular_Italic: 1,
}));

it('renders the root once fonts are loaded', () => {
  const { getByTestId } = render(<App />);
  expect(getByTestId('app-root')).toBeTruthy();
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test --workspace apps/mobile`
Expected: FAIL (tokens.ts and app-root do not exist).

- [ ] **Step 4: Implement tokens.ts and App.tsx**

`src/design/tokens.ts`: copy the `Colors`, `Typography`, `Spacing`, `Radius`, `TouchTargets` blocks **verbatim** from `dreamlens-engineering-standards.md` lines 2065–2156 (SECTION 8). Do not adjust any value toward the UI-design-spec prose — tokens.ts wins by decree of that spec's own header.

```tsx
// apps/mobile/App.tsx
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_300Light, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Colors } from './src/design/tokens';

export default function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light,
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
  });
  // Blank dark screen while fonts load — never show system fonts.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
  return (
    <View testID="app-root" style={{ flex: 1, backgroundColor: Colors.bg.base }}>
      <StatusBar style="light" />
    </View>
  );
}
```

`app.json`: set `"userInterfaceStyle": "dark"`, `"backgroundColor": "#070C1A"` (splash + android), name `DreamLens`, slug `dreamlens`.

`apps/mobile/.env.example`:

```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 5: Update the CI test-mobile job**

In `.github/workflows/test.yml`, replace the four `cd apps/mobile && npm ...` steps with the root-workspace pattern used by test-api (the `exists` guard stays):

```yaml
      - if: steps.check.outputs.exists == 'true'
        run: npm ci
      - if: steps.check.outputs.exists == 'true'
        run: npm run typecheck --workspace apps/mobile
      - if: steps.check.outputs.exists == 'true'
        run: npm test --workspace apps/mobile -- --coverage --coverageReporters=lcov
```

(The diff-cover step already points at `apps/mobile/coverage/lcov.info` — keep it.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test --workspace apps/mobile && npm run typecheck --workspace apps/mobile`
Expected: PASS. Also run `npm test --workspace apps/api` once to confirm the root install didn't break the API workspace.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile package.json package-lock.json .github/workflows/test.yml
git commit -m "feat(mobile): Expo scaffold, binding design tokens, font loading, jest + CI wiring"
```

---

### Task 2: Core component library

**Files:**
- Create: `apps/mobile/src/components/PrimaryButton.tsx`, `OutlinedButton.tsx`, `TextButton.tsx`, `Card.tsx`, `Pill.tsx`, `InputField.tsx`, `ToggleRow.tsx`, `EmptyState.tsx`, `BreathingCircle.tsx` (all under `src/components/`)
- Test: `apps/mobile/__tests__/components.test.tsx`

**Interfaces:**
- Produces (exact props):
  - `PrimaryButton({ label, onPress, disabled? })` — 52dp, radius full, bg `Colors.gold.primary`, text `#070C1A` via `Colors.bg.base`, Typography.label.lg, pressed scale 0.97, disabled opacity 0.35. Exactly one per screen.
  - `OutlinedButton({ label, onPress, disabled? })` — transparent bg, 1dp `Colors.bg.borderStrong` border, text `Colors.text.primary`.
  - `TextButton({ label, onPress, tone?: 'primary'|'secondary'|'gold' })` — ≥44dp touch height via padding.
  - `Card({ children, variant?: 'default'|'gold'|'symbol' })` — default: bg.elevated + bg.border + Radius.md + Spacing[4] padding; gold: `Colors.gold.dim` bg + `Colors.gold.border`; symbol: default + 2dp left border `Colors.gold.primary`, left radius 0.
  - `Pill({ label, tone?: 'gold'|'neutral' })` — eyebrow.sm text, radius full.
  - `InputField({ value, onChangeText, placeholder?, multiline?, ...textInputProps })` — bg `rgba(255,255,255,0.05)` (define as a local const derived from the input spec — the one token gap; put it IN tokens.ts as `Colors.bg.input` in this task), border bg.border, focus border gold.primary.
  - `ToggleRow({ label, value, onValueChange })` — Switch with track on = gold.primary, thumb on = bg.base.
  - `EmptyState({ title, body?, actionLabel?, onAction?, variant?: 'default'|'loading'|'error' })` — centered, max-width 280; `loading` renders `BreathingCircle` + optional title; used as every screen's loading/error scaffold.
  - `BreathingCircle()` — 48dp circle, `Colors.gold.border` border, opacity pulse 0.4→0.8→0.4 over 2s (Animated loop); static at 0.6 under reduced motion. **Never a spinner.**
- Consumes: tokens from Task 1.

- [ ] **Step 1: Write failing tests** — one `describe` per component in `components.test.tsx`; assert: renders label/children; `onPress` fires; disabled blocks press; `Card` gold variant has gold border color in flattened style; `EmptyState` error variant shows action button and fires `onAction`; `PrimaryButton` has `accessibilityRole="button"` and ≥52 height; `Pill` uppercases via eyebrow typography. Mock `AccessibilityInfo.isReduceMotionEnabled` to resolve `false`.

- [ ] **Step 2: Run to confirm failure** — `npm test --workspace apps/mobile -- components` → FAIL.

- [ ] **Step 3: Implement** the nine components. Rules: every value from tokens; `Pressable` with `hitSlop` to reach 56dp targets; no shadows; `accessibilityLabel` defaults to `label`. Add `Colors.bg.input: 'rgba(255,255,255,0.05)'` to tokens.ts (extends, does not alter, SECTION 8 values) and cover it in `tokens.test.ts`.

- [ ] **Step 4: Run tests** — PASS, plus `npm run typecheck --workspace apps/mobile`.

- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): core component library from design tokens"`

---

### Task 3: API client, auth store, sign-in/up screens

**Files:**
- Create: `apps/mobile/src/services/supabase.ts`, `src/services/api.ts`, `src/store/authStore.ts`, `src/screens/AuthScreen.tsx`
- Test: `apps/mobile/__tests__/api.test.ts`, `__tests__/authStore.test.ts`, `__tests__/AuthScreen.test.tsx`

**Interfaces:**
- Consumes: API envelope contract; Supabase Auth (email/password).
- Produces:
  - `supabase` — client from `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`, with an expo-secure-store storage adapter (`getItem/setItem/removeItem` wrapping `SecureStore.getItemAsync` etc.), `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`.
  - `api.get/post/put/del(path, body?)` → resolves `data` on `{success:true}`, throws `ApiError { code, message, status }` on `{success:false}` or network failure (code `'NETWORK'`). Injects `Authorization: Bearer <access_token>` from the current Supabase session; base URL from `EXPO_PUBLIC_API_URL`. **Never logs request/response bodies.**
  - `useAuthStore` (Zustand): `{ session, status: 'loading'|'signedOut'|'signedIn', signIn(email,pw), signUp(email,pw), signOut() }`; initializes from `supabase.auth.getSession()` and subscribes to `onAuthStateChange`.
  - `AuthScreen` — email + password `InputField`s, `PrimaryButton` "Sign in", `TextButton` toggle to "Create account"; errors surface as `Colors.semantic.error` body-sm text naming the fix ("Check your email and password."). Sentence case, no exclamation marks.

- [ ] **Step 1: Failing tests.** `api.test.ts`: mock global.fetch + mock `supabase.auth.getSession` → asserts bearer header, envelope unwrap, ApiError code passthrough (`UPGRADE_REQUIRED` with status 402), network failure → code `'NETWORK'`. `authStore.test.ts`: mock `./src/services/supabase` module; signIn success flips status; failure keeps signedOut and surfaces message. `AuthScreen.test.tsx`: renders inputs; submit calls `signIn`; error text visible on rejection.

- [ ] **Step 2:** `npm test --workspace apps/mobile -- api authStore AuthScreen` → FAIL.

- [ ] **Step 3: Implement.** Add deps: `@supabase/supabase-js`, `expo-secure-store`. `api.ts` core:

```typescript
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('NETWORK', "Can't connect right now.", 0);
  }
  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;
  if (json?.success) return json.data;
  throw new ApiError(json?.error.code ?? 'UNKNOWN', json?.error.message ?? 'Something went wrong.', res.status);
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
```

- [ ] **Step 4:** tests PASS + typecheck.
- [ ] **Step 5: Commit** — `feat(mobile): api client with envelope unwrap, supabase auth store, auth screen`

---

### Task 4: Encrypted offline dream queue + sync engine

**Files:**
- Create: `apps/mobile/src/services/dreamQueue.ts`, `src/services/sync.ts`, `src/store/dreamStore.ts`, `src/hooks/useDreams.ts`
- Test: `apps/mobile/__tests__/dreamQueue.test.ts`, `__tests__/sync.test.ts`, `__tests__/useDreams.test.tsx`

**Interfaces:**
- Consumes: `api` (Task 3); `POST /v1/dreams` (`{ recordedAt, rawTranscript, editedTranscript? }` — camelCase, matching `CreateDreamSchema` in `apps/api/src/validation/schemas.ts` → dream row), `GET /v1/dreams?page=`.
- Produces:
  - `dreamQueue`: `init()` (opens SQLCipher DB keyed from expo-secure-store — generate a random 32-byte hex key on first run via `Crypto.getRandomBytesAsync`, store under `dreamlens.dbkey`), `enqueue({ localId, recordedAt, rawTranscript, editedTranscript? })`, `pending()`, `markSynced(localId, syncedId)` (**deletes the row** — purge on sync per Mobile M9), `markFailed(localId)`. Schema = `dream_queue` from engineering-standards §9 verbatim.
  - `sync.flush()`: for each pending row → `api.post('/v1/dreams', ...)`; success → `markSynced`; `ApiError` 402 `UPGRADE_REQUIRED` → markFailed + surface `upgradeRequired` flag; network error → leave pending (retry later). Serial, oldest first. Returns `{ synced, failed, upgradeRequired }`.
  - `useDreamStore` (Zustand): `{ dreams, upgradeRequired, addLocal(dream), refresh() }` — `refresh()` = `flush()` then `GET /v1/dreams` merged with still-pending local rows (pending rows render with a `pending: true` marker).
  - `useDreams()` hook: `{ status: 'loading'|'ok'|'error', dreams, retry }` wrapping the store for list screens.
- Config: add `expo-sqlite` with `"useSQLCipher": true` in its config plugin options in app.json; deps `expo-sqlite`, `expo-crypto`.

- [ ] **Step 1: Failing tests.** Mock `expo-sqlite` with an in-memory JS table double and `expo-secure-store` with a Map. Cover: first `init()` generates + persists a key, second `init()` reuses it; enqueue→pending roundtrip; `markSynced` removes the row (assert the double's rows length is 0 — purge, not flag-flip); `sync.flush()` posts oldest-first, 402 sets `upgradeRequired: true` and does not retry that row, network error leaves the row pending; `useDreams` exposes loading→ok and error→retry.

- [ ] **Step 2:** run → FAIL. 
- [ ] **Step 3:** implement (SQL via `db.runAsync`/`getAllAsync`; `PRAGMA key = '<hex>'` immediately after open).
- [ ] **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** — `feat(mobile): encrypted offline dream queue with purge-on-sync and 402-aware sync engine`

---

### Task 5: Navigation shell + onboarding

**Files:**
- Create: `apps/mobile/src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`, `src/screens/OnboardingFlow.tsx`
- Modify: `apps/mobile/App.tsx` (render `RootNavigator` inside `NavigationContainer` with a dark theme built from tokens)
- Test: `apps/mobile/__tests__/OnboardingFlow.test.tsx`, `__tests__/RootNavigator.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 3).
- Produces: native-stack param list `{ Onboarding, Auth, Record, Review: { rawTranscript: string; recordedAt: string }, Interpretation: { dreamId: string } | { localDream: … }, Journal, EntryDetail: { dreamId: string }, Profile, Settings, Paywall }`. Routing rule: `status==='loading'` → blank bg.base view; signedOut → Onboarding (first run, tracked via secure-store flag `dreamlens.onboarded`) or Auth; signedIn → Record as home. **Record screen: `headerShown: false`** (no nav bar — design mandate). All other screens: transparent header, `Colors.text.primary` title in Typography.label.lg, no tab bar anywhere (stack only).
- Onboarding: 3 screens exactly per design spec Screen 8 (copy verbatim: "Every morning, your subconscious leaves you a message." / "Before we begin" privacy rows / "Let's begin."). Horizontal pager or internal step state; "I understand, continue"; final "Record now" sets the onboarded flag and routes to Auth (account before first record, since dreams sync to a user).

- [ ] **Step 1: Failing tests.** OnboardingFlow: renders screen-1 headline; advancing reaches privacy rows ("This is reflection, not therapy."); finishing invokes `onDone`. RootNavigator: with mocked auth `signedOut` + onboarded flag set renders AuthScreen; `signedIn` renders RecordScreen placeholder (Task 6 replaces it — for now assert route name via `getByTestId('record-placeholder')`).
- [ ] **Step 2:** FAIL. 
- [ ] **Step 3:** implement; deps `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`.
- [ ] **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): navigation shell with auth/onboarding gating and 3-screen onboarding`

---

### Task 6: RecordScreen + speech recognition

**Files:**
- Create: `apps/mobile/src/screens/RecordScreen.tsx`, `src/components/RecordButton.tsx`, `src/hooks/useSpeechRecognition.ts`, `src/screens/PermissionExplainScreen.tsx`, `src/services/haptics.ts`
- Test: `apps/mobile/__tests__/RecordScreen.test.tsx`, `__tests__/useSpeechRecognition.test.ts`

**Interfaces:**
- Consumes: navigation (Task 5); `expo-speech-recognition` (dep to add), `expo-haptics`.
- Produces:
  - `useSpeechRecognition()` → `{ state: 'idle'|'listening'|'stopped'|'denied'|'unavailable', transcript, start(), stop(), reset() }`. `start()` requests mic+speech permission; denied → `state:'denied'`; module unavailable → `'unavailable'`. Streams partial results into `transcript`. Handles interruption (end event while listening → keep transcript, state `'stopped'`).
  - `haptics.recordStart/recordStop/interpretationReady/error/buttonPress` — thin wrappers per engineering-standards §9 mapping; no-ops under test.
  - `RecordButton({ state, onPress })` — implements the design spec's five states verbatim (default/press/recording/stopping/disabled; 96dp; pulse ring 96→120dp 1600ms repeating; ring only, never the button; reduced motion → border opacity pulse; `accessibilityLabel` "Start recording"/"Stop recording").
  - `RecordScreen` — layout per engineering-standards SECTION 10 + design spec Screen 1: title "This morning's dream", uppercase date eyebrow, chrome-less transcript area (body-lg italic; placeholder "Speak when you're ready." — muted, centered), record button, hint text ("Tap to begin"/"Listening..."), bottom-right "Journal →" TextButton. **No nav bar, no card around the transcript.** Stop → `haptics.recordStop` → navigate `Review { rawTranscript, recordedAt: new Date().toISOString() }` when transcript non-empty; `'denied'` → PermissionExplainScreen (Settings deep link via `Linking.openSettings()`); `'unavailable'` → "Type instead" TextButton routing to Review with empty transcript.

- [ ] **Step 1: Failing tests.** Mock `expo-speech-recognition` module + haptics. Hook: start→listening, results event appends transcript, stop→stopped, denied path. Screen: default shows placeholder + "Tap to begin"; tap → start called + "Listening..."; second tap with transcript navigates to Review with params; denied state routes to permission screen; unavailable shows "Type instead".
- [ ] **Step 2:** FAIL. → **Step 3:** implement (add `app.json` plugin config for `expo-speech-recognition` with the exact `NSMicrophoneUsageDescription`/`NSSpeechRecognitionUsageDescription` strings from engineering-standards §10 App Store section). → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): record screen with streaming speech-to-text, permission and unavailable fallbacks`

---

### Task 7: ReviewScreen + create-and-interpret flow

**Files:**
- Create: `apps/mobile/src/screens/ReviewScreen.tsx`, `src/services/dreams.ts`
- Test: `apps/mobile/__tests__/ReviewScreen.test.tsx`, `__tests__/dreamsService.test.ts`

**Interfaces:**
- Consumes: `dreamQueue`/`sync` (Task 4), `api` (Task 3), navigation (Task 5). API: `POST /v1/dreams`, `POST /v1/dreams/:id/interpret`.
- Produces: `dreams.submit({ rawTranscript, editedTranscript, recordedAt, interpret: boolean })` → enqueue locally → `sync.flush()` → if synced and `interpret`, navigate Interpretation with the server id (interpretation call happens on that screen so its loading state owns the wait); if offline, dream stays queued and the user lands on Journal with the pending row visible ("Your dream is saved."); if `upgradeRequired`, navigate Paywall. `ReviewScreen` per design spec Screen 2 verbatim: DATE eyebrow + timestamp, "Review your dream" display-sm, editable multiline InputField (min 200dp, max 55% screen), whispered italic hint, PrimaryButton "Interpret this dream", TextButton "Save without interpreting". Transcript cap: 5000 chars (client-side guard matching API).

- [ ] **Step 1: Failing tests.** Service: interpret path (enqueue→flush→returns `{ syncedId }`), offline path (returns `{ queued: true }`), 402 path (returns `{ upgradeRequired: true }`). Screen: renders transcript param into input; editing updates; CTA calls submit with edited text; offline result shows "Your dream is saved." and routes to Journal; cap enforced at 5000.
- [ ] **Step 2:** FAIL. → **Step 3:** implement. → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): review screen and offline-first submit flow with interpret/save-only/402 branches`

---

### Task 8: InterpretationScreen

**Files:**
- Create: `apps/mobile/src/screens/InterpretationScreen.tsx`, `src/components/InterpretationView.tsx`, `src/hooks/useInterpretation.ts`
- Test: `apps/mobile/__tests__/InterpretationScreen.test.tsx`

**Interfaces:**
- Consumes: `api` (`POST /v1/dreams/:id/interpret` → dream with `interpretation { summary, themes[], symbols[{symbol,interpretation}], emotionalTone|emotional_tone, patternNote|pattern_note, questionsToReflectOn|questions_to_reflect_on }`; `GET /v1/dreams/:id` when already interpreted), haptics, Task 2 components.
- Produces:
  - `useInterpretation(dreamId)` → `{ status: 'loading'|'ok'|'error', dream, retry }`; fetches the dream, calls interpret only if `interpretation` is null; fires `haptics.interpretationReady` on success. Normalize snake_case/camelCase fields in ONE mapper here — screens see camelCase only.
  - `InterpretationView({ interpretation, recordedAt })` — reusable by EntryDetail (Task 10). Section order and styling verbatim from design spec Screen 3: emotional-tone gold Pill top-right; date eyebrow; summary in **Cormorant display-md on bare background** (no card); divider; "Themes" pills; "In your dream" symbol Cards (`variant="symbol"`, max 5 + "See all"); pattern-note gold Card with `✦ PATTERN` eyebrow (only when patternNote non-null; the ✦ has `accessibilityElementsHidden`); "Questions to sit with" left-bordered italic rows. Sequential reveal timings verbatim (summary 0ms/400ms fade … questions 800ms); reduced motion → all simultaneous, opacity only.
  - Screen: loading = `BreathingCircle` + "Reading your dream" (nothing else); error = "Couldn't interpret your dream" / "Your dream is saved. Tap to try again when you're connected." / OutlinedButton "Try again"; content = InterpretationView + OutlinedButton "Save to journal" → Journal (dream is already persisted; the button is navigational confirmation per spec "only if not saved" — here it reads "Done" semantics; label it "Save to journal" exactly).

- [ ] **Step 1: Failing tests.** Mock api: loading state shows "Reading your dream" and no spinner; success renders summary text, theme pills, ≤5 symbol cards + "See all" when 6 given, pattern card only when patternNote present, questions rendered; error state shows exact copy + retry refires; snake_case payload normalizes.
- [ ] **Step 2:** FAIL. → **Step 3:** implement. → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): interpretation screen with sequential reveal and exact error/loading copy`

---

### Task 9: JournalScreen

**Files:**
- Create: `apps/mobile/src/screens/JournalScreen.tsx`, `src/components/DreamRow.tsx`
- Test: `apps/mobile/__tests__/JournalScreen.test.tsx`

**Interfaces:**
- Consumes: `useDreams` (Task 4), navigation.
- Produces: SectionList grouped by month ("JULY 2026" eyebrow-md headers); `DreamRow` per design spec Screen 4 (76dp min, bg.elevated, **no radius**, 1dp separators, uppercase date eyebrow + tone Pill, 1-line truncated transcript quote, symbol names eyebrow row, 4dp gold left edge only when patternNote exists, pending rows show a muted "Waiting to sync" eyebrow instead of the tone pill); search InputField filtering client-side over transcript+symbols (case-insensitive; server search is a later phase); empty state copy verbatim ("Your journal is quiet" / "Record your first dream to begin." / TextButton "Record now"); header right nav: TextButtons to Profile and Settings. Tap row → EntryDetail (pending rows are not tappable).

- [ ] **Step 1: Failing tests.** Empty → exact copy + "Record now" navigates Record; two dreams across two months → two section headers; search "water" filters; pattern-note dream row exposes testID `pattern-edge`; pending row shows "Waiting to sync" and doesn't navigate; row tap navigates with dreamId.
- [ ] **Step 2:** FAIL. → **Step 3:** implement. → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): journal list with month sections, search, sync-pending rows`

---

### Task 10: Dream notes (API + EntryDetailScreen)

**Files:**
- Create: `supabase/migrations/20260707090000_dream_notes.sql`, `apps/mobile/src/screens/EntryDetailScreen.tsx`
- Modify: `apps/api/src/routes/dreams.ts` (PUT accepts `notes`), `apps/api/__tests__/helpers/fakeSupabase.ts` (notes column passthrough), `packages/shared/types/domain.ts` (`notes?: string` on Dream)
- Test: `apps/api/__tests__/integration/dreams.test.ts` (extend), `apps/mobile/__tests__/EntryDetailScreen.test.tsx`

**Interfaces:**
- Consumes: existing `PUT /v1/dreams/:id` (Zod-validated, owner-scoped), `InterpretationView` (Task 8).
- Produces: `dreams.notes TEXT` column (nullable); PUT body gains optional `notes: z.string().max(2000)`; response envelope returns the updated row. EntryDetail: nav title = formatted date; InterpretationView for interpreted dreams (transcript-only block for uninterpreted ones: eyebrow "YOUR DREAM" + body-lg italic transcript); "Your thoughts" notes InputField that **saves on blur** via PUT with a transient "Saved" label-sm confirmation (2s fade); save failure → "Couldn't save your note. Tap to retry." TextButton, note text preserved.

Migration:

```sql
-- supabase/migrations/20260707090000_dream_notes.sql
ALTER TABLE dreams ADD COLUMN notes TEXT;
```

- [ ] **Step 1 (API): failing test** — PUT with `{ notes: 'felt about my father' }` → 200, row's notes updated, other fields untouched; notes >2000 chars → 400 VALIDATION; user B updating user A's dream still 404 (existing behavior unchanged, add the notes case). Run `npm test --workspace apps/api -- dreams` → FAIL.
- [ ] **Step 2 (API): implement** (extend the existing update Zod schema + column list; **do not log notes content**). Tests PASS.
- [ ] **Step 3 (mobile): failing tests** — renders transcript for uninterpreted dream; blur triggers PUT with notes; "Saved" appears then disappears (fake timers); failure path shows retry and keeps text.
- [ ] **Step 4 (mobile): implement.** Tests PASS + both workspaces typecheck.
- [ ] **Step 5: Commit** — `feat(dreams): private notes on entries — API column+validation, entry detail with autosave`

---

### Task 11: ProfileScreen + pattern surfaces (absorbs deferred PE Task 9)

**Files:**
- Create: `apps/mobile/src/screens/ProfileScreen.tsx`, `src/components/InsightCard.tsx`, `src/components/EmotionArcChart.tsx`, `src/components/ClusterCard.tsx`, `src/hooks/usePatterns.ts`
- Test: `apps/mobile/__tests__/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/profile/summary` → `{ summary: { totalDreams|total_dreams, recurringSymbols[{label,count}]…, dominantTone }, emotionArc: [{date, tone}], clusters: [{id,label,topSymbols,dreamCount}], insights: [{id,title,body,seenAt}] }` (normalize snake/camel in `usePatterns`, mirroring Task 8's mapper approach); `POST /v1/insights/:id/seen`.
- Produces:
  - `usePatterns()` → `{ status: 'loading'|'error'|'ok', data, retry, markSeen(id) }` — `markSeen` fires the POST best-effort (failure silently ignored) and clears the unseen marker locally.
  - `EmotionArcChart({ arc })` — react-native-svg: 6dp circles colored by tone map (anxious `Colors.recording.active`-family red #C85252→use `Colors.semantic.error`? **No** — use the design spec's explicit mapping: anxious #C85252, peaceful #5CAD5C, surreal `Colors.gold.primary`, melancholic #7A85C1, other `Colors.bg.borderStrong`; define these five as `Colors.arc.*` additions in tokens.ts with a tokens test), 1dp connecting line, **no axes, no grid**; last 30 points; renders nothing (null) for <2 points.
  - `InsightCard({ title, body, unseen, onSeen })` — gold Card variant; calls `onSeen` on mount when `unseen`.
  - `ClusterCard({ label, topSymbols, dreamCount })` — default Card: label label-md, "×N" display-sm gold count, symbols eyebrow row.
  - `ProfileScreen` per design spec Screen 6: "YOUR DREAM LIFE" 3-stat row (dreams / symbols / dominant tone in display-lg); "Keeps returning" horizontal symbol cards (100dp, count "×7" gold); "How your dreams have felt" arc chart; "What your dreams suggest" insights. **Teaser** when `totalDreams < 5` (spec §6 threshold — matches API contract, not the design spec's illustrative 7): "Keep dreaming" / "Pattern analysis unlocks after 5 entries. [n] more to go." Loading = EmptyState loading; error = "Couldn't load your patterns" + "Try again" (per PE Task 9 tests).

- [ ] **Step 1: Failing tests** — port the three PE-plan Task 9 tests (teaser below 5, insight card title renders, error state retry) plus: stat row shows totals; arc renders a circle per point with the tone color; `markSeen` POSTs for unseen insights; snake_case payload normalizes.
- [ ] **Step 2:** FAIL. → **Step 3:** implement (dep: `react-native-svg`). → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(patterns): mobile profile surfaces — stats, recurring symbols, emotion arc, clusters, insights`

---

### Task 12: SettingsScreen, reminders, account deletion, paywall stub

**Files:**
- Create: `apps/mobile/src/screens/SettingsScreen.tsx`, `src/screens/PaywallScreen.tsx`, `src/services/reminders.ts`
- Test: `apps/mobile/__tests__/SettingsScreen.test.tsx`, `__tests__/reminders.test.ts`, `__tests__/PaywallScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `api` (`DELETE /v1/account`), `expo-notifications` (dep), navigation.
- Produces:
  - `reminders.schedule(time: {hour,minute})` / `reminders.cancel()` — daily local notification "Your dream is waiting. Record it before it fades." tapping it deep-links to Record (notification response listener in App.tsx routes home — Record IS home, so just foreground). Permission denied → return `{ granted: false }` so the toggle snaps back with "Notifications are off for DreamLens. Open Settings."
  - `SettingsScreen` per design spec Screen 7: MORNING RITUAL (ToggleRow + time picker via `@react-native-community/datetimepicker`), ACCOUNT (email label; tier Pill "Free"/"Pro"; "Upgrade to Pro" TextButton → Paywall when free), PRIVACY (Privacy Policy link stub; Data & Privacy row), ABOUT (version from `expo-constants`; the exact reflection-tool disclaimer italic block), DANGER ZONE: "Delete account and all dreams" in `Colors.semantic.error` → modal with exact copy "This will permanently delete all [n] dreams and your account. This cannot be undone." / "Delete everything" (error color) / "Keep my account" (gold, prominent). Confirm → `DELETE /v1/account` → clear local queue DB + secure-store keys → `signOut()`. Also a "Sign out" TextButton.
  - `PaywallScreen` — **clearly labeled placeholder** (RevenueCat stub per engineering-standards SECTION 14): Pro benefits list (unlimited dreams, full pattern analysis, search, lifetime history), price line "$7.99/month or $59.99/year", PrimaryButton "Continue" showing "Purchases aren't available in this build yet." muted note. No fake purchase flow. Reached from Settings upsell and the 402 branch (Task 7).

- [ ] **Step 1: Failing tests** — reminders: schedule computes a daily trigger and cancel clears; denied permission → granted:false. Settings: renders email/tier; delete flow requires the confirm modal and calls DELETE then signOut (mock api + store; assert queue-clear called); "Keep my account" dismisses without calling. Paywall: renders placeholder note, no purchase call exists.
- [ ] **Step 2:** FAIL. → **Step 3:** implement. → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): settings with morning reminder, compliant account deletion, paywall placeholder`

---

### Task 13: Apple + Google Sign-In

**Files:**
- Create: `apps/mobile/src/services/socialAuth.ts`
- Modify: `src/screens/AuthScreen.tsx` (add both buttons), `src/store/authStore.ts` (`signInWithApple`, `signInWithGoogle`), `apps/mobile/.env.example` (Google client IDs), `app.json` (per §4A)
- Test: `apps/mobile/__tests__/socialAuth.test.ts`, extend `__tests__/AuthScreen.test.tsx`

**Interfaces:**
- Consumes: engineering-standards **§4A verbatim** — native ID-token flow (never web redirect): `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider:'apple', token: credential.identityToken })` with the raw-nonce/hashed-nonce dance exactly as §4A's code shows; `@react-native-google-signin/google-signin` with `webClientId` → `signInWithIdToken({ provider:'google' })`.
- Produces: AuthScreen gains Apple sign-in (iOS only — `Platform.OS === 'ios'` AND `AppleAuthentication.isAvailableAsync()`, listed FIRST, rendered with Apple's own `AppleAuthenticationButton` per §4A — a custom button fails App Store review) and "Continue with Google" as an OutlinedButton, above the email fields; cancellation (`ERR_REQUEST_CANCELED` / `statusCodes.SIGN_IN_CANCELLED`) is silent — no error copy; real failures show "Couldn't sign in. Try again or use email."
- **Constraint:** these flows need a custom dev client + real provider credentials — offline tests mock the native modules; record "device verification pending" in the report. Do not fabricate a passing e2e claim.

- [ ] **Step 1: Failing tests** — mock both native modules: Apple success passes identityToken + nonce to `signInWithIdToken`; Google success passes idToken; cancellations produce no error state; Apple button absent on Android (`Platform.OS` mock).
- [ ] **Step 2:** FAIL. → **Step 3:** implement per §4A (copy its code; keep its comment about the Web client ID being the Supabase audience). → **Step 4:** PASS + typecheck. 
- [ ] **Step 5: Commit** — `feat(mobile): Apple and Google sign-in via native ID-token flow`

---

### Task 14: Error boundary, compliance strings, final wiring pass

**Files:**
- Create: `apps/mobile/src/components/ErrorBoundary.tsx`
- Modify: `App.tsx` (wrap navigator; wire notification-response listener from Task 12), `app.json` (verify/complete: `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` + notifications usage strings **verbatim from engineering-standards §10 Info.plist block**, dark-only `userInterfaceStyle`, bundle identifier `com.dreamlens.app`)
- Test: `apps/mobile/__tests__/ErrorBoundary.test.tsx`, `__tests__/appConfig.test.ts`

**Interfaces:**
- Produces: `ErrorBoundary` per engineering-standards §5 React Native block — catches render errors, shows "Something went wrong." / "Your dreams are safe. Restart to continue." / OutlinedButton "Try again" (resets boundary). **Never logs children's props/state (dream content).** `appConfig.test.ts` reads `app.json` and asserts: mic usage string mentions "transcribed on-device and not stored"; `userInterfaceStyle === 'dark'`; SQLCipher flag present; both font families in no place hard-coded — plus a repo-wide guard: `grep -rn "#C9A84C\|#070C1A" apps/mobile/src --include='*.tsx' -l` returns only files importing tokens (implement as a jest test walking `src/` asserting no hex-color literals outside `design/`).

- [ ] **Step 1: Failing tests.** → **Step 2:** FAIL. → **Step 3:** implement. → **Step 4:** PASS + typecheck + **full suite both workspaces** (`npm test --workspace apps/api && npm test --workspace apps/mobile`).
- [ ] **Step 5: Commit** — `feat(mobile): error boundary, App Store compliance strings, hex-literal guard`

---

## Out of scope (recorded, deliberate)

- Real purchases (RevenueCat) — placeholder only, per engineering-standards SECTION 14.
- Streak tracking (PRD F15) — conflicts with the binding design spec's "no gamification"; design spec governs.
- Server-side search, PDF export, wearables, widgets — later phases.
- Face ID app lock — design spec lists the toggle; defer the row to post-v1 (adding a dead toggle is worse than absence; note in Settings task report).
- "Data & Privacy" settings row — the design spec routes it to a data export/deletion sub-screen; export is out of scope (above) and deletion already lives in the danger zone, so the row would lead to an empty screen. Deferred with the export feature (controller decision, Task 12 review).
- Device/simulator verification of STT, SQLCipher, notifications, Apple/Google sign-in — requires hardware + credentials; each task's report must flag what needs on-device verification.

## Self-review notes

- Type consistency: `usePatterns`/`useInterpretation` both normalize snake_case at the hook boundary; screens consume camelCase only.
- Teaser threshold is 5 (pattern-engine spec §6 / API contract), not the design spec's illustrative "7 entries" copy — the count in the copy is computed, so the sentence stays truthful.
- PrimaryButton-per-screen rule holds: Review ("Interpret this dream"), Paywall ("Continue"), Auth ("Sign in"), Onboarding ("Get started"). Record screen has no PrimaryButton (the record button is its own element).
- All API paths used exist on `main` today except `PUT /v1/dreams/:id` `notes` (added by Task 10's API half before its mobile half consumes it).
