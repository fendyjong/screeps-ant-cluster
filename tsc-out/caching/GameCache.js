var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { DirectiveOutpost } from '../directives/colony/outpost';
import { DirectiveSKOutpost } from '../directives/colony/outpostSK';
import { profile } from '../profiler/decorator';
/**
 * GameCache does initial low-level preprocessing before each tick is run
 */
let GameCache = class GameCache {
    constructor() {
        this.overlords = {};
        this.creepsByColony = {};
        this.targets = {};
        this.outpostFlags = _.filter(Game.flags, flag => DirectiveOutpost.filter(flag)
            || DirectiveSKOutpost.filter(flag));
    }
    cacheCreepsByColony() {
        this.creepsByColony = _.groupBy(Game.creeps, creep => creep.memory["C" /* MEM.COLONY */]);
    }
    /**
     * Generates a hash table for creeps assigned to each object: key: OLref, val: (key: role, val: names[])
     */
    cacheOverlords() {
        this.overlords = {};
        // keys: overlordRef, value: creepNames[]
        const creepNamesByOverlord = _.groupBy(_.keys(Game.creeps), name => Game.creeps[name].memory["O" /* MEM.OVERLORD */]);
        const powerCreepNamesByOverlord = _.groupBy(_.keys(Game.powerCreeps), name => Game.powerCreeps[name].memory["O" /* MEM.OVERLORD */]);
        for (const ref in creepNamesByOverlord) {
            // keys: roleName, value: creepNames[]
            this.overlords[ref] = _.groupBy(creepNamesByOverlord[ref], name => (Game.creeps[name] || Game.powerCreeps[name]).memory.role);
        }
    }
    /**
     * Generates a hash table for targets: key: TargetRef, val: targeting creep names
     */
    cacheTargets() {
        this.targets = {};
        for (const i in Game.creeps) {
            const creep = Game.creeps[i];
            let task = creep.memory.task;
            while (task) {
                if (!this.targets[task._target.ref])
                    this.targets[task._target.ref] = [];
                this.targets[task._target.ref].push(creep.name);
                task = task._parent;
            }
        }
    }
    build() {
        this.cacheCreepsByColony();
        this.cacheOverlords();
        this.cacheTargets();
    }
    refresh() {
        this.cacheCreepsByColony();
        this.cacheOverlords();
        this.cacheTargets();
    }
};
GameCache = __decorate([
    profile
], GameCache);
export { GameCache };
