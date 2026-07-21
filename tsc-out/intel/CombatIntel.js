// Combat Intel - provides information related to making combat-related decisions
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CombatIntel_1;
import { log } from '../console/log';
import { isCreep, isOwnedStructure, isStandardZerg, isStructure } from '../declarations/typeGuards';
import { Mem } from '../memory/Memory';
import { Pathing } from '../movement/Pathing';
import { profile } from '../profiler/decorator';
import { BOOST_TIERS } from '../resources/map_resources';
import { Cartographer } from '../utilities/Cartographer';
import { Visualizer } from '../visuals/Visualizer';
import { toCreep } from '../zerg/Zerg';
import { RoomIntel } from './RoomIntel';
const getDefaultCombatIntelMemory = () => ({
    cache: {
        tick: Game.time,
    }
});
let CombatIntel = CombatIntel_1 = class CombatIntel {
    constructor(directive) {
        this.directive = directive;
    }
    get memory() {
        return Mem.wrap(this.directive.memory, 'combatIntel', getDefaultCombatIntelMemory);
    }
    get room() {
        return this.directive.room;
    }
    get colony() {
        return this.directive.colony;
    }
    // Tower damage ====================================================================================================
    /**
     * Get the tower damage at a given range
     */
    static singleTowerDamage(range) {
        if (range <= TOWER_OPTIMAL_RANGE) {
            return TOWER_POWER_ATTACK;
        }
        range = Math.min(range, TOWER_FALLOFF_RANGE);
        const falloff = (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
        return TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * falloff);
    }
    /**
     * Total tower damage from all towers in room at a given position
     * TODO needs to address stronghold
     */
    static towerDamageAtPos(pos, ignoreEnergy = false) {
        if (pos.room) {
            let expectedDamage = 0;
            for (const tower of pos.room.towers) {
                if ((tower.energy > 0 || ignoreEnergy)) {
                    expectedDamage += this.singleTowerDamage(pos.getRangeTo(tower));
                }
            }
            return expectedDamage;
        }
        else {
            log.warning(`CombatIntel.towerDamageAtPos: room visibility at ${pos.print}!`);
            return 0;
        }
    }
    // Cost matrix calculations
    computeCostMatrix() {
        if (this.room) {
            const matrix = new PathFinder.CostMatrix();
            const barriers = this.room.barriers;
            if (barriers.length > 0) {
                const highestHits = _.last(_.sortBy(barriers, barrier => barrier.hits)).hits;
                for (const barrier of barriers) {
                    matrix.set(barrier.pos.x, barrier.pos.y, Math.ceil(barrier.hits * 10 / highestHits) * 10);
                }
            }
            return matrix;
        }
    }
    /**
     * Calculates the total potential damage per tile in a region
     */
    static computeCreepDamagePotentialMatrix(room, creeps, startingMatrix) {
        if (room) {
            const cpuUsed = Game.cpu.getUsed();
            const matrix = startingMatrix || new PathFinder.CostMatrix();
            // const otherMatrix = new Array(50);
            // otherMatrix.forEach((loc, index) => otherMatrix[index] = new Array(50));
            creeps.forEach(creep => {
                const meleeAttack = CombatIntel_1.getAttackPotential(creep);
                const rangedAttack = CombatIntel_1.getRangedAttackPotential(creep);
                // const heal = CombatIntel.getHealPotential(creep);
                if (meleeAttack > 0) {
                    creep.pos.neighbors.forEach(pos => matrix.set(pos.x, pos.y, matrix.get(pos.x, pos.y) + meleeAttack * ATTACK_POWER / 100));
                }
                if (rangedAttack > 0) {
                    creep.pos.getPositionsInRange(3).forEach(pos => matrix.set(pos.x, pos.y, matrix.get(pos.x, pos.y) + rangedAttack * RANGED_ATTACK_POWER / 100));
                }
            });
            Visualizer.displayCostMatrix(matrix, room.name);
            console.log(`Cost matrix cpu used in ${room.print} = ${(Game.cpu.getUsed() - cpuUsed)}`);
            return matrix;
        }
    }
    /**
     * Calculates potential damage and heal per location in a region
     */
    static computeTotalCreepPotentialMatrix(room, creeps, startingMatrix) {
        if (room) {
            const cpuUsed = Game.cpu.getUsed();
            const matrix = startingMatrix || new PathFinder.CostMatrix();
            // const otherMatrix = new Array(50);
            // otherMatrix.forEach((loc, index) => otherMatrix[index] = new Array(50));
            creeps.forEach(creep => {
                const meleeAttack = CombatIntel_1.getAttackPotential(creep);
                const rangedAttack = CombatIntel_1.getRangedAttackPotential(creep);
                // const heal = CombatIntel.getHealPotential(creep);
                if (meleeAttack > 0) {
                    creep.pos.neighbors.forEach(pos => matrix.set(pos.x, pos.y, matrix.get(pos.x, pos.y) + meleeAttack * ATTACK_POWER / 100));
                }
                if (rangedAttack > 0) {
                    creep.pos.getPositionsInRange(3).forEach(pos => matrix.set(pos.x, pos.y, matrix.get(pos.x, pos.y) + rangedAttack * RANGED_ATTACK_POWER / 100));
                }
            });
            Visualizer.displayCostMatrix(matrix, room.name);
            console.log(`Cost matrix cpu used in ${room.print} = ${(Game.cpu.getUsed() - cpuUsed)}`);
            return matrix;
        }
    }
    // Fallback and exit calculations ==================================================================================
    findBestExit(matrix, towers, spawns) {
        if (!this.room) {
            return;
        }
        let bestExit;
        const destination = this.room.spawns[0] || this.room.storage; // enemy structure you are trying to get to
        if (!destination) {
            return;
        }
        const ret = Pathing.findPath(this.colony.pos, destination.pos, { range: 1 });
        if (!ret.incomplete) {
            bestExit = _.find(ret.path, p => p.roomName == this.room.name);
        }
        // Figure out possible exits to go from enemy room back to colony in a reasonable amount of time
        const maxRoomDistance = 8;
        const allowedExits = {};
        if (!bestExit) {
            const exitData = Game.map.describeExits(this.room.name);
            for (const direction in exitData) {
                const roomName = exitData[direction];
                const allowedRooms = Pathing.findRoute(this.colony.name, roomName);
                if (allowedRooms && Object.keys(allowedRooms).length <= maxRoomDistance) {
                    allowedExits[direction] = true;
                }
            }
            if (_.keys(allowedExits).length == 0) {
                return;
            }
        }
        const exitPositions = [];
        const terrain = Game.map.getRoomTerrain(this.room.name);
        for (let x = 0; x < 50; x += 49) {
            for (let y = 0; y < 50; y++) {
                if (x !== 0 && y !== 0 && x !== 49 && y !== 49) {
                    continue;
                }
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    continue;
                }
                matrix.set(x, y, 0xff);
                if (bestExit) {
                    continue;
                }
                if (allowedExits['1'] && y === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits['3'] && x === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits['5'] && y === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits['7'] && x === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
            }
        }
        if (!bestExit) {
            bestExit = _(exitPositions)
                .sortBy((p) => -_.sum(towers, (t) => p.getRangeTo(t)))
                .head();
        }
        matrix.set(bestExit.x, bestExit.y, 1);
        return bestExit;
    }
    // static findBestSiegeExit(roomName: string, matrix?: CostMatrix): RoomPosition | undefined  {
    // 	let edgeCoords: [number, number][] = [];
    // 	for (let x = 0; x < 50; x += 49) {
    // 		for (let y = 0; y < 50; y++) {
    // 			edgeCoords.push([x,y])
    // 		}
    // 	}
    // 	for (let x = 0; x < 50; x++) {
    // 		for (let y = 0; y < 50; y += 49) {
    // 			edgeCoords.push([x,y])
    // 		}
    // 	}
    //
    // 	const room = Game.rooms[roomName];
    // 	let siegeTarget = CombatTargeting.findBestStructureTarget()
    // }
    /**
     * Simple routine to find an assembly point outside of the target room
     */
    findSimpleSiegeFallback() {
        const ret = Pathing.findPath(this.colony.pos, this.directive.pos, { range: 23 });
        if (ret.incomplete) {
            log.warning(`Incomplete path while finding fallback! Destination: ${this.directive.pos.print}`);
        }
        const firstPosInRoom = _.find(ret.path, pos => pos.roomName == this.directive.pos.roomName);
        if (firstPosInRoom) {
            return CombatIntel_1.getFallbackFrom(firstPosInRoom);
        }
        else {
            return CombatIntel_1.getFallbackFrom(this.directive.pos);
        }
    }
    /**
     * Finds a location for a swarm to assemble outside of the target room
     */
    findSwarmAssemblyPoint(clearance, swarmIndex = 0) {
        const simpleFallback = this.findSimpleSiegeFallback();
        const startPos = Pathing.findPathablePosition(simpleFallback.roomName, clearance);
        let ret = Pathing.findSwarmPath(startPos, this.directive.pos, clearance.width, clearance.height);
        if (ret.incomplete) {
            log.debug(`Incomplete swarm path to find assembly point. Retrying with startpos = fallback.`);
            ret = Pathing.findSwarmPath(simpleFallback, this.directive.pos, clearance.width, clearance.height);
            if (ret.incomplete) {
                log.warning(`No pathable assembly point!`);
            }
        }
        const path = ret.path.reverse();
        const acceptablePositions = _.filter(path, pos => pos.roomName == simpleFallback.roomName &&
            pos.rangeToEdge > 1);
        const swarmSize = Math.max(clearance.width, clearance.height);
        const posIndex = (swarmSize + 1) * swarmIndex;
        return acceptablePositions[posIndex] || acceptablePositions[0] || simpleFallback;
    }
    /**
     * Finds a location for a swarm to assemble within an owned room
     */
    findSwarmAssemblyPointInColony(clearance, swarmIndex = 0) {
        // let ret = Pathing.findSwarmPath(this.colony.pos, this.directive.pos, clearance.width, clearance.height,
        // 								{ignoreCreeps: true});
        const ret = Pathing.findPath(this.colony.pos, this.directive.pos);
        const path = ret.path.reverse();
        const acceptablePositions = _.filter(path, pos => pos.roomName == this.colony.name && pos.rangeToEdge > 1);
        const swarmSize = Math.max(clearance.width, clearance.height);
        const posIndex = (swarmSize + 1) * swarmIndex;
        return acceptablePositions[posIndex] || acceptablePositions[0];
    }
    /**
     * Fallback is a location on the other side of the nearest exit the directive is placed at
     */
    static getFallbackFrom(pos, fallbackDistance = 2) {
        let { x, y, roomName } = pos;
        const rangesToExit = [[x, 'left'], [49 - x, 'right'], [y, 'top'], [49 - y, 'bottom']];
        const [range, direction] = _.first(_.sortBy(rangesToExit, pair => pair[0]));
        switch (direction) {
            case 'left':
                x = 49 - fallbackDistance;
                roomName = Cartographer.findRelativeRoomName(roomName, -1, 0);
                break;
            case 'right':
                x = fallbackDistance;
                roomName = Cartographer.findRelativeRoomName(roomName, 1, 0);
                break;
            case 'top':
                y = 49 - fallbackDistance;
                roomName = Cartographer.findRelativeRoomName(roomName, 0, -1);
                break;
            case 'bottom':
                y = fallbackDistance;
                roomName = Cartographer.findRelativeRoomName(roomName, 0, 1);
                break;
            default:
                log.error('Error getting fallback position!');
                break;
        }
        return new RoomPosition(x, y, roomName);
    }
    // Creep potentials ================================================================================================
    /**
     * Cache the result of a computation for a tick
     */
    static cache(creep, key, callback) {
        if (!creep.intel)
            creep.intel = {};
        if (creep.intel[key] == undefined) {
            creep.intel[key] = callback();
        }
        return creep.intel[key];
    }
    static uniqueBoosts(creep) {
        return _.compact(_.unique(_.map(creep.body, bodyPart => bodyPart.boost)));
    }
    /**
     * Heal potential of a single creep in units of effective number of parts
     */
    static getHealPotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'healPotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == HEAL) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.heal.T1 ||
                            boost == BOOST_TIERS.heal.T2 ||
                            boost == BOOST_TIERS.heal.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.heal.T1) {
                    return BOOSTS.heal.LO.heal;
                }
                else if (boost == BOOST_TIERS.heal.T2) {
                    return BOOSTS.heal.LHO2.heal;
                }
                else if (boost == BOOST_TIERS.heal.T3) {
                    return BOOSTS.heal.XLHO2.heal;
                }
            }
            return 0;
        }));
    }
    static getHealAmount(creep) {
        return HEAL_POWER * this.getHealPotential(toCreep(creep));
    }
    static getRangedHealAmount(creep) {
        return RANGED_HEAL_POWER * this.getHealPotential(toCreep(creep));
    }
    /**
     * If a creep appears to primarily be a healer
     */
    static isHealer(zerg) {
        const creep = toCreep(zerg);
        const healParts = _.filter(zerg.body, part => part.type == HEAL).length;
        const attackParts = _.filter(zerg.body, part => part.type == ATTACK).length;
        const rangedAttackParts = _.filter(zerg.body, part => part.type == RANGED_ATTACK).length;
        return healParts > attackParts + rangedAttackParts;
    }
    /**
     * Attack potential of a single creep in units of effective number of parts
     */
    static getAttackPotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'attackPotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == ATTACK) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.attack.T1 ||
                            boost == BOOST_TIERS.attack.T2 ||
                            boost == BOOST_TIERS.attack.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.attack.T1) {
                    return BOOSTS.attack.UH.attack;
                }
                else if (boost == BOOST_TIERS.attack.T2) {
                    return BOOSTS.attack.UH2O.attack;
                }
                else if (boost == BOOST_TIERS.attack.T3) {
                    return BOOSTS.attack.XUH2O.attack;
                }
            }
            return 0;
        }));
    }
    static getAttackDamage(creep) {
        return ATTACK_POWER * this.getAttackPotential(toCreep(creep));
    }
    /**
     * Ranged attack potential of a single creep in units of effective number of parts
     */
    static getRangedAttackPotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'rangedAttackPotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == RANGED_ATTACK) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.ranged.T1 ||
                            boost == BOOST_TIERS.ranged.T2 ||
                            boost == BOOST_TIERS.ranged.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.ranged.T1) {
                    return BOOSTS.ranged_attack.KO.rangedAttack;
                }
                else if (boost == BOOST_TIERS.ranged.T2) {
                    return BOOSTS.ranged_attack.KHO2.rangedAttack;
                }
                else if (boost == BOOST_TIERS.ranged.T3) {
                    return BOOSTS.ranged_attack.XKHO2.rangedAttack;
                }
            }
            return 0;
        }));
    }
    static getRangedAttackDamage(creep) {
        return RANGED_ATTACK_POWER * this.getRangedAttackPotential(toCreep(creep));
    }
    /**
     * Attack potential of a single creep in units of effective number of parts
     */
    static getDismantlePotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'dismantlePotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == WORK) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.dismantle.T1 ||
                            boost == BOOST_TIERS.dismantle.T2 ||
                            boost == BOOST_TIERS.dismantle.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.dismantle.T1) {
                    return BOOSTS.work.ZH.dismantle;
                }
                else if (boost == BOOST_TIERS.dismantle.T2) {
                    return BOOSTS.work.ZH2O.dismantle;
                }
                else if (boost == BOOST_TIERS.dismantle.T3) {
                    return BOOSTS.work.XZH2O.dismantle;
                }
            }
            return 0;
        }));
    }
    static getDismantleDamage(creep) {
        return DISMANTLE_POWER * this.getDismantlePotential(toCreep(creep));
    }
    static getRepairPotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'repairPotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == WORK) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.construct.T1 ||
                            boost == BOOST_TIERS.construct.T2 ||
                            boost == BOOST_TIERS.construct.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.construct.T1) {
                    return BOOSTS.work.LH.repair;
                }
                else if (boost == BOOST_TIERS.construct.T2) {
                    return BOOSTS.work.LH2O.repair;
                }
                else if (boost == BOOST_TIERS.construct.T3) {
                    return BOOSTS.work.XLH2O.repair;
                }
            }
            return 0;
        }));
    }
    static getRepairPower(creep) {
        return REPAIR_POWER * this.getRepairPotential(toCreep(creep));
    }
    /**
     * Attack potential of a single creep in units of effective number of parts
     */
    static getCarryPotential(creep, countIntendedBoosts = false) {
        return this.cache(creep, 'carryPotential', () => _.sum(creep.body, function (part) {
            if (part.hits == 0) {
                return 0;
            }
            if (part.type == CARRY) {
                let boost = part.boost;
                if (!boost && countIntendedBoosts && creep.my) {
                    if (creep.memory.needBoosts) {
                        boost = _.find(creep.memory.needBoosts, boost => boost == BOOST_TIERS.carry.T1 ||
                            boost == BOOST_TIERS.carry.T2 ||
                            boost == BOOST_TIERS.carry.T3);
                    }
                }
                if (!boost) {
                    return 1;
                }
                else if (boost == BOOST_TIERS.carry.T1) {
                    return BOOSTS.carry.KH.capacity;
                }
                else if (boost == BOOST_TIERS.carry.T2) {
                    return BOOSTS.carry.KH2O.capacity;
                }
                else if (boost == BOOST_TIERS.carry.T3) {
                    return BOOSTS.carry.XKH2O.capacity;
                }
            }
            return 0;
        }));
    }
    /**
     * Minimum damage multiplier a creep has
     */
    static minimumDamageTakenMultiplier(creep) {
        return this.cache(creep, 'minDamageMultiplier', () => _.min(_.map(creep.body, function (part) {
            if (part.type == TOUGH && part.hits > 0) {
                if (part.boost == BOOST_TIERS.tough.T1) {
                    return BOOSTS.tough.GO.damage;
                }
                else if (part.boost == BOOST_TIERS.tough.T2) {
                    return BOOSTS.tough.GHO2.damage;
                }
                else if (part.boost == BOOST_TIERS.tough.T3) {
                    return BOOSTS.tough.XGHO2.damage;
                }
            }
            return 1;
        })));
    }
    static minimumDamageMultiplierForGroup(creeps) {
        return _.min(_.map(creeps, creep => this.minimumDamageTakenMultiplier(creep)));
    }
    static getMassAttackDamageTo(attacker, target) {
        if (isStructure(target) && (!isOwnedStructure(target) || target.my)) {
            return 0;
        }
        const range = attacker.pos.getRangeTo(target.pos);
        let rangedMassAttackPower = 0;
        if (range <= 1) {
            rangedMassAttackPower = 10;
        }
        else if (range == 2) {
            rangedMassAttackPower = 4;
        }
        else if (range == 3) {
            rangedMassAttackPower = 1;
        }
        return rangedMassAttackPower * this.getRangedAttackPotential(isStandardZerg(attacker) ? attacker.creep : attacker);
    }
    /**
     * Total damage to enemy creeps done by attacker.rangedMassAttack()
     */
    static getMassAttackDamage(attacker, targets = attacker.room.hostiles, checkRampart = true) {
        const hostiles = attacker.pos.findInRange(targets, 3);
        return _.sum(hostiles, function (hostile) {
            if (checkRampart && hostile.pos.lookForStructure(STRUCTURE_RAMPART)) {
                return 0; // Creep inside rampart
            }
            else {
                return CombatIntel_1.getMassAttackDamageTo(attacker, hostile);
            }
        });
    }
    /**
     * A heuristic for scoring the effectiveness of creeps
     */
    static rating(creep) {
        const c = toCreep(creep);
        return this.cache(c, 'rating', () => {
            let rating = this.getRangedAttackPotential(c) + this.getAttackPotential(c) / 2;
            const healMultiplier = 1 / this.minimumDamageTakenMultiplier(c);
            rating += healMultiplier * this.getHealPotential(c);
            return rating;
        });
    }
    // Group creep calculations ========================================================================================
    /**
     * Maximum damage that a group of creeps can dish out (doesn't count for simultaneity restrictions)
     */
    static maxDamageByCreeps(creeps) {
        return _.sum(creeps, creep => ATTACK_POWER * this.getAttackPotential(creep) +
            RANGED_ATTACK_POWER * this.getRangedAttackPotential(creep));
    }
    /**
     * Maximum healing that a group of creeps can provide (doesn't count for simultaneity restrictions)
     */
    static maxHealingByCreeps(creeps) {
        return _.sum(creeps, creep => this.getHealAmount(creep));
    }
    /**
     * Total attack/rangedAttack/heal potentials for a group of creeps
     */
    static getCombatPotentials(creeps) {
        const attack = _.sum(creeps, creep => this.getAttackPotential(creep));
        const rangedAttack = _.sum(creeps, creep => this.getRangedAttackPotential(creep));
        const heal = _.sum(creeps, creep => this.getHealPotential(creep));
        const dismantle = _.sum(creeps, creep => this.getDismantlePotential(creep));
        return { attack, ranged: rangedAttack, heal, dismantle };
    }
    /**
     * Total attack/rangedAttack/heal potentials for a group of creeps
     */
    static getMyCombatPotentials(zergs, countIntendedBoosts = true) {
        const attack = _.sum(zergs, zerg => this.getAttackPotential(zerg.creep, countIntendedBoosts));
        const rangedAttack = _.sum(zergs, zerg => this.getRangedAttackPotential(zerg.creep, countIntendedBoosts));
        const heal = _.sum(zergs, zerg => this.getHealPotential(zerg.creep, countIntendedBoosts));
        const dismantle = _.sum(zergs, zerg => this.getDismantlePotential(zerg.creep, countIntendedBoosts));
        return { attack, ranged: rangedAttack, heal, dismantle };
    }
    /**
     * Maximum damage that is dealable at a given position by enemy forces
     */
    static maxDamageAtPos(pos) {
        if (!pos.room) {
            return 0;
        }
        const hostilesInMeleeRange = _.filter(pos.room.dangerousHostiles, creep => pos.getRangeTo(creep) <= 1);
        const meleeDamage = _.sum(hostilesInMeleeRange, hostile => this.getAttackDamage(hostile));
        const hostilesInRange = _.filter(pos.room.dangerousHostiles, creep => pos.getRangeTo(creep) <= 3);
        const rangedDamage = _.sum(hostilesInRange, hostile => this.getRangedAttackDamage(hostile));
        let totalDamage = meleeDamage + rangedDamage;
        if (!pos.room.my) {
            totalDamage += this.towerDamageAtPos(pos) || 0;
        }
        return totalDamage;
    }
    /**
     * Heal potential of self and possible healer neighbors
     */
    static maxHostileHealingTo(creep) {
        return this.cache(creep, 'maxHostileHealing', () => {
            const selfHealing = this.getHealAmount(creep);
            const neighbors = _.filter(creep.room.hostiles, hostile => hostile.pos.isNearTo(creep));
            const neighborHealing = _.sum(neighbors, neighbor => this.getHealAmount(neighbor));
            const rangedHealers = _.filter(creep.room.hostiles, hostile => hostile.pos.getRangeTo(creep) <= 3 &&
                !neighbors.includes(hostile));
            const rangedHealing = _.sum(rangedHealers, healer => this.getRangedHealAmount(healer));
            return selfHealing + neighborHealing + rangedHealing;
        });
    }
    /**
     * Heal potential of self and possible healer neighbors
     */
    static avgHostileHealingTo(creeps) {
        return _.max(_.map(creeps, creep => CombatIntel_1.maxHostileHealingTo(creep))) / creeps.length;
    }
    /**
     * Heal potential of self and possible healer neighbors
     */
    static maxFriendlyHealingTo(friendly) {
        const creep = toCreep(friendly);
        return this.cache(creep, 'maxFriendlyHealing', () => {
            const selfHealing = this.getHealAmount(creep);
            const neighbors = _.filter(creep.room.creeps, hostile => hostile.pos.isNearTo(creep));
            const neighborHealing = _.sum(neighbors, neighbor => this.getHealAmount(neighbor));
            const rangedHealers = _.filter(creep.room.creeps, hostile => hostile.pos.getRangeTo(creep) <= 3 &&
                !neighbors.includes(hostile));
            const rangedHealing = _.sum(rangedHealers, healer => this.getHealAmount(healer));
            return selfHealing + neighborHealing + rangedHealing;
        });
    }
    /**
     * Determine the predicted damage amount of a certain type of attack. Can specify if you should use predicted or
     * current hits amount and whether to include predicted healing. Does not update predicted hits.
     */
    static predictedDamageAmount(attacker, target, attackType, useHitsPredicted = true) {
        // Compute initial (gross) damage amount
        let grossDamage;
        if (attackType == 'attack') {
            grossDamage = this.getAttackDamage(attacker);
        }
        else if (attackType == 'rangedAttack') {
            grossDamage = this.getRangedAttackDamage(attacker);
        }
        else { // rangedMassAttack; not currently used
            grossDamage = this.getMassAttackDamageTo(attacker, target);
        }
        // Adjust for remaining tough parts
        let toughHits;
        let damageMultiplier;
        if (isCreep(target)) {
            if (useHitsPredicted) {
                if (target.hitsPredicted == undefined)
                    target.hitsPredicted = target.hits;
                const nonToughHits = _.sum(target.body, part => part.type == TOUGH ? 0 : part.hits);
                toughHits = Math.min(target.hitsPredicted - nonToughHits, 0); // predicted amount of TOUGH
            }
            else {
                toughHits = 100 * target.getActiveBodyparts(TOUGH);
            }
            damageMultiplier = this.minimumDamageTakenMultiplier(target); // assumes only 1 tier of boosts
        }
        else {
            toughHits = 0;
            damageMultiplier = 1;
        }
        if (grossDamage * damageMultiplier < toughHits) { // if you can't eat through armor
            return grossDamage * damageMultiplier;
        }
        else { // if you break tough shield
            grossDamage -= toughHits / damageMultiplier;
            return toughHits + grossDamage;
        }
    }
    // Creep position calculations =====================================================================================
    // // Distance from a given creep to the nearest rampart or wall; Infinity if no barriers in room
    // static distanceToBarrier(creep: Creep): number {
    //
    // }
    static isApproaching(approacher, toPos) {
        const previousPos = RoomIntel.getPreviousPos(approacher);
        const previousRange = toPos.getRangeTo(previousPos);
        const currentRange = toPos.getRangeTo(approacher.pos);
        return currentRange < previousRange;
    }
    static isRetreating(retreater, fromPos) {
        const previousPos = RoomIntel.getPreviousPos(retreater);
        const previousRange = fromPos.getRangeTo(previousPos);
        const currentRange = fromPos.getRangeTo(retreater.pos);
        return currentRange > previousRange;
    }
    /**
     * This method is probably expensive; use sparingly
     */
    static isEdgeDancing(creep, reentryThreshold = 3) {
        return false;
        // TODO: rewrite this
        // if (!creep.room.my) {
        // 	log.warning(`isEdgeDancing should only be called in owned rooms!`);
        // }
        // const creepOccupancies = creep.room.memory[RMEM.CREEPS_IN_ROOM];
        // if (creepOccupancies) {
        // 	// Look to see if the creep has exited and re-entered the room a given number of times
        // 	const creepInRoomTicks = [];
        // 	for (const tick in creepOccupancies) {
        // 		if (creepOccupancies[tick].includes(creep.name)) {
        // 			creepInRoomTicks.push(parseInt(tick, 10));
        // 		}
        // 	}
        // 	let reentries = 1;
        // 	if (creepInRoomTicks.length > 0) {
        // 		for (const i of _.range(creepInRoomTicks.length - 1)) {
        // 			if (creepInRoomTicks[i + 1] != creepInRoomTicks[i] + 1) {
        // 				// There was a gap between the creep's presence in the room so it must have reentered
        // 				reentries++;
        // 			}
        // 		}
        // 	}
        // 	return reentries >= reentryThreshold;
        // } else {
        // 	return false;
        // }
    }
    static getPositionsNearEnemies(hostiles, range = 0) {
        return _.unique(_.flatten(_.map(hostiles, hostile => hostile.pos.getPositionsInRange(range, false, true))));
    }
};
CombatIntel = CombatIntel_1 = __decorate([
    profile
], CombatIntel);
export { CombatIntel };
// For debugging
global.CombatIntel = CombatIntel;
