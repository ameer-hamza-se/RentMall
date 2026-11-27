import { requestSignal } from './request-signal.js';

export const apiOrigin = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');

const readWindowMs = 80_000;
const readTimeoutMs = 12_000;
const writeTimeoutMs = 25_000;
const transientStatuses = new Set([408, 429, 502, 503, 504]);

function pause(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, delay);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function fetchJson(path, { method, headers, body, signal }, timeout) {
  const attempt = requestSignal(timeout, signal);
  try {
    const response = await fetch(apiOrigin + '/api/v1' + path, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
      signal: attempt.signal,
    });
    if (response.status === 204) return null;

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (attempt.signal.aborted) throw attempt.signal.reason;
      if (response.ok && !(error instanceof SyntaxError)) throw error;
    }
    if (!response.ok || data === undefined) {
      const status = response.ok ? 502 : response.status;
      throw Object.assign(new Error(data?.error || 'Could not reach RentMall. Try again shortly.'), { status, code: data?.code });
    }
    return data;
  } finally {
    attempt.dispose();
  }
}

export async function requestJson(path, { method = 'GET', headers, body, signal, onRetry } = {}) {
  const options = { method, headers, body, signal };
  if (method !== 'GET') return fetchJson(path, options, writeTimeoutMs);

  // Render can take about a minute to wake a free service. Retry reads only.
  const deadline = Date.now() + readWindowMs;
  let backoff = 750;
  for (;;) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fetchJson(path, options, Math.max(1, Math.min(readTimeoutMs, deadline - Date.now())));
    } catch (error) {
      const retryable = error instanceof TypeError || error.name === 'TimeoutError' || transientStatuses.has(error.status);
      const remaining = deadline - Date.now();
      if (!retryable || signal?.aborted || remaining <= 0 || globalThis.navigator?.onLine === false) throw error;
      onRetry?.();
      await pause(Math.min(backoff, remaining), signal);
      if (Date.now() >= deadline) throw error;
      backoff = Math.min(backoff * 2, 8_000);
    }
  }
}
