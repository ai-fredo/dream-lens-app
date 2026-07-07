import { render, screen } from '@testing-library/react-native';
import { ClusterCard } from '../src/components/ClusterCard';

describe('ClusterCard', () => {
  it('renders the label, count, and top symbols', () => {
    render(<ClusterCard label="Dreams of Ocean" topSymbols={['Ocean', 'Water']} dreamCount={4} />);
    expect(screen.getByText('Dreams of Ocean')).toBeTruthy();
    expect(screen.getByText('×4')).toBeTruthy();
    expect(screen.getByText('Ocean, Water')).toBeTruthy();
  });
});
