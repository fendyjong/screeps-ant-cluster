import strategyMap from "./strategy.map";
import pathing from "./utils.pathing";

const roleScout = {
	run: function (creep) {
		strategyMap.updateRoom(creep.room);

		if (!creep.memory.targetRoom || creep.room.name === creep.memory.targetRoom) {
			creep.memory.targetRoom = strategyMap.pickScoutTarget(creep.room.name);
		}

		if (!creep.memory.targetRoom) {
			return;
		}

		if (creep.room.name !== creep.memory.targetRoom) {
			pathing.moveToRoom(creep, creep.memory.targetRoom, 'default', { stroke: '#66ccff' });
		}
	},
};

export default roleScout;
