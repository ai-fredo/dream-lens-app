import { Linking, StyleSheet, Text, View } from 'react-native';
import { OutlinedButton } from '../components/OutlinedButton';
import { Colors, Spacing, Typography } from '../design/tokens';

/**
 * Shown when the user denies microphone/speech permission from RecordScreen.
 * Permissions can only be changed from the system Settings app once denied,
 * so the only action here is a deep link via Linking.openSettings() —
 * engineering-standards SECTION 10 "Error states".
 */
export function PermissionExplainScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>DreamLens needs microphone access. Open Settings.</Text>
      <OutlinedButton label="Open Settings" onPress={() => Linking.openSettings()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
    gap: Spacing[8],
  },
  message: {
    ...Typography.body.lg,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});
