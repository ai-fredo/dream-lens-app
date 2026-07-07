import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
let mockRouteParams: { dreamId: string } = { dreamId: 'dream-1' };
const mockUseRoute = jest.fn(() => ({ params: mockRouteParams }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, setOptions: mockSetOptions }),
  useRoute: () => mockUseRoute(),
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../src/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
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

jest.mock('../src/services/haptics', () => ({
  haptics: {
    recordStart: jest.fn(),
    recordStop: jest.fn(),
    interpretationReady: jest.fn(),
    error: jest.fn(),
    buttonPress: jest.fn(),
  },
}));

import { EntryDetailScreen } from '../src/screens/EntryDetailScreen';

interface TestDream {
  id: string;
  recordedAt: string;
  rawTranscript: string;
  editedTranscript: string | null;
  notes: string | null;
}

const baseDream: TestDream = {
  id: 'dream-1',
  recordedAt: '2026-07-04T13:23:00.000Z',
  rawTranscript: 'I was flying over the ocean',
  editedTranscript: null,
  notes: null,
};

const fullInterpretation = {
  summary: 'This dream places you in the role of observer at a threshold.',
  themes: ['Unresolved transition'],
  symbols: [{ symbol: 'Door', interpretation: 'A door you cannot open appears when change is near.' }],
  emotionalTone: 'Anxious',
  patternNote: null,
  questionsToReflectOn: ['What are you avoiding?'],
};

describe('EntryDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { dreamId: 'dream-1' };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('uninterpreted dream', () => {
    it('renders the transcript block and does not trigger interpretation', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
      render(<EntryDetailScreen />);

      await waitFor(() => expect(screen.getByText('I was flying over the ocean')).toBeTruthy());
      expect(screen.getByText('YOUR DREAM')).toBeTruthy();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('prefers the edited transcript over the raw one when present', async () => {
      mockGet.mockResolvedValue({
        ...baseDream,
        editedTranscript: 'the edited version of the dream',
        interpretation: null,
      });
      render(<EntryDetailScreen />);

      await waitFor(() => expect(screen.getByText('the edited version of the dream')).toBeTruthy());
      expect(screen.queryByText('I was flying over the ocean')).toBeNull();
    });
  });

  describe('interpreted dream', () => {
    it('renders via InterpretationView content', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: fullInterpretation });
      render(<EntryDetailScreen />);

      await waitFor(() =>
        expect(
          screen.getByText('This dream places you in the role of observer at a threshold.'),
        ).toBeTruthy(),
      );
      expect(screen.getByText('Anxious')).toBeTruthy();
    });
  });

  describe('header title', () => {
    it('sets the title to the friendly formatted date once the dream loads', async () => {
      mockGet.mockResolvedValue({ ...baseDream, recordedAt: '2026-07-03T13:23:00.000Z', interpretation: null });
      render(<EntryDetailScreen />);

      await waitFor(() => expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Friday, July 3' }));
    });
  });

  describe('notes autosave', () => {
    it('prefills the notes field from dream.notes', async () => {
      mockGet.mockResolvedValue({ ...baseDream, notes: 'a prior reflection', interpretation: null });
      render(<EntryDetailScreen />);

      await waitFor(() => expect(screen.getByDisplayValue('a prior reflection')).toBeTruthy());
    });

    it('blur triggers a PUT with the changed notes', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
      mockPut.mockResolvedValue({ ...baseDream, notes: 'felt about my father' });
      render(<EntryDetailScreen />);

      const input = await screen.findByPlaceholderText('Add a reflection...');
      fireEvent.changeText(input, 'felt about my father');
      fireEvent(input, 'blur');

      await waitFor(() =>
        expect(mockPut).toHaveBeenCalledWith('/v1/dreams/dream-1', { notes: 'felt about my father' }),
      );
    });

    it('does not PUT on blur when notes are unchanged', async () => {
      mockGet.mockResolvedValue({ ...baseDream, notes: 'unchanged', interpretation: null });
      render(<EntryDetailScreen />);

      const input = await screen.findByDisplayValue('unchanged');
      fireEvent(input, 'blur');

      await new Promise((r) => setTimeout(r, 0));
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('shows "Saved" after a successful save, then fades it out', async () => {
      jest.useFakeTimers();
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
      mockPut.mockResolvedValue({ ...baseDream, notes: 'a new note' });
      render(<EntryDetailScreen />);

      const input = await screen.findByPlaceholderText('Add a reflection...');
      fireEvent.changeText(input, 'a new note');
      fireEvent(input, 'blur');

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText('Saved')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.queryByText('Saved')).toBeNull();
    });

    it('shows a retry TextButton on save failure and keeps the typed text', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
      mockPut.mockRejectedValueOnce(new Error('network down'));
      render(<EntryDetailScreen />);

      const input = await screen.findByPlaceholderText('Add a reflection...');
      fireEvent.changeText(input, 'a note that fails to save');
      fireEvent(input, 'blur');

      await waitFor(() =>
        expect(screen.getByText("Couldn't save your note. Tap to retry.")).toBeTruthy(),
      );
      expect(screen.getByDisplayValue('a note that fails to save')).toBeTruthy();

      mockPut.mockResolvedValue({ ...baseDream, notes: 'a note that fails to save' });
      fireEvent.press(screen.getByText("Couldn't save your note. Tap to retry."));

      await waitFor(() =>
        expect(mockPut).toHaveBeenLastCalledWith('/v1/dreams/dream-1', { notes: 'a note that fails to save' }),
      );
      await waitFor(() => expect(screen.queryByText("Couldn't save your note. Tap to retry.")).toBeNull());
    });

    it('does not update state (and does not warn) when a save resolves after unmount', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      let resolvePut: (value: TestDream) => void = () => {};
      mockPut.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePut = resolve;
          }),
      );

      const { unmount } = render(<EntryDetailScreen />);

      const input = await screen.findByPlaceholderText('Add a reflection...');
      fireEvent.changeText(input, 'note typed before leaving');
      fireEvent(input, 'blur');

      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

      // Unmount while the PUT is still in flight.
      unmount();

      // Now let the stale PUT resolve. If the component failed to guard
      // against post-unmount setState, this would trigger a React "Can't
      // perform a React state update on an unmounted component" warning.
      await act(async () => {
        resolvePut({ ...baseDream, notes: 'note typed before leaving' });
        await Promise.resolve();
        await Promise.resolve();
      });

      const stateUpdateWarning = consoleError.mock.calls.some((call) =>
        String(call[0]).includes("Can't perform a React state update"),
      );
      expect(stateUpdateWarning).toBe(false);

      consoleError.mockRestore();
    });

    it('resolves out of order: the second (latest) save wins over a stale first save', async () => {
      mockGet.mockResolvedValue({ ...baseDream, interpretation: null });

      let resolveFirst: (value: TestDream) => void = () => {};
      let resolveSecond: (value: TestDream) => void = () => {};
      const firstPut = new Promise<TestDream>((resolve) => {
        resolveFirst = resolve;
      });
      const secondPut = new Promise<TestDream>((resolve) => {
        resolveSecond = resolve;
      });
      mockPut.mockImplementationOnce(() => firstPut).mockImplementationOnce(() => secondPut);

      render(<EntryDetailScreen />);

      const input = await screen.findByPlaceholderText('Add a reflection...');

      // First save: type, blur (PUT #1 fires and hangs).
      fireEvent.changeText(input, 'first draft');
      fireEvent(input, 'blur');
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

      // Second save: edit again, blur (PUT #2 fires while PUT #1 is still in flight).
      fireEvent.changeText(input, 'second draft');
      fireEvent(input, 'blur');
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(2));

      expect(mockPut).toHaveBeenNthCalledWith(1, '/v1/dreams/dream-1', { notes: 'first draft' });
      expect(mockPut).toHaveBeenNthCalledWith(2, '/v1/dreams/dream-1', { notes: 'second draft' });

      // Resolve the SECOND (latest) save first, then the stale first save —
      // out-of-order resolution.
      await act(async () => {
        resolveSecond({ ...baseDream, notes: 'second draft' });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText('Saved')).toBeTruthy();

      await act(async () => {
        resolveFirst({ ...baseDream, notes: 'first draft' });
        await Promise.resolve();
        await Promise.resolve();
      });

      // "Saved" must still be showing exactly once — the stale first save's
      // resolution must not have reset or re-triggered anything, proving the
      // out-of-order response was ignored.
      expect(screen.getAllByText('Saved')).toHaveLength(1);
      expect(screen.getByDisplayValue('second draft')).toBeTruthy();
    });
  });
});
