import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockGet = jest.fn();
const mockDel = jest.fn();
jest.mock('../src/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: jest.fn(),
    put: jest.fn(),
    del: (...args: unknown[]) => mockDel(...args),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const mockSignOut = jest.fn();
const mockAuthState = {
  session: { user: { email: 'dreamer@example.com' } },
  signOut: (...args: unknown[]) => mockSignOut(...args),
};
jest.mock('../src/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(mockAuthState),
}));

const mockClearAll = jest.fn();
jest.mock('../src/services/dreamQueue', () => ({
  dreamQueue: {
    clearAll: (...args: unknown[]) => mockClearAll(...args),
  },
}));

const mockScheduleReminder = jest.fn();
const mockCancelReminder = jest.fn();
const mockGetSavedReminder = jest.fn();
jest.mock('../src/services/reminders', () => ({
  reminders: {
    schedule: (...args: unknown[]) => mockScheduleReminder(...args),
    cancel: (...args: unknown[]) => mockCancelReminder(...args),
    getSaved: (...args: unknown[]) => mockGetSavedReminder(...args),
  },
}));

const mockOpenSettings = jest.fn();
const mockOpenURL = jest.fn();
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    openSettings: (...args: unknown[]) => mockOpenSettings(...args),
    openURL: (...args: unknown[]) => mockOpenURL(...args),
  },
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { testID?: string }) => <View testID={props.testID ?? 'datetimepicker'} />,
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

import { SettingsScreen } from '../src/screens/SettingsScreen';

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSavedReminder.mockResolvedValue(null);
    mockGet.mockResolvedValue([]);
  });

  it('renders the account email and Free tier pill', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText('dreamer@example.com')).toBeTruthy());
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('renders the version and disclaimer', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeTruthy());
    expect(
      screen.getByText(
        /DreamLens is a journaling and reflection tool\. It is not a substitute for professional mental health care\./,
      ),
    ).toBeTruthy();
  });

  it('"Upgrade to Pro" navigates to Paywall', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText('Upgrade to Pro')).toBeTruthy());
    fireEvent.press(screen.getByText('Upgrade to Pro'));

    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });

  it('"Privacy Policy" opens the privacy URL', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText('Privacy Policy')).toBeTruthy());
    fireEvent.press(screen.getByText('Privacy Policy'));

    expect(mockOpenURL).toHaveBeenCalledWith('https://dreamlens.app/privacy');
  });

  it('"Sign out" calls signOut', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign out'));

    expect(mockSignOut).toHaveBeenCalled();
  });

  describe('morning ritual reminder', () => {
    it('enabling the reminder toggle shows a time control when permission is granted', async () => {
      mockScheduleReminder.mockResolvedValue({ granted: true });
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByTestId('reminder-toggle')).toBeTruthy());
      await act(async () => {
        fireEvent(screen.getByTestId('reminder-toggle'), 'valueChange', true);
      });

      await waitFor(() => expect(mockScheduleReminder).toHaveBeenCalled());
      expect(screen.getByTestId('reminder-time-picker')).toBeTruthy();
    });

    it('snaps the toggle back and shows the denied message when permission is denied', async () => {
      mockScheduleReminder.mockResolvedValue({ granted: false });
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByTestId('reminder-toggle')).toBeTruthy());
      await act(async () => {
        fireEvent(screen.getByTestId('reminder-toggle'), 'valueChange', true);
      });

      await waitFor(() => expect(screen.getByTestId('reminder-toggle').props.value).toBe(false));
      expect(screen.getByText(/Notifications are off for DreamLens\. Open Settings\./)).toBeTruthy();
      expect(screen.queryByTestId('reminder-time-picker')).toBeNull();
    });

    it('tapping the "Open Settings" link opens the OS settings', async () => {
      mockScheduleReminder.mockResolvedValue({ granted: false });
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByTestId('reminder-toggle')).toBeTruthy());
      await act(async () => {
        fireEvent(screen.getByTestId('reminder-toggle'), 'valueChange', true);
      });
      await waitFor(() => expect(screen.getByText(/Open Settings/)).toBeTruthy());

      fireEvent.press(screen.getByText(/Open Settings/));

      expect(mockOpenSettings).toHaveBeenCalled();
    });

    it('disabling an enabled reminder calls reminders.cancel', async () => {
      mockGetSavedReminder.mockResolvedValue({ enabled: true, hour: 7, minute: 0 });
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByTestId('reminder-toggle').props.value).toBe(true));
      await act(async () => {
        fireEvent(screen.getByTestId('reminder-toggle'), 'valueChange', false);
      });

      expect(mockCancelReminder).toHaveBeenCalled();
    });

    it('rehydrates the saved enabled reminder on mount, including the time control', async () => {
      mockGetSavedReminder.mockResolvedValue({ enabled: true, hour: 6, minute: 30 });
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByTestId('reminder-toggle').props.value).toBe(true));
      expect(screen.getByTestId('reminder-time-picker')).toBeTruthy();
    });
  });

  describe('danger zone / account deletion', () => {
    it('tapping "Delete account and all dreams" opens a confirmation modal (does not call the API directly)', async () => {
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByText('Delete account and all dreams')).toBeTruthy());
      fireEvent.press(screen.getByText('Delete account and all dreams'));

      expect(mockDel).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('delete-account-modal')).toBeTruthy());
    });

    it('shows the dream count fetched lazily when the modal opens', async () => {
      mockGet.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }]);
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByText('Delete account and all dreams')).toBeTruthy());
      fireEvent.press(screen.getByText('Delete account and all dreams'));

      await waitFor(() =>
        expect(
          screen.getByText('This will permanently delete all 3 dreams and your account. This cannot be undone.'),
        ).toBeTruthy(),
      );
      expect(mockGet).toHaveBeenCalledWith('/v1/dreams');
    });

    it('shows truthful "your" copy while the count is still loading', async () => {
      let resolveGet: (value: unknown[]) => void = () => {};
      mockGet.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );
      render(<SettingsScreen />);

      await waitFor(() => expect(screen.getByText('Delete account and all dreams')).toBeTruthy());
      fireEvent.press(screen.getByText('Delete account and all dreams'));

      await waitFor(() =>
        expect(
          screen.getByText('This will permanently delete all your dreams and your account. This cannot be undone.'),
        ).toBeTruthy(),
      );

      await act(async () => {
        resolveGet([{ id: '1' }]);
      });
    });

    it('"Keep my account" dismisses the modal without calling delete/clearAll/signOut', async () => {
      render(<SettingsScreen />);

      fireEvent.press(await screen.findByText('Delete account and all dreams'));
      await screen.findByTestId('delete-account-modal');

      fireEvent.press(screen.getByText('Keep my account'));

      await waitFor(() => expect(screen.queryByTestId('delete-account-modal')).toBeNull());
      expect(mockDel).not.toHaveBeenCalled();
      expect(mockClearAll).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('"Delete everything" calls DELETE /v1/account, then clearAll, then signOut, in order', async () => {
      const callOrder: string[] = [];
      mockDel.mockImplementation(async () => {
        callOrder.push('del');
      });
      mockClearAll.mockImplementation(async () => {
        callOrder.push('clearAll');
      });
      mockSignOut.mockImplementation(async () => {
        callOrder.push('signOut');
      });

      render(<SettingsScreen />);

      fireEvent.press(await screen.findByText('Delete account and all dreams'));
      await screen.findByTestId('delete-account-modal');

      await act(async () => {
        fireEvent.press(screen.getByText('Delete everything'));
      });

      await waitFor(() => expect(callOrder).toEqual(['del', 'clearAll', 'signOut']));
    });

    it('shows an inline error and keeps the modal open when deletion fails', async () => {
      mockDel.mockRejectedValue(new Error('server exploded'));

      render(<SettingsScreen />);

      fireEvent.press(await screen.findByText('Delete account and all dreams'));
      await screen.findByTestId('delete-account-modal');

      await act(async () => {
        fireEvent.press(screen.getByText('Delete everything'));
      });

      await waitFor(() => expect(screen.getByText(/Couldn't delete your account\. Try again\./)).toBeTruthy());
      expect(screen.getByTestId('delete-account-modal')).toBeTruthy();
      expect(mockClearAll).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });
});
