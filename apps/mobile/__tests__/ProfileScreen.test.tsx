import { fireEvent, render, screen } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
}));

const mockUsePatterns = jest.fn();
jest.mock('../src/hooks/usePatterns', () => ({
  usePatterns: (...args: unknown[]) => mockUsePatterns(...args),
}));

import { ProfileScreen } from '../src/screens/ProfileScreen';

function mockPatterns(overrides: Partial<ReturnType<typeof mockUsePatterns>>) {
  mockUsePatterns.mockReturnValue({
    status: 'ok',
    data: null,
    retry: jest.fn(),
    markSeen: jest.fn(),
    ...overrides,
  });
}

const basePatterns = {
  summary: {
    totalDreams: 23,
    recurringSymbols: [
      { label: 'Ocean', count: 7 },
      { label: 'Flying', count: 5 },
      { label: 'Door', count: 3 },
    ],
    dominantTone: 'Anxious',
  },
  emotionArc: [
    { date: '2026-07-01', tone: 'anxious' },
    { date: '2026-07-02', tone: 'peaceful' },
    { date: '2026-07-03', tone: 'surreal' },
  ],
  clusters: [{ id: 'c1', label: 'Dreams of Ocean', topSymbols: ['Ocean', 'Water'], dreamCount: 4 }],
  insights: [
    { id: 'i1', title: 'A recurring theme', body: 'You keep dreaming of water.', seenAt: null },
    { id: 'i2', title: 'Old insight', body: 'Already seen.', seenAt: '2026-06-01T00:00:00.000Z' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfileScreen', () => {
  it('shows a loading empty state', () => {
    mockPatterns({ status: 'loading', data: null });
    render(<ProfileScreen />);
    expect(screen.getByTestId('profile-loading')).toBeTruthy();
  });

  it('shows an error state with a retry action', () => {
    const retry = jest.fn();
    mockPatterns({ status: 'error', data: null, retry });
    render(<ProfileScreen />);
    expect(screen.getByText("Couldn't load your patterns")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders the stat row totals', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(screen.getByText('23')).toBeTruthy(); // totalDreams
    expect(screen.getByText('3')).toBeTruthy(); // recurringSymbols.length
    expect(screen.getByText('Anxious')).toBeTruthy(); // dominantTone
    expect(screen.getByText('Dreams')).toBeTruthy();
    expect(screen.getByText('Symbols')).toBeTruthy();
    expect(screen.getByText('Dominant tone')).toBeTruthy();
  });

  it('renders recurring symbol cards under "Keeps returning"', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(screen.getByText('Keeps returning')).toBeTruthy();
    expect(screen.getByText('Ocean')).toBeTruthy();
    expect(screen.getByText('×7')).toBeTruthy();
  });

  it('renders the insight card title, unseen first', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(screen.getByText('What your dreams suggest')).toBeTruthy();
    expect(screen.getByText('A recurring theme')).toBeTruthy();
  });

  it('renders cluster cards under a recurring-themes section', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(screen.getByText('Dreams of Ocean')).toBeTruthy();
    expect(screen.getByText('×4')).toBeTruthy();
  });

  it('shows the "Keep dreaming" teaser when totalDreams < 5, with correct copy', () => {
    mockPatterns({
      status: 'ok',
      data: {
        ...basePatterns,
        summary: { ...basePatterns.summary, totalDreams: 2 },
      },
    });
    render(<ProfileScreen />);
    expect(screen.getByText('Keep dreaming')).toBeTruthy();
    expect(
      screen.getByText('Pattern analysis unlocks after 5 entries. 3 more to go.'),
    ).toBeTruthy();
  });

  it('shows singular copy when exactly 1 more dream is needed', () => {
    mockPatterns({
      status: 'ok',
      data: {
        ...basePatterns,
        summary: { ...basePatterns.summary, totalDreams: 4 },
      },
    });
    render(<ProfileScreen />);
    expect(screen.getByText('Pattern analysis unlocks after 5 entries. 1 more to go.')).toBeTruthy();
  });

  it('does not show the teaser at 5 or more dreams', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(screen.queryByText('Keep dreaming')).toBeNull();
  });

  it('sets the header title to "Your patterns"', () => {
    mockPatterns({ status: 'ok', data: basePatterns });
    render(<ProfileScreen />);
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Your patterns' });
  });
});
