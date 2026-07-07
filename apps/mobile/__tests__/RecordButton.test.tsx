import { fireEvent, render, screen } from '@testing-library/react-native';

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
});
