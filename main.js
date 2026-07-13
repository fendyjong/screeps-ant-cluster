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
    const energy = room.energyCapacityAvailable;
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
            if (room.energyCapacityAvailable >= bodyCost) {
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
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                repairNearby(creep);
            }
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
        return creep.pos.findClosestByPath(containers);
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
            if (energy instanceof Structure) {
                if (creep.withdraw(energy, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveTo(creep, energy);
                }
            }
            else {
                if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                    moveTo(creep, energy);
                }
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
const MAX_DEMOLISH_PER_TICK = 3;
function findConstructionSite(creep) {
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length === 0)
        return null;
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
function dismantleStructure(creep, structureId) {
    const structure = Game.getObjectById(structureId);
    if (!structure)
        return false;
    const result = creep.dismantle(structure);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, structure);
        return false;
    }
    return result === OK;
}
function buildFromSwapPlan(creep) {
    const layout = creep.room.memory.layout;
    if (!layout || !layout.swap || layout.swap.build.length === 0)
        return false;
    // Find first construction site that matches build list
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    for (const entry of layout.swap.build) {
        const site = sites.find(s => s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType);
        if (site) {
            if (creep.build(site) === ERR_NOT_IN_RANGE) {
                moveTo(creep, site);
            }
            return true;
        }
    }
    return false;
}
function harvestEnergy(creep) {
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
        const source = sources[0];
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            moveTo(creep, source);
        }
    }
}
function run$1(creep, goal) {
    const layout = creep.room.memory.layout;
    const swapPlan = layout?.swap;
    if (swapPlan && swapPlan.destroy.length > 0) {
        swapPlan.state = 'destroying';
        let demolishCount = 0;
        const toRemove = [];
        for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
            const structureId = swapPlan.destroy[i];
            const structure = Game.getObjectById(structureId);
            if (!structure) {
                toRemove.push(i);
                continue;
            }
            const success = dismantleStructure(creep, structureId);
            if (success) {
                toRemove.push(i);
                demolishCount++;
            }
        }
        for (let i = toRemove.length - 1; i >= 0; i--) {
            swapPlan.destroy.splice(toRemove[i], 1);
        }
        return;
    }
    if (swapPlan && swapPlan.build.length > 0) {
        swapPlan.state = 'building';
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            const built = buildFromSwapPlan(creep);
            if (!built) {
                buildStructures(creep);
            }
        }
        else {
            harvestEnergy(creep);
        }
        return;
    }
    if (swapPlan) {
        swapPlan.state = 'idle';
    }
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
        harvestEnergy(creep);
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

const CURRENT_NS = 'v1';
const ENGINE_KEYS = {
    creeps: true,
    rooms: true,
    flags: true,
    powerCreeps: true,
};
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
function ensureMemoryNs() {
    if (!Memory[CURRENT_NS]) {
        Memory[CURRENT_NS] = {};
    }
}
function cleanLegacyMemory() {
    for (const key in Memory) {
        if (key === CURRENT_NS)
            continue;
        if (ENGINE_KEYS[key])
            continue;
        delete Memory[key];
    }
}

const TERRAIN_COSTS = {
    plain: 1,
    swamp: 5,
    wall: 255,
};
function ensurePathingMemory() {
    ensureMemoryNs();
    const ns = Memory[CURRENT_NS];
    if (!ns.pathing) {
        ns.pathing = {};
    }
    if (!ns.pathing.terrain) {
        ns.pathing.terrain = {};
    }
}
function generateTerrainMatrix(roomName) {
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const terrainType = terrain.get(x, y);
            if (terrainType === TERRAIN_MASK_WALL) {
                matrix.set(x, y, TERRAIN_COSTS.wall);
            }
            else if (terrainType === TERRAIN_MASK_SWAMP) {
                matrix.set(x, y, TERRAIN_COSTS.swamp);
            }
            else {
                matrix.set(x, y, TERRAIN_COSTS.plain);
            }
        }
    }
    return matrix;
}
function getTerrainMatrix(roomName) {
    ensurePathingMemory();
    const ns = Memory[CURRENT_NS];
    const cached = ns.pathing.terrain[roomName];
    if (cached) {
        return PathFinder.CostMatrix.deserialize(cached.matrix);
    }
    const matrix = generateTerrainMatrix(roomName);
    ns.pathing.terrain[roomName] = {
        matrix: matrix.serialize(),
        tick: Game.time,
    };
    return matrix;
}
function isWalkable(terrainMatrix, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49)
        return false;
    return terrainMatrix.get(x, y) < 255;
}
function findWalkablePositions(roomName) {
    const matrix = getTerrainMatrix(roomName);
    const positions = [];
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (isWalkable(matrix, x, y)) {
                positions.push(new RoomPosition(x, y, roomName));
            }
        }
    }
    return positions;
}
function findChokepoints(roomName) {
    const matrix = getTerrainMatrix(roomName);
    const chokepoints = [];
    for (let y = 1; y < 49; y++) {
        for (let x = 1; x < 49; x++) {
            if (!isWalkable(matrix, x, y))
                continue;
            const neighbors = [
                isWalkable(matrix, x - 1, y),
                isWalkable(matrix, x + 1, y),
                isWalkable(matrix, x, y - 1),
                isWalkable(matrix, x, y + 1),
            ];
            const walkableCount = neighbors.filter(Boolean).length;
            if (walkableCount <= 2) {
                chokepoints.push(new RoomPosition(x, y, roomName));
            }
        }
    }
    return chokepoints;
}
function findPerimeterPositions(roomName) {
    const matrix = getTerrainMatrix(roomName);
    const perimeter = [];
    for (let i = 0; i < 50; i++) {
        if (isWalkable(matrix, i, 1))
            perimeter.push(new RoomPosition(i, 1, roomName));
        if (isWalkable(matrix, i, 48))
            perimeter.push(new RoomPosition(i, 48, roomName));
        if (isWalkable(matrix, 1, i))
            perimeter.push(new RoomPosition(1, i, roomName));
        if (isWalkable(matrix, 48, i))
            perimeter.push(new RoomPosition(48, i, roomName));
    }
    return perimeter;
}
function calculateCoverage(pos, range, roomName) {
    let count = 0;
    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x >= 0 && x <= 49 && y >= 0 && y <= 49) {
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                if (distance <= range) {
                    count++;
                }
            }
        }
    }
    return count;
}
function findOptimalTowerPositions(roomName, count) {
    const matrix = getTerrainMatrix(roomName);
    const positions = [];
    const candidates = [];
    for (let y = 5; y < 45; y++) {
        for (let x = 5; x < 45; x++) {
            if (!isWalkable(matrix, x, y))
                continue;
            const pos = new RoomPosition(x, y, roomName);
            const coverage = calculateCoverage(pos, 10, roomName);
            const edgeDistance = Math.min(x, y, 49 - x, 49 - y);
            const score = coverage + edgeDistance * 2;
            candidates.push({ pos, score });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(count, candidates.length); i++) {
        positions.push(candidates[i].pos);
    }
    return positions;
}

const REBUILD_COSTS = {
    [STRUCTURE_SPAWN]: 15000,
    [STRUCTURE_STORAGE]: 100000,
    [STRUCTURE_TOWER]: 5000,
    [STRUCTURE_LINK]: 5000,
    [STRUCTURE_TERMINAL]: 100000,
    [STRUCTURE_LAB]: 50000,
    [STRUCTURE_FACTORY]: 100000,
    [STRUCTURE_OBSERVER]: 8000,
    [STRUCTURE_NUKER]: 100000,
    [STRUCTURE_POWER_SPAWN]: 200000,
    [STRUCTURE_EXTRACTOR]: 5000,
    [STRUCTURE_ROAD]: 300,
    [STRUCTURE_WALL]: 10000,
    [STRUCTURE_RAMPART]: 10000,
    [STRUCTURE_CONTAINER]: 5000,
    [STRUCTURE_EXTENSION]: 3000,
};
function isSafeToDestroy(room, structure) {
    const type = structure.structureType;
    const cost = REBUILD_COSTS[type] || 0;
    // Don't destroy spawn unless we have energy to rebuild or another spawn exists
    if (type === STRUCTURE_SPAWN) {
        const otherSpawns = room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_SPAWN && s.id !== structure.id
        });
        if (otherSpawns.length > 0)
            return true;
        return room.energyCapacityAvailable >= cost;
    }
    // Don't destroy terminal/storage before RCL 4
    if (type === STRUCTURE_TERMINAL || type === STRUCTURE_STORAGE) {
        if (room.controller && room.controller.level < 4)
            return false;
    }
    // Don't destroy terminal until storage exists
    if (type === STRUCTURE_TERMINAL) {
        const storage = room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_STORAGE
        })[0];
        if (!storage)
            return false;
    }
    // Don't destroy storage until terminal has no non-energy resources
    if (type === STRUCTURE_STORAGE) {
        const terminal = room.find(FIND_MY_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TERMINAL
        })[0];
        if (terminal) {
            const nonEnergy = Object.keys(terminal.store).filter(r => r !== RESOURCE_ENERGY);
            if (nonEnergy.some(r => (terminal.store[r] || 0) > 1000))
                return false;
        }
    }
    return true;
}
const BUILD_PRIORITIES = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_LINK,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_FACTORY,
    STRUCTURE_OBSERVER,
    STRUCTURE_NUKER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_ROAD,
    STRUCTURE_WALL,
    STRUCTURE_RAMPART,
    STRUCTURE_CONTAINER,
    STRUCTURE_EXTENSION,
];
function sortByPriority(buildList) {
    return buildList.sort((a, b) => {
        const aIdx = BUILD_PRIORITIES.indexOf(a.structureType);
        const bIdx = BUILD_PRIORITIES.indexOf(b.structureType);
        return aIdx - bIdx;
    });
}
function findSpawnPosition(roomName) {
    const matrix = getTerrainMatrix(roomName);
    // Find central walkable position
    for (let radius = 0; radius < 20; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = 25 + dx;
                const y = 25 + dy;
                if (isWalkable(matrix, x, y)) {
                    return new RoomPosition(x, y, roomName);
                }
            }
        }
    }
    // Fallback to center
    return new RoomPosition(25, 25, roomName);
}
function findStoragePosition(roomName, spawnPos) {
    const matrix = getTerrainMatrix(roomName);
    // Find walkable position near spawn
    for (let radius = 1; radius < 5; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = spawnPos.x + dx;
                const y = spawnPos.y + dy;
                if (isWalkable(matrix, x, y) && !(x === spawnPos.x && y === spawnPos.y)) {
                    return new RoomPosition(x, y, roomName);
                }
            }
        }
    }
    return new RoomPosition(spawnPos.x + 1, spawnPos.y, roomName);
}
function findRampartPositions(roomName, layout) {
    const matrix = getTerrainMatrix(roomName);
    const ramparts = [];
    // Find perimeter positions near spawn
    for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
            const x = layout.spawn.x + dx;
            const y = layout.spawn.y + dy;
            if (isWalkable(matrix, x, y)) {
                // Check if this is a perimeter position
                const neighbors = [
                    isWalkable(matrix, x - 1, y),
                    isWalkable(matrix, x + 1, y),
                    isWalkable(matrix, x, y - 1),
                    isWalkable(matrix, x, y + 1),
                ];
                const walkableCount = neighbors.filter(Boolean).length;
                if (walkableCount <= 3) {
                    ramparts.push(new RoomPosition(x, y, roomName));
                }
            }
        }
    }
    return ramparts.slice(0, 10); // Limit to 10 ramparts
}
function findWallPositions(roomName, _layout) {
    return findChokepoints(roomName).slice(0, 20);
}
function planLayout(room) {
    const spawnPos = findSpawnPosition(room.name);
    const storagePos = findStoragePosition(room.name, spawnPos);
    const towerPositions = findOptimalTowerPositions(room.name, 3);
    const partialLayout = {
        spawn: spawnPos,
        towers: towerPositions,
        storage: storagePos,
        ramparts: [],
        walls: [],
    };
    partialLayout.ramparts = findRampartPositions(room.name, partialLayout);
    partialLayout.walls = findWallPositions(room.name, partialLayout);
    return partialLayout;
}
function planSwap(room, layout) {
    const destroy = [];
    const build = [];
    // Check spawn
    const existingSpawn = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_SPAWN
    })[0];
    if (existingSpawn && !existingSpawn.pos.isEqualTo(layout.spawn)) {
        if (isSafeToDestroy(room, existingSpawn)) {
            destroy.push(existingSpawn.id);
            build.push({ pos: layout.spawn, structureType: STRUCTURE_SPAWN });
        }
    }
    // Check storage
    const existingStorage = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_STORAGE
    })[0];
    if (existingStorage && !existingStorage.pos.isEqualTo(layout.storage)) {
        if (isSafeToDestroy(room, existingStorage)) {
            destroy.push(existingStorage.id);
            build.push({ pos: layout.storage, structureType: STRUCTURE_STORAGE });
        }
    }
    // Check towers
    const existingTowers = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    });
    for (const tower of existingTowers) {
        const inLayout = layout.towers.some(t => t.isEqualTo(tower.pos));
        if (!inLayout && isSafeToDestroy(room, tower)) {
            destroy.push(tower.id);
        }
    }
    for (const towerPos of layout.towers) {
        const exists = existingTowers.some(t => t.pos.isEqualTo(towerPos));
        if (!exists) {
            build.push({ pos: towerPos, structureType: STRUCTURE_TOWER });
        }
    }
    // Sort build list by priority
    const sortedBuild = sortByPriority(build);
    return {
        destroy,
        build: sortedBuild,
        state: 'idle',
    };
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
const STRUCTURE_COSTS = {
    [STRUCTURE_SPAWN]: 15000,
    [STRUCTURE_STORAGE]: 100000,
    [STRUCTURE_TOWER]: 5000,
    [STRUCTURE_LINK]: 5000,
    [STRUCTURE_TERMINAL]: 100000,
    [STRUCTURE_LAB]: 50000,
    [STRUCTURE_FACTORY]: 100000,
    [STRUCTURE_OBSERVER]: 8000,
    [STRUCTURE_NUKER]: 100000,
    [STRUCTURE_POWER_SPAWN]: 200000,
    [STRUCTURE_EXTRACTOR]: 5000,
    [STRUCTURE_ROAD]: 300,
    [STRUCTURE_WALL]: 10000,
    [STRUCTURE_RAMPART]: 10000,
    [STRUCTURE_CONTAINER]: 5000,
    [STRUCTURE_EXTENSION]: 3000,
};
function createConstructionSites(room) {
    const layout = room.memory.layout;
    if (!layout || !layout.swap || layout.swap.build.length === 0)
        return;
    // Only create sites every 100 ticks
    if (Game.time % 100 !== 0)
        return;
    // Check energy availability
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const sitesPerRun = 5;
    let sitesCreated = 0;
    for (const entry of layout.swap.build) {
        // Skip if construction site already exists at this position
        const existingSite = sites.find(s => s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType);
        if (existingSite)
            continue;
        // Skip if structure already exists at this position
        const existingStructure = room.lookForAt(LOOK_STRUCTURES, entry.pos.x, entry.pos.y)
            .find(s => s.structureType === entry.structureType);
        if (existingStructure)
            continue;
        // Check energy availability (50% of structure cost)
        const cost = STRUCTURE_COSTS[entry.structureType] || 0;
        if (cost > 0 && room.energyAvailable < cost * 0.5)
            continue;
        // Create construction site
        const result = room.createConstructionSite(entry.pos, entry.structureType);
        if (result === OK) {
            sitesCreated++;
            if (sitesCreated >= sitesPerRun)
                break;
        }
    }
}
function recheckLayout(room) {
    // Only recheck every 200 ticks
    if (Game.time % 200 !== 0)
        return;
    const layout = room.memory.layout;
    if (!layout || !layout.bunker)
        return;
    // Verify all planned positions are still valid
    let needsReplan = false;
    // Check if planned structures still exist at correct positions
    for (const towerPos of layout.bunker.towers) {
        const tower = room.lookForAt(LOOK_STRUCTURES, towerPos.x, towerPos.y)
            .find(s => s.structureType === STRUCTURE_TOWER);
        if (!tower) {
            needsReplan = true;
            break;
        }
    }
    // Check if structures moved or were destroyed
    const existingSpawns = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_SPAWN
    });
    if (existingSpawns.length > 0) {
        const spawn = existingSpawns[0];
        if (!spawn.pos.isEqualTo(layout.bunker.spawn)) {
            needsReplan = true;
        }
    }
    // Re-plan if needed
    if (needsReplan) {
        const newLayout = planLayout(room);
        const newSwapPlan = planSwap(room, newLayout);
        room.memory.layout = { bunker: newLayout, swap: newSwapPlan, lastUpdated: Game.time };
    }
}
const loop = () => {
    // Migration: carry v1 → v2 (or whatever next version) when CURRENT_NS changes
    if (Memory.v1 && !Memory[CURRENT_NS]) {
        Memory[CURRENT_NS] = Memory.v1;
        delete Memory.v1;
    }
    // Ensure current version namespace exists
    ensureMemoryNs();
    // Clean up dead creep memory
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    // Prune legacy top-level Memory keys every 100 ticks
    if (Game.time % 100 === 0) {
        cleanLegacyMemory();
    }
    // Process each owned room
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my)
            continue;
        ensureRoomMemory(room);
        tick$1(room);
        // Terrain and layout planning — cache every 100 ticks
        getTerrainMatrix(room.name);
        if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
            const layout = planLayout(room);
            const swapPlan = planSwap(room, layout);
            room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
        }
        // Create construction sites from swap plan
        createConstructionSites(room);
        // Periodic layout rechecking
        recheckLayout(room);
        tick(room, room.memory.goal);
        runCreeps(room, room.memory.goal);
    }
};

exports.loop = loop;
