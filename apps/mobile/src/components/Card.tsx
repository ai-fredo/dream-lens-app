import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '../design/tokens';

export interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'gold' | 'symbol';
  testID?: string;
}

export function Card({ children, variant = 'default', testID }: CardProps) {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        variant === 'gold' ? styles.gold : null,
        variant === 'symbol' ? styles.symbol : null,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    borderRadius: Radius.md,
    padding: Spacing[4],
  },
  gold: {
    backgroundColor: Colors.gold.dim,
    borderColor: Colors.gold.border,
  },
  symbol: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.gold.primary,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
});
