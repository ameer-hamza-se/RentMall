export function requestSignal(timeout, parent) {
  if (parent?.aborted) return parent;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
  }, timeout);
  const cancel = () => controller.abort(parent.reason);

  parent?.addEventListener('abort', cancel, { once: true });
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }, { once: true });

  return controller.signal;
}
