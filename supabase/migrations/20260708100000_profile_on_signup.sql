-- supabase/migrations/20260708100000_profile_on_signup.sql
--
-- Every API route assumes a user_profiles row exists for the authed user
-- (POST /v1/dreams 404s with PROFILE_NOT_FOUND otherwise), but nothing
-- created that row: the offline test harness seeds profiles directly, which
-- masked the gap until the first live signup. Standard Supabase pattern:
-- create the profile when the auth user is created. SECURITY DEFINER is
-- required (the signup context has no rights on public.user_profiles);
-- search_path pinned per the same hardening applied to the other functions.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
