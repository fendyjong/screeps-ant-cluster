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
    plain: 2,
    swamp: 10,
    wall: 255,
};
const TERRAIN_VERSION = 1;
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
    if (cached && cached.version === TERRAIN_VERSION) {
        return PathFinder.CostMatrix.deserialize(cached.matrix);
    }
    const matrix = generateTerrainMatrix(roomName);
    ns.pathing.terrain[roomName] = {
        matrix: matrix.serialize(),
        tick: Game.time,
        version: TERRAIN_VERSION,
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

function isCreepStuck(creep) {
    if (!creep.memory._lastPos) {
        creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
        return false;
    }
    const last = creep.memory._lastPos;
    if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
        creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
    }
    else {
        creep.memory._stuckTicks = 0;
    }
    creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
    return (creep.memory._stuckTicks || 0) > 1;
}
const TRAFFIC_THRESHOLD = 100;
function computeStructSig(room) {
    let sig = 0;
    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3);
    }
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        sig ^= s.structureType.charCodeAt(0) * (s.pos.x + 1) * (s.pos.y + 3) * 7;
    }
    return sig;
}
function getOrBuildCostMatrix(room) {
    const ns = Memory[CURRENT_NS];
    if (!ns.pathing)
        ns.pathing = {};
    if (!ns.pathing.costCache)
        ns.pathing.costCache = {};
    const currentSig = computeStructSig(room);
    const cached = ns.pathing.costCache[room.name];
    if (cached && cached.structSig === currentSig) {
        return PathFinder.CostMatrix.deserialize(cached.matrix);
    }
    const base = getTerrainMatrix(room.name);
    const costs = new PathFinder.CostMatrix();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            costs.set(x, y, base.get(x, y));
        }
    }
    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (s.structureType === STRUCTURE_ROAD) {
            costs.set(s.pos.x, s.pos.y, 1);
        }
        else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
            costs.set(s.pos.x, s.pos.y, 255);
        }
    }
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    }
    ns.pathing.costCache[room.name] = {
        matrix: costs.serialize(),
        structSig: currentSig,
    };
    return costs;
}
function recordTraffic(creep) {
    const roomName = creep.room.name;
    const ns = Memory[CURRENT_NS];
    if (!ns.pathing)
        ns.pathing = {};
    if (!ns.pathing.traffic)
        ns.pathing.traffic = {};
    if (!ns.pathing.traffic[roomName])
        ns.pathing.traffic[roomName] = {};
    const pos = creep.pos;
    const key = pos.x + ',' + pos.y;
    const heatmap = ns.pathing.traffic[roomName];
    heatmap[key] = (heatmap[key] || 0) + 1;
    if (heatmap[key] >= TRAFFIC_THRESHOLD) {
        if (!ns.pathing.pendingRoads)
            ns.pathing.pendingRoads = [];
        ns.pathing.pendingRoads.push({ roomName, x: pos.x, y: pos.y });
        heatmap[key] = 0;
    }
}
function giveWayIfStuck(creep) {
    if (!creep.memory._stuckTicks || creep.memory._stuckTicks < 3)
        return false;
    if (creep.store.getUsedCapacity() === 0)
        return false;
    const dirs = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    ];
    for (const d of dirs) {
        const x = creep.pos.x + d.dx;
        const y = creep.pos.y + d.dy;
        if (x < 0 || x > 49 || y < 0 || y > 49)
            continue;
        const look = creep.room.lookForAt(LOOK_CREEPS, x, y);
        if (look.length > 0)
            continue;
        const terrain = creep.room.lookForAt(LOOK_TERRAIN, x, y);
        if (terrain[0] === 'wall')
            continue;
        creep.move(creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name)));
        return true;
    }
    return false;
}
function moveTo(creep, target, opts) {
    const stuck = isCreepStuck(creep);
    if (giveWayIfStuck(creep))
        return;
    creep.moveTo(target, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: stuck ? 0 : 10,
        maxOps: stuck ? 2000 : 1200,
        ignoreCreeps: false,
        ...opts,
        costCallback: (roomName, matrix) => {
            if (roomName !== creep.room.name)
                return matrix;
            const cm = getOrBuildCostMatrix(creep.room);
            const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
            for (let i = 0; i < hostiles.length; i++) {
                const h = hostiles[i];
                cm.set(h.pos.x, h.pos.y, 255);
            }
            const friendlies = creep.room.find(FIND_MY_CREEPS);
            for (let i = 0; i < friendlies.length; i++) {
                const f = friendlies[i];
                if (cm.get(f.pos.x, f.pos.y) !== 255) {
                    cm.set(f.pos.x, f.pos.y, 8);
                }
            }
            return cm;
        },
    });
    recordTraffic(creep);
}

// src/roles/Harvester.ts
function findSource(creep) {
    const sources = creep.room.find(FIND_SOURCES_ACTIVE);
    if (sources.length === 0) {
        const allSources = creep.room.find(FIND_SOURCES);
        return allSources[0] || null;
    }
    const harvesters = creep.room.find(FIND_MY_CREEPS, {
        filter: (c) => c.memory.role === 'harvester' && c.name !== creep.name
    });
    let best = null;
    let bestScore = Infinity;
    for (const source of sources) {
        const dist = creep.pos.getRangeTo(source);
        const harvesterCount = harvesters.filter((h) => h.memory.targetSourceId === source.id).length;
        const score = dist * 10 + harvesterCount;
        if (score < bestScore) {
            bestScore = score;
            best = source;
        }
    }
    return best;
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
        if (!source)
            return;
        creep.memory.targetSourceId = source.id;
        const totalAdj = [...getAdjacentWalkable$1(getTerrainMatrix(creep.room.name), source.pos)].length;
        const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
            .filter((c) => c.pos.getRangeTo(source) === 1).length;
        if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
            const freeSpots = getAdjacentWalkable$1(getTerrainMatrix(creep.room.name), source.pos)
                .filter((p) => creep.room.lookForAt(LOOK_CREEPS, p.x, p.y).length === 0);
            if (freeSpots.length > 0) {
                moveTo(creep, freeSpots[0]);
                return;
            }
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            moveTo(creep, source);
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
function getAdjacentWalkable$1(matrix, pos) {
    const dirs = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    const result = [];
    for (const d of dirs) {
        const x = pos.x + d.dx;
        const y = pos.y + d.dy;
        const matrixCost = matrix.get(x, y);
        if (x >= 0 && x < 50 && y >= 0 && y < 50 && matrixCost < 255) {
            result.push(new RoomPosition(x, y, pos.roomName));
        }
    }
    return result;
}
function run$4(creep, goal) {
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
function run$3(creep, goal) {
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
function run$2(creep, goal) {
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
function run$1(creep, goal) {
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
    STRUCTURE_EXTENSION,
    STRUCTURE_ROAD,
    STRUCTURE_RAMPART,
    STRUCTURE_WALL,
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
function getAdjacentWalkable(matrix, pos) {
    const dirs = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    const result = [];
    for (const d of dirs) {
        const x = pos.x + d.dx;
        const y = pos.y + d.dy;
        if (isWalkable(matrix, x, y)) {
            result.push(new RoomPosition(x, y, pos.roomName));
        }
    }
    return result;
}
function carveCoreZone(room, anchor, matrix) {
    const layout = {};
    layout.anchor = anchor;
    layout.spawn = anchor;
    const coreTiles = new Map();
    coreTiles.set(anchor.x + ',' + anchor.y, anchor);
    const queue = [anchor];
    while (queue.length > 0 && coreTiles.size < 25) {
        const current = queue.shift();
        for (const adj of getAdjacentWalkable(matrix, current)) {
            const key = adj.x + ',' + adj.y;
            if (!coreTiles.has(key)) {
                coreTiles.set(key, adj);
                queue.push(adj);
            }
        }
    }
    const sortedTiles = Array.from(coreTiles.values())
        .sort((a, b) => a.getRangeTo(anchor) - b.getRangeTo(anchor));
    // Fallback to anchor (spawn) if not enough walkable tiles
    const getTile = (i) => sortedTiles[i] || anchor;
    layout.storage = getTile(1);
    layout.terminal = getTile(2);
    layout.factory = getTile(3);
    layout.powerSpawn = getTile(4);
    layout.nuker = getTile(5);
    layout.observer = getTile(6);
    layout.linkSpawn = getTile(7);
    layout.labs = [];
    layout.extensions = [];
    layout.towers = [];
    layout.ramparts = [];
    layout.walls = [];
    layout.roads = [];
    layout.linkController = layout.linkSpawn;
    layout.linkLab = layout.linkSpawn;
    return layout;
}
function carveLabZone(room, matrix, coreKeys) {
    const roomName = room.name;
    const labs = [];
    const claimed = new Set(coreKeys);
    const queue = [];
    for (const key of coreKeys) {
        const [x, y] = key.split(',').map(Number);
        queue.push(new RoomPosition(x, y, roomName));
    }
    const candidates = [];
    const visited = new Set();
    while (queue.length > 0 && candidates.length < 30) {
        const current = queue.shift();
        for (const adj of getAdjacentWalkable(matrix, current)) {
            const key = adj.x + ',' + adj.y;
            if (claimed.has(key) || visited.has(key))
                continue;
            visited.add(key);
            candidates.push(adj);
            queue.push(adj);
        }
    }
    candidates.sort((a, b) => {
        const distA = a.getRangeTo(new RoomPosition(25, 25, roomName));
        const distB = b.getRangeTo(new RoomPosition(25, 25, roomName));
        return distA - distB;
    });
    const labCount = Math.min(15, candidates.length);
    for (let i = 0; i < labCount; i++) {
        labs.push(candidates[i]);
        claimed.add(candidates[i].x + ',' + candidates[i].y);
    }
    return labs;
}
function carveExtensions(room, matrix, coreKeys, labKeys) {
    const roomName = room.name;
    const claimed = new Set();
    for (const k of coreKeys)
        claimed.add(k);
    for (const k of labKeys)
        claimed.add(k);
    const extensions = [];
    const controllerLevel = room.controller ? room.controller.level : 1;
    const maxExtensions = Math.min(60, CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][controllerLevel] || 0);
    const queue = [];
    for (const key of claimed) {
        const [x, y] = key.split(',').map(Number);
        for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
            const k = adj.x + ',' + adj.y;
            if (!claimed.has(k)) {
                queue.push(adj);
                claimed.add(k);
            }
        }
    }
    while (queue.length > 0 && extensions.length < maxExtensions) {
        const pos = queue.shift();
        extensions.push(pos);
        for (const adj of getAdjacentWalkable(matrix, pos)) {
            const k = adj.x + ',' + adj.y;
            if (!claimed.has(k)) {
                queue.push(adj);
                claimed.add(k);
            }
        }
    }
    return extensions;
}
function placeTowers(room, matrix, extensions) {
    const controllerLevel = room.controller ? room.controller.level : 1;
    const towerCount = Math.min(6, CONTROLLER_STRUCTURES[STRUCTURE_TOWER][controllerLevel] || 0);
    return findOptimalTowerPositions(room.name, towerCount);
}
function computeRampartPositions(core, labs, extensions) {
    const ramparts = [];
    const corePositions = [
        core.spawn, core.storage, core.terminal, core.factory,
        core.powerSpawn, core.nuker, core.observer, core.linkSpawn
    ];
    for (const pos of corePositions) {
        if (pos && isWalkablePos(pos))
            ramparts.push(pos);
    }
    for (const pos of labs)
        ramparts.push(pos);
    for (const pos of core.towers) {
        if (pos && isWalkablePos(pos))
            ramparts.push(pos);
    }
    return ramparts;
}
function computeWallPositions(room, matrix, allStructureKeys) {
    const walls = [];
    const roomName = room.name;
    for (const key of allStructureKeys) {
        const [x, y] = key.split(',').map(Number);
        for (const adj of getAdjacentWalkable(matrix, new RoomPosition(x, y, roomName))) {
            const k = adj.x + ',' + adj.y;
            if (!allStructureKeys.has(k)) {
                walls.push(adj);
            }
        }
    }
    return walls.slice(0, 50);
}
function computeRoadPositions(room, matrix, core, extensions) {
    const roads = [];
    for (const ext of extensions) {
        roads.push(ext);
    }
    return roads;
}
function planLayout(room) {
    const matrix = getTerrainMatrix(room.name);
    const anchor = findSpawnPosition(room.name);
    // Phase 1: Core zone
    const core = carveCoreZone(room, anchor, matrix);
    // Collect core tile keys
    const coreKeys = new Set();
    coreKeys.add(core.spawn.x + ',' + core.spawn.y);
    coreKeys.add(core.storage.x + ',' + core.storage.y);
    coreKeys.add(core.terminal.x + ',' + core.terminal.y);
    coreKeys.add(core.factory.x + ',' + core.factory.y);
    coreKeys.add(core.powerSpawn.x + ',' + core.powerSpawn.y);
    coreKeys.add(core.nuker.x + ',' + core.nuker.y);
    coreKeys.add(core.observer.x + ',' + core.observer.y);
    coreKeys.add(core.linkSpawn.x + ',' + core.linkSpawn.y);
    // Phase 2: Lab zone
    const labs = carveLabZone(room, matrix, coreKeys);
    core.labs = labs;
    const labKeys = new Set(labs.map(p => p.x + ',' + p.y));
    // Phase 3: Extensions
    const extensions = carveExtensions(room, matrix, coreKeys, labKeys);
    core.extensions = extensions;
    // Phase 4: Towers
    core.towers = placeTowers(room, matrix, extensions);
    // Phase 5: Ramparts + walls
    const allKeys = new Set();
    for (const k of coreKeys)
        allKeys.add(k);
    for (const k of labKeys)
        allKeys.add(k);
    for (const ext of extensions)
        allKeys.add(ext.x + ',' + ext.y);
    for (const t of core.towers)
        allKeys.add(t.x + ',' + t.y);
    core.ramparts = computeRampartPositions(core, labs, extensions);
    core.walls = computeWallPositions(room, matrix, allKeys);
    // Phase 6: Roads
    core.roads = computeRoadPositions(room, matrix, core, extensions);
    // Controller link
    if (room.controller) {
        core.linkController = new RoomPosition(room.controller.pos.x + 1, room.controller.pos.y, room.name);
        if (!isWalkable(matrix, core.linkController.x, core.linkController.y)) {
            core.linkController = new RoomPosition(room.controller.pos.x, room.controller.pos.y + 1, room.name);
        }
    }
    core.linkLab = labs.length > 0 ? labs[Math.floor(labs.length / 2)] : core.linkSpawn;
    return core;
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
    // Check terminal
    const existingTerminal = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TERMINAL
    })[0];
    if (existingTerminal && !existingTerminal.pos.isEqualTo(layout.terminal)) {
        if (isSafeToDestroy(room, existingTerminal)) {
            destroy.push(existingTerminal.id);
            build.push({ pos: layout.terminal, structureType: STRUCTURE_TERMINAL });
        }
    }
    // Check factory
    const existingFactory = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_FACTORY
    })[0];
    if (existingFactory && !existingFactory.pos.isEqualTo(layout.factory)) {
        if (isSafeToDestroy(room, existingFactory)) {
            destroy.push(existingFactory.id);
            build.push({ pos: layout.factory, structureType: STRUCTURE_FACTORY });
        }
    }
    // Check power spawn
    const existingPowerSpawn = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_POWER_SPAWN
    })[0];
    if (existingPowerSpawn && !existingPowerSpawn.pos.isEqualTo(layout.powerSpawn)) {
        if (isSafeToDestroy(room, existingPowerSpawn)) {
            destroy.push(existingPowerSpawn.id);
            build.push({ pos: layout.powerSpawn, structureType: STRUCTURE_POWER_SPAWN });
        }
    }
    // Check nuker
    const existingNuker = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_NUKER
    })[0];
    if (existingNuker && !existingNuker.pos.isEqualTo(layout.nuker)) {
        if (isSafeToDestroy(room, existingNuker)) {
            destroy.push(existingNuker.id);
            build.push({ pos: layout.nuker, structureType: STRUCTURE_NUKER });
        }
    }
    // Check observer
    const existingObserver = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_OBSERVER
    })[0];
    if (existingObserver && !existingObserver.pos.isEqualTo(layout.observer)) {
        if (isSafeToDestroy(room, existingObserver)) {
            destroy.push(existingObserver.id);
            build.push({ pos: layout.observer, structureType: STRUCTURE_OBSERVER });
        }
    }
    const roomName = room.name;
    // Check labs
    const existingLabs = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_LAB
    });
    const labPosSet = new Set(layout.labs.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const lab of existingLabs) {
        if (!labPosSet.has(lab.pos.x + ',' + lab.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, lab)) {
                destroy.push(lab.id);
            }
        }
    }
    for (const labPos of layout.labs) {
        const exists = existingLabs.some(l => l.pos.isEqualTo(labPos));
        if (!exists) {
            build.push({ pos: labPos, structureType: STRUCTURE_LAB });
        }
    }
    // Check links
    const existingLinks = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_LINK
    });
    const linkPositions = [layout.linkSpawn, layout.linkController, layout.linkLab].filter(isWalkablePos);
    const linkPosSet = new Set(linkPositions.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const link of existingLinks) {
        if (!linkPosSet.has(link.pos.x + ',' + link.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, link)) {
                destroy.push(link.id);
            }
        }
    }
    for (const linkPos of linkPositions) {
        const exists = existingLinks.some(l => l.pos.isEqualTo(linkPos));
        if (!exists) {
            build.push({ pos: linkPos, structureType: STRUCTURE_LINK });
        }
    }
    // Check extensions
    const existingExtensions = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_EXTENSION
    });
    const extPosSet = new Set(layout.extensions.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const ext of existingExtensions) {
        if (!extPosSet.has(ext.pos.x + ',' + ext.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, ext)) {
                destroy.push(ext.id);
            }
        }
    }
    for (const extPos of layout.extensions) {
        const exists = existingExtensions.some(e => e.pos.isEqualTo(extPos));
        if (!exists) {
            build.push({ pos: extPos, structureType: STRUCTURE_EXTENSION });
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
function isWalkablePos(pos) {
    return pos !== undefined && pos.x >= 0 && pos.x < 50 && pos.y >= 0 && pos.y < 50;
}

function drawPanel(vis, x, y, rows, width) {
    const rowH = 0.85;
    const h = rows.length * rowH + 0.3;
    vis.rect(x - 0.2, y - 0.2, width, h, {
        fill: '#000000',
        opacity: 0.4,
        stroke: '#444444',
        strokeWidth: 0.05,
    });
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowY = y + i * rowH;
        if (row[0]) {
            vis.text(row[0], x, rowY, {
                align: 'left',
                font: '7px monospace',
                color: '#888888',
            });
        }
        if (row[1]) {
            vis.text(row[1], x + width - 0.5, rowY, {
                align: 'right',
                font: '7px monospace',
                color: '#ffffff',
            });
        }
    }
}
function drawTopLeft(vis, room) {
    const rcl = room.controller ? room.controller.level : 0;
    const sources = room.find(FIND_SOURCES);
    const harvesters = Object.values(Game.creeps).filter((c) => c.memory.roomName === room.name && c.memory.role === 'harvester');
    const sourceAssignments = sources.map((s) => {
        const count = harvesters.filter((h) => h.memory.targetSourceId === s.id).length;
        const fill = s.energy / s.energyCapacity;
        return 'S' + (sources.indexOf(s) + 1) + '(' + count + ')';
    }).join(' ');
    const avgFill = sources.length > 0
        ? Math.round(sources.reduce((sum, s) => sum + s.energy / s.energyCapacity, 0) / sources.length * 100)
        : 0;
    const myCreeps = Object.values(Game.creeps).filter((c) => c.memory.roomName === room.name);
    const idle = myCreeps.filter((c) => (c.memory._stuckTicks || 0) > 5).length;
    const cpuAtStart = Memory.v1.hud?.cpuTick?.[room.name] || 0;
    const cpuUsed = ((Game.cpu.getUsed() - cpuAtStart) / 25).toFixed(1);
    drawPanel(vis, 0.5, 0.5, [
        [room.name + '  RCL ' + rcl, ''],
        ['Sources: ' + sourceAssignments, avgFill + '%'],
        ['Creeps: ' + myCreeps.length + '  idle: ' + idle, idle > 0 ? Math.round(idle / myCreeps.length * 100) + '%' : ''],
        ['CPU: ' + cpuUsed + 'ms', ''],
    ], 13);
}
function drawTopRight(vis, room) {
    const energy = room.energyAvailable.toLocaleString();
    const energyCap = room.energyCapacityAvailable.toLocaleString();
    const storage = room.storage ? room.storage.store[RESOURCE_ENERGY].toLocaleString() : '0';
    const hudMem = Memory.v1.hud || {};
    const income = hudMem.income?.[room.name] || 0;
    const spend = hudMem.spend?.[room.name] || 0;
    drawPanel(vis, 35, 0.5, [
        ['Energy', energy + ' / ' + energyCap],
        ['Income', '+' + income.toFixed(1) + '/t'],
        ['Spend', '-' + spend.toFixed(1) + '/t'],
        ['Stockpile', storage],
    ], 14);
}
function drawBottomLeft(vis, room) {
    const towers = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER
    });
    const towersOnline = towers.filter((t) => t.store[RESOURCE_ENERGY] > 0).length;
    const towerBar = towers.map((_t, i) => i < towersOnline ? '■' : '□').join('');
    const walls = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_WALL
    });
    const wallHealth = walls.length > 0
        ? Math.round(walls.reduce((sum, w) => sum + w.hits / w.hitsMax, 0) / walls.length * 100)
        : 0;
    const ramparts = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_RAMPART
    });
    const rampartHealth = ramparts.length > 0
        ? Math.round(ramparts.reduce((sum, r) => sum + r.hits / r.hitsMax, 0) / ramparts.length * 100)
        : 0;
    const hostiles = room.find(FIND_HOSTILE_CREEPS).length;
    const lastThreat = Memory.v1.hud?.lastThreat?.[room.name] || 0;
    const threatAgo = lastThreat > 0 ? (Game.time - lastThreat).toLocaleString() + ' ticks ago' : 'never';
    drawPanel(vis, 0.5, 35, [
        ['Towers: ' + towerBar, towersOnline + '/' + towers.length + ' online'],
        ['Walls: ' + wallHealth + '%', 'Ramparts: ' + rampartHealth + '%'],
        ['Hostiles: ' + hostiles, hostiles > 0 ? 'IN ROOM' : 'clear'],
        ['Last threat', threatAgo],
    ], 13);
}
function drawBottomRight(vis, room) {
    const swap = room.memory.layout?.swap;
    const swapState = swap?.state || 'none';
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    const pendingRoads = (Memory.v1.pathing?.pendingRoads || [])
        .filter((r) => r.roomName === room.name).length;
    const nextReplan = 100 - (Game.time % 100);
    drawPanel(vis, 35, 35, [
        ['Swap', swapState],
        ['Sites', sites + ' pending'],
        ['Roads pending', pendingRoads.toString()],
        ['Next replan', nextReplan + ' ticks'],
    ], 14);
}
function drawCreepLabels(vis, creep) {
    let label = '';
    let color = '#ffffff';
    switch (creep.memory.role) {
        case 'harvester':
            label = '[H' + (creep.memory.targetSourceId ? ' ->' + creep.memory.targetSourceId.slice(0, 4) : '') + ']';
            color = '#4caf50';
            break;
        case 'hauler':
            label = '[HAUL]';
            color = '#00bcd4';
            break;
        case 'builder':
            label = '[BUILD]';
            color = '#ffeb3b';
            break;
        case 'upgrader':
            label = '[UP]';
            color = '#9c27b0';
            break;
    }
    if (label) {
        vis.text(label, creep.pos.x, creep.pos.y - 0.5, {
            font: '5px monospace',
            color: color,
            stroke: '#000000',
            strokeWidth: 0.15,
        });
    }
}
function run(room) {
    const vis = new RoomVisual(room.name);
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.roomName !== room.name)
            continue;
        drawCreepLabels(vis, creep);
    }
    if (Game.time % 25 !== 0)
        return;
    if (!Memory.v1.hud)
        Memory.v1.hud = {};
    if (!Memory.v1.hud.cpuTick)
        Memory.v1.hud.cpuTick = {};
    Memory.v1.hud.cpuTick[room.name] = Game.cpu.getUsed();
    drawTopLeft(vis, room);
    drawTopRight(vis, room);
    drawBottomLeft(vis, room);
    drawBottomRight(vis, room);
    if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
        if (!Memory.v1.hud.lastThreat)
            Memory.v1.hud.lastThreat = {};
        Memory.v1.hud.lastThreat[room.name] = Game.time;
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
                run$4(creep, goal);
                break;
            case 'hauler':
                run$3(creep, goal);
                break;
            case 'builder':
                run$2(creep, goal);
                break;
            case 'upgrader':
                run$1(creep, goal);
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
const MAX_ROADS_PER_TICK = 5;
function drainPendingRoads(room) {
    const ns = Memory[CURRENT_NS];
    if (!ns.pathing || !ns.pathing.pendingRoads)
        return;
    const pending = ns.pathing.pendingRoads;
    let placed = 0;
    for (let i = pending.length - 1; i >= 0 && placed < MAX_ROADS_PER_TICK; i--) {
        const entry = pending[i];
        if (entry.roomName !== room.name)
            continue;
        const result = room.createConstructionSite(entry.x, entry.y, STRUCTURE_ROAD);
        if (result === OK || result === ERR_INVALID_TARGET) {
            pending.splice(i, 1);
            if (result === OK)
                placed++;
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
        // Track energy for HUD income/spend
        const prevEnergy = Memory.v1?.hud?.prevEnergy?.[roomName];
        const currentEnergy = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
        if (prevEnergy !== undefined) {
            const delta = currentEnergy - prevEnergy;
            if (!Memory.v1.hud)
                Memory.v1.hud = {};
            if (!Memory.v1.hud.income)
                Memory.v1.hud.income = {};
            if (!Memory.v1.hud.spend)
                Memory.v1.hud.spend = {};
            if (delta > 0) {
                Memory.v1.hud.income[roomName] = Memory.v1.hud.income[roomName] || 0;
                Memory.v1.hud.income[roomName] = Memory.v1.hud.income[roomName] * 0.9 + delta * 0.1;
            }
            else {
                Memory.v1.hud.spend[roomName] = Memory.v1.hud.spend[roomName] || 0;
                Memory.v1.hud.spend[roomName] = Memory.v1.hud.spend[roomName] * 0.9 + Math.abs(delta) * 0.1;
            }
        }
        if (!Memory.v1.hud.prevEnergy)
            Memory.v1.hud.prevEnergy = {};
        Memory.v1.hud.prevEnergy[roomName] = currentEnergy;
        // Terrain and layout planning — cache every 100 ticks
        getTerrainMatrix(room.name);
        if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
            const layout = planLayout(room);
            const swapPlan = planSwap(room, layout);
            room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
        }
        // Create construction sites from swap plan
        createConstructionSites(room);
        // Drain pending roads from traffic heatmap (up to 5 per tick)
        drainPendingRoads(room);
        // Periodic layout rechecking
        recheckLayout(room);
        tick(room, room.memory.goal);
        runCreeps(room, room.memory.goal);
        run(room);
    }
};

exports.loop = loop;
