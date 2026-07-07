jest.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import { supabase } from '../src/services/supabase';
import { useAuthStore } from '../src/store/authStore';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
const mockSignUp = supabase.auth.signUp as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;

describe('useAuthStore', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockSignInWithPassword.mockReset();
    mockSignUp.mockReset();
    mockSignOut.mockReset();

    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });

    useAuthStore.setState({ session: null, status: 'loading' });
  });

  it('signIn success stores the session and flips status to signedIn', async () => {
    const session = { access_token: 'tok', user: { id: 'u1' } };
    mockSignInWithPassword.mockResolvedValue({ data: { session }, error: null });

    await useAuthStore.getState().signIn('user@example.com', 'password123');

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('signIn failure keeps status signedOut and surfaces an error message', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      useAuthStore.getState().signIn('user@example.com', 'wrong'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('signUp success stores the session and flips status to signedIn', async () => {
    const session = { access_token: 'tok2', user: { id: 'u2' } };
    mockSignUp.mockResolvedValue({ data: { session }, error: null });

    await useAuthStore.getState().signUp('new@example.com', 'password123');

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('signOut clears the session and sets status to signedOut', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    useAuthStore.setState({
      session: { access_token: 'tok', user: { id: 'u1' } } as never,
      status: 'signedIn',
    });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().session).toBeNull();
  });
});
