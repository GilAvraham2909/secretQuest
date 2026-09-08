/**
 * @file Toast.js
 * Small transient message component. Mounts into #overlay-root and
 * auto-dismisses after a short delay.
 */
import { createElement } from '../utils/dom.js';

let stackEl = null;

function ensureStack() {
  if (stackEl && document.body.contains(stackEl)) return stackEl;
  const overlay = document.getElementById('overlay-root') ?? document.body;
  stackEl = createElement('div', { classes: 'toast-stack', attrs: { 'aria-live': 'polite' } });
  overlay.append(stackEl);
  return stackEl;
}

/**
 * @param {string} message
 * @param {{variant?: 'info'|'warning', duration?: number}} [opts]
 */
export function showToast(message, opts = {}) {
  const { variant = 'info', duration = 3200 } = opts;
  const stack = ensureStack();
  const toast = createElement('div', {
    classes: variant === 'warning' ? 'toast toast--warning' : 'toast',
    text: message,
  });
  stack.append(toast);

  window.setTimeout(() => {
    toast.style.animation = 'fade-out var(--transition-base) ease both';
    window.setTimeout(() => toast.remove(), 260);
  }, duration);
}
