import type { ComponentType } from 'react';
import type { MechanicId, MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import { BalloonMechanic, balloonDefinition } from './BalloonMechanic.js';
import { FishingMechanic, fishingDefinition } from './FishingMechanic.js';
import { TrainMechanic, trainDefinition } from './TrainMechanic.js';
import { MatchMechanic, matchDefinition } from './MatchMechanic.js';

/**
 * The mechanic registry.
 *
 * Adding a mechanic is one row here plus one module. Nothing in the engine, the
 * hint ladder, the assessment engine or the content schema changes — that is
 * acceptance criterion 3.12, and the diff is the evidence.
 */

export interface RegisteredMechanic {
  readonly definition: MechanicDefinition;
  readonly component: ComponentType<MechanicProps>;
  readonly labelHe: string;
  /** Scene art, purely cosmetic. */
  readonly sceneClass: string;
}

export const MECHANIC_REGISTRY: Partial<Record<MechanicId, RegisteredMechanic>> = {
  balloon_game: {
    definition: balloonDefinition,
    component: BalloonMechanic,
    labelHe: 'פיצוץ בלונים',
    sceneClass: 'scene--balloon',
  },
  fishing_game: {
    definition: fishingDefinition,
    component: FishingMechanic,
    labelHe: 'דיג אותיות',
    sceneClass: 'scene--fishing',
  },
  letter_train_game: {
    definition: trainDefinition,
    component: TrainMechanic,
    labelHe: 'רכבת האותיות',
    sceneClass: 'scene--train',
  },
  match_game: {
    definition: matchDefinition,
    component: MatchMechanic,
    labelHe: 'משחק התאמה',
    sceneClass: 'scene--match',
  },
};

export const PLAYABLE_MECHANICS = Object.keys(MECHANIC_REGISTRY) as MechanicId[];
