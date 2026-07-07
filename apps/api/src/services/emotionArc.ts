// apps/api/src/services/emotionArc.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId, EmotionPoint } from '@dreamlens/shared/types/domain';
import { logger } from '../middleware/logger';

const NEGATIVE = new Set(['anxious', 'melancholic', 'fearful', 'sad', 'angry', 'distressed']);

export function negativeStreakLength(points: EmotionPoint[]): number {
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (NEGATIVE.has(points[i]!.emotionalTone)) streak++;
    else break;
  }
  return streak;
}

export function makeEmotionArc(db: SupabaseClient) {
  return {
    async getForUser(userId: UserId, _sinceDays?: number): Promise<EmotionPoint[]> {
      const { data, error } = await db.from('dreams')
        .select('recorded_at,emotional_tone').eq('user_id', userId)
        .order('recorded_at', { ascending: true });

      if (error) {
        logger.warn({ event: 'emotion_arc_fetch_failed', code: 'DB_READ_FAILED', message: error.message });
        return [];
      }

      return (data ?? []).filter((r) => r.emotional_tone)
        .map((r) => ({ date: String(r.recorded_at).slice(0, 10), emotionalTone: r.emotional_tone }));
    },
  };
}
