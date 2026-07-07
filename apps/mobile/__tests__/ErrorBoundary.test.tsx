import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

// A child that throws on render — used to exercise the boundary's catch path.
function Bomb(): React.JSX.Element {
  throw new Error('dream content: I was flying over a purple ocean');
}

function Safe() {
  return <Text>All good</Text>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React (and React Native's LogBox) logs its own noisy "The above error
    // occurred in..." warning via console.error when a boundary catches —
    // that's React's own diagnostic, not something ErrorBoundary itself
    // logs. Spy + silence so test output stays clean, and so we can assert
    // ErrorBoundary itself never logs dream content.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>,
    );
    expect(getByText('All good')).toBeTruthy();
  });

  it('catches a render error and shows the fallback copy', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong.')).toBeTruthy();
    expect(getByText('Your dreams are safe. Restart to continue.')).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
    expect(queryByText('All good')).toBeNull();
  });

  it('never logs dream content or component props/state from the caught error', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    const loggedText = consoleErrorSpy.mock.calls
      .map((call) => call.map((arg: unknown) => (typeof arg === 'string' ? arg : '')).join(' '))
      .join('\n');
    expect(loggedText).not.toContain('purple ocean');
    expect(loggedText).not.toContain('dream content');
  });

  it('resets the boundary on "Try again" so children remount', () => {
    const { getByText, queryByText, rerender } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong.')).toBeTruthy();

    // Simulate "the condition that caused the crash is gone" by rerendering
    // with a non-throwing child first — while the boundary is still in its
    // error state, so the fallback should still be showing (children are
    // not read again until hasError flips back to false).
    rerender(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong.')).toBeTruthy();

    // Now press "Try again": this clears hasError and re-renders, this time
    // reading the current (non-throwing) children — proving the reset
    // actually cleared the boundary's own state rather than the fallback
    // disappearing for some other reason.
    fireEvent.press(getByText('Try again'));

    expect(getByText('All good')).toBeTruthy();
    expect(queryByText('Something went wrong.')).toBeNull();
  });
});
