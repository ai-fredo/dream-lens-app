import { useCallback, useEffect, useState } from 'react';
import { useDreamStore, type DisplayDream } from '../store/dreamStore';

export type DreamsStatus = 'loading' | 'ok' | 'error';

export interface UseDreamsResult {
  status: DreamsStatus;
  dreams: DisplayDream[];
  retry: () => Promise<void>;
}

/**
 * List-screen wrapper around `useDreamStore`: turns `refresh()` into a
 * loading -> ok / error lifecycle with a `retry` escape hatch.
 */
export function useDreams(): UseDreamsResult {
  const dreams = useDreamStore((s) => s.dreams);
  const refresh = useDreamStore((s) => s.refresh);
  const [status, setStatus] = useState<DreamsStatus>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      await refresh();
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, dreams, retry: load };
}
