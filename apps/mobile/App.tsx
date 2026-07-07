import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_300Light, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Colors } from './src/design/tokens';

export default function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light,
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
  });
  // Blank dark screen while fonts load — never show system fonts.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: Colors.bg.base }} />;
  return (
    <View testID="app-root" style={{ flex: 1, backgroundColor: Colors.bg.base }}>
      <StatusBar style="light" />
    </View>
  );
}
