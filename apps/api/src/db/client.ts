// apps/api/src/db/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazily-created singletons. We deliberately do NOT read env vars or
// construct Supabase clients at module import time: no .env exists in this
// project's test environment, and eager construction would crash any test
// that imports this module (directly or transitively) without Supabase env
// vars set. Clients are only constructed the first time a getter is called.
let anonClient: SupabaseClient | undefined;
let serviceClient: SupabaseClient | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Returns a singleton Supabase client authenticated with the anon key. */
export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const url = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    anonClient = createClient(url, anonKey);
  }
  return anonClient;
}

/**
 * Returns a singleton Supabase client authenticated with the service_role
 * key. This client bypasses RLS — only use it from trusted server-side code.
 */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const url = requireEnv('SUPABASE_URL');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    serviceClient = createClient(url, serviceKey);
  }
  return serviceClient;
}
