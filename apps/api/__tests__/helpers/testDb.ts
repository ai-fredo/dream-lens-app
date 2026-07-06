// apps/api/__tests__/helpers/testDb.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazily-created singleton, mirroring the pattern in apps/api/src/db/client.ts.
// We deliberately do NOT read env vars or construct the Supabase client at
// module import time: no .env / live Supabase instance exists in this
// project's default test environment, and eager construction would crash
// any test that imports this module without SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY set. The client is only constructed the first
// time `testDb` is accessed, and only integration tests that are gated on
// those env vars (see schema.test.ts) should ever trigger that.
let client: SupabaseClient | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTestDb(): SupabaseClient {
  if (!client) {
    const url = requireEnv('SUPABASE_URL');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, serviceKey);
  }
  return client;
}

/**
 * Service-role Supabase client for integration tests. Accessing any property
 * lazily constructs the underlying client on first use, so importing this
 * module is safe even when no database is configured.
 */
export const testDb: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getTestDb();
    return Reflect.get(real, prop, real);
  },
});
