import { requestSignal } from './request-signal.js';
import { useEffect, useState } from 'react';

const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function useApi(path, { paginate = false } = {}) {
  const [request, setRequest] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        async function read(endpoint) {
          const response = await fetch(`${apiOrigin}/api/v1${endpoint}`, {
            signal: requestSignal(10000, controller.signal),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'Unable to load this page. Try again shortly.');
          return body;
        }
        const body = await read(path);
        if (paginate) {
          const items = new Map(body.items.map((item) => [item.slug, item]));
          const pages = Math.min(9999, Math.ceil(body.total / body.pageSize));
          for (let page = 2; page <= pages; page += 1) {
            const result = await read(path + '&page=' + page);
            for (const item of result.items) items.set(item.slug, item);
            if (result.items.length < result.pageSize) break;
          }
          body.items = [...items.values()];
        }
        if (!controller.signal.aborted) {
          setRequest({ status: 'ready', body });
        }
      } catch {
        if (!controller.signal.aborted) {
          setRequest({ status: 'error', message: 'Unable to reach RentMall. Try again shortly.' });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [path, attempt, paginate]);

  function retry() {
    setRequest({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }

  return { ...request, retry };
}
