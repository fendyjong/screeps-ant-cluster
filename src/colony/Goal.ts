// src/colony/Goal.ts

import { Goal } from '../types';

export function getColonyGoal(room: Room): Goal {
  // MVP: ECONOMY only
  // Future: check hostiles for DEFEND, damage for RECOVER
  return Goal.ECONOMY;
}
