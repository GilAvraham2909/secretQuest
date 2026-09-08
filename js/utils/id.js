/**
 * @file id.js
 * ID generation helper with a fallback for environments without
 * crypto.randomUUID (older WebViews, insecure contexts).
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rand()}${rand()}-${rand()}-${rand()}-${rand()}-${rand()}${rand()}${rand()}`;
}
