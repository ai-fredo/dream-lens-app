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
      expect(screen.getByRole('button', { name: 'Interpret this dream' }).props.accessibilityState.disabled).toBe(
        true
      );
    });

    resolveSubmit({ saved: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Journal');
    });
  });
});
