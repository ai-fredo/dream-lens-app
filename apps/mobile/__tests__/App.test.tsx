import { render } from '@testing-library/react-native';
import App from '../App';

jest.mock('@expo-google-fonts/cormorant-garamond', () => ({
  useFonts: () => [true, null],
  CormorantGaramond_300Light: 1, CormorantGaramond_300Light_Italic: 1,
  CormorantGaramond_400Regular: 1, CormorantGaramond_400Regular_Italic: 1,
}));

it('renders the root once fonts are loaded', () => {
  const { getByTestId } = render(<App />);
  expect(getByTestId('app-root')).toBeTruthy();
});
