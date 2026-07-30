import { COLORS } from './config';

/** Draws each creep's current task above it. */
export function drawCreepLabels(room: Room): void {
  for (const creep of room.find(FIND_MY_CREEPS)) {
    const task = creep.memory.task;
    if (!task) continue;
    room.visual.text(task, creep.pos.x, creep.pos.y - 0.6, {
      color: COLORS.hud,
      font: 0.4,
      align: 'center',
    });
  }
}
