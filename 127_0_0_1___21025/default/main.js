'use strict';

var screeps = require('screeps');

const PART_COST = {
    [WORK]: 100,
    [CARRY]: 50,
    [MOVE]: 50,
    [ATTACK]: 80,
    [RANGED_ATTACK]: 150,
    [HEAL]: 250,
    [TOUGH]: 10,
    [CLAIM]: 600,
};
function bodyCost(body) {
    return body.reduce((sum, p) => sum + (PART_COST[p] || 0), 0);
}
function scaleBody(min, ideal, availableEnergy) {
    if (min.length > 50)
        return null;
    const minCost = bodyCost(min);
    if (minCost > availableEnergy)
        return null;
    const body = [...min];
    let remaining = availableEnergy - minCost;
    for (let i = min.length; i < ideal.length && body.length < 50; i++) {
        const part = ideal[i];
        const cost = PART_COST[part] || 0;
        if (cost <= remaining) {
            body.push(part);
            remaining -= cost;
        }
        else {
            break;
        }
    }
    return body;
}
function serializeBody(body) {
    const map = {
        [WORK]: 1,
        [CARRY]: 2,
        [MOVE]: 3,
        [ATTACK]: 4,
        [RANGED_ATTACK]: 5,
        [HEAL]: 6,
        [TOUGH]: 7,
        [CLAIM]: 8,
    };
    return body.map(p => map[p] || 0);
}
function deserializeBody(data) {
    const map = {
        1: WORK,
        2: CARRY,
        3: MOVE,
        4: ATTACK,
        5: RANGED_ATTACK,
        6: HEAL,
        7: TOUGH,
        8: CLAIM,
    };
    return data.map(n => map[n] || WORK);
}

var Priority;
(function (Priority) {
    Priority[Priority["CRITICAL"] = 0] = "CRITICAL";
    Priority[Priority["HIGH"] = 100] = "HIGH";
    Priority[Priority["NORMAL"] = 300] = "NORMAL";
    Priority[Priority["LOW"] = 600] = "LOW";
    Priority[Priority["IDLE"] = 900] = "IDLE";
})(Priority || (Priority = {}));
function requestToMemory(req) {
    return {
        role: req.role,
        priority: req.priority,
        bodyMin: serializeBody(req.body.min),
        bodyIdeal: serializeBody(req.body.ideal),
        count: req.count,
        memory: req.memory,
        createdAt: req.createdAt,
        roomName: req.roomName,
    };
}
function requestFromMemory(data) {
    return {
        role: data.role,
        priority: data.priority,
        body: {
            min: deserializeBody(data.bodyMin),
            ideal: deserializeBody(data.bodyIdeal),
        },
        count: data.count,
        memory: data.memory,
        createdAt: data.createdAt,
        roomName: data.roomName,
    };
}

const ALPHA = 0.1;
const BUILD_RATE_WINDOW = 50;
function getRate(key, roomName) {
    const cf = Memory.v1.cashflow?.[roomName];
    if (!cf)
        return 0;
    return cf[key] || 0;
}
function setRate(key, roomName, value) {
    if (!Memory.v1.cashflow)
        Memory.v1.cashflow = {};
    if (!Memory.v1.cashflow[roomName])
        Memory.v1.cashflow[roomName] = { incomeRate: 0, spawnRate: 0, buildRate: 0 };
    Memory.v1.cashflow[roomName][key] = value;
}
function ema(old, sample) {
    return old + ALPHA * (sample - old);
}
function computeEmergencyReserve(room) {
    let reserve = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.memory.roomName !== room.name)
            continue;
        if (c.ticksToLive !== undefined && c.ticksToLive < 100) {
            const parts = c.body.map(p => p.type);
            reserve += bodyCost(parts);
        }
    }
    return reserve;
}
function trackIncome(roomName, totalEnergy, prevTotalEnergy) {
    const delta = totalEnergy - prevTotalEnergy;
    if (delta > 0) {
        const old = getRate('incomeRate', roomName);
        setRate('incomeRate', roomName, ema(old, delta));
    }
}
function trackSpawn(roomName, cost) {
    const old = getRate('spawnRate', roomName);
    setRate('spawnRate', roomName, ema(old, cost));
}
function trackBuild(roomName, progressDelta) {
    const old = getRate('buildRate', roomName);
    setRate('buildRate', roomName, ema(old, progressDelta));
}
function getHealth(room) {
    const reserve = computeEmergencyReserve(room);
    if (room.energyAvailable < reserve)
        return 'red';
    const income = getRate('incomeRate', room.name);
    const spend = getRate('spawnRate', room.name) + getRate('buildRate', room.name);
    if (income > spend * 1.1)
        return 'green';
    return 'yellow';
}
function getBudget(room) {
    const reserve = computeEmergencyReserve(room);
    const spawnBudget = Math.max(0, room.energyAvailable - reserve);
    const spawnRate = getRate('spawnRate', room.name);
    const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
    const buildBudget = Math.max(0, storageEnergy - spawnRate * BUILD_RATE_WINDOW);
    return { spawnBudget, buildBudget, reserve };
}
function getCpuBudgets() {
    const limit = Game.cpu.limit;
    const bucket = Game.cpu.bucket;
    const safeCapacity = limit * 0.85;
    return {
        soft: Math.min(safeCapacity, Math.max(limit * 0.3, bucket * 0.05)),
        hard: Math.min(safeCapacity, Math.max(limit * 0.5, bucket * 0.1)),
    };
}

// src/hatchery/Hatchery.ts
const QUEUE_TTL = 100;
function ensureHatcheryMemory(roomName) {
    if (!Memory.v1)
        Memory.v1 = {};
    if (!Memory.v1.hatchery)
        Memory.v1.hatchery = { queue: {}, deathWatch: {} };
    if (!Memory.v1.hatchery.queue[roomName])
        Memory.v1.hatchery.queue[roomName] = [];
}
function request(req) {
    ensureHatcheryMemory(req.roomName);
    const queue = Memory.v1.hatchery.queue[req.roomName];
    // Check for existing matching request (same role, same room, same body min+ideal)
    const existing = queue.find((r) => r.role === req.role &&
        r.bodyMin.join(',') === serializeBody(req.body.min).join(',') &&
        r.bodyIdeal.join(',') === serializeBody(req.body.ideal).join(','));
    if (existing) {
        existing.count = Math.max(existing.count, req.count);
        existing.priority = Math.min(existing.priority, req.priority);
    }
    else {
        queue.push(requestToMemory(req));
    }
}
function process(room) {
    ensureHatcheryMemory(room.name);
    const queue = Memory.v1.hatchery.queue[room.name];
    const { spawnBudget } = getBudget(room);
    // Filter out invalid entries
    const valid = queue.filter(r => r && typeof r.role === 'string' && r.count > 0);
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
    const toRemove = [];
    for (let i = 0; i < fresh.length; i++) {
        if (spawned)
            break;
        const entry = fresh[i];
        const req = requestFromMemory(entry);
        const body = scaleBody(req.body.min, req.body.ideal, room.energyAvailable);
        if (!body)
            continue; // can't afford min, keep for next tick
        if (bodyCost(body) > spawnBudget)
            continue; // above priority budget, keep for next tick
        const name = `${req.role}_${room.name}_${Game.time}`;
        const result = spawn.spawnCreep(body, name, {
            memory: { role: req.role, roomName: room.name, ...req.memory },
        });
        if (result === OK) {
            trackSpawn(room.name, bodyCost(body));
            entry.count--;
            if (entry.count <= 0)
                toRemove.push(i);
            spawned = true;
        }
        else if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_NOT_ENOUGH_RESOURCES) {
            toRemove.push(i);
        }
    }
    // Remove consumed entries (reverse order to preserve indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
        fresh.splice(toRemove[i], 1);
    }
    Memory.v1.hatchery.queue[room.name] = fresh;
}

// src/hatchery/Queen.ts
const ROLE_PRIORITIES = {
    harvester: Priority.HIGH,
    hauler: Priority.NORMAL,
    builder: Priority.NORMAL,
    upgrader: Priority.NORMAL,
    defender: Priority.HIGH,
    scout: Priority.LOW,
    claimer: Priority.LOW,
    attacker: Priority.IDLE,
    healer: Priority.IDLE,
};
const DEFAULT_BODIES = {
    harvester: {
        min: [WORK, CARRY, MOVE],
        ideal: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    },
    hauler: {
        min: [CARRY, CARRY, MOVE],
        ideal: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
    },
    builder: {
        min: [WORK, CARRY, MOVE],
        ideal: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    },
    upgrader: {
        min: [WORK, CARRY, MOVE],
        ideal: [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
    },
    defender: {
        min: [TOUGH, ATTACK, ATTACK, MOVE],
        ideal: [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
    },
    scout: {
        min: [MOVE],
        ideal: [MOVE, MOVE],
    },
    claimer: {
        min: [CLAIM, MOVE],
        ideal: [CLAIM, MOVE],
    },
    attacker: {
        min: [ATTACK, MOVE],
        ideal: [ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE],
    },
    healer: {
        min: [HEAL, MOVE],
        ideal: [HEAL, HEAL, MOVE, MOVE],
    },
};
function getPhaseConfig(room) {
    const rcl = room.controller?.level || 1;
    const energyRatio = room.energyAvailable / Math.max(room.energyCapacityAvailable, 1);
    if (rcl <= 2 && energyRatio < 0.8) {
        return {
            floor: { harvester: 2, hauler: 1 },
            scaling: {},
        };
    }
    if (rcl <= 2) {
        return {
            floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
            scaling: { hauler: { threshold: 5000, increment: 1 } },
        };
    }
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const hasSites = sites.length > 0;
    const missingCritical = (type) => {
        const have = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === type }).length;
        const need = CONTROLLER_STRUCTURES[type]?.[rcl] || 0;
        return have < need;
    };
    const missingExtensions = missingCritical(STRUCTURE_EXTENSION);
    const missingTowers = missingCritical(STRUCTURE_TOWER);
    if (rcl <= 4 && (missingExtensions || missingTowers)) {
        return {
            floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
            scaling: {
                builder: { threshold: 30000, increment: 1 },
                upgrader: { threshold: 5000, increment: 1 },
            },
        };
    }
    if (rcl >= 8 || (!hasSites && rcl >= 5)) {
        return {
            floor: { harvester: 2, hauler: 1, upgrader: 1 },
            scaling: {
                upgrader: { threshold: 10000, increment: 1 },
            },
        };
    }
    if (hasSites && rcl >= 5) {
        return {
            floor: { harvester: 2, hauler: 1, builder: 1, upgrader: 1 },
            scaling: {
                hauler: { threshold: 10000, increment: 1 },
                builder: { threshold: 20000, increment: 1 },
            },
        };
    }
    return {
        floor: { harvester: 2, hauler: 1, upgrader: 1 },
        scaling: {},
    };
}
function computeTargets(room, health) {
    const phase = getPhaseConfig(room);
    const targets = { ...phase.floor };
    const stored = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const backlog = sites.reduce((sum, s) => sum + (s.progressTotal - s.progress), 0);
    for (const [role, cfg] of Object.entries(phase.scaling)) {
        let extra = 0;
        const threshold = health === 'red' ? cfg.threshold * 2 : cfg.threshold;
        if (role === 'builder') {
            extra = Math.floor(backlog / threshold) * cfg.increment;
        }
        else {
            extra = Math.floor(stored / threshold) * cfg.increment;
        }
        targets[role] = (targets[role] || 0) + extra;
    }
    return targets;
}
function isEconomyLocked(room) {
    const harvesters = Object.values(Game.creeps).filter(c => c.memory.roomName === room.name && c.memory.role === 'harvester');
    return room.energyAvailable < 200 && harvesters.length === 0;
}
function scanCreeps(room) {
    const live = {};
    const soonDead = {};
    const deathWatch = {};
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.roomName !== room.name)
            continue;
        const role = creep.memory.role || 'unknown';
        live[role] = (live[role] || 0) + 1;
        const ttl = creep.ticksToLive;
        if (ttl !== undefined && ttl < 100) {
            soonDead[role] = (soonDead[role] || 0) + 1;
            if (!deathWatch[role])
                deathWatch[role] = [];
            deathWatch[role].push({ name, ttl });
        }
    }
    return { live, soonDead, deathWatch };
}
function maybeRequestRoomExpansion(room) {
    const rcl = room.controller?.level || 1;
    if (rcl >= 4 && room.energyCapacityAvailable >= 5000 && room.storage) {
        const stored = room.storage.store[RESOURCE_ENERGY] || 0;
        if (stored > 500000) {
            const exits = Game.map.describeExits(room.name);
            for (const exitKey in exits) {
                const exitRoom = exits[exitKey];
                if (!Game.rooms[exitRoom] || !Game.rooms[exitRoom].controller?.my) {
                    const claimReq = {
                        role: 'claimer',
                        priority: Priority.LOW,
                        body: DEFAULT_BODIES.claimer,
                        count: 1,
                        memory: { targetRoom: exitRoom, claim: true },
                        createdAt: Game.time,
                        roomName: room.name,
                    };
                    request(claimReq);
                    const remoteHarvester = {
                        role: 'harvester',
                        priority: Priority.LOW,
                        body: DEFAULT_BODIES.harvester,
                        count: 2,
                        memory: { remoteRoom: exitRoom },
                        createdAt: Game.time,
                        roomName: room.name,
                    };
                    request(remoteHarvester);
                    const remoteHauler = {
                        role: 'hauler',
                        priority: Priority.LOW,
                        body: DEFAULT_BODIES.hauler,
                        count: 1,
                        memory: { remoteRoom: exitRoom },
                        createdAt: Game.time,
                        roomName: room.name,
                    };
                    request(remoteHauler);
                    continue;
                }
            }
        }
    }
}
function tick(room) {
    if (!Memory.v1)
        Memory.v1 = {};
    if (!Memory.v1.hatchery)
        Memory.v1.hatchery = { queue: {}, deathWatch: {} };
    if (!Memory.v1.hatchery.deathWatch[room.name])
        Memory.v1.hatchery.deathWatch[room.name] = {};
    const { live, soonDead, deathWatch } = scanCreeps(room);
    Memory.v1.hatchery.deathWatch[room.name] = deathWatch;
    const locked = isEconomyLocked(room);
    const targets = computeTargets(room, getHealth(room));
    const roleOrder = ['harvester', 'hauler', 'builder', 'upgrader', 'defender', 'scout', 'claimer', 'attacker', 'healer'];
    for (const role of roleOrder) {
        const target = targets[role] || 0;
        if (locked && role !== 'harvester' && role !== 'hauler')
            continue;
        const alive = live[role] || 0;
        const dying = soonDead[role] || 0;
        const need = Math.max(0, target + dying - alive);
        if (need <= 0)
            continue;
        const basePrio = ROLE_PRIORITIES[role] || Priority.NORMAL;
        let priority = basePrio;
        const dw = deathWatch[role] || [];
        const minTtl = dw.length > 0 ? Math.min(...dw.map(e => e.ttl)) : 999;
        if (minTtl < 20)
            priority = Math.min(priority, 50);
        else if (minTtl < 100)
            priority = Math.min(priority, 150);
        const bodyDef = DEFAULT_BODIES[role] || DEFAULT_BODIES.harvester;
        const spawnReq = {
            role,
            priority,
            body: bodyDef,
            count: need,
            memory: {},
            createdAt: Game.time,
            roomName: room.name,
        };
        request(spawnReq);
    }
    maybeRequestRoomExpansion(room);
}

// src/lib/Memory.ts
const CURRENT_NS = 'v1';
const ENGINE_KEYS = {
    creeps: true,
    rooms: true,
    flags: true,
    powerCreeps: true,
};
function ensureRoomMemory(room) {
    // Nothing required — layout is optional
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

const TERRAIN_VERSION = 1;
function isWalkable(matrix, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49)
        return false;
    return matrix.get(x, y) < 255;
}
function getTerrainMatrix(roomName) {
    const ns = Memory[CURRENT_NS];
    if (!ns) {
        Memory[CURRENT_NS] = {};
    }
    if (!ns.pathing)
        ns.pathing = {};
    if (!ns.pathing.terrain)
        ns.pathing.terrain = {};
    const cached = ns.pathing.terrain[roomName];
    if (cached && cached.version === TERRAIN_VERSION) {
        return PathFinder.CostMatrix.deserialize(cached.matrix);
    }
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const t = terrain.get(x, y);
            if (t === TERRAIN_MASK_WALL) {
                matrix.set(x, y, 255);
            }
            else if (t === TERRAIN_MASK_SWAMP) {
                matrix.set(x, y, 10);
            }
            else {
                matrix.set(x, y, 2);
            }
        }
    }
    ns.pathing.terrain[roomName] = {
        matrix: matrix.serialize(),
        tick: Game.time,
        version: TERRAIN_VERSION,
    };
    return matrix;
}
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
function getStructureMatrix(room) {
    const ns = Memory[CURRENT_NS];
    if (!ns.pathing)
        ns.pathing = {};
    if (!ns.pathing.structureCache)
        ns.pathing.structureCache = {};
    const currentSig = computeStructSig(room);
    const cached = ns.pathing.structureCache[room.name];
    if (cached && cached.structSig === currentSig) {
        return PathFinder.CostMatrix.deserialize(cached.matrix);
    }
    const matrix = getTerrainMatrix(room.name);
    const costs = new PathFinder.CostMatrix();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            costs.set(x, y, matrix.get(x, y));
        }
    }
    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (s.structureType === STRUCTURE_ROAD) {
            costs.set(s.pos.x, s.pos.y, 1);
        }
        else if (s.structureType === STRUCTURE_CONTAINER) {
            costs.set(s.pos.x, s.pos.y, 1);
        }
        else if (s.structureType === STRUCTURE_RAMPART && s.my) {
            costs.set(s.pos.x, s.pos.y, 1);
        }
        else if (!s.isWalkable) {
            costs.set(s.pos.x, s.pos.y, 255);
        }
    }
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (!site.isWalkable) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    }
    ns.pathing.structureCache[room.name] = {
        matrix: costs.serialize(),
        structSig: currentSig,
    };
    return costs;
}
function findRoute(origin, destination, opts = {}) {
    const highwayBias = opts.preferHighway ? 2.5 : 1;
    const restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 10;
    const ret = Game.map.findRoute(origin, destination, {
        routeCallback: (roomName) => {
            const range = Game.map.getRoomLinearDistance(origin, roomName);
            if (range > restrictDistance)
                return Number.POSITIVE_INFINITY;
            if (opts.avoidHostile !== false) {
                const mem = Memory.rooms?.[roomName];
                if (mem && mem.avoid && roomName !== destination && roomName !== origin) {
                    return Number.POSITIVE_INFINITY;
                }
            }
            return highwayBias;
        },
    });
    if (!Array.isArray(ret))
        return undefined;
    const allowedRooms = { [origin]: true, [destination]: true };
    for (const value of ret) {
        allowedRooms[value.room] = true;
    }
    return allowedRooms;
}
function findPath(origin, destination, opts = {}) {
    const defaults = {
        ignoreCreeps: true,
        maxOps: 20000,
        range: 1,
        terrainCosts: { plainCost: 2, swampCost: 10 },
    };
    const options = { ...defaults, ...opts };
    const roomDistance = Game.map.getRoomLinearDistance(origin.roomName, destination.roomName);
    const useRoute = options.maxRooms !== 1 && (roomDistance > 2 || (options.maxRooms && options.maxRooms > 1));
    const allowedRooms = useRoute ? findRoute(origin.roomName, destination.roomName, options) : undefined;
    const roomCallback = (roomName) => {
        if (allowedRooms && !allowedRooms[roomName])
            return false;
        if (options.avoidHostile !== false) {
            const mem = Memory.rooms?.[roomName];
            if (mem && mem.avoid && roomName !== origin.roomName && roomName !== destination.roomName) {
                return false;
            }
        }
        const room = Game.rooms[roomName];
        if (room) {
            return getStructureMatrix(room);
        }
        return true;
    };
    return PathFinder.search(origin, { pos: destination, range: options.range }, {
        maxOps: options.maxOps,
        maxRooms: options.maxRooms,
        plainCost: options.terrainCosts.plainCost,
        swampCost: options.terrainCosts.swampCost,
        roomCallback,
    });
}

function normalizePos(destination) {
    if (screeps.hasPos(destination)) {
        return destination.pos;
    }
    return destination;
}
function isExit(pos) {
    return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}
function sameCoord(pos1, pos2) {
    return pos1.x === pos2.x && pos1.y === pos2.y;
}
function getTerrainCosts(creep) {
    let weighted = 0;
    let moveParts = 0;
    for (const part of creep.body) {
        switch (part.type) {
            case MOVE:
                moveParts++;
                break;
            case CARRY:
                break;
            default:
                weighted++;
        }
    }
    if (moveParts === 0)
        moveParts = 1;
    const carryUsed = creep.store.getUsedCapacity();
    weighted += Math.ceil(carryUsed / CARRY_CAPACITY);
    const ratio = Math.ceil(weighted / moveParts);
    return {
        plainCost: Math.max(ratio, 1),
        swampCost: Math.max(ratio * 5, 5),
    };
}

const MOVE_PRIORITY = {
    harvester: 1,
    defender: 2,
    hauler: 3,
    builder: 4,
    upgrader: 5,
    scout: 9,
};
const DEFAULT_PRIORITY = 10;
const STUCK_THRESHOLD = 2;
const TRAFFIC_THRESHOLD = 100;
const DIR_OFFSETS = {
    1: { dx: 0, dy: -1 },
    2: { dx: 1, dy: -1 },
    3: { dx: 1, dy: 0 },
    4: { dx: 1, dy: 1 },
    5: { dx: 0, dy: 1 },
    6: { dx: -1, dy: 1 },
    7: { dx: -1, dy: 0 },
    8: { dx: -1, dy: -1 },
};
function oppositeDir(dir) {
    return ((dir + 3) % 8 + 1);
}
function getPushPriority(creep) {
    return MOVE_PRIORITY[creep.memory.role] ?? DEFAULT_PRIORITY;
}
function serializePath(startPos, path) {
    let result = '';
    let last = startPos;
    for (const pos of path) {
        if (pos.roomName === last.roomName) {
            result += last.getDirectionTo(pos);
        }
        last = pos;
    }
    return result;
}
function isStuck(creep) {
    const last = creep.memory._lastPos;
    if (!last) {
        creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
        return false;
    }
    if (creep.pos.x === last.x && creep.pos.y === last.y && creep.room.name === last.roomName) {
        creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
    }
    else {
        creep.memory._stuckTicks = 0;
    }
    creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
    return (creep.memory._stuckTicks || 0) > STUCK_THRESHOLD;
}
function tryPush(creep, dir) {
    const offset = DIR_OFFSETS[dir];
    if (!offset)
        return false;
    const x = creep.pos.x + offset.dx;
    const y = creep.pos.y + offset.dy;
    if (x < 0 || x > 49 || y < 0 || y > 49)
        return true;
    const blocking = creep.room.lookForAt(LOOK_CREEPS, x, y)[0];
    if (!blocking)
        return true;
    if (getPushPriority(creep) >= getPushPriority(blocking))
        return false;
    const dirs = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const d of dirs) {
        const off = DIR_OFFSETS[d];
        const nx = blocking.pos.x + off.dx;
        const ny = blocking.pos.y + off.dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49)
            continue;
        const terrain = blocking.room.lookForAt(LOOK_TERRAIN, nx, ny)[0];
        if (terrain === 'wall')
            continue;
        if (blocking.room.lookForAt(LOOK_CREEPS, nx, ny).length > 0)
            continue;
        if (blocking.room.lookForAt(LOOK_STRUCTURES, nx, ny).some(s => !s.isWalkable))
            continue;
        const result = blocking.move(d);
        if (result === OK) {
            if (blocking.memory._path) {
                blocking.memory._path = oppositeDir(d) + blocking.memory._path;
            }
            return true;
        }
    }
    return false;
}
function recordTraffic(creep) {
    const roomName = creep.room.name;
    if (!Memory.v1)
        return;
    const ns = Memory.v1;
    if (!ns.pathing)
        ns.pathing = {};
    if (!ns.pathing.traffic)
        ns.pathing.traffic = {};
    if (!ns.pathing.traffic[roomName])
        ns.pathing.traffic[roomName] = {};
    const key = creep.pos.x + ',' + creep.pos.y;
    const heatmap = ns.pathing.traffic[roomName];
    heatmap[key] = (heatmap[key] || 0) + 1;
    if (heatmap[key] >= TRAFFIC_THRESHOLD) {
        if (!ns.pathing.pendingRoads)
            ns.pathing.pendingRoads = [];
        ns.pathing.pendingRoads.push({ roomName, x: creep.pos.x, y: creep.pos.y });
        heatmap[key] = 0;
    }
}
function moveTo(creep, target, opts) {
    if (creep.fatigue > 0)
        return ERR_TIRED;
    if (creep.spawning)
        return ERR_BUSY;
    const dest = normalizePos(target);
    const range = opts?.range ?? 1;
    const rangeTo = creep.pos.getRangeTo(dest);
    if (rangeTo <= range)
        return ERR_NOT_IN_RANGE;
    if (!creep.memory._path)
        creep.memory._path = '';
    if (!creep.memory._stuckTicks)
        creep.memory._stuckTicks = 0;
    const stuck = isStuck(creep);
    if (stuck && Math.random() > 0.5) {
        creep.memory._path = '';
    }
    if (!creep.memory._path || creep.memory._path.length === 0) {
        const terrainCosts = getTerrainCosts(creep);
        const ret = findPath(creep.pos, dest, {
            ...opts,
            terrainCosts,
            ignoreCreeps: true,
        });
        if (ret.incomplete)
            return ERR_NO_PATH;
        creep.memory._path = serializePath(creep.pos, ret.path);
    }
    if (!creep.memory._path || creep.memory._path.length === 0)
        return ERR_NO_PATH;
    const dir = parseInt(creep.memory._path[0], 10);
    if (!tryPush(creep, dir)) {
        return ERR_BUSY;
    }
    const result = creep.move(dir);
    if (result === OK) {
        creep.memory._path = creep.memory._path.slice(1);
        recordTraffic(creep);
    }
    return result;
}

// src/lib/TaskManager.ts
function getTask(creep) {
    return creep.memory.task || null;
}
function setTask(creep, type, targetId) {
    creep.memory.task = { type, targetId };
}
function clearTask(creep) {
    delete creep.memory.task;
}
function isValidTask(creep) {
    const task = creep.memory.task;
    if (!task || !task.targetId)
        return false;
    const target = Game.getObjectById(task.targetId);
    if (!target)
        return false;
    switch (task.type) {
        case 'harvest':
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        case 'transfer':
            return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        case 'withdraw':
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && target.store[RESOURCE_ENERGY] > 0;
        case 'pickup':
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        case 'build':
            return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        case 'repair':
            return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && target.hits < target.hitsMax;
        case 'upgrade':
            return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        case 'dismantle':
            return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        case 'recharge':
            return creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        default:
            return false;
    }
}
function executeTask(creep) {
    const task = creep.memory.task;
    if (!task || !task.targetId)
        return 'invalid';
    const target = Game.getObjectById(task.targetId);
    if (!target) {
        clearTask(creep);
        return 'invalid';
    }
    let result;
    switch (task.type) {
        case 'harvest':
            result = creep.harvest(target);
            break;
        case 'transfer':
            result = creep.transfer(target, RESOURCE_ENERGY);
            break;
        case 'withdraw':
            result = creep.withdraw(target, RESOURCE_ENERGY);
            break;
        case 'pickup':
            result = creep.pickup(target);
            break;
        case 'build':
            result = creep.build(target);
            break;
        case 'repair':
            result = creep.repair(target);
            break;
        case 'upgrade':
            result = creep.upgradeController(target);
            break;
        case 'dismantle':
            result = creep.dismantle(target);
            break;
        case 'recharge':
            if (target instanceof Resource) {
                result = creep.pickup(target);
            }
            else if (target instanceof Tombstone) {
                result = creep.withdraw(target, RESOURCE_ENERGY);
            }
            else {
                result = creep.withdraw(target, RESOURCE_ENERGY);
            }
            break;
        default:
            return 'invalid';
    }
    if (result === OK) {
        switch (task.type) {
            case 'harvest':
                if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    clearTask(creep);
                    return 'ok';
                }
                break;
            case 'transfer':
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                    clearTask(creep);
                    return 'ok';
                }
                break;
            case 'withdraw':
            case 'pickup':
            case 'recharge':
                if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    clearTask(creep);
                    return 'ok';
                }
                break;
            case 'build':
            case 'repair':
            case 'upgrade':
            case 'dismantle':
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                    clearTask(creep);
                    return 'ok';
                }
                break;
        }
        return 'ok';
    }
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, target);
        return 'working';
    }
    if (result === ERR_INVALID_TARGET) {
        clearTask(creep);
        return 'invalid';
    }
    return 'working';
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
        const harvesterCount = harvesters.filter((h) => h.memory.task?.targetId === source.id).length;
        const score = dist * 10 + harvesterCount;
        if (score < bestScore) {
            bestScore = score;
            best = source;
        }
    }
    return best;
}
function findDropOff$1(creep) {
    const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => ((s.structureType === STRUCTURE_CONTAINER ||
            s.structureType === STRUCTURE_STORAGE) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (targets.length > 0) {
        return creep.pos.findClosestByPath(targets);
    }
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
function actionHarvest(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'harvest' && isValidTask(creep))
        return true;
    const source = findSource(creep);
    if (!source)
        return false;
    setTask(creep, 'harvest', source.id);
    const totalAdj = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ].filter(d => {
        const x = source.pos.x + d.dx, y = source.pos.y + d.dy;
        if (x < 0 || x >= 50 || y < 0 || y >= 50)
            return false;
        return getTerrainMatrix(creep.room.name).get(x, y) < 255;
    }).length;
    const busyAdj = source.pos.findInRange(FIND_MY_CREEPS, 1)
        .filter((c) => c.pos.getRangeTo(source) === 1).length;
    if (busyAdj >= totalAdj && totalAdj > 0 && creep.pos.getRangeTo(source) <= 1) {
        const freeSpots = [
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
        ]
            .map(d => new RoomPosition(source.pos.x + d.dx, source.pos.y + d.dy, creep.room.name))
            .filter(p => {
            if (p.x < 0 || p.x >= 50 || p.y < 0 || p.y >= 50)
                return false;
            return getTerrainMatrix(creep.room.name).get(p.x, p.y) < 255
                && creep.room.lookForAt(LOOK_CREEPS, p.x, p.y).length === 0;
        });
        if (freeSpots.length > 0) {
            moveTo(creep, freeSpots[0]);
            return true;
        }
    }
    return true;
}
function actionTransfer$1(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'transfer' && isValidTask(creep))
        return true;
    const dropOff = findDropOff$1(creep);
    if (!dropOff)
        return false;
    setTask(creep, 'transfer', dropOff.id);
    return true;
}
const PRIORITY$3 = [
    actionHarvest,
    actionTransfer$1,
];
function run$4(creep) {
    if (isValidTask(creep)) {
        const result = executeTask(creep);
        if (result !== 'invalid')
            return;
    }
    for (const action of PRIORITY$3) {
        if (action(creep)) {
            executeTask(creep);
            return;
        }
    }
}

function findEnergy(creep) {
    const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (droppedEnergy.length > 0) {
        return creep.pos.findClosestByPath(droppedEnergy);
    }
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_CONTAINER &&
            s.store[RESOURCE_ENERGY] > 0)
    });
    if (containers.length > 0) {
        return creep.pos.findClosestByPath(containers);
    }
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_STORAGE &&
            s.store[RESOURCE_ENERGY] > 0)
    });
    if (storage.length > 0) {
        return storage[0];
    }
    return null;
}
function findDropOff(creep) {
    const targets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => ((s.structureType === STRUCTURE_SPAWN ||
            s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (targets.length > 0) {
        return creep.pos.findClosestByPath(targets);
    }
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_STORAGE &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    });
    if (storage.length > 0) {
        return storage[0];
    }
    return null;
}
function actionPickup(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'pickup' && isValidTask(creep))
        return true;
    const energy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (energy.length === 0)
        return false;
    const closest = creep.pos.findClosestByPath(energy);
    if (!closest)
        return false;
    setTask(creep, 'pickup', closest.id);
    return true;
}
function actionWithdraw(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'withdraw' && isValidTask(creep))
        return true;
    const energy = findEnergy(creep);
    if (!energy)
        return false;
    setTask(creep, 'withdraw', energy.id);
    return true;
}
function actionTransfer(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'transfer' && isValidTask(creep))
        return true;
    const dropOff = findDropOff(creep);
    if (!dropOff)
        return false;
    setTask(creep, 'transfer', dropOff.id);
    return true;
}
const PRIORITY$2 = [
    actionPickup,
    actionWithdraw,
    actionTransfer,
];
function run$3(creep) {
    if (isValidTask(creep)) {
        const result = executeTask(creep);
        if (result !== 'invalid')
            return;
    }
    for (const action of PRIORITY$2) {
        if (action(creep)) {
            executeTask(creep);
            return;
        }
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
function findRechargeSource(creep) {
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    });
    if (containers.length > 0)
        return creep.pos.findClosestByPath(containers);
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
    });
    if (storage.length > 0)
        return storage[0];
    return null;
}
function actionDismantle(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    const layout = creep.room.memory.layout;
    const swapPlan = layout?.swap;
    if (!swapPlan || swapPlan.destroy.length === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'dismantle' && isValidTask(creep))
        return true;
    let demolishCount = 0;
    for (let i = 0; i < swapPlan.destroy.length && demolishCount < MAX_DEMOLISH_PER_TICK; i++) {
        const structureId = swapPlan.destroy[i];
        const structure = Game.getObjectById(structureId);
        if (!structure) {
            swapPlan.destroy.splice(i, 1);
            i--;
            continue;
        }
        const alreadyTargeted = Object.values(Game.creeps).some(c => c.memory.role === 'builder' && c.memory.task?.targetId === structureId && c.name !== creep.name);
        if (alreadyTargeted)
            continue;
        setTask(creep, 'dismantle', structureId);
        return true;
    }
    return false;
}
function actionBuildFromSwap(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    const layout = creep.room.memory.layout;
    const swapPlan = layout?.swap;
    if (!swapPlan || swapPlan.build.length === 0)
        return false;
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    for (const entry of swapPlan.build) {
        const site = sites.find(s => s.pos.isEqualTo(entry.pos) && s.structureType === entry.structureType);
        if (site) {
            setTask(creep, 'build', site.id);
            return true;
        }
    }
    return false;
}
function actionBuild(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'build' && isValidTask(creep))
        return true;
    const site = findConstructionSite(creep);
    if (!site)
        return false;
    setTask(creep, 'build', site.id);
    return true;
}
function actionRepair(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'repair' && isValidTask(creep))
        return true;
    const structure = findDamagedStructure(creep);
    if (!structure)
        return false;
    setTask(creep, 'repair', structure.id);
    return true;
}
function actionRecharge$1(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'recharge' && isValidTask(creep))
        return true;
    const source = findRechargeSource(creep);
    if (!source)
        return false;
    setTask(creep, 'recharge', source.id);
    return true;
}
const PRIORITY$1 = [
    actionDismantle,
    actionBuildFromSwap,
    actionBuild,
    actionRepair,
    actionRecharge$1,
];
function run$2(creep) {
    if (isValidTask(creep)) {
        const result = executeTask(creep);
        if (result !== 'invalid')
            return;
    }
    for (const action of PRIORITY$1) {
        if (action(creep)) {
            executeTask(creep);
            return;
        }
    }
}

function findEnergySource(creep) {
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    });
    if (containers.length > 0)
        return creep.pos.findClosestByPath(containers);
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0
    });
    if (storage.length > 0)
        return storage[0];
    const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (dropped.length > 0)
        return creep.pos.findClosestByPath(dropped);
    return null;
}
function actionUpgrade(creep) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'upgrade' && isValidTask(creep))
        return true;
    const controller = creep.room.controller;
    if (!controller)
        return false;
    setTask(creep, 'upgrade', controller.id);
    return true;
}
function actionRecharge(creep) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        return false;
    let task = getTask(creep);
    if (task && task.type === 'recharge' && isValidTask(creep))
        return true;
    const source = findEnergySource(creep);
    if (!source)
        return false;
    setTask(creep, 'recharge', source.id);
    return true;
}
const PRIORITY = [
    actionUpgrade,
    actionRecharge,
];
function run$1(creep) {
    if (isValidTask(creep)) {
        const result = executeTask(creep);
        if (result !== 'invalid')
            return;
    }
    for (const action of PRIORITY) {
        if (action(creep)) {
            executeTask(creep);
            return;
        }
    }
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
        const { buildBudget } = getBudget(room);
        return buildBudget >= cost;
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
    const roomName = room.name;
    const roads = new Map();
    const claim = new Set();
    claim.add(core.spawn.x + ',' + core.spawn.y);
    claim.add(core.storage.x + ',' + core.storage.y);
    claim.add(core.terminal.x + ',' + core.terminal.y);
    for (const ext of extensions) {
        claim.add(ext.x + ',' + ext.y);
    }
    // BFS from core to controller
    if (room.controller) {
        const ctrl = room.controller.pos;
        const queue = [ctrl];
        const visited = new Set();
        visited.add(ctrl.x + ',' + ctrl.y);
        while (queue.length > 0) {
            const cur = queue.shift();
            const key = cur.x + ',' + cur.y;
            if (claim.has(key))
                break;
            if (!roads.has(key) && isWalkable(matrix, cur.x, cur.y)) {
                roads.set(key, cur);
            }
            for (const adj of getAdjacentWalkable(matrix, cur)) {
                const k = adj.x + ',' + adj.y;
                if (!visited.has(k)) {
                    visited.add(k);
                    queue.push(adj);
                }
            }
        }
    }
    return Array.from(roads.values());
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
    // Check roads
    const existingRoads = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_ROAD
    });
    const roadPosSet = new Set(layout.roads.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const road of existingRoads) {
        if (!roadPosSet.has(road.pos.x + ',' + road.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, road)) {
                destroy.push(road.id);
            }
        }
    }
    for (const roadPos of layout.roads) {
        const exists = existingRoads.some(r => r.pos.isEqualTo(roadPos));
        if (!exists) {
            build.push({ pos: roadPos, structureType: STRUCTURE_ROAD });
        }
    }
    // Check ramparts
    const existingRamparts = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_RAMPART
    });
    const rampartPosSet = new Set(layout.ramparts.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const r of existingRamparts) {
        if (!rampartPosSet.has(r.pos.x + ',' + r.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, r)) {
                destroy.push(r.id);
            }
        }
    }
    for (const rPos of layout.ramparts) {
        const exists = existingRamparts.some(r => r.pos.isEqualTo(rPos));
        if (!exists) {
            build.push({ pos: rPos, structureType: STRUCTURE_RAMPART });
        }
    }
    // Check walls
    const existingWalls = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_WALL
    });
    const wallPosSet = new Set(layout.walls.map(p => p.x + ',' + p.y + ',' + roomName));
    for (const w of existingWalls) {
        if (!wallPosSet.has(w.pos.x + ',' + w.pos.y + ',' + roomName)) {
            if (isSafeToDestroy(room, w)) {
                destroy.push(w.id);
            }
        }
    }
    for (const wPos of layout.walls) {
        const exists = existingWalls.some(w => w.pos.isEqualTo(wPos));
        if (!exists) {
            build.push({ pos: wPos, structureType: STRUCTURE_WALL });
        }
    }
    // Sort build list by priority
    const sortedBuild = sortByPriority(build);
    // Filter to items affordable within buildBudget
    const { buildBudget } = getBudget(room);
    let totalCost = 0;
    const affordable = sortedBuild.filter(entry => {
        const cost = REBUILD_COSTS[entry.structureType] || 0;
        if (totalCost + cost <= buildBudget) {
            totalCost += cost;
            return true;
        }
        return false;
    });
    return {
        destroy,
        build: affordable,
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
    const cf = Memory.v1.cashflow?.[room.name];
    const income = cf?.incomeRate || 0;
    const spawn = cf?.spawnRate || 0;
    const build = cf?.buildRate || 0;
    const net = income - spawn - build;
    const health = getHealth(room);
    const reserve = computeEmergencyReserve(room);
    drawPanel(vis, 35, 0.5, [
        ['Cashflow', ''],
        ['In: +' + income.toFixed(1) + '/t', ''],
        ['Spawn: -' + spawn.toFixed(1) + '/t', ''],
        ['Build: -' + build.toFixed(1) + '/t', ''],
        ['Net:', (net >= 0 ? '+' : '') + net.toFixed(1) + '/t'],
        ['Health: ' + health.toUpperCase(), 'Rsv: ' + reserve.toLocaleString()],
    ], 16);
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
function runCreeps(room) {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.roomName !== room.name)
            continue;
        ensureCreepMemory(creep);
        switch (creep.memory.role) {
            case 'harvester':
                run$4(creep);
                break;
            case 'hauler':
                run$3(creep);
                break;
            case 'builder':
                run$2(creep);
                break;
            case 'upgrader':
                run$1(creep);
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
    const { buildBudget } = getBudget(room);
    if (buildBudget <= 0)
        return;
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
        // Queen evaluates colony needs and submits spawn requests
        tick(room);
        // Track energy for cashflow
        const prevTotal = Memory.v1._prevTotalEnergy?.[roomName] ?? -1;
        const currentTotal = room.energyAvailable + (room.storage ? room.storage.store[RESOURCE_ENERGY] : 0);
        if (prevTotal >= 0) {
            trackIncome(roomName, currentTotal, prevTotal);
        }
        if (!Memory.v1._prevTotalEnergy)
            Memory.v1._prevTotalEnergy = {};
        Memory.v1._prevTotalEnergy[roomName] = currentTotal;
        // Terrain and layout planning — cache every 100 ticks
        getTerrainMatrix(room.name);
        if (Game.time % 100 === 0 || !room.memory.layout || !room.memory.layout.lastUpdated) {
            const health = getHealth(room);
            if (health !== 'red' || !room.memory.layout) {
                const layout = planLayout(room);
                const swapPlan = planSwap(room, layout);
                room.memory.layout = { bunker: layout, swap: swapPlan, lastUpdated: Game.time };
            }
        }
        // Create construction sites from swap plan
        createConstructionSites(room);
        // Drain pending roads from traffic heatmap (up to 5 per tick)
        drainPendingRoads(room);
        // Periodic layout rechecking
        recheckLayout(room);
        // Hatchery processes queue and spawns highest priority request
        process(room);
        // Run existing creeps
        runCreeps(room);
        // Track construction progress for build rate
        const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
        let progressDelta = 0;
        for (const site of sites) {
            const prev = Memory.v1._prevProgress?.[site.id] || site.progress;
            progressDelta += Math.max(0, site.progress - prev);
            if (!Memory.v1._prevProgress)
                Memory.v1._prevProgress = {};
            Memory.v1._prevProgress[site.id] = site.progress;
        }
        if (progressDelta > 0) {
            trackBuild(roomName, progressDelta);
        }
        run(room);
    }
};

exports.loop = loop;
