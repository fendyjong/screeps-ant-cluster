import { DEBUG_LOGGING, TELEMETRY_BUFFER_MAX, TELEMETRY_SENTINEL } from './config';
import { LogLevel, Stimuli, TaskName, TelemetryRecord } from './types';

export type TaskDistribution = Record<TaskName, number>;

/**
 * Emits one telemetry record by two routes, because neither alone is enough:
 *
 *  1. `console.log` with the '[ANT]' sentinel — readable in the game client,
 *     and tailable by tools/log-shipper on servers that forward console output
 *     to a file.
 *  2. A bounded ring buffer in `Memory.telemetry` — the route that actually
 *     works here. This private server is launched by Steam, so `log_console`
 *     forwards to the launcher process's stdout, which the GUI swallows and no
 *     external process can tail. Memory, by contrast, is flushed into the
 *     server's db.json roughly every 10s, so tools/memory-shipper can read it.
 *
 * The buffer is capped: Memory is serialized every tick, so it must not grow.
 */
export function emit(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  if (level === 'DEBUG' && !DEBUG_LOGGING) return;

  const record: TelemetryRecord = { tick: Game.time, level, event, ...data };
  console.log(TELEMETRY_SENTINEL + JSON.stringify(record));

  const buffer = Memory.telemetry ?? (Memory.telemetry = []);
  buffer.push(record);
  if (buffer.length > TELEMETRY_BUFFER_MAX) {
    buffer.splice(0, buffer.length - TELEMETRY_BUFFER_MAX);
  }
}

/** The periodic colony snapshot. Task distribution is the key series. */
export function emitSnapshot(
  room: Room,
  stimuli: Stimuli,
  distribution: TaskDistribution,
  energy: { available: number; capacity: number },
  switches: Record<string, number>,
  deferred: number,
): void {
  emit('INFO', 'snapshot', {
    room: room.name,
    creeps: room.find(FIND_MY_CREEPS).length,
    // Taken from readEnergy, not room.energyAvailable — the room properties
    // arrive undefined on this server and serialized as null.
    energyAvailable: energy.available,
    energyCapacity: energy.capacity,
    stimuli,
    distribution,
    // Aggregated rather than one event per switch: at ~50 ticks/sec with 25
    // creeps, per-switch events were 94% of all telemetry and almost entirely
    // exploration noise. The counts preserve the signal (how much churn, and
    // why) at ~1/500th the volume.
    switches,
    // Recruitment attempts refused this tick by the rate limit — how hard the
    // colony is straining against it.
    deferred,
  });
}
