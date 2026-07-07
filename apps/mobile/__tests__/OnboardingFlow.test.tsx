import { fireEvent, render, screen } from '@testing-library/react-native';
import { OnboardingFlow } from '../src/screens/OnboardingFlow';

describe('OnboardingFlow', () => {
  it('renders the screen-1 headline', () => {
    render(<OnboardingFlow onDone={jest.fn()} />);
    expect(
      screen.getByText('Every morning, your subconscious leaves you a message.')
    ).toBeTruthy();
  });

  it('advancing from screen 1 reaches the privacy rows on screen 2', () => {
    render(<OnboardingFlow onDone={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

    expect(screen.getByText('Before we begin')).toBeTruthy();
    expect(screen.getByText('This is reflection, not therapy.')).toBeTruthy();
    expect(screen.getByText('Your dreams are private.')).toBeTruthy();
    expect(screen.getByText('You control your data.')).toBeTruthy();
  });

  it('advancing from screen 2 reaches screen 3', () => {
    render(<OnboardingFlow onDone={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.press(screen.getByRole('button', { name: 'I understand, continue' }));

    expect(screen.getByText("Let's begin.")).toBeTruthy();
    expect(screen.getByText('Do you remember a dream from last night?')).toBeTruthy();
  });

  it('finishing via "Record now" invokes onDone', () => {
    const onDone = jest.fn();
    render(<OnboardingFlow onDone={onDone} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.press(screen.getByRole('button', { name: 'I understand, continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Record now' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('finishing via "Not today" also invokes onDone', () => {
    const onDone = jest.fn();
    render(<OnboardingFlow onDone={onDone} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.press(screen.getByRole('button', { name: 'I understand, continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Not today' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
