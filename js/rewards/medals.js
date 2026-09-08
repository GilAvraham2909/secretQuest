/**
 * @file medals.js
 * "המדליות שלי" — one medal per learning category, derived from the
 * highest adaptive-difficulty level (adaptiveEngine.js: 1-3) the child has
 * ever reached in that category, awarded/upgraded at station-completion
 * time (see each station's renderCompletion()).
 *
 * Deliberately one-way (silver -> gold, never gold -> silver, never
 * revoked to "none"): adaptiveEngine's level can drop back down after a
 * few wrong answers (the "zero frustration" rule — struggle lowers
 * difficulty immediately, never punishes), and a medal disappearing again
 * after a bad round would be exactly the kind of punishing regression this
 * project's design explicitly avoids. So a medal, once earned, is a
 * permanent record of "the best this child has ever done here" rather than
 * a live reflection of their current level.
 */

/** @enum {string} */
export const MedalTier = Object.freeze({
  SILVER: 'silver',
  GOLD: 'gold',
});

const TIER_RANK = { [MedalTier.SILVER]: 1, [MedalTier.GOLD]: 2 };

/**
 * @param {number} level adaptiveEngine level (1-3) at the moment a station session ends
 * @returns {MedalTier|null} silver at level 2 ("medium"), gold at level 3 ("hard"), else null
 */
export function medalTierForLevel(level) {
  if (level >= 3) return MedalTier.GOLD;
  if (level >= 2) return MedalTier.SILVER;
  return null;
}

/**
 * @param {MedalTier|null|undefined} current
 * @param {MedalTier|null} candidate
 * @returns {boolean} true if candidate is a strictly better tier than current
 */
export function isMedalUpgrade(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;
  return TIER_RANK[candidate] > TIER_RANK[current];
}
