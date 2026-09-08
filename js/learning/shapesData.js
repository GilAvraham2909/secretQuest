/**
 * @file shapesData.js
 * The 8 CSS-drawn shapes used by the geometry station. Static data only —
 * no logic. `cssClass` names the modifier class (defined in
 * css/screens/geometry-station.css) that renders the shape's silhouette on
 * top of the shared `.shape` base class via border-radius/clip-path.
 * @typedef {{id: string, nameHe: string, cssClass: string}} ShapeEntry
 */

/** @type {ShapeEntry[]} */
export const SHAPES = Object.freeze([
  { id: 'circle', nameHe: 'עיגול', cssClass: 'shape--circle' },
  { id: 'square', nameHe: 'ריבוע', cssClass: 'shape--square' },
  { id: 'triangle', nameHe: 'משולש', cssClass: 'shape--triangle' },
  { id: 'rectangle', nameHe: 'מלבן', cssClass: 'shape--rectangle' },
  { id: 'diamond', nameHe: 'מעוין', cssClass: 'shape--diamond' },
  { id: 'star', nameHe: 'כוכב', cssClass: 'shape--star' },
  { id: 'pentagon', nameHe: 'מחומש', cssClass: 'shape--pentagon' },
  { id: 'hexagon', nameHe: 'משושה', cssClass: 'shape--hexagon' },
]);
