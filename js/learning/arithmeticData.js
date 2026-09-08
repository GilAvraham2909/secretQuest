/**
 * @file arithmeticData.js
 * Curated addition/subtraction problem bank for the arithmetic station
 * ("חשבון"). Static data only — no logic. Every entry is a pre-verified
 * single-digit equation: `a op b === answer`, `op` is the literal string
 * '+' or '-', and no subtraction entry produces a negative result (all
 * numbers stay within the friendly 0-10 range for the visual star count).
 *
 * The station renders `a` and `b` as rows of star icons for concreteness,
 * plus the plain numeric equation text, so no emoji/art field is needed
 * here — just the four numbers of each fact.
 *
 * @typedef {{id: string, a: number, op: '+'|'-', b: number, answer: number}} ArithmeticEntry
 */

/** @type {ArithmeticEntry[]} */
export const ARITHMETIC_PROBLEMS = Object.freeze([
  { id: 'arith-01', a: 2, op: '+', b: 3, answer: 5 },
  { id: 'arith-02', a: 4, op: '+', b: 1, answer: 5 },
  { id: 'arith-03', a: 3, op: '+', b: 4, answer: 7 },
  { id: 'arith-04', a: 5, op: '+', b: 2, answer: 7 },
  { id: 'arith-05', a: 6, op: '+', b: 3, answer: 9 },
  { id: 'arith-06', a: 4, op: '+', b: 4, answer: 8 },
  { id: 'arith-07', a: 6, op: '+', b: 2, answer: 8 },
  { id: 'arith-08', a: 2, op: '+', b: 2, answer: 4 },
  { id: 'arith-09', a: 5, op: '-', b: 2, answer: 3 },
  { id: 'arith-10', a: 6, op: '-', b: 4, answer: 2 },
  { id: 'arith-11', a: 8, op: '-', b: 3, answer: 5 },
  { id: 'arith-12', a: 7, op: '-', b: 5, answer: 2 },
  { id: 'arith-13', a: 9, op: '-', b: 4, answer: 5 },
  { id: 'arith-14', a: 10, op: '-', b: 6, answer: 4 },
  { id: 'arith-15', a: 3, op: '+', b: 1, answer: 4 },
  { id: 'arith-16', a: 9, op: '-', b: 7, answer: 2 },
]);
