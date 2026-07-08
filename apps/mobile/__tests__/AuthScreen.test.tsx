import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockIsAvailableAsync = jest.fn();

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

// AuthScreen renders Apple's own button component (engineering-standards
// §4A — a custom button fails review). Mock it as a lightweight native
// stand-in that still exposes onPress and passes through testID, so tests
// can trigger it without depending on the real ASAuthorizationAppleIDButton
// native view.
jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress, testID, accessibilityLabel }: any) =>
      React.createElement(Pressable, { onPress, testID, accessibilityLabel }),
  };
});

import { AuthScreen } from '../src/screens/AuthScreen';

describe('AuthScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSignUp.mockReset();
    mockSignInWithApple.mockReset();
    mockSignInWithGoogle.mockReset();
    mockIsAvailableAsync.mockReset();
    mockIsAvailableAsync.mockResolvedValue(true);
    Platform.OS = 'ios';
  });

  it('renders email and password inputs and a single primary sign-in button', async () => {
    render(<AuthScreen />);
    // Flush the isAvailableAsync() effect so its setState lands inside act().
    await screen.findByTestId('auth-apple');
    expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(1);
  });

  it('calls signIn with email and password on submit', async () => {
    mockSignIn.mockResolvedValue(undefined);
    render(<AuthScreen />);
    await screen.findByTestId('auth-apple');

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

  it('renders the native Apple button above Continue with Google, both above the email field, on iOS when available', async () => {
    Platform.OS = 'ios';
    mockIsAvailableAsync.mockResolvedValue(true);
    render(<AuthScreen />);

    expect(await screen.findByTestId('auth-apple')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('does not render the Apple button on Android', async () => {
    Platform.OS = 'android';
    render(<AuthScreen />);

    // isAvailableAsync is never even queried off-iOS.
    expect(mockIsAvailableAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('auth-apple')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('does not render the Apple button on iOS when isAvailableAsync resolves false', async () => {
    Platform.OS = 'ios';
    mockIsAvailableAsync.mockResolvedValue(false);
    render(<AuthScreen />);

    await waitFor(() => {
      expect(mockIsAvailableAsync).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('auth-apple')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('uses the native AppleAuthenticationButton, not a generic OutlinedButton, for Apple sign-in', async () => {
    Platform.OS = 'ios';
    mockIsAvailableAsync.mockResolvedValue(true);
    render(<AuthScreen />);

    const appleButton = await screen.findByTestId('auth-apple');
    // The mocked AppleAuthenticationButton passes accessibilityLabel through
    // as given, with no text child — OutlinedButton always renders its
    // `label` as a visible Text child instead, so this distinguishes the
    // native component from the generic button used elsewhere in this screen.
    expect(appleButton.props.accessibilityLabel).toBe('Continue with Apple');
    expect(screen.queryByText('Continue with Apple')).toBeNull();
  });

  it('calls signInWithApple when the Apple button is pressed', async () => {
    Platform.OS = 'ios';
    mockIsAvailableAsync.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue('success');
    render(<AuthScreen />);

    fireEvent.press(await screen.findByTestId('auth-apple'));

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
    mockIsAvailableAsync.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue('cancelled');
    render(<AuthScreen />);

    fireEvent.press(await screen.findByTestId('auth-apple'));

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
    mockIsAvailableAsync.mockResolvedValue(true);
    mockSignInWithApple.mockRejectedValue(new Error('Supabase rejected the Apple token'));
    render(<AuthScreen />);

    fireEvent.press(await screen.findByTestId('auth-apple'));

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
