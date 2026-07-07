import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors, Spacing, Typography } from '../design/tokens';
import { Card } from './Card';

export interface InsightCardProps {
  title: string;
  body: string;
  unseen: boolean;
  onSeen: () => void;
  testID?: string;
}

/**
 * "What your dreams suggest" — one AI-generated pattern insight, gold Card
 * treatment (design spec §Screen 6). Fires `onSeen` exactly once, on mount,
 * when the insight is unseen — a fired-ref guards against StrictMode's
 * double-invoke and any re-render calling it twice; `unseen` flipping to
 * false later (e.g. after usePatterns.markSeen resolves) must not re-fire it.
 */
export function InsightCard({ title, body, unseen, onSeen, testID }: InsightCardProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (unseen && !fired.current) {
      fired.current = true;
      onSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card variant="gold" {...(testID ? { testID } : {})}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    ...Typography.label.lg,
    color: Colors.text.primary,
  },
  body: {
    ...Typography.body.md,
    color: Colors.text.secondary,
    fontStyle: 'italic',
    marginTop: Spacing[2],
  },
});
