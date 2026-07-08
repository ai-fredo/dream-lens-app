import { render, screen } from '@testing-library/react-native';
import { Colors } from '../src/design/tokens';
import { EmotionArcChart } from '../src/components/EmotionArcChart';

describe('EmotionArcChart', () => {
  it('renders null for fewer than 2 points', () => {
    render(<EmotionArcChart arc={[{ date: '2026-07-01', tone: 'anxious' }]} />);
    expect(screen.queryByTestId('emotion-arc-chart')).toBeNull();
  });

  it('renders null for zero points', () => {
    render(<EmotionArcChart arc={[]} />);
    expect(screen.queryByTestId('emotion-arc-chart')).toBeNull();
  });

  it('renders one circle per point, colored by tone', () => {
    render(
      <EmotionArcChart
        arc={[
          { date: '2026-07-01', tone: 'anxious' },
          { date: '2026-07-02', tone: 'peaceful' },
          { date: '2026-07-03', tone: 'surreal' },
          { date: '2026-07-04', tone: 'melancholic' },
          { date: '2026-07-05', tone: 'unknown-tone' },
        ]}
      />,
    );
    const chart = screen.getByTestId('emotion-arc-chart');
    expect(chart).toBeTruthy();

    expect(screen.getByTestId('emotion-arc-point-0').props.fill).toBe(Colors.arc.anxious);
    expect(screen.getByTestId('emotion-arc-point-1').props.fill).toBe(Colors.arc.peaceful);
    expect(screen.getByTestId('emotion-arc-point-2').props.fill).toBe(Colors.arc.surreal);
    expect(screen.getByTestId('emotion-arc-point-3').props.fill).toBe(Colors.arc.melancholic);
    // unmapped tone falls back to Colors.arc.other
    expect(screen.getByTestId('emotion-arc-point-4').props.fill).toBe(Colors.arc.other);
  });

  it('uses a 6dp radius for each point circle', () => {
    render(
      <EmotionArcChart
        arc={[
          { date: '2026-07-01', tone: 'anxious' },
          { date: '2026-07-02', tone: 'peaceful' },
        ]}
      />,
    );
    expect(screen.getByTestId('emotion-arc-point-0').props.r).toBe(3);
  });

  it('draws a connecting polyline in border-subtle at 1dp', () => {
    render(
      <EmotionArcChart
        arc={[
          { date: '2026-07-01', tone: 'anxious' },
          { date: '2026-07-02', tone: 'peaceful' },
        ]}
      />,
    );
    const line = screen.getByTestId('emotion-arc-line');
    expect(line.props.stroke).toBe(Colors.bg.border);
    expect(line.props.strokeWidth).toBe(1);
  });

  it('only keeps the last 30 points', () => {
    const arc = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      tone: 'anxious',
    }));
    render(<EmotionArcChart arc={arc} />);
    expect(screen.getByTestId('emotion-arc-point-0')).toBeTruthy();
    expect(screen.getByTestId('emotion-arc-point-29')).toBeTruthy();
    expect(screen.queryByTestId('emotion-arc-point-30')).toBeNull();
  });
});
