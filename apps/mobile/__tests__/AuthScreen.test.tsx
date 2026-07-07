import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();

jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: null,
      status: 'signedOut',
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: jest.fn(),
    }),
}));

import { AuthScreen } from '../src/screens/AuthScreen';

describe('AuthScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSignUp.mockReset();
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
});
