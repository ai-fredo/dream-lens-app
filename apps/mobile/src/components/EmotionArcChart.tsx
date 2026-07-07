import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Colors } from '../design/tokens';
import type { EmotionArcPoint } from '../hooks/usePatterns';

export interface EmotionArcChartProps {
  arc: EmotionArcPoint[];
}

const MAX_POINTS = 30;
const HEIGHT = 64;
const POINT_RADIUS = 3; // 6dp circle
const H_PADDING = POINT_RADIUS;

type ArcTone = keyof typeof Colors.arc;

function toneColor(tone: string): string {
  return (Colors.arc as Record<string, string>)[tone as ArcTone] ?? Colors.arc.other;
}

/**
 * "How your dreams have felt" — Screen 6's emotional timeline. Renders the
 * last 30 emotion-arc points as small tone-colored circles connected by a
 * thin line, no axes/grid/labels (design spec §Screen 6). Renders nothing
 * for fewer than 2 points — a single dot can't show a trend, and the
 * connecting line needs at least two points to exist.
 *
 * Layout math needs the chart's rendered width, which isn't known until
 * after the first layout pass, so points are positioned using onLayout ->
 * state (full-width, 0 on first render before layout fires).
 */
export function EmotionArcChart({ arc }: EmotionArcChartProps) {
  const [width, setWidth] = useState(0);
  const points = arc.slice(-MAX_POINTS);

  if (points.length < 2) return null;

  const usableWidth = Math.max(width - H_PADDING * 2, 0);
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: H_PADDING + step * i,
    y: HEIGHT / 2,
    tone: p.tone,
  }));
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <View
      testID="emotion-arc-chart"
      style={{ width: '100%', height: HEIGHT }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Svg width="100%" height={HEIGHT}>
        <Polyline
          testID="emotion-arc-line"
          points={polylinePoints}
          fill="none"
          stroke={Colors.bg.border}
          strokeWidth={1}
        />
        {coords.map((c, i) => (
          <Circle
            key={i}
            testID={`emotion-arc-point-${i}`}
            cx={c.x}
            cy={c.y}
            r={POINT_RADIUS}
            fill={toneColor(c.tone)}
          />
        ))}
      </Svg>
    </View>
  );
}
