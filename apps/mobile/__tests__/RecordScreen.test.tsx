import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockReset = jest.fn();
let mockHookState: {
  state: 'idle' | 'listening' | 'stopped' | 'denied' | 'unavailable';
  transcript: string;
};

jest.mock('../src/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    ...mockHookState,
    start: mockStart,
    stop: mockStop,
    reset: mockReset,
  }),
}));

const mockOpenSettings = jest.fn();
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openSettings: (...args: unknown[]) => mockOpenSettings(...args),
}));

import { RecordScreen } from '../src/screens/RecordScreen';

describe('RecordScreen', () => {
  // The date-eyebrow assertion ("TUESDAY, JULY 7") is only deterministic if
  // the process timezone is fixed — Node/V8 reads TZ once at startup, so it
  // must be set before the test process launches (see the workspace's `test`
  // script in package.json, which pins TZ=UTC) rather than mutated here.
  beforeEach(() => {
    mockNavigate.mockReset();
    mockStart.mockReset();
    mockStop.mockReset();
    mockReset.mockReset();
    mockOpenSettings.mockReset();
    mockHookState = { state: 'idle', transcript: '' };
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the placeholder copy and "Tap to begin" hint by default', () => {
    render(<RecordScreen />);
    expect(screen.getByText("Speak when you're ready.")).toBeTruthy();
    expect(screen.getByText('Tap to begin')).toBeTruthy();
  });

  it('shows the title and uppercase date eyebrow', () => {
    render(<RecordScreen />);
    expect(screen.getByText("This morning's dream")).toBeTruthy();
    expect(screen.getByText('TUESDAY, JULY 7')).toBeTruthy();
  });

  it('tapping the record button starts recognition', () => {
    render(<RecordScreen />);
    fireEvent.press(screen.getByLabelText('Start recording'));
    expect(mockStart).toHaveBeenCalled();
  });

  it('shows "Listening... tap to stop" and streams transcript while listening', () => {
    mockHookState = { state: 'listening', transcript: 'I was flying over the ocean' };
    render(<RecordScreen />);
    expect(screen.getByText('Listening... tap to stop')).toBeTruthy();
    expect(screen.getByText('I was flying over the ocean')).toBeTruthy();
  });

  it('tapping again while listening stops recognition', () => {
    mockHookState = { state: 'listening', transcript: 'a dream' };
    render(<RecordScreen />);
    fireEvent.press(screen.getByLabelText('Stop recording'));
    expect(mockStop).toHaveBeenCalled();
  });

  it('navigates to Review with the transcript and an ISO timestamp once stopped with content', async () => {
    mockHookState = { state: 'stopped', transcript: 'a vivid dream about the sea' };
    render(<RecordScreen />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Review', {
        rawTranscript: 'a vivid dream about the sea',
        recordedAt: '2026-07-07T12:00:00.000Z',
      });
    });
  });

  it('does not navigate to Review when stopped with an empty transcript', () => {
    mockHookState = { state: 'stopped', transcript: '' };
    render(<RecordScreen />);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('Nothing recorded yet')).toBeTruthy();
  });

  it('routes to PermissionExplainScreen when permission is denied', async () => {
    mockHookState = { state: 'denied', transcript: '' };
    render(<RecordScreen />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('PermissionExplain');
    });
  });

  it('shows a "Type instead" option when STT is unavailable, routing to Review with an empty transcript', () => {
    mockHookState = { state: 'unavailable', transcript: '' };
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Type instead' }));

    expect(mockNavigate).toHaveBeenCalledWith('Review', {
      rawTranscript: '',
      recordedAt: '2026-07-07T12:00:00.000Z',
    });
  });

  it('has a "Journal →" link at the bottom', () => {
    render(<RecordScreen />);
    expect(screen.getByRole('button', { name: 'Journal →' })).toBeTruthy();
  });

  it('tapping "Journal →" navigates to Journal', () => {
    render(<RecordScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Journal →' }));
    expect(mockNavigate).toHaveBeenCalledWith('Journal');
  });
});
