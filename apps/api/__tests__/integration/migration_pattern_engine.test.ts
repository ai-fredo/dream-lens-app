// apps/api/__tests__/integration/migration_pattern_engine.test.ts
import { testDb } from '../helpers/testDb';

// Gate: this suite requires a live Supabase instance (SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY). No Supabase CLI/Docker is available on this
// machine, so we skip cleanly rather than fail when the env isn't present.
// Mirrors the pattern in schema.test.ts.
const describeIfDb = process.env.SUPABASE_URL ? describe : describe.skip;

describeIfDb('pattern engine migration', () => {
  it('user_patterns has label + pattern_type columns', async () => {
    expect(
      (await testDb.from('user_patterns').select('label, pattern_type').limit(0)).error
    ).toBeNull();
  });

  it('user_patterns no longer has a symbol column', async () => {
    expect(
      (await testDb.from('user_patterns').select('symbol').limit(0)).error
    ).not.toBeNull();
  });

  it('dream_clusters and user_insights exist', async () => {
    expect((await testDb.from('dream_clusters').select('id').limit(0)).error).toBeNull();
    expect((await testDb.from('user_insights').select('id').limit(0)).error).toBeNull();
  });
});
