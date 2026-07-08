import * as fs from 'fs';
import * as path from 'path';
import appConfig from '../app.json';

describe('app.json — App Store compliance strings', () => {
  const { expo } = appConfig;

  it('declares a microphone usage string that discloses on-device, non-stored transcription', () => {
    const mic = expo.ios?.infoPlist?.NSMicrophoneUsageDescription;
    expect(typeof mic).toBe('string');
    expect(mic).toContain('transcribed on-device and not stored');
  });

  it('declares a notifications usage string (verbatim, engineering-standards §10)', () => {
    const notifications = expo.ios?.infoPlist?.NSUserNotificationsUsageDescription;
    expect(notifications).toBe(
      'DreamLens can send you a morning reminder to log your dream before the memory fades.',
    );
  });

  it('declares a speech-recognition usage string', () => {
    const speech = expo.ios?.infoPlist?.NSSpeechRecognitionUsageDescription;
    expect(typeof speech).toBe('string');
    expect(speech!.length).toBeGreaterThan(0);
  });

  it('is dark-only (no light-mode UI is designed)', () => {
    expect(expo.userInterfaceStyle).toBe('dark');
  });

  it('declares the iOS bundle identifier', () => {
    expect(expo.ios?.bundleIdentifier).toBe('com.dreamlens.app');
  });

  it('keeps the SQLCipher plugin flag enabled', () => {
    // app.json's `plugins` array is a union of Expo's per-plugin config
    // shapes; reading it back out generically (rather than matching one
    // specific plugin's type) needs an escape hatch at this JSON-config
    // boundary — this is describing arbitrary config data, not app code.
    const plugins = (expo.plugins ?? []) as unknown[];
    const sqlitePlugin = plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-sqlite',
    ) as [string, Record<string, unknown>] | undefined;
    expect(sqlitePlugin).toBeDefined();
    expect(sqlitePlugin?.[1]?.useSQLCipher).toBe(true);
  });
});

describe('hex-literal guard — colors must come from src/design/tokens.ts', () => {
  const SRC_ROOT = path.resolve(__dirname, '../src');
  const DESIGN_DIR = path.join(SRC_ROOT, 'design');
  const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;

  function walk(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      if (/\.(tsx?|jsx?)$/.test(entry.name)) return [fullPath];
      return [];
    });
  }

  /** Strips // and /* *‍/ comments so a hex code mentioned only in a
   * comment (e.g. explaining a token's value) doesn't trip the guard. */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('finds no hex color literals outside src/design/', () => {
    const files = walk(SRC_ROOT).filter((file) => !file.startsWith(DESIGN_DIR + path.sep));

    const offenders: { file: string; matches: string[] }[] = [];
    for (const file of files) {
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      const matches = source.match(HEX_COLOR_RE);
      if (matches && matches.length > 0) {
        offenders.push({ file: path.relative(SRC_ROOT, file), matches });
      }
    }

    expect(offenders).toEqual([]);
  });

  it('sanity check: the guard actually detects a hex literal when one is present', () => {
    const source = stripComments("const x = { color: '#FF00AA' };\n// not a real color: #ABC123\n");
    const matches = source.match(HEX_COLOR_RE);
    expect(matches).toEqual(['#FF00AA']);
  });
});
