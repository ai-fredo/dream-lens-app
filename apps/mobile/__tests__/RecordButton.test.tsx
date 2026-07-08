import { Animated } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { RecordButton } from '../src/components/RecordButton';

describe('RecordButton', () => {
  it('default state has accessibility label "Start recording"', () => {
    render(<RecordButton state="default" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
  });

  it('recording state has accessibility label "Stop recording"', () => {
    render(<RecordButton state="recording" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<RecordButton state="default" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Start recording'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled state is not pressable and exposes disabled accessibility state', () => {
    const onPress = jest.fn();
    render(<RecordButton state="disabled" onPress={onPress} />);
    const button = screen.getByLabelText('Start recording');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('stopping state still reads as a recording-ish control but does not error', () => {
    render(<RecordButton state="stopping" onPress={jest.fn()} />);
    // Stopping is an instant, non-animated confirmation state; button remains
    // labeled for its resting action ("Start recording") since recording has
    // already ended by the time this state renders.
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
  });

  describe('press scale animation', () => {
    // Design spec: press state scale (0.96) must be an Animated.spring —
    // stiffness 400, damping 28, no overshoot — not a static style. This
    // test fails if someone reverts to a plain `transform: [{ scale: 0.96 }]`
    // style, since that path never calls Animated.spring at all.
    it('pressIn drives an Animated.spring to 0.96 with the spec spring config', async () => {
      const springSpy = jest.spyOn(Animated, 'spring');
      render(<RecordButton state="default" onPress={jest.fn()} />);
      // Let the pending isReduceMotionEnabled() microtask resolve before
      // simulating the press, so its state update isn't left dangling.
      await act(async () => {});

      fireEvent(screen.getByLabelText('Start recording'), 'pressIn');

      expect(springSpy).toHaveBeenCalledWith(
        expect.any(Animated.Value),
        expect.objectContaining({
          toValue: 0.96,
          stiffness: 400,
          damping: 28,
        })
      );

      springSpy.mockRestore();
    });

    it('pressOut drives an Animated.spring back to 1 with the spec spring config', async () => {
      const springSpy = jest.spyOn(Animated, 'spring');
      render(<RecordButton state="default" onPress={jest.fn()} />);
      await act(async () => {});

      const button = screen.getByLabelText('Start recording');
      fireEvent(button, 'pressIn');
      fireEvent(button, 'pressOut');

      expect(springSpy).toHaveBeenLastCalledWith(
        expect.any(Animated.Value),
        expect.objectContaining({
          toValue: 1,
          stiffness: 400,
          damping: 28,
        })
      );

      springSpy.mockRestore();
    });

    it('the pressed circle transform is bound to an Animated node, not a static style', async () => {
      render(<RecordButton state="press" onPress={jest.fn()} testID="record-button" />);
      await act(async () => {});
      const pressableHost = screen.getByTestId('record-button');
      // children[0] is our Animated.View circle (the pressable's other child
      // is RN's PressabilityDebugView, dev-only overlay).
      const circleElement = pressableHost.props.children[0];

      const flatten = (style: unknown): Record<string, unknown> =>
        Array.isArray(style)
          ? style.reduce((acc, s) => ({ ...acc, ...(s ? flatten(s) : {}) }), {})
          : (style as Record<string, unknown>) ?? {};

      const flattened = flatten(circleElement.props.style);
      const transform = flattened.transform as Array<Record<string, unknown>>;
      const scaleEntry = transform.find((t) => 'scale' in t);

      // A reverted static style would put a plain number (0.96) here; the
      // animated implementation must put an Animated.Value/interpolated node.
      expect(typeof scaleEntry?.scale).not.toBe('number');
    });
  });
});
