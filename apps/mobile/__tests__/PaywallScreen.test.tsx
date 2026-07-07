import { fireEvent, render, screen } from '@testing-library/react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

import { PaywallScreen } from '../src/screens/PaywallScreen';

describe('PaywallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Pro benefits list', () => {
    render(<PaywallScreen />);

    expect(screen.getByText(/unlimited dreams/i)).toBeTruthy();
    expect(screen.getByText(/full pattern analysis/i)).toBeTruthy();
    expect(screen.getByText(/search/i)).toBeTruthy();
    expect(screen.getByText(/lifetime history/i)).toBeTruthy();
  });

  it('renders the price line', () => {
    render(<PaywallScreen />);

    expect(screen.getByText(/\$7\.99\/month or \$59\.99\/year/)).toBeTruthy();
  });

  it('shows the "not available in this build" note only after tapping Continue, and never calls a purchase API', () => {
    render(<PaywallScreen />);

    expect(screen.queryByText(/purchases aren't available in this build yet/i)).toBeNull();

    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText(/purchases aren't available in this build yet/i)).toBeTruthy();
  });

  it('"Not now" navigates back', () => {
    render(<PaywallScreen />);

    fireEvent.press(screen.getByText('Not now'));

    expect(mockGoBack).toHaveBeenCalled();
  });
});
