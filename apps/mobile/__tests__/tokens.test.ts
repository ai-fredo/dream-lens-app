import { Colors, Typography, Spacing, Radius, TouchTargets } from '../src/design/tokens';

it('matches the binding SECTION 8 values', () => {
  expect(Colors.bg.base).toBe('#070C1A');
  expect(Colors.gold.primary).toBe('#C9A84C');
  expect(Colors.text.primary).toBe('#F2EFEA');
  expect(Colors.recording.active).toBe('#E05C5C');
  expect(Typography.display.md.fontFamily).toBe('CormorantGaramond_400Regular');
  expect(Typography.body.lg.fontSize).toBe(17);
  expect(Typography.eyebrow.md.textTransform).toBe('uppercase');
  expect(Spacing[8]).toBe(32);
  expect(Radius.full).toBe(9999);
  expect(TouchTargets.record).toBe(96);
});
