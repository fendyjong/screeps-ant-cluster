// src/hatchery/Hatchery.ts

import { SpawnRequest, requestToMemory, requestFromMemory } from './Request';
import { scaleBody, serializeBody } from './Body';
import { HatcheryMemory, SpawnRequestData } from '../types';

const QUEUE_TTL = 100;

function ensureHatcheryMemory(roomName: string): void {
	if (!Memory.v1) (Memory as any).v1 = {};
	if (!Memory.v1.hatchery) Memory.v1.hatchery = { queue: {}, deathWatch: {} } as HatcheryMemory;
	if (!Memory.v1.hatchery.queue[roomName]) Memory.v1.hatchery.queue[roomName] = [];
}

export function request(req: SpawnRequest): void {
	ensureHatcheryMemory(req.roomName);
	const queue = Memory.v1.hatchery.queue[req.roomName];

	// Check for existing matching request (same role, same room, same body min+ideal)
	const existing = queue.find(
		(r: SpawnRequestData) =>
			r.role === req.role &&
			r.bodyMin.join(',') === serializeBody(req.body.min).join(',') &&
			r.bodyIdeal.join(',') === serializeBody(req.body.ideal).join(',')
	);

	if (existing) {
		existing.count = Math.max(existing.count, req.count);
		existing.priority = Math.min(existing.priority, req.priority);
	} else {
		queue.push(requestToMemory(req));
	}
}

export function process(room: Room): void {
	ensureHatcheryMemory(room.name);
	const queue = Memory.v1.hatchery.queue[room.name];

	// Filter out invalid entries
	const valid: SpawnRequestData[] = queue.filter(r => r && typeof r.role === 'string' && r.count > 0);

	// Purge stale
	const now = Game.time;
	const fresh = valid.filter(r => now - r.createdAt < QUEUE_TTL);

	// Sort by priority ascending
	fresh.sort((a, b) => a.priority - b.priority);

	// Find idle spawn
	const spawns = room.find(FIND_MY_SPAWNS);
	const spawn = spawns.find(s => !s.spawning);
	if (!spawn) {
		Memory.v1.hatchery.queue[room.name] = fresh;
		return;
	}

	// Process entries with manual index to allow deferred splice
	let spawned = false;
	const toRemove: number[] = [];

	for (let i = 0; i < fresh.length; i++) {
		if (spawned) break;
		const entry = fresh[i];
		const req = requestFromMemory(entry);
		const body = scaleBody(req.body.min, req.body.ideal, room.energyAvailable);
		if (!body) continue; // can't afford min, keep for next tick

		const name = `${req.role}_${room.name}_${Game.time}`;
		const result = spawn.spawnCreep(body, name, {
			memory: { role: req.role, roomName: room.name, ...req.memory },
		});

		if (result === OK) {
			entry.count--;
			if (entry.count <= 0) toRemove.push(i);
			spawned = true;
		} else if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_NOT_ENOUGH_RESOURCES) {
			toRemove.push(i);
		}
	}

	// Remove consumed entries (reverse order to preserve indices)
	for (let i = toRemove.length - 1; i >= 0; i--) {
		fresh.splice(toRemove[i], 1);
	}

	Memory.v1.hatchery.queue[room.name] = fresh;
}