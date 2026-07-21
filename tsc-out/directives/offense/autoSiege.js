var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { CombatPlanner } from '../../strategy/CombatPlanner';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
/**
 * Automatic siege directive: uses scouting/observer data to determine an appropriate offensive strike level,
 * then sieges the targeted room until it is no longer claimed
 */
let DirectiveAutoSiege = class DirectiveAutoSiege extends Directive {
    // overlords: {
    // 	scout?: StationaryScoutOverlord;
    // 	destroy?: SwarmDestroyerOverlord | PairDestroyerOverlord;
    // 	guard?: OutpostDefenseOverlord;
    // 	controllerAttack?: ControllerAttackerOverlord;
    // };
    constructor(flag) {
        super(flag);
    }
    spawnMoarOverlords() {
        // this.overlords.destroy = new SwarmDestroyerOverlord(this);
    }
    init() {
        this.alert(`Auto-siege directive active`);
        if (!this.memory.siegeAnalysis || Game.time > this.memory.siegeAnalysis.expiration) {
            if (this.room) {
                // Register a siege analysis
                this.memory.siegeAnalysis = CombatPlanner.getSiegeAnalysis(this.room);
            }
            else {
                // Obtain vision of room
                if (this.colony.commandCenter && this.colony.commandCenter.observer) {
                    this.colony.commandCenter.requestRoomObservation(this.pos.roomName);
                }
                else {
                    // todo
                }
            }
        }
    }
    run() {
        // If there are no hostiles left in the room then remove the flag and associated healpoint
        if (this.room && this.room.hostiles.length == 0 && this.room.hostileStructures.length == 0) {
            log.notify(`Auto-siege operation at ${this.pos.roomName} completed successfully.`);
            this.remove();
        }
    }
    visuals() {
        Visualizer.marker(this.pos, { color: 'red' });
    }
};
DirectiveAutoSiege.directiveName = 'autoSiege';
DirectiveAutoSiege.color = COLOR_RED;
DirectiveAutoSiege.secondaryColor = COLOR_ORANGE;
DirectiveAutoSiege = __decorate([
    profile
], DirectiveAutoSiege);
export { DirectiveAutoSiege };
