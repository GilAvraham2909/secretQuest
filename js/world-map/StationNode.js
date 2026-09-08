/**
 * @file StationNode.js
 * Render helper for a single map marker. Always enterable — no locked
 * state, per the "zero frustration" rule.
 */
import { createElement } from '../utils/dom.js';

/**
 * Maps each learning category to the CSS modifier suffix used for that
 * station's map-node color identity (see world-map.css's
 * .station-node--* rules). Kebab-cased to match the rest of the project's
 * class-naming convention even where the categoryKey itself is camelCase.
 */
const NODE_COLOR_MODIFIER = {
  letters: 'letters',
  phonology: 'phonology',
  syllablesWords: 'syllables-words',
  arithmetic: 'arithmetic',
  geometry: 'geometry',
  multiplicationPrep: 'multiplication-prep',
  readingComprehension: 'reading-comprehension',
};

/**
 * @param {import('./stations.js').Station} station
 * @param {(station: import('./stations.js').Station) => void} onEnter
 * @param {boolean} [visited] whether profile.stationsVisited has an entry for
 *   this station. Optional/falsy behaves exactly as before (no badge) — kept
 *   optional for backward compatibility even though the one call site
 *   (WorldMapScreen.js) always passes an explicit boolean.
 * @returns {HTMLElement}
 */
export function createStationNode(station, onEnter, visited) {
  const { categoryKey, titleHe, imagePath, fallbackEmoji, mapPosition } = station;
  const colorModifier = NODE_COLOR_MODIFIER[categoryKey];

  const classes = ['station-node'];
  if (colorModifier) classes.push(`station-node--${colorModifier}`);
  if (visited) classes.push('station-node--visited');

  const node = createElement('button', {
    classes,
    attrs: {
      type: 'button',
      style: `inset-inline-start: ${mapPosition.xPercent}%; inset-block-start: ${mapPosition.yPercent}%;`,
      'aria-label': `תחנת ${titleHe}`,
    },
  });

  const iconWrap = createElement('span', { classes: 'station-node__icon' });
  const img = createElement('img', { attrs: { src: imagePath, alt: '' } });
  img.addEventListener('error', () => {
    img.remove();
    iconWrap.append(createElement('span', { attrs: { 'aria-hidden': 'true' }, text: fallbackEmoji }));
  });
  iconWrap.append(img);

  if (visited) {
    iconWrap.append(
      createElement('span', {
        classes: 'station-node__visited-badge',
        attrs: { 'aria-hidden': 'true' },
        text: '✓',
      })
    );
  }

  const label = createElement('span', { classes: 'station-node__label', text: titleHe });

  node.append(iconWrap, label);
  node.addEventListener('click', () => onEnter(station));

  return node;
}
