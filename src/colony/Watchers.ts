// src/colony/Watchers.ts

export function hostileWatcher(room: Room): void {
	const hostiles = room.find(FIND_HOSTILE_CREEPS);
	if (hostiles.length === 0) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.hostile?.[room.name]) return;

	if (!events.hostile) events.hostile = {};
	events.hostile[room.name] = {
		tick: Game.time,
		room: room.name,
		threat: hostiles.length > 3 ? 'swarm' : 'scout',
	};
}

export function expansionWatcher(room: Room): void {
	const rcl = room.controller?.level || 1;
	if (rcl < 4) return;

	const storage = room.storage;
	if (!storage) return;
	if ((storage.store[RESOURCE_ENERGY] || 0) < 500000) return;

	const events = Memory.v1.events;
	if (!events) return;
	if (events.expansion?.[room.name]) return;

	const exits = Game.map.describeExits(room.name);
	for (const exitKey in exits) {
		const exitRoom = exits[exitKey as unknown as ExitKey];
		if (!Game.rooms[exitRoom] || !Game.rooms[exitRoom].controller?.my) {
			if (!events.expansion) events.expansion = {};
			events.expansion[room.name] = {
				sourceRoom: room.name,
				targetRoom: exitRoom,
				tick: Game.time,
			};
			return;
		}
	}
}