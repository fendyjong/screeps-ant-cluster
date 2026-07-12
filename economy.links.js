function run(room) {
	if (!room.controller || !room.controller.my) {
		return;
	}

	const links = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_LINK;
		},
	});
	if (links.length < 2) {
		return;
	}

	const storage = room.storage;
	const controller = room.controller;
	let controllerLink = null;
	let storageLink = null;
	const sourceLinks = [];

	for (const link of links) {
		if (controller && link.pos.getRangeTo(controller) <= 3) {
			controllerLink = link;
			continue;
		}
		if (storage && link.pos.getRangeTo(storage) <= 2) {
			storageLink = link;
			continue;
		}
		sourceLinks.push(link);
	}

	for (const link of sourceLinks) {
		if (link.cooldown > 0 || link.store[RESOURCE_ENERGY] < 400) {
			continue;
		}
		if (controllerLink && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
			link.transferEnergy(controllerLink);
			return;
		}
		if (storageLink && storageLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
			link.transferEnergy(storageLink);
			return;
		}
	}
}

module.exports = { run: run };
