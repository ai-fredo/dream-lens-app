import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: jest.fn(),
}));

let mockAuthState: { session: null; status: 'loading' | 'signedOut' | 'signedIn' } = {
  session: null,
  status: 'loading',
};
jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(mockAuthState),
}));

import { RootNavigator } from '../src/navigation/RootNavigator';

function renderNavigator() {
  return render(
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

describe('RootNavigator', () => {
  beforeEach(() => {
    mockGetItemAsync.mockReset();
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockReset();
  });

  it('renders a blank view while auth status is loading', () => {
    mockAuthState = { session: null, status: 'loading' };
    const { getByTestId } = renderNavigator();
    expect(getByTestId('root-navigator-loading')).toBeTruthy();
  });

  it('renders AuthScreen when signed out and already onboarded', async () => {
    mockGetItemAsync.mockResolvedValue('true');
    mockAuthState = { session: null, status: 'signedOut' };
    renderNavigator();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    });
  });

  it('renders OnboardingFlow when signed out and not yet onboarded', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    mockAuthState = { session: null, status: 'signedOut' };
    renderNavigator();

    await waitFor(() => {
      expect(
        screen.getByText('Every morning, your subconscious leaves you a message.')
      ).toBeTruthy();
    });
  });

  it('renders RecordScreen placeholder as the home route when signed in', async () => {
    mockAuthState = { session: null, status: 'signedIn' };
    const { getByTestId } = renderNavigator();

    await waitFor(() => {
      expect(getByTestId('record-placeholder')).toBeTruthy();
    });
  });

  describe('completing onboarding through the navigator', () => {
    it.each([['Record now'], ['Not today']])(
      'driving the onboarding flow to completion via "%s" persists the onboarded flag and transitions to Auth',
      async (finishButtonName) => {
        mockGetItemAsync.mockResolvedValue(null);
        mockAuthState = { session: null, status: 'signedOut' };
        renderNavigator();

        await waitFor(() => {
          expect(
            screen.getByText('Every morning, your subconscious leaves you a message.')
          ).toBeTruthy();
        });

        fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
        fireEvent.press(screen.getByRole('button', { name: 'I understand, continue' }));
        fireEvent.press(screen.getByRole('button', { name: finishButtonName }));

        await waitFor(() => {
          expect(mockSetItemAsync).toHaveBeenCalledWith('dreamlens.onboarded', 'true');
        });

        await waitFor(() => {
          expect(screen.getByPlaceholderText('Email')).toBeTruthy();
        });
      }
    );
  });
});
