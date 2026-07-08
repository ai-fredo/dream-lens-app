import { act, render } from '@testing-library/react-native';
import App, { navigationRef } from '../App';

jest.mock('@expo-google-fonts/cormorant-garamond', () => ({
  useFonts: () => [true, null],
  CormorantGaramond_300Light: 1, CormorantGaramond_300Light_Italic: 1,
  CormorantGaramond_400Regular: 1, CormorantGaramond_400Regular_Italic: 1,
}));

// Captures the notification-response listener so tests can fire it
// directly, and stubs the subscription's remove() so unmount cleanup is
// exercised without touching the real native module.
const mockRemove = jest.fn();
let capturedListener: ((event: unknown) => void) | undefined;
const mockAddNotificationResponseReceivedListener = jest.fn((listener: (event: unknown) => void) => {
  capturedListener = listener;
  return { remove: mockRemove };
});
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (listener: (event: unknown) => void) =>
    mockAddNotificationResponseReceivedListener(listener),
}));

// App.tsx now renders the navigation shell, which pulls in authStore (and
// transitively the Supabase client) and expo-secure-store. Mock both so
// this test stays focused on the font-loading/root-mount behavior instead
// of exercising the full auth/onboarding gate (covered by
// RootNavigator.test.tsx and OnboardingFlow.test.tsx).
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('true'),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// The navigator also now reaches ReviewScreen -> dreams.ts -> sync.ts ->
// api.ts -> services/supabase, which constructs a real Supabase client at
// module-load time and throws without EXPO_PUBLIC_SUPABASE_URL. Mock it
// the same way __tests__/api.test.ts does.
jest.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// Mutable so individual tests can flip the auth status (e.g. to exercise
// the notification-response listener's signed-in navigation branch).
let mockAuthStatus: 'loading' | 'signedOut' | 'signedIn' = 'loading';
jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: null,
      get status() {
        return mockAuthStatus;
      },
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    }),
}));

beforeEach(() => {
  mockAuthStatus = 'loading';
  capturedListener = undefined;
  mockAddNotificationResponseReceivedListener.mockClear();
  mockRemove.mockClear();
});

it('renders the root once fonts are loaded', () => {
  const { getByTestId } = render(<App />);
  expect(getByTestId('app-root')).toBeTruthy();
});

describe('notification-response listener', () => {
  it('registers a listener on mount', () => {
    render(<App />);
    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(capturedListener).toBeInstanceOf(Function);
  });

  it('removes the subscription on unmount', () => {
    const { unmount } = render(<App />);
    expect(mockRemove).not.toHaveBeenCalled();
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('navigates to Record via the nav ref when signed in and the ref is ready', async () => {
    mockAuthStatus = 'signedIn';
    const { findByText } = render(<App />);
    // Wait for the signed-in stack to actually settle on RecordScreen
    // (RootNavigator's mount effect reads the onboarded flag from
    // SecureStore asynchronously) before asserting on the ref/listener —
    // matches the wait pattern used in RootNavigator.test.tsx.
    await findByText('Tap to begin');

    expect(navigationRef.isReady()).toBe(true);
    const resetSpy = jest.spyOn(navigationRef, 'reset');

    // The listener invokes navigationRef.reset() directly (not through a
    // user-event helper), so React doesn't know to batch/flush it — wrap
    // in act() so the resulting navigation-container state update settles
    // before we assert and before the test tears down.
    act(() => {
      capturedListener?.({});
    });

    expect(resetSpy).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Record' }] });
    resetSpy.mockRestore();
  });

  it('does not navigate when the user is not signed in', async () => {
    // The secure-store mock above resolves the onboarded flag to 'true',
    // so signedOut lands on AuthScreen (not Onboarding).
    mockAuthStatus = 'signedOut';
    const { findByText } = render(<App />);
    await findByText('Sign in');

    const resetSpy = jest.spyOn(navigationRef, 'reset');
    act(() => {
      capturedListener?.({});
    });

    expect(resetSpy).not.toHaveBeenCalled();
    resetSpy.mockRestore();
  });
});
