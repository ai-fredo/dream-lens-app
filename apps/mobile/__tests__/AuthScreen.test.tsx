import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();

jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: null,
      status: 'signedOut',
      signIn: mockSignIn,
      signUp: mockSignUp,
      signInWithApple: mockSignInWithApple,
      signInWithGoogle: mockSignInWithGoogle,
      signOut: jest.fn(),
    }),
}));

import { AuthScreen } from '../src/screens/AuthScreen';

describe('AuthScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSignUp.mockReset();
    mockSignInWithApple.mockReset();
    mockSignInWithGoogle.mockReset();
    Platform.OS = 'ios';
  });

  it('renders email and password inputs and a single primary sign-in button', () => {
    render(<AuthScreen />);
    expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(1);
  });

  it('calls signIn with email and password on submit', async () => {
    mockSignIn.mockResolvedValue(undefined);
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  it('shows a fix-naming error message when sign-in is rejected', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email and password.')).toBeTruthy();
    });
  });

  it('toggles to create-account mode and calls signUp on submit', async () => {
    mockSignUp.mockResolvedValue(undefined);
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getAllByRole('button', { name: 'Sign up' })).toHaveLength(1);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  it('renders Continue with Apple above Continue with Google, both above the email field, on iOS', () => {
    Platform.OS = 'ios';
    render(<AuthScreen />);

    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('does not render Continue with Apple on Android', () => {
    Platform.OS = 'android';
    render(<AuthScreen />);

    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('calls signInWithApple when Continue with Apple is pressed', async () => {
    Platform.OS = 'ios';
    mockSignInWithApple.mockResolvedValue('success');
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Apple' }));

    await waitFor(() => {
      expect(mockSignInWithApple).toHaveBeenCalled();
    });
  });

  it('calls signInWithGoogle when Continue with Google is pressed', async () => {
    mockSignInWithGoogle.mockResolvedValue('success');
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });
  });

  it('shows no error text when the user cancels Apple sign-in', async () => {
    Platform.OS = 'ios';
    mockSignInWithApple.mockResolvedValue('cancelled');
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Apple' }));

    await waitFor(() => {
      expect(mockSignInWithApple).toHaveBeenCalled();
    });
    expect(screen.queryByText("Couldn't sign in. Try again or use email.")).toBeNull();
  });

  it('shows no error text when the user cancels Google sign-in', async () => {
    mockSignInWithGoogle.mockResolvedValue('cancelled');
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });
    expect(screen.queryByText("Couldn't sign in. Try again or use email.")).toBeNull();
  });

  it('shows the exact inline error copy when Apple sign-in fails for real', async () => {
    Platform.OS = 'ios';
    mockSignInWithApple.mockRejectedValue(new Error('Supabase rejected the Apple token'));
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Apple' }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't sign in. Try again or use email.")).toBeTruthy();
    });
  });

  it('shows the exact inline error copy when Google sign-in fails for real', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Supabase rejected the Google token'));
    render(<AuthScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't sign in. Try again or use email.")).toBeTruthy();
    });
  });
});
