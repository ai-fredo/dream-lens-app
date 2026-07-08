jest.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import { supabase } from '../src/services/supabase';
import { api, ApiError } from '../src/services/api';

const mockGetSession = supabase.auth.getSession as jest.Mock;

describe('api client', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    mockGetSession.mockReset();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = originalEnv;
  });

  it('injects the bearer token from the current supabase session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    await api.get('/v1/dreams');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/dreams',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('omits the authorization header when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    await api.get('/v1/dreams');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.authorization).toBeUndefined();
  });

  it('unwraps the envelope and resolves data on success', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: { id: 'abc' } }),
    });

    const result = await api.get<{ id: string }>('/v1/dreams');

    expect(result).toEqual({ id: 'abc' });
  });

  it('throws ApiError with code and status passthrough on failure envelope', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 402,
      json: async () => ({
        success: false,
        error: { code: 'UPGRADE_REQUIRED', message: 'Upgrade to continue.' },
      }),
    });

    await expect(api.get('/v1/dreams')).rejects.toMatchObject({
      code: 'UPGRADE_REQUIRED',
      message: 'Upgrade to continue.',
      status: 402,
    });
    await expect(api.get('/v1/dreams')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with code NETWORK on fetch failure', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    await expect(api.post('/v1/dreams', { title: 'x' })).rejects.toMatchObject({
      code: 'NETWORK',
      status: 0,
    });
  });

  it('sends a JSON body on post and omits body when undefined', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: null }),
    });

    await api.post('/v1/dreams', { title: 'hello' });
    let [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ title: 'hello' }));

    (globalThis.fetch as jest.Mock).mockClear();
    await api.del('/v1/dreams/1');
    [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toBeUndefined();
  });
});
