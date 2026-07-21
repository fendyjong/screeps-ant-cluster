var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { GuardSwarmOverlord } from '../../overlords/defense/guardSwarm';
import { DefenseNPCOverlord } from '../../overlords/defense/npcDefense';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
/**
 * NPC defense directive for outpost rooms with invaders
 */
let DirectiveGuard = class DirectiveGuard extends Directive {
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
        if (this.colony.level >= DefenseNPCOverlord.requiredRCL) {
            // if (this.memory.enhanced || this.name.includes('enhanced')) {
            // 	this.overlords.guardPair = new GuardPairOverlord(this);
            // } else {
            this.overlords.guard = new DefenseNPCOverlord(this);
            // }
        }
        else {
            this.overlords.swarmGuard = new GuardSwarmOverlord(this);
        }
    }
    init() {
        if (this.room && this.room.invaderCore) {
            this.memory.invaderCore = true;
        }
        if (this.memory.invaderCore) {
            this.alert(`Attacking invader core`, NotifierPriority.Low);
        }
    }
    run() {
        // If there are no hostiles or hostiles structures left in the room, possibly remove
        if (this.room && this.room.hostiles.length == 0 && this.room.hostileStructures.length == 0) {
            // If everyone's healed up and the room is safe, remove
            const creepsNeedingHealing = _.filter(this.room.creeps, creep => creep.hits < creep.hitsMax);
            if (creepsNeedingHealing.length == 0 && this.room.isSafe) {
                this.remove();
            }
        }
    }
};
DirectiveGuard.directiveName = 'guard';
DirectiveGuard.color = COLOR_BLUE;
DirectiveGuard.secondaryColor = COLOR_BLUE;
DirectiveGuard = __decorate([
    profile
], DirectiveGuard);
export { DirectiveGuard };
