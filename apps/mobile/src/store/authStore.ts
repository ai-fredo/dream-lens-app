import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { signInWithApple as signInWithAppleService, signInWithGoogle as signInWithGoogleService } from '../services/socialAuth';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  session: Session | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<'success' | 'cancelled'>;
  signInWithGoogle: () => Promise<'success' | 'cancelled'>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    set({ session, status: session ? 'signedIn' : 'signedOut' });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, status: session ? 'signedIn' : 'signedOut' });
  });

  return {
    session: null,
    status: 'loading',
    async signIn(email: string, password: string) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        set({ session: null, status: 'signedOut' });
        throw new Error(error.message);
      }
      set({ session: data.session, status: 'signedIn' });
    },
    async signUp(email: string, password: string) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        set({ session: null, status: 'signedOut' });
        throw new Error(error.message);
      }
      set({ session: data.session, status: 'signedIn' });
    },
    async signInWithApple() {
      const result = await signInWithAppleService();
      if (result.type === 'cancelled') {
        return 'cancelled';
      }
      set({ session: result.session, status: result.session ? 'signedIn' : 'signedOut' });
      return 'success';
    },
    async signInWithGoogle() {
      const result = await signInWithGoogleService();
      if (result.type === 'cancelled') {
        return 'cancelled';
      }
      set({ session: result.session, status: result.session ? 'signedIn' : 'signedOut' });
      return 'success';
    },
    async signOut() {
      await supabase.auth.signOut();
      set({ session: null, status: 'signedOut' });
    },
  };
});
