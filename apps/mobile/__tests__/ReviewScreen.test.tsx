import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: { rawTranscript: string; recordedAt: string } = {
  rawTranscript: '',
  recordedAt: '2026-07-04T13:23:00.000Z',
};
const mockUseRoute = jest.fn(() => ({ params: mockRouteParams }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => mockUseRoute(),
}));

const mockSubmit = jest.fn();
jest.mock('../src/services/dreams', () => ({
  dreams: {
    submit: (...args: unknown[]) => mockSubmit(...args),
  },
}));

import { ReviewScreen } from '../src/screens/ReviewScreen';

describe('ReviewScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockSubmit.mockReset();
    mockUseRoute.mockClear();
    mockRouteParams = {
      rawTranscript: 'I was flying over the ocean',
      recordedAt: '2026-07-04T13:23:00.000Z',
    };
  });

  it('prefills the input with the rawTranscript param', () => {
    render(<ReviewScreen />);
    expect(screen.getByDisplayValue('I was flying over the ocean')).toBeTruthy();
  });

  it('shows the title and subtitle copy', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('Review your dream')).toBeTruthy();
    expect(screen.getByText('Correct any errors before interpretation')).toBeTruthy();
  });

  it('shows the DATE eyebrow and a formatted timestamp', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('DATE')).toBeTruthy();
    // 2026-07-04T13:23:00.000Z with TZ=UTC (pinned in package.json test script)
    // -> "Saturday, July 4 at 1:23 PM"
    expect(screen.getByText('Saturday, July 4 at 1:23 PM')).toBeTruthy();
  });

  it('shows the whispered italic hint', () => {
    render(<ReviewScreen />);
    expect(
      screen.getByText('Lightly edit any transcription errors. Meaning matters more than exact words.')
    ).toBeTruthy();
  });

  it('shows the primary CTA and the save-only text link', () => {
    render(<ReviewScreen />);
    expect(screen.getByRole('button', { name: 'Interpret this dream' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save without interpreting' })).toBeTruthy();
  });

  it('editing the input updates its value', () => {
    render(<ReviewScreen />);
    const input = screen.getByDisplayValue('I was flying over the ocean');
    fireEvent.changeText(input, 'I was flying over the sea');
    expect(screen.getByDisplayValue('I was flying over the sea')).toBeTruthy();
  });

  it('pressing "Interpret this dream" submits with interpret:true and the edited text', async () => {
    mockSubmit.mockResolvedValue({ syncedId: 'server-1' });
    render(<ReviewScreen />);

    const input = screen.getByDisplayValue('I was flying over the ocean');
    fireEvent.changeText(input, 'I was flying over the sea');
    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        rawTranscript: 'I was flying over the ocean',
        editedTranscript: 'I was flying over the sea',
        recordedAt: '2026-07-04T13:23:00.000Z',
        interpret: true,
      });
    });
  });

  it('navigates to Interpretation with the server id when submit returns syncedId', async () => {
    mockSubmit.mockResolvedValue({ syncedId: 'server-1' });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Interpretation', { dreamId: 'server-1' });
    });
  });

  it('pressing "Save without interpreting" submits with interpret:false', async () => {
    mockSubmit.mockResolvedValue({ saved: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Save without interpreting' }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        rawTranscript: 'I was flying over the ocean',
        editedTranscript: 'I was flying over the ocean',
        recordedAt: '2026-07-04T13:23:00.000Z',
        interpret: false,
      });
    });
  });

  it('navigates to Journal when submit returns saved:true, with no error shown', async () => {
    mockSubmit.mockResolvedValue({ saved: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Save without interpreting' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });
    expect(screen.queryByText(/couldn't|failed|try again|something went wrong/i)).toBeNull();
  });

  it('navigates to Journal when submit returns queued:true (offline), with no error shown', async () => {
    mockSubmit.mockResolvedValue({ queued: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });
    expect(screen.queryByText(/couldn't|failed|try again|something went wrong/i)).toBeNull();
  });

  it('navigates to Paywall when submit returns upgradeRequired:true', async () => {
    mockSubmit.mockResolvedValue({ upgradeRequired: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Paywall');
    });
  });

  it('enforces a 5000 character cap on the input via maxLength', () => {
    render(<ReviewScreen />);
    const input = screen.getByDisplayValue('I was flying over the ocean');
    expect(input.props.maxLength).toBe(5000);
  });

  it('disables the CTA buttons while a submit is in flight', async () => {
    let resolveSubmit: (v: { saved: true }) => void = () => {};
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        })
    );
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Save without interpreting' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' }).props.accessibilityState.disabled).toBe(true);
    });

    resolveSubmit({ saved: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });
  });

  it('shows "Saving..." on the primary button and disables both buttons while submitting', async () => {
    let resolveSubmit: (v: { saved: true }) => void = () => {};
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        })
    );
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      const primary = screen.getByRole('button', { name: 'Saving...' });
      expect(primary.props.accessibilityState.disabled).toBe(true);
    });
    expect(screen.queryByRole('button', { name: 'Interpret this dream' })).toBeNull();

    const secondary = screen.getByRole('button', { name: 'Save without interpreting' });
    expect(secondary.props.accessibilityState.disabled).toBe(true);

    resolveSubmit({ saved: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });

    // Label restored after submit settles (screen unmounts on navigate in
    // real usage, but this render stays mounted in the test harness).
    expect(screen.getByRole('button', { name: 'Interpret this dream' })).toBeTruthy();
  });

  it('shows the inline error copy and stays on-screen when submit rejects before enqueue', async () => {
    mockSubmit.mockRejectedValue(new Error('rawTranscript exceeds 5000 characters'));
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(
        screen.getByText('Something went wrong. Your transcript is safe — tap to try again.')
      ).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    // Button re-enables and label restores so the user can retry.
    const primary = screen.getByRole('button', { name: 'Interpret this dream' });
    expect(primary.props.accessibilityState.disabled).toBe(false);
  });

  it('lands on Journal (not an error) when submit resolves queued:true after an unexpected post-enqueue failure', async () => {
    // dreams.submit's contract: unexpected errors after the dream is
    // enqueued are swallowed internally and surfaced as { queued: true },
    // never as a rejection. This exercises the screen's handling of that
    // resolved outcome (the contract itself is tested in dreamsService.test).
    mockSubmit.mockResolvedValue({ queued: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Interpret this dream' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});
