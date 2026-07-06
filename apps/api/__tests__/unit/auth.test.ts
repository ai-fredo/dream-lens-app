import { makeRequireAuth } from '../../src/middleware/auth';

// any: minimal Express Response stub — only status/json used by the middleware
const res = () => { const r: any = {}; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

it('401 when no Authorization header', async () => {
  // Mock Supabase client for testing
  const r = res(); let called = false;
  // any: Supabase client stub — type structure matches auth.getUser interface
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as any)(
    // any: minimal Express Request stub — only headers used by the middleware
    { headers: {} } as any,
    r,
    () => { called = true; }
  );
  expect(r.code).toBe(401); expect(called).toBe(false);
});

it('sets req.user and calls next on a valid token', async () => {
  // Mock Supabase client with valid user data
  const r = res();
  // any: minimal Express Request stub — only headers.authorization mutated by middleware
  const req: any = { headers: { authorization: 'Bearer good' } };
  let called = false;
  // any: Supabase client stub — type structure matches auth.getUser interface
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } } as any)(req, r, () => { called = true; });
  expect(called).toBe(true); expect(req.user.id).toBe('u1');
});

it('401 with INVALID_TOKEN code when token verification returns null user', async () => {
  const r = res(); let called = false;
  // any: Supabase client stub — type structure matches auth.getUser interface
  await makeRequireAuth({ auth: { getUser: async () => ({ data: { user: null }, error: { message: 'invalid' } }) } } as any)(
    // any: minimal Express Request stub — only headers used by the middleware
    { headers: { authorization: 'Bearer bad' } } as any,
    r,
    () => { called = true; }
  );
  expect(r.code).toBe(401);
  expect(r.body).toEqual({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  expect(called).toBe(false);
});

it('forwards errors from getUser to next for central error handler', async () => {
  const r = res();
  // any: minimal Express Request stub — only headers used by the middleware
  const req: any = { headers: { authorization: 'Bearer token' } };
  let nextCalled = false;
  let nextError: any = null;
  // any: Supabase client stub — throws to simulate infrastructure failure
  await makeRequireAuth({ auth: { getUser: async () => { throw new Error('network down'); } } } as any)(
    req,
    r,
    (err: any) => { nextCalled = true; nextError = err; }
  );
  expect(nextCalled).toBe(true);
  expect(nextError?.message).toBe('network down');
  expect(r.code).toBeUndefined();
});
