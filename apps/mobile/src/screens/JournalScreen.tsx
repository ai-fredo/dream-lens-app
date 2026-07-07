import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DreamRow } from '../components/DreamRow';
import { EmptyState } from '../components/EmptyState';
import { InputField } from '../components/InputField';
import { TextButton } from '../components/TextButton';
import { Colors, Spacing, Typography } from '../design/tokens';
import { useDreams } from '../hooks/useDreams';
import type { DisplayDream } from '../store/dreamStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MonthSection {
  title: string;
  data: DisplayDream[];
}

/** "JULY 2026" — uppercase month + year, used as both the section grouping key and header label. */
function monthKey(recordedAt: string): string {
  const date = new Date(recordedAt);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  return `${month} ${date.getFullYear()}`.toUpperCase();
}

function matchesSearch(dream: DisplayDream, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;

  const transcript = (dream.editedTranscript ?? dream.rawTranscript).toLowerCase();
  if (transcript.includes(needle)) return true;

  const symbols = dream.interpretation?.symbols ?? [];
  return symbols.some((s) => s.symbol.toLowerCase().includes(needle));
}

/** Groups dreams by calendar month of recordedAt, newest month first. Dreams
 * within a section preserve the order useDreams/useDreamStore already
 * provides (newest-first, since pending rows are prepended and server rows
 * come back newest-first from the API). */
function groupByMonth(dreams: DisplayDream[]): MonthSection[] {
  const sections: MonthSection[] = [];
  const sectionByKey = new Map<string, MonthSection>();

  for (const dream of dreams) {
    const key = monthKey(dream.recordedAt);
    const existing = sectionByKey.get(key);
    if (existing == null) {
      const section: MonthSection = { title: key, data: [dream] };
      sectionByKey.set(key, section);
      sections.push(section);
    } else {
      existing.data.push(dream);
    }
  }

  return sections;
}

/**
 * Screen 4 of the design spec: the private archive. Search filters
 * client-side over the visible transcript (edited, falling back to raw) and
 * interpreted symbol names; server-side search is a later phase. Rows are
 * grouped into month sections via SectionList, newest first (both dreams and
 * useDreamStore's server fetch already come back newest-first, so no extra
 * sort is applied here beyond the grouping itself).
 *
 * Header: inherits the stack's standard transparent header, title "Journal",
 * with header-right TextButton links to Profile and Settings (both
 * placeholder-only routes until Tasks 11/12 land).
 */
export function JournalScreen() {
  const navigation = useNavigation<Nav>();
  const { status, dreams, retry } = useDreams();
  const [query, setQuery] = useState('');

  useEffect(() => {
    navigation.setOptions({
      title: 'Journal',
      headerRight: () => (
        <View style={styles.headerLinks}>
          <TextButton label="Profile" onPress={() => navigation.navigate('Profile')} tone="secondary" />
          <TextButton label="Settings" onPress={() => navigation.navigate('Settings')} tone="secondary" />
        </View>
      ),
    });
  }, [navigation]);

  const filtered = useMemo(() => dreams.filter((d) => matchesSearch(d, query)), [dreams, query]);
  const sections = useMemo(() => groupByMonth(filtered), [filtered]);

  const handleRowPress = (dreamId: string) => {
    navigation.navigate('EntryDetail', { dreamId });
  };

  if (status === 'loading') {
    return (
      <View style={[styles.container, styles.centered]} testID="journal-loading">
        <EmptyState variant="loading" title="Loading your journal" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.container, styles.centered]}>
        <EmptyState
          title="Can't connect right now"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={retry}
          variant="error"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <InputField
          value={query}
          onChangeText={setQuery}
          placeholder="Search dreams..."
          testID="journal-search"
        />
      </View>

      {dreams.length === 0 ? (
        <View style={[styles.centered, styles.emptyFill]}>
          <EmptyState title="Your journal is quiet" body="Record your first dream to begin." />
          <View style={styles.recordNow}>
            <TextButton label="Record now" onPress={() => navigation.navigate('Record')} tone="gold" />
          </View>
        </View>
      ) : sections.length === 0 ? (
        <View style={[styles.centered, styles.emptyFill]}>
          <Text style={styles.noMatches}>No dreams match.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DreamRow dream={item} onPress={handleRowPress} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFill: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  sectionHeader: {
    ...Typography.eyebrow.md,
    color: Colors.text.muted,
    paddingLeft: Spacing[4],
    marginTop: Spacing[6],
    marginBottom: Spacing[2],
  },
  noMatches: {
    ...Typography.body.md,
    color: Colors.text.muted,
  },
  headerLinks: {
    flexDirection: 'row',
    gap: Spacing[1],
  },
  recordNow: {
    marginTop: Spacing[3],
  },
});
