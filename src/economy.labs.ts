function run(room) {
	if (!room.controller || room.controller.level < 6 || !room.controller.my) {
		return;
	}
	if (!Memory.strategy) {
		Memory.strategy = {};
	}
	if (!Memory.strategy.labs) {
		Memory.strategy.labs = {};
	}

	const labs = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_LAB;
		},
	});
	const mineral = room.find(FIND_MINERALS)[0];
	const extractor = room.find(FIND_MY_STRUCTURES, {
		filter: function (structure) {
			return structure.structureType === STRUCTURE_EXTRACTOR;
		},
	})[0];
	const boostInventory = {};
	for (const lab of labs) {
		if (lab.mineralType) {
			boostInventory[lab.mineralType] = (boostInventory[lab.mineralType] || 0) + (lab.store[lab.mineralType] || 0);
		}
	}
	Memory.strategy.labs[room.name] = {
		labCount: labs.length,
		mineralType: mineral ? mineral.mineralType : null,
		extractorReady: !!extractor,
		mineralAvailable: mineral ? mineral.mineralAmount : 0,
		boostReady: labs.length >= 3,
		reactionReady: labs.length >= 3,
		boostInventory: boostInventory,
	};

	if (labs.length < 3) {
		return;
	}

	const inputA = labs[0];
	const inputB = labs[1];
	const output = labs[2];
	if (!inputA.mineralType || !inputB.mineralType) {
		return;
	}
	if (output.cooldown > 0) {
		return;
	}
	output.runReaction(inputA, inputB);
}

export default { run: run };
