/**
 * @file dom.js
 * Small DOM helper utilities used across screens/components.
 */

/**
 * Create a DOM element with attributes/classes/text and append children.
 * @param {string} tag
 * @param {{attrs?: Object<string,string>, classes?: string[]|string, text?: string, html?: string}} [opts]
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
export function createElement(tag, opts = {}, children = []) {
  const el = document.createElement(tag);
  const { attrs, classes, text, html } = opts;

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  if (classes) {
    const list = Array.isArray(classes) ? classes : classes.split(' ');
    el.classList.add(...list.filter(Boolean));
  }

  if (text !== undefined) {
    el.textContent = text;
  }

  if (html !== undefined) {
    el.innerHTML = html;
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return el;
}

/** @param {string} selector @param {ParentNode} [root] */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** @param {string} selector @param {ParentNode} [root] */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Attach an <img> with a graceful onerror fallback chain, ending in a
 * styled emoji if every image source fails. `fallbackSrcs` lets a caller
 * try a more specific image first (e.g. a character wearing a specific
 * earned outfit) and fall back to a more general one (the plain base
 * character) before giving up on real art entirely — e.g.
 * `{ src: dressedPortrait, fallbackSrcs: [baseAvatar], emoji: '🙂' }`.
 * @param {{src: string, fallbackSrcs?: string[], alt: string, emoji: string, className?: string, wrapperClass?: string}} opts
 * @returns {HTMLElement} wrapper element containing either an img or the emoji fallback
 */
export function createImageWithFallback({ src, fallbackSrcs = [], alt, emoji, className = '', wrapperClass = '' }) {
  const wrapper = createElement('div', { classes: wrapperClass, attrs: { role: 'img', 'aria-label': alt } });
  const sources = [src, ...fallbackSrcs].filter(Boolean);
  let nextIndex = 1;
  const img = createElement('img', {
    // draggable="false" disables the browser's native image drag (a ghost
    // thumbnail that follows the cursor and snaps back on drop) — it
    // otherwise fights any custom Pointer Event drag handling a caller
    // attaches to this element (see MyWorldScreen.js's room-item dragging),
    // making a real drag feel like it only moves in tiny, unreliable steps.
    attrs: { src: sources[0] ?? '', alt: '', 'aria-hidden': 'true', draggable: 'false' },
    classes: className,
  });
  img.addEventListener('error', function handleError() {
    if (nextIndex < sources.length) {
      img.src = sources[nextIndex];
      nextIndex += 1;
    } else {
      img.remove();
      wrapper.append(createElement('span', { classes: 'avatar-emoji', attrs: { 'aria-hidden': 'true' }, text: emoji }));
    }
  });
  wrapper.append(img);
  return wrapper;
}

export function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
