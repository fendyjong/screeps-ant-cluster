var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { SpawnGroup } from 'logistics/SpawnGroup';
import { log } from '../../console/log';
import { Roles, Setups } from '../../creepSetups/setups';
import { OverlordPriority } from '../../priorities/priorities_overlords';
import { profile } from '../../profiler/decorator';
import { Overlord } from '../Overlord';
/**
 * Controller attacker overlord.  Spawn CLAIM creeps to mass up on a controller and attack all at once
 * This module was contributed by @sarrick and has since been modified
 */
let ControllerAttackerOverlord = class ControllerAttackerOverlord extends Overlord {
    constructor(directive, priority = OverlordPriority.offense.controllerAttack) {
        super(directive, 'controllerAttack', priority);
        this.controllerAttackers = this.zerg(Roles.claim);
        this.spawnGroup = new SpawnGroup(this, { requiredRCL: 4 });
        this.refresh();
    }
    refresh() {
        super.refresh();
        if (this.room && this.room.controller) {
            this.attackPositions = this.room.controller.pos.availableNeighbors(true);
            this.readyTick = Game.time + (this.room.controller.upgradeBlocked || 0);
        }
        else {
            this.attackPositions = [];
            this.readyTick = Game.time;
        }
        this.assignments = this.getPositionAssignments();
    }
    getPositionAssignments() {
        const assignments = {};
        const maxLoops = Math.min(this.attackPositions.length, this.controllerAttackers.length);
        const controllerAttackers = _.sortBy(this.controllerAttackers, zerg => zerg.name);
        for (let i = 0; i < maxLoops; i++) {
            assignments[controllerAttackers[i].name] = this.attackPositions[i];
        }
        return assignments;
    }
    init() {
        // TODO: Prespawn attackers to arrive as cooldown disappears
        if (this.attackPositions.length > 0 && Game.time >= this.readyTick) {
            this.wishlist(this.attackPositions.length, Setups.infestors.controllerAttacker, { noLifetimeFilter: true });
        }
    }
    run() {
        for (const controllerAttacker of this.controllerAttackers) {
            const attackPos = this.assignments[controllerAttacker.name];
            if (attackPos) {
                controllerAttacker.goTo(attackPos);
            }
            else {
                log.debug(`No attack position for ${controllerAttacker.print}!`);
            }
        }
        if (this.room && this.room.controller && this.room.controller.reservation && !this.room.controller.reservedByMe) {
            this.launchAttack();
        }
        else if (this.room && this.room.controller && !this.room.controller.upgradeBlocked) {
            if (_.all(this.controllerAttackers, creep => creep.pos.isEqualTo(this.assignments[creep.name]))
                || _.any(this.controllerAttackers, creep => creep.pos.isNearTo(this.room.controller)
                    && (creep.ticksToLive || 10) <= 2)) {
                this.launchAttack();
            }
        }
    }
    launchAttack() {
        let signed = false;
        if (this.room && this.room.controller) {
            for (const infestor of this.controllerAttackers) {
                infestor.attackController(this.room.controller);
                if (!signed) {
                    signed = (infestor.signController(this.room.controller, 'For the swarm') == OK);
                }
            }
        }
    }
};
ControllerAttackerOverlord = __decorate([
    profile
], ControllerAttackerOverlord);
export { ControllerAttackerOverlord };
