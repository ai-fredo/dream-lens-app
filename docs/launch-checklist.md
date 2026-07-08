# DreamLens Launch Checklist

This is the ordered, step-by-step document for taking DreamLens from this repository to TestFlight. Complete each section in order. The API must be deployed first (see [Deploying the API](./deploy.md#3-deploying-on-render)).

## 1. Apple Developer Account Setup

Register the app's bundle ID and configure Apple Sign in with Apple.

1. Log into [Apple Developer](https://developer.apple.com/account).
2. Go to **Certificates, Identifiers & Profiles → Identifiers** and register a new App ID:
   - Name: `DreamLens`
   - Bundle ID: `com.dreamlens.app`
   - Capabilities: Enable **Sign in with Apple** (required for account deletion and token revocation)
3. Create a Sign in with Apple key (used to sign identity tokens server-side):
   - Go to **Certificates, Identifiers & Profiles → Keys**
   - Create a new key: **Key Type** = Sign in with Apple
   - Name: `DreamLens SIWA Key`
   - Download the `.p8` private key file (can only download once)
4. Record the following and set them on the API host (see section 4):
   - `APPLE_TEAM_ID`: Your 10-character Team ID (Membership page)
   - `APPLE_KEY_ID`: Your 10-character Key ID (displayed on the key page)
   - `APPLE_PRIVATE_KEY`: The full contents of the downloaded `.p8` file, with newlines escaped for env vars (e.g. `-----BEGIN...KEY-----\nMIIEvQI...==\n-----END...KEY-----`)
   - `APPLE_BUNDLE_ID`: `com.dreamlens.app`

**Why this matters:** These credentials enable revocation of Apple Sign in with Apple tokens when a user deletes their account. Without them, account deletion still succeeds locally and on the API side, but skips Apple revocation — this fails App Review if not documented.

## 2. Supabase Authentication Providers

Enable Apple and Google OAuth providers in Supabase, so users can sign in with these credentials.

1. Log into your [Supabase dashboard](https://supabase.com) → select your DreamLens project
2. Go to **Authentication → Providers**
3. Enable **Apple**:
   - Services ID: the App ID's associated domain (e.g. `com.dreamlens.app`)
   - Team ID, Key ID, and Private Key: use the same values from section 1
   - Return URL: leave Supabase's default
4. Enable **Google**:
   - Authorized Client IDs: paste the Web OAuth Client ID from your Google Cloud Console (see section 3)

## 3. Google OAuth Setup

Create OAuth credentials on Google Cloud Console and configure both iOS and Web client IDs.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **Credentials**
2. Create two OAuth 2.0 Client ID credentials:
   - **Client 1 (iOS):**
     - Application type: **iOS**
     - Bundle ID: `com.dreamlens.app`
     - Note the generated Client ID (format: `1234567890.apps.googleusercontent.com`)
   - **Client 2 (Web):**
     - Application type: **Web application**
     - Authorized redirect URIs: `https://your-supabase-project.supabase.co/auth/v1/callback` (from Supabase Project Settings)
     - Note the generated Client ID
3. In your mobile app's build environment, set:
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS Client ID from above>`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web Client ID from above>`
4. Update the `iosUrlScheme` placeholder in `apps/mobile/app.json` to your reversed iOS Client ID:
   - Reverse the iOS Client ID (e.g. `1234567890.apps.googleusercontent.com` → `com.googleusercontent.apps.1234567890`)
   - Find `"iosUrlScheme"` in the Google provider config block and replace the placeholder
   - (Already partially configured; ensure it matches exactly)

## 4. Deploy the API

Deploy `apps/api` to your hosting platform and verify it responds to the health check.

1. Follow the complete [API deployment guide](./deploy.md) for your chosen platform (Render recommended)
2. After deployment, set these environment variables on the API host:
   - `CORS_ALLOWLIST`: comma-separated list of allowed browser origins (e.g. `https://landingpage.com`); for native apps, this has no effect since they don't send an `Origin` header
   - `SENTRY_DSN`: (optional — if using crash reporting, see section 5)
   - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`: (from section 1)
3. Verify the API is healthy:
   ```bash
   curl https://<your-api-host>/v1/health
   # Expect: {"success":true,"data":{"status":"ok"}}
   ```

## 5. Sentry Integration (Optional but Recommended)

Optionally enable crash reporting for both the API and mobile app. All telemetry is automatically redacted of dream content.

1. Create a [Sentry](https://sentry.io) account and organization if you don't have one
2. Create two projects under your organization:
   - Project 1: `dreamlens-api` (platform: Node.js)
   - Project 2: `dreamlens-mobile` (platform: React Native)
3. From each project's Settings → Client Keys (DSN), copy the DSN:
   - Set `SENTRY_DSN` on your API host (from section 4)
   - Set `EXPO_PUBLIC_SENTRY_DSN` in your mobile app's build environment (see section 6)
4. For native stack traces (iOS symbolicatio):
   - Create a Sentry auth token with project admin scope
   - In `apps/mobile/app.json`, add the `@sentry/react-native/expo` plugin (if not already present) with your org slug and project slug
   - Set `SENTRY_AUTH_TOKEN` in EAS build secrets (do not commit; explained in section 6)

**Telemetry Safety:**
- All Sentry events are automatically redacted of dream content by a key-based scrubber (documented in `apps/mobile/src/services/telemetry.ts`)
- Redaction is limited to known dream-content field names (transcript, interpretation, notes, etc.); **static error messages and exceptions must never include user/dream text** — the policy is enforced at the call site (e.g. `throw new Error("Generic message, not user data")`)
- Initialization is opt-in: if `EXPO_PUBLIC_SENTRY_DSN` is not set, Sentry does not initialize

## 6. Mobile App Build Environment

Configure environment variables for the mobile app build in EAS or locally.

1. Decide where to manage env vars:
   - **Option A (recommended for CI/CD):** Store in EAS secrets and reference in `eas.json` `env` blocks
   - **Option B (for local development):** Create `apps/mobile/.env` with values (git-ignored; use `.env.example` as template)
2. Set these variables in your chosen location:
   - `EXPO_PUBLIC_API_URL`: The deployed API URL (e.g. `https://dreamlens-api.onrender.com`)
   - `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase project URL (from Project Settings)
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon (public) key, **not** the service-role key (from Project Settings)
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`: (from section 3)
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: (from section 3)
   - `EXPO_PUBLIC_SENTRY_DSN`: (from section 5, if using Sentry; optional)
3. If storing in EAS, sync them using `eas secret:create` or the Sentry plugin's `SENTRY_AUTH_TOKEN` (for native symbolication, if configured)

## 7. Build the App for Testing

Build the development app and install it on a physical iOS device.

1. Run `npx eas init` if not already done (links `projectId` into `app.json`)
2. Build the development profile:
   ```bash
   npx eas build --profile development --platform ios
   ```
   This creates a development client on a real device; emulators / simulators are not supported for development builds.
3. After the build completes, EAS provides a download link; follow it to open the app on your device (or scan the QR code)
4. The app should launch and show the DreamLens login screen

## 8. On-Device Verification Checklist

Manually test core functionality on the installed development app.

- [ ] **Microphone permission prompt** displays the exact §10 text: "DreamLens uses your microphone to record your dream description immediately upon waking, before the memory fades. Recordings are transcribed on-device and not stored."
- [ ] **Speech-to-text** works: speak a dream aloud and confirm it transcribes on-device with reasonable accuracy
- [ ] **Offline persistence** works: disable internet, record a dream, kill the app, turn off airplane mode, relaunch, and verify the dream syncs to the server
- [ ] **Database encryption** works: connect the device to a computer, inspect the SQLCipher database file at `Documents/dreamlens.db`, and confirm it is unreadable (binary, not plaintext SQLite)
- [ ] **Dream interpretation** renders: after saving a dream, view the interpretation and confirm text renders and themes appear
- [ ] **Pattern recognition** works: log 5+ dreams, then navigate to Patterns and confirm themes/frequencies are computed and displayed
- [ ] **Reminder notifications** work: set a morning reminder, wait until the scheduled time, and confirm the notification arrives
- [ ] **Apple Sign in with Apple** works: on a real device, complete sign-in with a real Apple ID; on logout, confirm the session clears locally and the token is revoked server-side
- [ ] **Google Sign in** works: complete sign-in with a real Google account; on logout, confirm the session clears locally
- [ ] **Account deletion** works: delete your account from settings; verify the app signs you out, the account is removed from the Supabase dashboard, and (if APPLE_* is set) the Apple token is revoked
- [ ] **Free-tier paywall** appears: log 5 dreams, then attempt to log a 6th; confirm the paywall blocks further entries and prompts for in-app purchase

## 9. App Store Preparation

Prepare metadata and privacy documentation for TestFlight and App Store submission.

1. **Privacy Policy:**
   - Create a public, HTTPS-accessible privacy policy (or use a template generator)
   - Update the placeholder URL in `apps/mobile/app.json` → `ios.infoPlist.privacyManifestCode` (if present) or another privacy URL field
   - Ensure it documents: audio processing on-device, transcripts stored encrypted, no third-party tracking or data sharing
2. **App Privacy Questionnaire (App Store Connect):**
   - Go to your app in [App Store Connect](https://appstoreconnect.apple.com)
   - Complete the **App Privacy** questionnaire under the app's listing:
     - Audio data: on-device processing only
     - Health & Fitness data: none
     - Contact Info: none
     - User ID: only for account management (Supabase auth)
     - Tracking: none (Sentry telemetry is error-based, not user-tracking)
3. **TestFlight Review:**
   - Submit the build to TestFlight internal testers
   - TestFlight review is typically faster than App Store review (~24 hours)
   - Monitor for rejection and address any issues (e.g. missing privacy policy, broken sign-in, crash on launch)
4. **App Store Submission:**
   - Once TestFlight review passes, submit to the App Store
   - App Store review typically takes 1–2 business days
   - Common rejection reasons: incomplete privacy policy, unclear why mic permission is needed (our §10 text is explicit), or features that don't work on first try (so test each item in section 8 thoroughly)

---

**Go-live:** Once section 8 passes completely and section 9 clears App Store review, the app is live in the App Store.
