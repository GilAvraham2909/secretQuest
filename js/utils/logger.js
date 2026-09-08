/**
 * @file logger.js
 * Tiny namespaced wrapper around console.* so log lines are easy to spot
 * and easy to strip/redirect later.
 */
const PREFIX = '[Riki]';

export const logger = {
  log(...args) {
    console.log(PREFIX, ...args);
  },
  info(...args) {
    console.info(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
};
