export const Colors = {
  // Backgrounds (darkest to lightest)
  bg: {
    base: '#070C1A',      // Screen background
    elevated: '#0D1628',  // Cards, modals
    overlay: '#141E3C',   // Bottom sheets
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    input: 'rgba(255,255,255,0.05)',
  },
  // Gold accent (the brand's single expressive color)
  gold: {
    primary: '#C9A84C',
    light: '#DFC27A',
    pale: '#EDD9A3',
    dim: 'rgba(201,168,76,0.15)',
    border: 'rgba(201,168,76,0.25)',
  },
  // Text
  text: {
    primary: '#F2EFEA',    // Main text — warm white, not pure white
    secondary: 'rgba(242,239,234,0.65)',  // Secondary labels
    muted: 'rgba(242,239,234,0.38)',      // Disabled, placeholder
    gold: '#C9A84C',       // Accented labels
  },
  // Semantic
  semantic: {
    error: '#E05C5C',
    success: '#5CB85C',
    warning: '#C9A84C',    // Gold doubles as warning
  },
  // Recording state
  recording: {
    active: '#E05C5C',
    pulse: 'rgba(224,92,92,0.25)',
  },
  // Emotion-arc tone map (ProfileScreen's EmotionArcChart, design spec §Screen 6)
  arc: {
    anxious: '#C85252',
    peaceful: '#5CAD5C',
    surreal: '#C9A84C',
    melancholic: '#7A85C1',
    other: 'rgba(255,255,255,0.16)',
  },
} as const;

export const Typography = {
  // Display — Cormorant Garamond, used sparingly for emotional moments
  display: {
    xl: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
    lg: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
    md: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
    sm: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 20, lineHeight: 26 },
  },
  // Body — Inter, used for all UI text
  body: {
    lg: { fontFamily: 'Inter_400Regular', fontSize: 17, lineHeight: 26 },
    md: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23 },
    sm: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
    xs: { fontFamily: 'Inter_300Light', fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },
  },
  // Labels — Inter Medium
  label: {
    lg: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 20 },
    md: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
    sm: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 14, letterSpacing: 0.08 },
  },
  // Eyebrow — Inter, uppercase, wide tracking
  eyebrow: {
    md: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 14, letterSpacing: 0.18, textTransform: 'uppercase' as const },
    sm: { fontFamily: 'Inter_500Medium', fontSize: 9, lineHeight: 12, letterSpacing: 0.16, textTransform: 'uppercase' as const },
  },
} as const;

export const Spacing = {
  // 8pt grid
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const TouchTargets = {
  minimum: 56,      // All interactive elements
  comfortable: 72,  // Most buttons
  record: 96,       // The record button specifically
} as const;
