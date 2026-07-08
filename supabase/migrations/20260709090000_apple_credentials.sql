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
