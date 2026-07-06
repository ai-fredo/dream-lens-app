// apps/api/__tests__/integration/rls.test.ts
import { seedLiveUser } from '../helpers';

// Gate: this suite requires a live Supabase instance (SUPABASE_URL +
// SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY) to create real auth users
// and exercise RLS. No Supabase CLI/Docker is available on this machine, so
// we skip cleanly rather than fail when the env isn't present.
const describeIfDb = process.env.SUPABASE_URL ? describe : describe.skip;

describeIfDb('RLS: dreams table user isolation', () => {
  it('user A cannot read user B dreams even with a valid token', async () => {
    const a = await seedLiveUser();
    const b = await seedLiveUser();

    await b.client
      .from('dreams')
      .insert({ user_id: b.id, recorded_at: new Date().toISOString(), raw_transcript: 'x'.repeat(20) });

    const { data } = await a.client.from('dreams').select('*');

    expect(data?.every((d) => d.user_id === a.id)).toBe(true);
  });
});
