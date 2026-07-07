import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '../src/design/tokens';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { PrimaryButton } from '../src/components/PrimaryButton';
import { OutlinedButton } from '../src/components/OutlinedButton';
import { TextButton } from '../src/components/TextButton';
import { Card } from '../src/components/Card';
import { Pill } from '../src/components/Pill';
import { InputField } from '../src/components/InputField';
import { ToggleRow } from '../src/components/ToggleRow';
import { EmptyState } from '../src/components/EmptyState';
import { BreathingCircle } from '../src/components/BreathingCircle';
import { Text } from 'react-native';

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

describe('PrimaryButton', () => {
  it('renders its label', () => {
    render(<PrimaryButton label="Save Dream" onPress={() => {}} />);
    expect(screen.getByText('Save Dream')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Save Dream" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save Dream' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks press when disabled', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Save Dream" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Save Dream' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('has accessibilityRole="button" and is at least 52dp tall', () => {
    render(<PrimaryButton label="Save Dream" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Save Dream' });
    expect(button.props.accessibilityRole).toBe('button');
    const style = flatten(button.props.style);
    expect(style.minHeight as number).toBeGreaterThanOrEqual(52);
  });

  it('uses gold background and full radius', () => {
    render(<PrimaryButton label="Save Dream" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Save Dream' });
    const style = flatten(button.props.style);
    expect(style.backgroundColor).toBe(Colors.gold.primary);
    expect(style.borderRadius).toBe(9999);
  });

  it('applies disabled opacity', () => {
    render(<PrimaryButton label="Save Dream" onPress={() => {}} disabled />);
    const button = screen.getByRole('button', { name: 'Save Dream' });
    const style = flatten(button.props.style);
    expect(style.opacity).toBe(0.35);
  });
});

describe('OutlinedButton', () => {
  it('renders its label', () => {
    render(<OutlinedButton label="Cancel" onPress={() => {}} />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<OutlinedButton label="Cancel" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks press when disabled', () => {
    const onPress = jest.fn();
    render(<OutlinedButton label="Cancel" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('has a transparent background and a 1dp border', () => {
    render(<OutlinedButton label="Cancel" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Cancel' });
    const style = flatten(button.props.style);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(Colors.bg.borderStrong);
  });
});

describe('TextButton', () => {
  it('renders its label', () => {
    render(<TextButton label="Skip" onPress={() => {}} />);
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<TextButton label="Skip" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has at least a 44dp touch height via padding', () => {
    render(<TextButton label="Skip" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Skip' });
    const style = flatten(button.props.style);
    expect(style.minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it('defaults tone to primary text color', () => {
    render(<TextButton label="Skip" onPress={() => {}} />);
    const text = screen.getByText('Skip');
    const style = flatten(text.props.style);
    expect(style.color).toBe(Colors.text.primary);
  });

  it('applies gold tone color', () => {
    render(<TextButton label="Skip" onPress={() => {}} tone="gold" />);
    const text = screen.getByText('Skip');
    const style = flatten(text.props.style);
    expect(style.color).toBe(Colors.text.gold);
  });
});

describe('Card', () => {
  it('renders its children', () => {
    render(
      <Card>
        <Text>Card content</Text>
      </Card>,
    );
    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('default variant uses elevated background and border', () => {
    render(
      <Card testID="card">
        <Text>Content</Text>
      </Card>,
    );
    const style = flatten(screen.getByTestId('card').props.style);
    expect(style.backgroundColor).toBe(Colors.bg.elevated);
    expect(style.borderColor).toBe(Colors.bg.border);
  });

  it('gold variant has gold border color in flattened style', () => {
    render(
      <Card variant="gold" testID="card">
        <Text>Content</Text>
      </Card>,
    );
    const style = flatten(screen.getByTestId('card').props.style);
    expect(style.borderColor).toBe(Colors.gold.border);
    expect(style.backgroundColor).toBe(Colors.gold.dim);
  });

  it('symbol variant has a 2dp gold left border and no left radius', () => {
    render(
      <Card variant="symbol" testID="card">
        <Text>Content</Text>
      </Card>,
    );
    const style = flatten(screen.getByTestId('card').props.style);
    expect(style.borderLeftWidth).toBe(2);
    expect(style.borderLeftColor).toBe(Colors.gold.primary);
    expect(style.borderTopLeftRadius).toBe(0);
    expect(style.borderBottomLeftRadius).toBe(0);
  });
});

describe('Pill', () => {
  it('renders its label', () => {
    render(<Pill label="lucid" />);
    expect(screen.getByText('lucid')).toBeTruthy();
  });

  it('uses eyebrow typography, which uppercases via the token', () => {
    render(<Pill label="lucid" />);
    const text = screen.getByText('lucid');
    const style = flatten(text.props.style);
    expect(style.textTransform).toBe('uppercase');
    expect(style.fontFamily).toBe('Inter_500Medium');
  });

  it('uses full radius on its container', () => {
    render(<Pill label="lucid" testID="pill" />);
    const style = flatten(screen.getByTestId('pill').props.style);
    expect(style.borderRadius).toBe(9999);
  });

  it('applies gold tone background by default', () => {
    render(<Pill label="lucid" testID="pill" />);
    const style = flatten(screen.getByTestId('pill').props.style);
    expect(style.backgroundColor).toBe(Colors.gold.dim);
  });

  it('applies neutral tone background', () => {
    render(<Pill label="lucid" tone="neutral" testID="pill" />);
    const style = flatten(screen.getByTestId('pill').props.style);
    expect(style.backgroundColor).toBe(Colors.bg.elevated);
  });
});

describe('InputField', () => {
  it('renders the given value', () => {
    render(<InputField value="hello" onChangeText={() => {}} />);
    expect(screen.getByDisplayValue('hello')).toBeTruthy();
  });

  it('fires onChangeText', () => {
    const onChangeText = jest.fn();
    render(<InputField value="" onChangeText={onChangeText} placeholder="Describe your dream" />);
    fireEvent.changeText(screen.getByPlaceholderText('Describe your dream'), 'new text');
    expect(onChangeText).toHaveBeenCalledWith('new text');
  });

  it('has the input background and default border color', () => {
    render(<InputField value="" onChangeText={() => {}} testID="input" />);
    const style = flatten(screen.getByTestId('input').props.style);
    expect(style.backgroundColor).toBe(Colors.bg.input);
    expect(style.borderColor).toBe(Colors.bg.border);
  });

  it('shows a gold border color on focus', () => {
    render(<InputField value="" onChangeText={() => {}} testID="input" />);
    const input = screen.getByTestId('input');
    fireEvent(input, 'focus');
    const style = flatten(screen.getByTestId('input').props.style);
    expect(style.borderColor).toBe(Colors.gold.primary);
  });

  it('supports multiline', () => {
    render(<InputField value="" onChangeText={() => {}} multiline testID="input" />);
    expect(screen.getByTestId('input').props.multiline).toBe(true);
  });
});

describe('ToggleRow', () => {
  it('renders its label', () => {
    render(<ToggleRow label="Reminders" value={false} onValueChange={() => {}} />);
    expect(screen.getByText('Reminders')).toBeTruthy();
  });

  it('fires onValueChange', () => {
    const onValueChange = jest.fn();
    render(<ToggleRow label="Reminders" value={false} onValueChange={onValueChange} />);
    fireEvent(screen.getByRole('switch'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('has accessibilityRole="switch" with a default accessibilityLabel', () => {
    render(<ToggleRow label="Reminders" value={false} onValueChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityLabel).toBe('Reminders');
  });

  it('uses gold.primary for the on track color and bg.base for the on thumb color', () => {
    render(<ToggleRow label="Reminders" value={true} onValueChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    // React Native's Switch translates trackColor/thumbColor into native tint props.
    expect(toggle.props.onTintColor).toBe(Colors.gold.primary);
    expect(toggle.props.thumbTintColor).toBe(Colors.bg.base);
  });
});

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No dreams yet" />);
    expect(screen.getByText('No dreams yet')).toBeTruthy();
  });

  it('renders the body when given', () => {
    render(<EmptyState title="No dreams yet" body="Record your first dream" />);
    expect(screen.getByText('Record your first dream')).toBeTruthy();
  });

  it('loading variant renders BreathingCircle plus optional title', () => {
    render(<EmptyState title="Loading dreams" variant="loading" testID="empty" />);
    expect(screen.getByText('Loading dreams')).toBeTruthy();
    expect(screen.getByTestId('empty-breathing-circle')).toBeTruthy();
  });

  it('error variant shows an action button and fires onAction', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        title="Something went wrong"
        variant="error"
        actionLabel="Retry"
        onAction={onAction}
      />,
    );
    const action = screen.getByRole('button', { name: 'Retry' });
    fireEvent.press(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('is centered with a max width of 280', () => {
    render(<EmptyState title="No dreams yet" testID="empty" />);
    const style = flatten(screen.getByTestId('empty').props.style);
    expect(style.maxWidth).toBe(280);
    expect(style.alignItems).toBe('center');
  });
});

describe('BreathingCircle', () => {
  it('renders a 48dp circle with a gold border', () => {
    render(<BreathingCircle testID="circle" />);
    const style = flatten(screen.getByTestId('circle').props.style);
    expect(style.width).toBe(48);
    expect(style.height).toBe(48);
    expect(style.borderColor).toBe(Colors.gold.border);
  });

  it('renders a static opacity-0.6 circle under reduced motion', async () => {
    const { default: AccessibilityInfo } = require('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo');
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    render(<BreathingCircle testID="circle" />);
    await screen.findByTestId('circle');
    const style = flatten(screen.getByTestId('circle').props.style);
    expect(style.opacity).toBe(0.6);
  });
});
