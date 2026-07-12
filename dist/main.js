'use strict';

// src/types/index.ts
var Goal;
(function (Goal) {
    Goal["ECONOMY"] = "economy";
    Goal["DEFEND"] = "defend";
    Goal["RECOVER"] = "recover";
})(Goal || (Goal = {}));

// src/colony/Goal.ts
function getColonyGoal(room) {
    // MVP: ECONOMY only
    // Future: check hostiles for DEFEND, damage for RECOVER
    return Goal.ECONOMY;
}

function tick$1(room) {
    const goal = getColonyGoal(room);
    room.memory.goal = goal;
}

function forRole(role, room) {
    const energy = room.energyAvailable;
    switch (role) {
        case 'harvester':
            if (energy >= 300)
                return [WORK, WORK, CARRY, MOVE];
            if (energy >= 200)
                return [WORK, CARRY, MOVE];
            return [WORK, MOVE];
        case 'hauler':
            if (energy >= 300)
                return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
            if (energy >= 200)
                return [CARRY, CARRY, MOVE, MOVE];
            return [CARRY, MOVE];
        case 'builder':
            if (energy >= 300)
                return [WORK, WORK, CARRY, MOVE];
            if (energy >= 200)
                return [WORK, CARRY, MOVE];
            return [WORK, MOVE];
        case 'upgrader':
            if (energy >= 300)
                return [WORK, WORK, CARRY, MOVE];
            if (energy >= 200)
                return [WORK, CARRY, MOVE];
            return [WORK, MOVE];
        default:
            return [WORK, CARRY, MOVE];
    }
}
function cost(body) {
    const costs = {
        [WORK]: 100,
        [CARRY]: 50,
        [MOVE]: 50,
        [ATTACK]: 80,
        [RANGED_ATTACK]: 150,
        [HEAL]: 250,
        [TOUGH]: 10,
        [CLAIM]: 600,
    };
    return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
}

// src/spawn/Spawner.ts
const ROLE_ORDER = ['harvester', 'hauler', 'builder', 'upgrader'];
function getTargets(goal) {
    switch (goal) {
        case Goal.ECONOMY:
            return { harvester: 2, hauler: 1, builder: 1, upgrader: 1 };
        case Goal.DEFEND:
            return { harvester: 1, hauler: 0, builder: 0, upgrader: 0 };
        case Goal.RECOVER:
            return { harvester: 2, hauler: 1, builder: 2, upgrader: 0 };
    }
}
function countCreeps(room) {
    const counts = {};
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.roomName === room.name) {
            const role = creep.memory.role;
            counts[role] = (counts[role] || 0) + 1;
        }
    }
    return counts;
}
function getSpawn(room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    return spawns[0] || null;
}
function tick(room, goal) {
    const spawn = getSpawn(room);
    if (!spawn || spawn.spawning)
        return;
    const targets = getTargets(goal);
    const counts = countCreeps(room);
    for (const role of ROLE_ORDER) {
        const target = targets[role] || 0;
        const current = counts[role] || 0;
        if (current < target) {
            const body = forRole(role, room);
            const bodyCost = cost(body);
            if (room.energyAvailable >= bodyCost) {
                const name = `${role}_${room.name}_${Game.time}`;
                const result = spawn.spawnCreep(body, name, {
                    memory: { role, roomName: room.name }
                });
                if (result === OK)
                    break;
            }
        }
    }
}

function moveTo(creep, target, opts) {
    creep.moveTo(target, {
        visualizePathStyle: { stroke: '#ffffff' },
        ...opts
    });
}

// src/roles/Harvester.ts
function findSource(creep) {
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length === 0)
        return null;
    // Prefer source with energy
    for (const source of sources) {
        if (source.energy > 0)
            return source;
    }
    return sources[0];
}
function findDropOff$1(creep) {
    // Prefer containers and storage
    const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => ((s.structureType === STRUCTURE_CONTAINER ||
            s.structureType === STRUCTURE_STORAGE) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (targets.length > 0) {
        return creep.pos.findClosestByPath(targets);
    }
    // Fallback to spawn and extensions
    const spawnTargets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => ((s.structureType === STRUCTURE_SPAWN ||
            s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (spawnTargets.length > 0) {
        return creep.pos.findClosestByPath(spawnTargets);
    }
    return null;
}
function harvestAndTransfer(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        const source = findSource(creep);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                moveTo(creep, source);
            }
        }
    }
    else {
        const dropOff = findDropOff$1(creep);
        if (dropOff) {
            if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveTo(creep, dropOff);
            }
        }
    }
}
function repairNearby(creep) {
    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
    });
    if (damagedStructures.length > 0) {
        const target = creep.pos.findClosestByPath(damagedStructures);
        if (target) {
            if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                moveTo(creep, target);
            }
        }
    }
}
function run$3(creep, goal) {
    switch (goal) {
        case Goal.ECONOMY:
            harvestAndTransfer(creep);
            break;
        case Goal.DEFEND:
            repairNearby(creep);
            break;
        case Goal.RECOVER:
            harvestAndTransfer(creep);
            break;
    }
}

function findEnergy(creep) {
    // Look for dropped energy
    const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (droppedEnergy.length > 0) {
        return creep.pos.findClosestByPath(droppedEnergy);
    }
    // Look for containers with energy
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_CONTAINER &&
            s.store[RESOURCE_ENERGY] > 0)
    });
    if (containers.length > 0) {
        const container = creep.pos.findClosestByPath(containers);
        if (container) {
            // Withdraw from container
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveTo(creep, container);
            }
        }
    }
    return null;
}
function findDropOff(creep) {
    // Prefer spawn and extensions
    const targets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => ((s.structureType === STRUCTURE_SPAWN ||
            s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (targets.length > 0) {
        return creep.pos.findClosestByPath(targets);
    }
    // Fallback to storage
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_STORAGE &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (storage.length > 0) {
        return storage[0];
    }
    return null;
}
function haulEnergy(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        const energy = findEnergy(creep);
        if (energy) {
            if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                moveTo(creep, energy);
            }
        }
    }
    else {
        const dropOff = findDropOff(creep);
        if (dropOff) {
            if (creep.transfer(dropOff, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveTo(creep, dropOff);
            }
        }
    }
}
function deliverToTowers(creep) {
    const towers = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (towers.length > 0) {
        const tower = creep.pos.findClosestByPath(towers);
        if (tower) {
            if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveTo(creep, tower);
            }
        }
    }
}
function run$2(creep, goal) {
    switch (goal) {
        case Goal.ECONOMY:
            haulEnergy(creep);
            break;
        case Goal.DEFEND:
            deliverToTowers(creep);
            break;
        case Goal.RECOVER:
            haulEnergy(creep);
            break;
    }
}

// src/roles/Builder.ts
function findConstructionSite(creep) {
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length === 0)
        return null;
    // Prioritize by progress ratio
    return creep.pos.findClosestByPath(sites);
}
function findDamagedStructure(creep) {
    const structures = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
    });
    if (structures.length === 0)
        return null;
    return creep.pos.findClosestByPath(structures);
}
function buildStructures(creep) {
    const site = findConstructionSite(creep);
    if (site) {
        if (creep.build(site) === ERR_NOT_IN_RANGE) {
            moveTo(creep, site);
        }
    }
}
function repairStructures(creep) {
    const structure = findDamagedStructure(creep);
    if (structure) {
        if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
            moveTo(creep, structure);
        }
    }
}
function run$1(creep, goal) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        switch (goal) {
            case Goal.ECONOMY:
                buildStructures(creep);
                break;
            case Goal.DEFEND:
                repairStructures(creep);
                break;
            case Goal.RECOVER:
                repairStructures(creep);
                break;
        }
    }
    else {
        // Find energy
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
            const source = sources[0];
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                moveTo(creep, source);
            }
        }
    }
}

function upgradeController(creep) {
    if (!creep.room.controller)
        return;
    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        moveTo(creep, creep.room.controller);
    }
}
function parkNearSpawn(creep) {
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
        const range = creep.pos.getRangeTo(spawn);
        if (range > 3) {
            moveTo(creep, spawn.pos);
        }
    }
}
function run(creep, goal) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        switch (goal) {
            case Goal.ECONOMY:
                upgradeController(creep);
                break;
            case Goal.DEFEND:
                parkNearSpawn(creep);
                break;
            case Goal.RECOVER:
                upgradeController(creep);
                break;
        }
    }
    else {
        // Find energy
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
            const source = sources[0];
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                moveTo(creep, source);
            }
        }
    }
}

function ensureRoomMemory(room) {
    if (!room.memory.goal) {
        room.memory.goal = Goal.ECONOMY;
    }
}
function ensureCreepMemory(creep) {
    if (!creep.memory.role) {
        creep.memory.role = 'harvester';
    }
    if (!creep.memory.roomName) {
        creep.memory.roomName = creep.room.name;
    }
}

// src/main.ts
function runCreeps(room, goal) {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.roomName !== room.name)
            continue;
        ensureCreepMemory(creep);
        switch (creep.memory.role) {
            case 'harvester':
                run$3(creep, goal);
                break;
            case 'hauler':
                run$2(creep, goal);
                break;
            case 'builder':
                run$1(creep, goal);
                break;
            case 'upgrader':
                run(creep, goal);
                break;
        }
    }
}
const loop = () => {
    // Clean up dead creep memory
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    // Process each owned room
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my)
            continue;
        ensureRoomMemory(room);
        tick$1(room);
        tick(room, room.memory.goal);
        runCreeps(room, room.memory.goal);
    }
};

exports.loop = loop;
