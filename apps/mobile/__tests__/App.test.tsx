import { render } from '@testing-library/react-native';
import App from '../App';

jest.mock('@expo-google-fonts/cormorant-garamond', () => ({
  useFonts: () => [true, null],
  CormorantGaramond_300Light: 1, CormorantGaramond_300Light_Italic: 1,
  CormorantGaramond_400Regular: 1, CormorantGaramond_400Regular_Italic: 1,
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

jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: null,
      status: 'loading',
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    }),
}));

it('renders the root once fonts are loaded', () => {
  const { getByTestId } = render(<App />);
  expect(getByTestId('app-root')).toBeTruthy();
});
