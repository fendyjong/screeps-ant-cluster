var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveSwarmDestroy_1;
import { log } from '../../console/log';
import { SwarmDestroyerOverlord } from '../../overlords/offense/swarmDestroyer';
import { profile } from '../../profiler/decorator';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
/**
 * Spawns a 2x2 squad of coordinated creeps to destroy a room
 */
let DirectiveSwarmDestroy = DirectiveSwarmDestroy_1 = class DirectiveSwarmDestroy extends Directive {
    constructor(flag) {
        super(flag, colony => colony.level >= DirectiveSwarmDestroy_1.requiredRCL);
    }
    spawnMoarOverlords() {
        this.overlords.destroy = new SwarmDestroyerOverlord(this);
    }
    init() {
        this.alert(`Swarm destroyer directive active`);
    }
    run() {
        // If there are no hostiles left in the room then remove the flag and associated healpoint
        if (this.room && this.room.hostiles.length == 0 && this.room.hostileStructures.length == 0) {
            log.notify(`Swarm destroyer mission at ${this.pos.roomName} completed successfully.`);
            this.remove();
        }
    }
    visuals() {
        Visualizer.marker(this.pos, { color: 'red' });
    }
};
DirectiveSwarmDestroy.directiveName = 'destroy';
DirectiveSwarmDestroy.color = COLOR_RED;
DirectiveSwarmDestroy.secondaryColor = COLOR_RED;
DirectiveSwarmDestroy.requiredRCL = 6;
DirectiveSwarmDestroy = DirectiveSwarmDestroy_1 = __decorate([
    profile
], DirectiveSwarmDestroy);
export { DirectiveSwarmDestroy };
