var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CombatIntel } from '../../intel/CombatIntel';
import { BunkerDefenseOverlord } from '../../overlords/defense/bunkerDefense';
import { DistractionOverlord } from '../../overlords/defense/distraction';
import { RangedDefenseOverlord } from '../../overlords/defense/rangedDefense';
import { profile } from '../../profiler/decorator';
import { BarrierPlanner } from '../../roomPlanner/BarrierPlanner';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
/**
 * Defend an owned room against an incoming player invasion
 */
let DirectiveInvasionDefense = class DirectiveInvasionDefense extends Directive {
    constructor(flag) {
        super(flag, colony => colony.level >= 1 && colony.spawns.length > 0);
    }
    spawnMoarOverlords() {
        if (!this.room) {
            return;
        }
        const expectedDamage = CombatIntel.maxDamageByCreeps(this.room.dangerousPlayerHostiles);
        const expectedHealing = CombatIntel.maxHealingByCreeps(this.room.dangerousPlayerHostiles);
        const useBoosts = (expectedDamage > ATTACK_POWER * 50) || (expectedHealing > RANGED_ATTACK_POWER * 100)
            && !!this.colony.terminal
            && !!this.colony.evolutionChamber;
        const percentWalls = _.filter(this.room.barriers, s => s.structureType == STRUCTURE_WALL).length /
            this.room.barriers.length;
        const meleeHostiles = _.filter(this.room.hostiles, hostile => hostile.getActiveBodyparts(ATTACK) > 0 ||
            hostile.getActiveBodyparts(WORK) > 0);
        const rangedHostiles = _.filter(this.room.hostiles, hostile => hostile.getActiveBodyparts(RANGED_ATTACK) > 0);
        this.overlords.rangedDefense = new RangedDefenseOverlord(this);
        // If serious bunker busting attempt, spawn lurkers
        // TODO understand dismantlers damage output
        if (meleeHostiles.length > 0 && expectedDamage > ATTACK_POWER * 70 &&
            (this.colony.level >= BarrierPlanner.settings.bunkerizeRCL || rangedHostiles.length > 3)) {
            this.overlords.bunkerDefense = new BunkerDefenseOverlord(this);
        }
        // If melee attackers, try distractions
        // TODO drop these if they don't work, need to detect effectiveness. Although the says make for great 🍿
        if (meleeHostiles.length > 0 && expectedDamage > 40 * ATTACK_POWER) {
            this.overlords.distraction = new DistractionOverlord(this);
        }
    }
    init() {
        const numHostiles = this.room ? this.room.hostiles.length.toString() : '???';
        this.alert(`Invasion (hostiles: ${numHostiles}) ${Game.time - this.memory.safeSince}`, NotifierPriority.Critical);
    }
    // TODO record baddies needs to be redone in a more systemic fashion. But here for the 🍿
    recordBaddies() {
        if (!this.room) {
            return;
        }
        const mem = Memory.playerCreepTracker;
        const hostiles = this.room.hostiles;
        hostiles.forEach(creep => {
            if (!mem[creep.owner.username]) {
                mem[creep.owner.username] = {
                    creeps: {},
                    types: {},
                    parts: {},
                    boosts: {},
                };
            }
            const playerMem = mem[creep.owner.username];
            if (!playerMem.creeps[creep.name]) {
                playerMem.creeps[creep.name] = Game.time;
                const creepType = creep.name.substr(0, creep.name.indexOf(' '));
                if (creepType == creep.name) {
                    // memory protection if they don't split name
                    return;
                }
                playerMem.types[creepType] = (playerMem.types[creepType] + 1) || 1;
                for (const bodyPart of creep.body) {
                    playerMem.parts[bodyPart.type] = (playerMem.parts[bodyPart.type]) + 1 || 1;
                    if (bodyPart.boost) {
                        playerMem.boosts[bodyPart.boost] = (playerMem.boosts[bodyPart.boost]) + 1 || 1;
                    }
                }
            }
        });
    }
    printPlayerExpenditure() {
        let t3Count = 0;
        let energyCount = 0;
        const mem = Memory.playerCreepTracker.inakrin;
        for (const boostid in mem.boosts) {
            const boost = mem.boosts[boostid];
            console.log(`${boostid} : ${boost * 30}`);
            t3Count += boost * 30;
            energyCount += 20;
        }
        for (const partType in mem.parts) {
            const partCount = mem.parts[partType];
            const cost = BODYPART_COST[partType];
            console.log(`${partType} : ${cost * partCount}`);
            energyCount += cost * partCount;
        }
        console.log(`Total T3 Cost: ${t3Count}`);
        console.log(`Total Energy Cost: ${energyCount}`);
    }
    cleanUpPlayerMem() {
        const mem = Memory.playerCreepTracker;
        for (const player of _.keys(mem)) {
            const tracker = mem[player];
            for (const creep of _.keys(tracker.creeps)) {
                if (tracker.creeps[creep] + 1500 < Game.time) {
                    delete tracker.creeps[creep];
                }
            }
        }
    }
    run() {
        if (!this.room || this.room.hostiles.length > 0) {
            this.memory.safeSince = Game.time;
            this.recordBaddies();
        }
        // this.printPlayerExpenditure();
        if (Game.time % 5000 == 0) {
            // clean up, ya this shit
            this.cleanUpPlayerMem();
        }
        if (this.room && false) {
            // CombatIntel.computeCreepDamagePotentialMatrix(this.room, this.room.dangerousPlayerHostiles);
        }
        // If there are no hostiles left in the room and everyone's healed, then remove the flag
        if (this.room && this.room.hostiles.length == 0 &&
            (Game.time - this.memory.safeSince) > this.safeEndTime) {
            if (_.filter(this.room.creeps, creep => creep.hits < creep.hitsMax).length == 0) {
                this.remove();
            }
        }
        else if ((Game.time - this.memory.safeSince) > 3000) {
            this.remove();
        }
    }
};
DirectiveInvasionDefense.directiveName = 'invasionDefense';
DirectiveInvasionDefense.color = COLOR_BLUE;
DirectiveInvasionDefense.secondaryColor = COLOR_PURPLE;
DirectiveInvasionDefense = __decorate([
    profile
], DirectiveInvasionDefense);
export { DirectiveInvasionDefense };
