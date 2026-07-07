import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: { dreamId: string } = { dreamId: 'dream-1' };
const mockUseRoute = jest.fn(() => ({ params: mockRouteParams }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    del: jest.fn(),
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

const mockInterpretationReady = jest.fn();
jest.mock('../src/services/haptics', () => ({
  haptics: {
    recordStart: jest.fn(),
    recordStop: jest.fn(),
    interpretationReady: (...args: unknown[]) => mockInterpretationReady(...args),
    error: jest.fn(),
    buttonPress: jest.fn(),
  },
}));

import { InterpretationScreen } from '../src/screens/InterpretationScreen';

const baseDream = {
  id: 'dream-1',
  userId: 'u1',
  recordedAt: '2026-07-04T13:23:00.000Z',
  rawTranscript: 'I was flying over the ocean',
  editedTranscript: null,
  createdAt: '2026-07-04T13:24:00.000Z',
};

const fullInterpretation = {
  summary: 'This dream places you in the role of observer at a threshold.',
  themes: ['Unresolved transition', 'Identity uncertainty', 'Avoidance'],
  symbols: [
    { symbol: 'Door', interpretation: 'A door you cannot open appears when change is near.' },
    { symbol: 'Ocean', interpretation: 'The vastness of the unknown.' },
  ],
  emotionalTone: 'Anxious',
  patternNote: null,
  questionsToReflectOn: ['What are you avoiding?', 'What lies beyond the door?'],
};

function sixSymbols() {
  return Array.from({ length: 6 }, (_, i) => ({
    symbol: `Symbol${i}`,
    interpretation: `Interpretation text ${i}`,
  }));
}

describe('InterpretationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { dreamId: 'dream-1' };
  });

  describe('loading state', () => {
    it('shows "Reading your dream" and nothing else — no spinner, no percentage', async () => {
      mockGet.mockReturnValue(new Promise(() => {}));
      render(<InterpretationScreen />);

      expect(screen.getByText('Reading your dream')).toBeTruthy();
      expect(screen.queryByText(/%/)).toBeNull();
      expect(screen.queryByTestId('activity-indicator')).toBeNull();
    });
  });

  describe('content state', () => {
    it('renders the summary text', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() =>
        expect(
          screen.getByText('This dream places you in the role of observer at a threshold.')
        ).toBeTruthy()
      );
    });

    it('renders the emotional-tone pill and theme pills', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('Anxious')).toBeTruthy());
      expect(screen.getByText('Unresolved transition')).toBeTruthy();
      expect(screen.getByText('Identity uncertainty')).toBeTruthy();
      expect(screen.getByText('Avoidance')).toBeTruthy();
    });

    it('renders up to 5 symbol cards with no "See all" when 5 or fewer', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('DOOR')).toBeTruthy());
      expect(screen.getByText('OCEAN')).toBeTruthy();
      expect(screen.queryByText('See all')).toBeNull();
    });

    it('shows only 5 symbol cards plus "See all" when 6 symbols are given, revealing the rest on tap', async () => {
      mockGet.mockResolvedValue({
        ...baseDream,
        interpretation: { ...fullInterpretation, symbols: sixSymbols() },
      });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('SYMBOL0')).toBeTruthy());
      expect(screen.getByText('SYMBOL4')).toBeTruthy();
      expect(screen.queryByText('SYMBOL5')).toBeNull();
      expect(screen.getByText('See all')).toBeTruthy();

      fireEvent.press(screen.getByText('See all'));

      expect(screen.getByText('SYMBOL5')).toBeTruthy();
      expect(screen.queryByText('See all')).toBeNull();
    });

    it('renders the pattern note card only when patternNote is present', async () => {
      mockGet.mockResolvedValue({
        ...baseDream,
        interpretation: { ...fullInterpretation, patternNote: 'You keep dreaming of thresholds.' },
      });
      render(<InterpretationScreen />);

      await waitFor(() =>
        expect(screen.getByText('You keep dreaming of thresholds.')).toBeTruthy()
      );
      expect(screen.getByText(/PATTERN/)).toBeTruthy();
    });

    it('does not render the pattern note card when patternNote is null', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('Anxious')).toBeTruthy());
      expect(screen.queryByText(/PATTERN/)).toBeNull();
    });

    it('renders the reflection questions', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('What are you avoiding?')).toBeTruthy());
      expect(screen.getByText('What lies beyond the door?')).toBeTruthy();
      expect(screen.getByText('Questions to sit with')).toBeTruthy();
    });

    it('renders the "Save to journal" button which navigates to Journal', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save to journal' })).toBeTruthy());
      fireEvent.press(screen.getByRole('button', { name: 'Save to journal' }));
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });

    it('fires haptics.interpretationReady once when content first renders', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText('Anxious')).toBeTruthy());
      expect(mockInterpretationReady).toHaveBeenCalledTimes(1);
    });
  });

  describe('error state', () => {
    it('shows the exact error copy and a "Try again" button', async () => {
      mockGet.mockRejectedValue(new Error('network down'));
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByText("Couldn't interpret your dream")).toBeTruthy());
      expect(
        screen.getByText("Your dream is saved. Tap to try again when you're connected.")
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('tapping "Try again" refires the fetch/interpret flow', async () => {
      mockGet.mockRejectedValueOnce(new Error('network down'));
      render(<InterpretationScreen />);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());

      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

      await waitFor(() => expect(screen.getByText('Anxious')).toBeTruthy());
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });
});
