import { render, screen } from '@testing-library/react-native';
import { InsightCard } from '../src/components/InsightCard';

describe('InsightCard', () => {
  it('renders the title and body', () => {
    render(
      <InsightCard
        title="A recurring theme"
        body="You keep dreaming of water."
        unseen
        onSeen={() => {}}
      />,
    );
    expect(screen.getByText('A recurring theme')).toBeTruthy();
    expect(screen.getByText('You keep dreaming of water.')).toBeTruthy();
  });

  it('calls onSeen exactly once on mount when unseen', () => {
    const onSeen = jest.fn();
    render(<InsightCard title="t" body="b" unseen onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it('does not call onSeen when already seen', () => {
    const onSeen = jest.fn();
    render(<InsightCard title="t" body="b" unseen={false} onSeen={onSeen} />);
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('does not call onSeen again on re-render', () => {
    const onSeen = jest.fn();
    const { rerender } = render(<InsightCard title="t" body="b" unseen onSeen={onSeen} />);
    rerender(<InsightCard title="t" body="b2" unseen onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });
});
