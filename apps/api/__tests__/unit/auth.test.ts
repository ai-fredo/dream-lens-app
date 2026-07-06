import { makeRequireAuth } from '../../src/middleware/auth';

const res = () => { const r: any = {}; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

it('401 when no Authorization header', async () => {
  // Mock Supabase client for testing
  const r = res(); let called = false;
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as any)({ headers: {} } as any, r, () => { called = true; });
  expect(r.code).toBe(401); expect(called).toBe(false);
});

it('sets req.user and calls next on a valid token', async () => {
  // Mock Supabase client with valid user data
  const r = res(); const req: any = { headers: { authorization: 'Bearer good' } }; let called = false;
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } } as any)(req, r, () => { called = true; });
  expect(called).toBe(true); expect(req.user.id).toBe('u1');
});
