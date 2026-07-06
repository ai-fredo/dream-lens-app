// apps/api/__tests__/integration/kb_seed.test.ts
import { testDb } from '../helpers/testDb';

// Gate: this suite requires a live Supabase instance (SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY) to verify the knowledge base is seeded and embedded.
const describeIfDb = process.env.SUPABASE_URL ? describe : describe.skip;

describeIfDb('knowledge base seeding', () => {
  it('knowledge base is seeded and embedded', async () => {
    // Verify row count is at least 113 (the clean JSONL has 113 entries).
    const { count } = await testDb
      .from('dream_symbols')
      .select('*', { count: 'exact', head: true });
    expect(count).toBeGreaterThanOrEqual(113);

    // Verify at least one row has a non-null embedding.
    const { data } = await testDb
      .from('dream_symbols')
      .select('embedding')
      .not('embedding', 'is', null)
      .limit(1);
    expect(data?.length).toBe(1);
  });
});
