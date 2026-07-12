import { getColonyGoal } from './Goal';
import { Goal } from '../types';

export function tick(room: Room): void {
  const goal = getColonyGoal(room);
  room.memory.goal = goal;
}
