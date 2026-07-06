// apps/api/__tests__/integration/schema.test.ts
import { testDb } from '../helpers/testDb';

// Gate: this suite requires a live Supabase instance (SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY). No Supabase CLI/Docker is available on this
// machine, so we skip cleanly rather than fail when the env isn't present.
const describeIfDb = process.env.SUPABASE_URL ? describe : describe.skip;

describeIfDb('database schema', () => {
  it.each(['user_profiles', 'dreams', 'dream_symbols', 'user_patterns'])(
    'table %s exists',
    async (t) => {
      expect((await testDb.from(t).select('*').limit(0)).error).toBeNull();
    }
  );
});
