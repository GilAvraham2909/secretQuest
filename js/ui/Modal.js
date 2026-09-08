/**
 * @file Modal.js
 * Small confirm-dialog helper (used for delete-profile confirmation).
 * Mounts into #overlay-root. Deliberately non-scary visuals (amber accent,
 * friendly copy) per the "zero frustration" tone — this is a gentle check,
 * not an error state.
 */
import { createElement } from '../utils/dom.js';

/**
 * @param {{icon?: string, title: string, message: string, confirmLabel: string, cancelLabel: string}} opts
 * @returns {Promise<boolean>} resolves true if confirmed, false if cancelled
 */
export function confirmModal(opts) {
  const { icon = '🤔', title, message, confirmLabel = 'כן', cancelLabel = 'ביטול' } = opts;
  const overlay = document.getElementById('overlay-root') ?? document.body;

  return new Promise((resolve) => {
    const backdrop = createElement('div', { classes: 'modal-backdrop', attrs: { role: 'presentation' } });
    const modal = createElement('div', {
      classes: 'modal',
      attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    });

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKeydown);

    const confirmBtn = createElement('button', { classes: 'btn btn-primary', attrs: { type: 'button' }, text: confirmLabel });
    confirmBtn.addEventListener('click', () => close(true));

    const cancelBtn = createElement('button', { classes: 'btn btn-ghost', attrs: { type: 'button' }, text: cancelLabel });
    cancelBtn.addEventListener('click', () => close(false));

    modal.append(
      createElement('div', { classes: 'modal__icon', attrs: { 'aria-hidden': 'true' }, text: icon }),
      createElement('h2', { classes: 'modal__title', attrs: { id: 'modal-title' }, text: title }),
      createElement('p', { classes: 'modal__message', text: message }),
      createElement('div', { classes: 'modal__actions' }, [confirmBtn, cancelBtn])
    );

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    backdrop.append(modal);
    overlay.append(backdrop);
    confirmBtn.focus();
  });
}
