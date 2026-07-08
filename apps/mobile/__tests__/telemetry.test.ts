describe('scrubEvent', () => {
  // Re-require per test via isolateModules where needed; scrubEvent itself
  // has no module-level state so a single import is fine.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { scrubEvent } = require('../src/services/telemetry') as typeof import('../src/services/telemetry');

  it('recursively replaces sensitive keys at any nesting depth in objects', () => {
    const input = {
      transcript: 'I dreamed of flying',
      rawTranscript: 'raw text',
      editedTranscript: 'edited text',
      interpretation: 'means freedom',
      notes: 'personal note',
      summary: 'a summary',
      keep: 'this stays',
      nested: {
        transcript: 'nested dream text',
        deeper: {
          notes: 'deep note',
          fine: 'still here',
        },
      },
    };

    const result = scrubEvent(input);

    expect(result.transcript).toBe('[REDACTED]');
    expect(result.rawTranscript).toBe('[REDACTED]');
    expect(result.editedTranscript).toBe('[REDACTED]');
    expect(result.interpretation).toBe('[REDACTED]');
    expect(result.notes).toBe('[REDACTED]');
    expect(result.summary).toBe('[REDACTED]');
    expect(result.keep).toBe('this stays');
    expect(result.nested.transcript).toBe('[REDACTED]');
    expect(result.nested.deeper.notes).toBe('[REDACTED]');
    expect(result.nested.deeper.fine).toBe('still here');
  });

  it('recursively replaces sensitive keys inside arrays', () => {
    const input = {
      items: [
        { transcript: 'one' },
        { summary: 'two', keep: 'three' },
      ] as Record<string, unknown>[],
      nestedArray: ['nope', { notes: 'buried in array' }] as unknown[],
    };

    const result = scrubEvent(input);

    expect(result.items[0]?.transcript).toBe('[REDACTED]');
    expect(result.items[1]?.summary).toBe('[REDACTED]');
    expect(result.items[1]?.keep).toBe('three');
    expect(result.nestedArray[0]).toBe('nope');
    expect((result.nestedArray[1] as Record<string, unknown>).notes).toBe('[REDACTED]');
  });

  it('leaves other keys untouched', () => {
    const input = { id: '123', title: 'A Dream', count: 4 };
    expect(scrubEvent(input)).toEqual(input);
  });

  it('handles primitives and null without throwing', () => {
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent(42)).toBe(42);
    expect(scrubEvent('a string')).toBe('a string');
    expect(scrubEvent(undefined)).toBeUndefined();
  });

  it('redacts inside event.breadcrumbs[].data and event.extra', () => {
    const event = {
      breadcrumbs: [
        { message: 'nav', data: { transcript: 'breadcrumb dream text', ok: 'fine' } as Record<string, unknown> },
      ],
      extra: {
        interpretation: 'this dream means...',
        safe: 'value',
      } as Record<string, unknown>,
    };

    const result = scrubEvent(event);

    expect(result.breadcrumbs[0]?.data.transcript).toBe('[REDACTED]');
    expect(result.breadcrumbs[0]?.data.ok).toBe('fine');
    expect(result.extra.interpretation).toBe('[REDACTED]');
    expect(result.extra.safe).toBe('value');
  });
});

describe('initTelemetry / captureError', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // jest.resetModules() clears the module registry, so re-requiring
  // telemetry.ts inside a test also re-requires a fresh instance of the
  // '@sentry/react-native' mock — distinct from the `Sentry` binding
  // captured by the top-level `import` above. Re-require both together per
  // test so assertions target the same mock instance telemetry.ts actually
  // calls into.
  function loadModules() {
    const telemetry = require('../src/services/telemetry') as typeof import('../src/services/telemetry');
    const sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    return { telemetry, sentry };
  }

  it('does not call Sentry.init or Sentry.captureException when the DSN is unset', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const { telemetry, sentry } = loadModules();

    telemetry.initTelemetry();
    telemetry.captureError(new Error('x'));

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('calls Sentry.init once with dsn, sendDefaultPii: false, and a scrubbing beforeSend when the DSN is set', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example.ingest.sentry.io/123';
    const { telemetry, sentry } = loadModules();

    telemetry.initTelemetry();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const initArg = (sentry.init as jest.Mock).mock.calls[0][0];
    expect(initArg.dsn).toBe('https://example.ingest.sentry.io/123');
    expect(initArg.sendDefaultPii).toBe(false);
    expect(typeof initArg.beforeSend).toBe('function');

    const scrubbedEvent = initArg.beforeSend({ extra: { transcript: 'dream text', safe: 'value' } });
    expect(scrubbedEvent.extra.transcript).toBe('[REDACTED]');
    expect(scrubbedEvent.extra.safe).toBe('value');
  });

  it('forwards to Sentry.captureException when initialized', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example.ingest.sentry.io/123';
    const { telemetry, sentry } = loadModules();
    telemetry.initTelemetry();

    const error = new Error('boom');
    telemetry.captureError(error);

    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});
