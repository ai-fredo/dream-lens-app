# Deploying the DreamLens API

## 1. What gets deployed

Only `apps/api` is deployed as a server. Supabase (database, auth, storage) is
already live and is not part of this deploy — the API connects to it over the
network via `SUPABASE_URL` / the Supabase keys below. The mobile app
(`apps/mobile`) is not deployed here either; it ships separately via Expo
Application Services (EAS) and simply points at the deployed API's URL (see
§6).

The API runs its TypeScript source directly under `tsx` (via `npm start
--workspace apps/api`) — there is no separate build step, and
`packages/shared` needs no build either since it's consumed as source.

## 2. Environment variables

| Var | Description | Where to get it |
| --- | --- | --- |
| `PORT` | Port the API listens on. | Injected automatically by the hosting platform (Render/Railway) — do not set manually. |
| `SUPABASE_URL` | Your Supabase project URL. | Supabase dashboard → Project Settings → API. |
| `SUPABASE_ANON_KEY` | Public/anon key, used for RLS-bound, request-scoped access. | Supabase dashboard → Project Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, bypasses RLS. Server-side only. | Supabase dashboard → Project Settings → API. Never expose to clients. |
| `OPENAI_API_KEY` | Used for dream transcription / auxiliary AI features. | OpenAI dashboard → API keys. |
| `ANTHROPIC_API_KEY` | Used for dream interpretation (Claude). | Anthropic Console → API keys. |
| `CORS_ALLOWLIST` | Comma-separated list of allowed browser origins. Native apps send no `Origin` header, so this only matters for browser clients (e.g. the landing page's public demo). Set it to the landing-page origin(s) when a web client exists. | Your own deployment config — the landing-page URL(s). |
| `SENTRY_DSN` | Optional. API crash reporting. If unset, Sentry is not initialized. | Sentry dashboard → Project Settings → Client Keys (DSN). |
| `APPLE_TEAM_ID` | Optional; all four `APPLE_*` vars are required together. Enables Apple token revocation on account deletion. | Apple Developer account → Membership. |
| `APPLE_KEY_ID` | Optional; see `APPLE_TEAM_ID`. | Apple Developer account → Keys. |
| `APPLE_PRIVATE_KEY` | Optional; see `APPLE_TEAM_ID`. | Apple Developer account → Keys (download the `.p8` private key). |
| `APPLE_BUNDLE_ID` | Optional; see `APPLE_TEAM_ID`. | The mobile app's bundle identifier (`com.dreamlens.app`). |
| `LOG_LEVEL` | Winston logger level (`debug`, `info`, `warn`, `error`). Defaults to `info`. | Set directly; `info` is the recommended production default. |

## 3. Deploying on Render

1. Push this repo to GitHub (if not already).
2. In the Render dashboard: **New → Blueprint** → connect the repo.
3. Render picks up `render.yaml` at the repo root automatically.
4. Fill in the env vars marked `sync: false` in `render.yaml` (Supabase keys,
   AI provider keys, `CORS_ALLOWLIST`, `SENTRY_DSN`, `APPLE_*`) in the Render
   dashboard.
5. Deploy. Render builds the Dockerfile and uses `healthCheckPath: /v1/health`
   to confirm the service is up.

## 4. Deploying on Railway

1. Railway dashboard: **New Project → Deploy from GitHub repo** → select this repo.
2. Railway auto-detects the root `Dockerfile` and builds it.
3. Set the same env vars as the table above in the Railway project settings.
4. Generate a public domain for the service (Railway → Settings → Networking → Generate Domain).

## 5. Post-deploy smoke test

```bash
# Health check
curl https://<host>/v1/health
# Expect: {"success":true,"data":{"status":"ok"}}

# Public demo endpoint (no auth required, rate-limited to 3/hr/IP)
curl -X POST https://<host>/v1/demo/interpret \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"I was flying over a city made of glass."}'
# Expect: {"success":true,"data":{"summary":"...","themes":[...],"emotional_tone":"...","question":"..."}}
```

## 6. Mobile app configuration

Once the API is deployed, set `EXPO_PUBLIC_API_URL` in the mobile app's build
environment to the deployed API URL (e.g. `https://dreamlens-api.onrender.com`)
before building/publishing via EAS.
