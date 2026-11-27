import { useEffect, useState } from 'react';
import { apiOrigin, requestJson } from './api-client.js';

const catalogCacheLifetimeMs = 30 * 60 * 1000;

function cacheKey(path) {
  return 'rentmall:catalog:v1:' + apiOrigin + path;
}

function cachedCatalog(path) {
  try {
    const entry = JSON.parse(sessionStorage.getItem(cacheKey(path)));
    if (entry && Date.now() - entry.savedAt < catalogCacheLifetimeMs && Array.isArray(entry.body?.items)) {
      return entry.body;
    }
  } catch {
    // Catalog loading still works when browser storage is unavailable.
  }
}

function rememberCatalog(path, body) {
  try {
    if (body) sessionStorage.setItem(cacheKey(path), JSON.stringify({ body, savedAt: Date.now() }));
    else sessionStorage.removeItem(cacheKey(path));
  } catch {
    // Storing a public catalog snapshot is optional.
  }
}

export function useApi(path, { enabled = true, paginate = false, cache = false } = {}) {
  const [request, setRequest] = useState(() => {
    const body = cache ? cachedCatalog(path) : undefined;
    return { path, status: 'loading', body, complete: !!body };
  });
  const [attempt, setAttempt] = useState(0);
  const current = request.path === path ? request : { path, status: 'loading' };

  useEffect(() => {
    if (!enabled || !path) return;
    const controller = new AbortController();
    const { signal } = controller;

    function read(endpoint) {
      return requestJson(endpoint, {
        signal,
        onRetry: () => setRequest((previous) => {
          if (signal.aborted) return previous;
          if (previous.path === path && previous.reconnecting) return previous;
          return { ...(previous.path === path ? previous : null), path, status: 'loading', errorStatus: undefined, reconnecting: true };
        }),
      });
    }

    function publish(body, status) {
      if (signal.aborted) return;
      setRequest((previous) => {
        if (status === 'loading' && previous.path === path && previous.complete) {
          return { ...previous, status, errorStatus: undefined, reconnecting: false };
        }
        return { path, status, body, complete: status === 'ready' };
      });
    }

    async function load() {
      try {
        const body = await read(path);
        if (paginate) {
          const items = new Map(body.items.map((item) => [item.slug, item]));
          const pages = Math.min(9999, Math.ceil(body.total / body.pageSize));
          for (let page = 2; page <= pages; page += 1) {
            publish({ ...body, items: [...items.values()] }, 'loading');
            const result = await read(path + '&page=' + page);
            for (const item of result.items) items.set(item.slug, item);
            if (result.items.length < result.pageSize) break;
          }
          body.items = [...items.values()];
        }
        publish(body, 'ready');
        if (cache && !signal.aborted) rememberCatalog(path, body);
      } catch (error) {
        if (!signal.aborted) {
          setRequest((previous) => ({
            ...(previous.path === path ? previous : null),
            path, status: 'error', errorStatus: error.status, reconnecting: false,
            message: 'Unable to reach RentMall. Try again shortly.',
          }));
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [path, enabled, attempt, paginate, cache]);

  function refresh(discard) {
    if (discard && cache) rememberCatalog(path);
    setRequest((previous) => ({
      ...(!discard && previous.path === path ? previous : null),
      path, status: 'loading', errorStatus: undefined, reconnecting: false,
    }));
    setAttempt((previous) => previous + 1);
  }

  return { ...current, retry: () => refresh(false), invalidate: () => refresh(true) };
}
