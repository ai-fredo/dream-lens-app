import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('NETWORK', "Can't connect right now.", 0);
  }
  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;
  if (json?.success) return json.data;
  throw new ApiError(json?.error.code ?? 'UNKNOWN', json?.error.message ?? 'Something went wrong.', res.status);
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
