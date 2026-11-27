export function requestSignal(timeout, parent) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });

  const timer = setTimeout(() => {
    controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
  }, timeout);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', cancel);
    },
  };
}
