import { DEBUG_LOGGING, TELEMETRY_SENTINEL } from './config';
import { LogLevel, Stimuli, TaskName } from './types';

export type TaskDistribution = Record<TaskName, number>;

/**
 * Emits one '[ANT]'-prefixed JSON line. This is the only path out of the
 * sandbox: the server writes it to disk and tools/log-shipper forwards it.
 */
export function emit(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  if (level === 'DEBUG' && !DEBUG_LOGGING) return;
  console.log(
    TELEMETRY_SENTINEL +
      JSON.stringify({
        tick: Game.time,
        level,
        event,
        ...data,
      }),
  );
}

/** The periodic colony snapshot. Task distribution is the key series. */
export function emitSnapshot(
  room: Room,
  stimuli: Stimuli,
  distribution: TaskDistribution,
): void {
  emit('INFO', 'snapshot', {
    room: room.name,
    creeps: room.find(FIND_MY_CREEPS).length,
    energyAvailable: room.energyAvailable,
    energyCapacity: room.energyCapacityAvailable,
    stimuli,
    distribution,
  });
}
