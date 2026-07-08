import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
}));

const mockUseDreams = jest.fn();
jest.mock('../src/hooks/useDreams', () => ({
  useDreams: (...args: unknown[]) => mockUseDreams(...args),
}));

import { JournalScreen } from '../src/screens/JournalScreen';

const julyDream = {
  id: 'dream-1',
  recordedAt: '2026-07-04T13:23:00.000Z',
  rawTranscript: 'I was standing in my childhood home, looking for a door that led nowhere.',
  editedTranscript: null,
  createdAt: '2026-07-04T13:24:00.000Z',
  pending: false,
  interpretation: {
    summary: 'Summary text',
    themes: ['Transition'],
    symbols: [
      { symbol: 'Water', interpretation: 'x' },
      { symbol: 'Door', interpretation: 'x' },
      { symbol: 'Stranger', interpretation: 'x' },
    ],
    emotionalTone: 'Anxious',
    patternNote: 'You keep returning to thresholds in your dreams.',
    questionsToReflectOn: [],
  },
};

const juneDream = {
  id: 'dream-2',
  recordedAt: '2026-06-15T08:00:00.000Z',
  rawTranscript: 'I found myself swimming in a calm blue ocean under a full moon.',
  editedTranscript: null,
  createdAt: '2026-06-15T08:01:00.000Z',
  pending: false,
  interpretation: null,
};

const pendingDream = {
  id: 'local-1',
  recordedAt: '2026-07-05T06:00:00.000Z',
  rawTranscript: 'A dream not yet synced to the server.',
  editedTranscript: null,
  createdAt: '2026-07-05T06:00:01.000Z',
  pending: true,
  interpretation: null,
};

function mockDreams(overrides: Partial<ReturnType<typeof mockUseDreams>>) {
  mockUseDreams.mockReturnValue({
    status: 'ok',
    dreams: [],
    retry: jest.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('JournalScreen', () => {
  it('shows exact empty-state copy when there are no dreams, and "Record now" navigates to Record', () => {
    mockDreams({ status: 'ok', dreams: [] });

    render(<JournalScreen />);

    expect(screen.getByText('Your journal is quiet')).toBeTruthy();
    expect(screen.getByText('Record your first dream to begin.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Record now' }));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
  });

  it('groups dreams into month sections, newest first', () => {
    mockDreams({ status: 'ok', dreams: [julyDream, juneDream] });

    render(<JournalScreen />);

    expect(screen.getByText('JULY 2026')).toBeTruthy();
    expect(screen.getByText('JUNE 2026')).toBeTruthy();
  });

  it('filters rows by search term across transcript and symbol names (case-insensitive)', () => {
    mockDreams({ status: 'ok', dreams: [julyDream, juneDream] });

    render(<JournalScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Search dreams...'), 'water');

    expect(screen.getByText('JULY 2026')).toBeTruthy();
    expect(screen.queryByText('JUNE 2026')).toBeNull();
  });

  it('shows "No dreams match." when search has no results', () => {
    mockDreams({ status: 'ok', dreams: [julyDream, juneDream] });

    render(<JournalScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Search dreams...'), 'zzzznomatch');

    expect(screen.getByText('No dreams match.')).toBeTruthy();
  });

  it('shows the gold left edge testID only on rows whose interpretation has a patternNote', () => {
    mockDreams({ status: 'ok', dreams: [julyDream, juneDream] });

    render(<JournalScreen />);

    expect(screen.getByTestId('pattern-edge-dream-1')).toBeTruthy();
    expect(screen.queryByTestId('pattern-edge-dream-2')).toBeNull();
  });

  it('pending rows show "Waiting to sync" instead of a tone pill and are not tappable', () => {
    mockDreams({ status: 'ok', dreams: [pendingDream] });

    render(<JournalScreen />);

    expect(screen.getByText('Waiting to sync')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dream-row-local-1'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('tapping a synced row navigates to EntryDetail with the dreamId', () => {
    mockDreams({ status: 'ok', dreams: [julyDream] });

    render(<JournalScreen />);

    fireEvent.press(screen.getByTestId('dream-row-dream-1'));
    expect(mockNavigate).toHaveBeenCalledWith('EntryDetail', { dreamId: 'dream-1' });
  });

  it('renders a loading EmptyState while dreams are loading', () => {
    mockDreams({ status: 'loading', dreams: [] });

    render(<JournalScreen />);

    expect(screen.getByTestId('journal-loading')).toBeTruthy();
  });

  it('renders an error EmptyState with Retry calling retry()', async () => {
    const retry = jest.fn();
    mockDreams({ status: 'error', dreams: [], retry });

    render(<JournalScreen />);

    expect(screen.getByText("Can't connect right now")).toBeTruthy();
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  });

  it('sets header right nav options with Profile and Settings TextButtons', () => {
    mockDreams({ status: 'ok', dreams: [] });

    render(<JournalScreen />);

    expect(mockSetOptions).toHaveBeenCalled();
    const optionsArg = mockSetOptions.mock.calls[0][0];
    expect(optionsArg.title).toBe('Journal');

    const HeaderRight = optionsArg.headerRight;
    const { getByRole } = render(<HeaderRight />);

    fireEvent.press(getByRole('button', { name: 'Profile' }));
    expect(mockNavigate).toHaveBeenCalledWith('Profile');

    fireEvent.press(getByRole('button', { name: 'Settings' }));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });
});
