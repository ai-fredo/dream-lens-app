import type { DreamCluster, Insight, EmotionPoint, UserPatternSummary } from '@dreamlens/shared/types/domain';

it('pattern types are shaped as expected', () => {
  const c: DreamCluster = { id: 'x', label: 'Loss of control', dreamIds: [], topSymbols: ['water'], dreamCount: 3, computedAt: new Date() };
  const i: Insight = { id: 'x', type: 'recurring_symbol', title: 't', body: 'b', payload: null, createdAt: new Date(), seenAt: null };
  const e: EmotionPoint = { date: '2026-07-05', emotionalTone: 'anxious' };
  const s: UserPatternSummary = { totalDreams: 1, recurringSymbols: [], recurringThemes: [], dominantThemes: [], dominantEmotionalTone: null, recentDreamSummaries: [] };
  expect([c.dreamCount, i.type, e.date, s.totalDreams]).toBeDefined();
});
