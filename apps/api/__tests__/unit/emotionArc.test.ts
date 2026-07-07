// apps/api/__tests__/unit/emotionArc.test.ts
import { makeEmotionArc, negativeStreakLength } from '../../src/services/emotionArc';

it('maps dream rows to date/tone points in chronological order', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({
    data: [
      { recorded_at: '2026-07-01T06:00:00Z', emotional_tone: 'anxious' },
      { recorded_at: '2026-07-02T06:00:00Z', emotional_tone: 'calm' },
    ], error: null }) }) }) }) } as any;
  const pts = await makeEmotionArc(db).getForUser('u1' as any);
  expect(pts).toEqual([
    { date: '2026-07-01', emotionalTone: 'anxious' },
    { date: '2026-07-02', emotionalTone: 'calm' },
  ]);
});

it('counts a trailing run of negative tones as the streak length', () => {
  const pts = [
    { date: '2026-07-01', emotionalTone: 'calm' },
    { date: '2026-07-02', emotionalTone: 'anxious' },
    { date: '2026-07-03', emotionalTone: 'melancholic' },
  ];
  expect(negativeStreakLength(pts)).toBe(2);
});

it('returns empty array on database error', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({
    data: null,
    error: { message: 'boom' }
  }) }) }) }) } as any;
  const pts = await makeEmotionArc(db).getForUser('u1' as any);
  expect(pts).toEqual([]);
});
