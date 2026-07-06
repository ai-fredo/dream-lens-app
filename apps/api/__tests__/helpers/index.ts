// apps/api/__tests__/helpers/index.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { testDb } from './testDb';

export { testDb };

// Offline test harness (used by the fully-in-memory integration tests, e.g.
// dreams.test.ts). The brief's tests import { authHeader, seedUser } from
// '../helpers'; these resolve to the fake-Supabase versions below.
export { seedUser, authHeader, makeTestApp } from './fakeSupabase';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Creates a brand-new auth user (via the service-role `testDb` admin API) and
 * returns its id plus an auth-scoped supabase-js client signed in as that
 * user. Used by RLS integration tests to exercise policies as a real,
 * non-service-role user would. Requires SUPABASE_URL, SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY — callers should env-gate with describe.skip when
 * those aren't present (no live Supabase instance on this machine).
 */
export async function seedLiveUser(): Promise<{ id: string; client: SupabaseClient }> {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');

  const email = `rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = `Test-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const { data, error } = await testDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`seedUser: failed to create user: ${error?.message}`);
  }

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`seedUser: failed to sign in: ${signInError.message}`);
  }

  return { id: data.user.id, client };
}
