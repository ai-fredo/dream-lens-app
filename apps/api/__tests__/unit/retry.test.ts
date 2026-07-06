// apps/api/__tests__/unit/retry.test.ts
import { withRetry } from '../../src/services/retry';

it('succeeds after a retry', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('transient');
      return 'ok';
    },
    { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
  );
  expect(result).toBe('ok');
  expect(attempts).toBe(2);
});

it('exhausts retries and rethrows the last error', async () => {
  let attempts = 0;
  await expect(
    withRetry(
      async () => {
        attempts += 1;
        throw new Error(`fail-${attempts}`);
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    ),
  ).rejects.toThrow('fail-3');
  expect(attempts).toBe(3);
});
