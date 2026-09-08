/**
 * @file multiplicationPrepData.js
 * Curated problem bank for the multiplication-prep station ("הכנה לכפל").
 * Static data only — no logic. Covers the two early multiplication-
 * readiness skills named in game.md's own wording ("קבוצות שוות ודילוגים" —
 * equal groups and skip-counting), mixed together in one bank so a session
 * can draw either type.
 *
 * Two shapes of entry, distinguished by `type`:
 *  - 'groups': `groups` equal clusters of `perGroup` items each.
 *    `answer = groups * perGroup` (verified for every entry below).
 *  - 'skip': a 3-term arithmetic sequence (`sequence`), `answer` is the
 *    4th term continuing that sequence's fixed step (verified for every
 *    entry below).
 *
 * @typedef {{id: string, type: 'groups', groups: number, perGroup: number, answer: number}} GroupsEntry
 * @typedef {{id: string, type: 'skip', sequence: [number, number, number], answer: number}} SkipEntry
 * @typedef {GroupsEntry|SkipEntry} MultiplicationPrepEntry
 */

/** @type {MultiplicationPrepEntry[]} */
export const MULTIPLICATION_PREP_PROBLEMS = Object.freeze([
  { id: 'mprep-01', type: 'groups', groups: 2, perGroup: 3, answer: 6 },
  { id: 'mprep-02', type: 'groups', groups: 3, perGroup: 2, answer: 6 },
  { id: 'mprep-03', type: 'groups', groups: 2, perGroup: 4, answer: 8 },
  { id: 'mprep-04', type: 'groups', groups: 4, perGroup: 2, answer: 8 },
  { id: 'mprep-05', type: 'groups', groups: 3, perGroup: 3, answer: 9 },
  { id: 'mprep-06', type: 'groups', groups: 2, perGroup: 5, answer: 10 },
  { id: 'mprep-07', type: 'groups', groups: 5, perGroup: 2, answer: 10 },
  { id: 'mprep-08', type: 'groups', groups: 3, perGroup: 4, answer: 12 },
  { id: 'mprep-09', type: 'skip', sequence: [2, 4, 6], answer: 8 },
  { id: 'mprep-10', type: 'skip', sequence: [4, 6, 8], answer: 10 },
  { id: 'mprep-11', type: 'skip', sequence: [5, 10, 15], answer: 20 },
  { id: 'mprep-12', type: 'skip', sequence: [10, 15, 20], answer: 25 },
  { id: 'mprep-13', type: 'skip', sequence: [10, 20, 30], answer: 40 },
  { id: 'mprep-14', type: 'skip', sequence: [3, 6, 9], answer: 12 },
  { id: 'mprep-15', type: 'skip', sequence: [6, 9, 12], answer: 15 },
  { id: 'mprep-16', type: 'skip', sequence: [4, 8, 12], answer: 16 },
]);
