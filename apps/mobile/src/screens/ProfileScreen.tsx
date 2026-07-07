import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../components/Card';
import { ClusterCard } from '../components/ClusterCard';
import { EmotionArcChart } from '../components/EmotionArcChart';
import { EmptyState } from '../components/EmptyState';
import { InsightCard } from '../components/InsightCard';
import { Colors, Spacing, Typography } from '../design/tokens';
import { usePatterns } from '../hooks/usePatterns';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Pattern analysis unlocks once the user has this many dreams (API contract
 * — the design spec's mock uses an illustrative 7, but the real teaser
 * threshold this screen enforces is 5, per the Task 11 brief). */
const UNLOCK_THRESHOLD = 5;

/**
 * Screen 6 of the design spec: the pattern-analysis surface. Renders the
 * user's dream-life stats, recurring symbols, emotional timeline, AI
 * insights, and recurring-theme clusters — all sourced from usePatterns
 * (GET /v1/profile/summary). Below UNLOCK_THRESHOLD total dreams, the
 * insights section is replaced by a "Keep dreaming" teaser instead (the
 * rest of the screen — stats, symbols, arc — still renders, since those are
 * meaningful even with few entries).
 */
export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { status, data, retry, markSeen } = usePatterns();

  useEffect(() => {
    navigation.setOptions({ title: 'Your patterns' });
  }, [navigation]);

  if (status === 'error') {
    return (
      <View style={[styles.container, styles.centered]}>
        <EmptyState
          title="Couldn't load your patterns"
          actionLabel="Try again"
          onAction={retry}
          variant="error"
        />
      </View>
    );
  }

  if (status === 'loading' || !data) {
    return (
      <View style={[styles.container, styles.centered]} testID="profile-loading">
        <EmptyState variant="loading" title="Loading your patterns" />
      </View>
    );
  }

  const { summary, emotionArc, clusters, insights } = data;
  const isTeaser = summary.totalDreams < UNLOCK_THRESHOLD;
  const remaining = UNLOCK_THRESHOLD - summary.totalDreams;
  const sortedInsights = [...insights].sort((a, b) => {
    if (a.seenAt == null && b.seenAt != null) return -1;
    if (a.seenAt != null && b.seenAt == null) return 1;
    return 0;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR DREAM LIFE</Text>
      <View style={styles.statRow}>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{summary.totalDreams}</Text>
          <Text style={styles.statLabel}>Dreams</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{summary.recurringSymbols.length}</Text>
          <Text style={styles.statLabel}>Symbols</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{summary.dominantTone ?? '—'}</Text>
          <Text style={styles.statLabel}>Dominant tone</Text>
        </View>
      </View>

      {summary.recurringSymbols.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Keeps returning</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolRow}>
            {summary.recurringSymbols.map((s) => (
              <View key={s.label} style={styles.symbolCard}>
                <Text style={styles.symbolName}>{s.label}</Text>
                <Text style={styles.symbolCount}>{`×${s.count}`}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>How your dreams have felt</Text>
        <EmotionArcChart arc={emotionArc} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>What your dreams suggest</Text>
        {isTeaser ? (
          <Card testID="profile-teaser">
            <Text style={styles.teaserTitle}>Keep dreaming</Text>
            <Text style={styles.teaserBody}>
              {`Pattern analysis unlocks after ${UNLOCK_THRESHOLD} entries. ${remaining} more to go.`}
            </Text>
          </Card>
        ) : sortedInsights.length > 0 ? (
          <View style={styles.insightList}>
            {sortedInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                title={insight.title}
                body={insight.body}
                unseen={insight.seenAt == null}
                onSeen={() => markSeen(insight.id)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {clusters.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Recurring themes</Text>
          <View style={styles.clusterList}>
            {clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                label={cluster.label}
                topSymbols={cluster.topSymbols}
                dreamCount={cluster.dreamCount}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const SYMBOL_CARD_SIZE = 100;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[8],
    paddingBottom: Spacing[12],
  },
  eyebrow: {
    ...Typography.eyebrow.md,
    color: Colors.text.muted,
    marginBottom: Spacing[4],
  },
  statRow: {
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...Typography.display.lg,
    color: Colors.text.primary,
  },
  statLabel: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginTop: Spacing[1],
  },
  section: {
    marginTop: Spacing[8],
  },
  sectionEyebrow: {
    ...Typography.eyebrow.sm,
    color: Colors.text.muted,
    marginBottom: Spacing[4],
  },
  symbolRow: {
    flexGrow: 0,
  },
  symbolCard: {
    width: SYMBOL_CARD_SIZE,
    height: SYMBOL_CARD_SIZE,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing[3],
  },
  symbolName: {
    ...Typography.label.md,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  symbolCount: {
    ...Typography.display.sm,
    color: Colors.gold.primary,
    marginTop: Spacing[1],
    textAlign: 'center',
  },
  teaserTitle: {
    ...Typography.display.sm,
    color: Colors.text.secondary,
  },
  teaserBody: {
    ...Typography.body.md,
    color: Colors.text.muted,
    marginTop: Spacing[2],
  },
  insightList: {
    gap: Spacing[3],
  },
  clusterList: {
    gap: Spacing[3],
  },
});
