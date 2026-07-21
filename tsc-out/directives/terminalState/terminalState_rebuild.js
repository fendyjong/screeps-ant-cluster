var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { log } from '../../console/log';
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
const REBUILD_STATE_TIMEOUT = 25000;
/**
 * Put the colony's terminal in a rebuild state, which pushes resources out of a room which is undergoing reconstruction
 * while maintaining a small reserve of energy
 */
let DirectiveTerminalRebuildState = class DirectiveTerminalRebuildState extends Directive {
    constructor(flag) {
        super(flag);
        this.refresh();
    }
    refresh() {
        super.refresh();
        this.colony.state.isRebuilding = true;
    }
    spawnMoarOverlords() {
    }
    init() {
        if (this.colony && this.colony.terminal) {
            for (const resource of RESOURCES_ALL) {
                if (this.colony.assets[resource] > 0) {
                    if (resource == RESOURCE_ENERGY) { // keep a little energy just to keep the room functioning
                        Overmind.terminalNetwork.exportResource(this.colony, resource, {
                            target: 25000,
                            tolerance: 5000,
                            surplus: 35000,
                        });
                    }
                    else {
                        Overmind.terminalNetwork.exportResource(this.colony, resource);
                    }
                }
            }
        }
        if (Game.time % 25 == 0) {
            log.alert(`${this.pos.print}: rebuild terminal state active!`);
        }
        this.alert('Rebuild terminal state active!', NotifierPriority.High);
    }
    run() {
        // Incubation directive gets removed once the colony has a command center (storage)
        if (!this.colony || !this.terminal || Game.time > (this.memory["T" /* MEM.TICK */] || 0) + REBUILD_STATE_TIMEOUT) {
            this.remove();
        }
    }
};
DirectiveTerminalRebuildState.directiveName = 'rebuildState';
DirectiveTerminalRebuildState.color = COLOR_BROWN;
DirectiveTerminalRebuildState.secondaryColor = COLOR_YELLOW;
DirectiveTerminalRebuildState = __decorate([
    profile
], DirectiveTerminalRebuildState);
export { DirectiveTerminalRebuildState };
