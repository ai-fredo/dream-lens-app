import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { BreathingCircle } from './BreathingCircle';
import { PrimaryButton } from './PrimaryButton';

export interface EmptyStateProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'default' | 'loading' | 'error';
  testID?: string;
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  variant = 'default',
  testID,
}: EmptyStateProps) {
  const showAction = variant === 'error' && !!actionLabel && !!onAction;

  return (
    <View testID={testID} style={styles.container}>
      {variant === 'loading' ? (
        <BreathingCircle {...(testID ? { testID: `${testID}-breathing-circle` } : {})} />
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {showAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel as string} onPress={onAction as () => void} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: 280,
    gap: Spacing[3],
  },
  title: {
    ...Typography.display.sm,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  body: {
    ...Typography.body.md,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing[3],
    alignSelf: 'stretch',
  },
});
