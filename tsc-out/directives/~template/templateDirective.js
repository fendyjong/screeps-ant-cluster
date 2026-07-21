var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DirectiveTemplate_1;
import { $ } from '../../caching/GlobalCache';
import { log } from '../../console/log';
import { TemplateOverlord } from '../../overlords/~template/templateOverlord';
import { profile } from '../../profiler/decorator';
import { Visualizer } from '../../visuals/Visualizer';
import { Directive } from '../Directive';
import { NotifierPriority } from '../Notifier';
// Default memory should be wrapped as a function to avoid default-modifying bugs
const getDefaultDirectiveTemplateMemory = () => ({
    memoryProperty1: 69,
});
/**
 * Template directive that you can copy/paste as an example of how to write a directive. Some description of what
 * the directive does should go in this multi-comment.
 */
let DirectiveTemplate = DirectiveTemplate_1 = class DirectiveTemplate extends Directive {
    /**
     * constructor() tips:
     * - If you need to filter a colony by required RCL, put a static property on the directive
     * - If the only thing you do is call super(flag) then you may omit the constructor entirely
     * - If you have to recompute or set some value every tick, you can directly call refresh() from the constructor
     * - Never modify Colony.state in the constructor! Colony.state gets reset each tick, so this must go on refresh()
     *   and refresh() must be called from the constructor.
     */
    constructor(flag) {
        super(flag, colony => colony.level >= DirectiveTemplate_1.requriedRCL);
        _.defaultsDeep(this.memory, getDefaultDirectiveTemplateMemory());
        this.refresh();
    }
    /**
     * refresh() tips:
     * - If the only thing you do here is call super.refresh(), you may omit this method entirely
     * - Don't forget to call super.refresh() before you do anything else in this method!
     * - Any modifications to Colony.state must go in refresh()
     * - Only put things in here that you need to recalculate every tick. Expensive computations that can be cached
     *   should go on the constructor, and you can use $.someMethod() to update the properties here.
     */
    refresh() {
        super.refresh();
        this.property2 = $.number(this, 'property1', () => {
            return 42; // some expensive computation
        });
        this.colony.state.bootstrapping = true;
    }
    spawnMoarOverlords() {
        this.overlords.overlordName = new TemplateOverlord(this);
    }
    /**
     * If you need to place logic which is specific to this directive type but not to this directive instance and which
     * is used elsewhere, make it a static method. Helper methods should be placed above the phase in which they are
     * called. (So if it is called in run(), it should go between init and run)
     */
    static shouldDoSomethingToPos(pos) {
        return false;
    }
    /**
     * init() tips:
     * - Calls to this.alert() should generally be placed in init() rather than run, but this is not a hard requirement
     * - Only place alerts for things that are actually important enough to warrrant screen space
     *
     */
    init() {
        this.alert(`High priority notification!`, NotifierPriority.High);
        this.alert(`Regular notifiaction`);
        // this.alert(`Notification that really isn't necessary to see shouldn't go here`);
        if (Game.time % 10 == 0) {
            log.alert(`Very, very important stuff (or stuff that is definitely an error) may be console spammed`);
        }
    }
    /**
     * run() tips:
     * - Directive removal logic should go on run() (and only on run) if necessary
     */
    run() {
        if (this.room && this.room.hostiles.length == 0 && Game.time > this.memory["T" /* MEM.TICK */] + 5000) {
            this.remove();
        }
    }
    visuals() {
        Visualizer.marker(this.pos, { color: 'red' });
    }
};
// All directives must have these three static properties
DirectiveTemplate.directiveName = 'template';
DirectiveTemplate.color = COLOR_BROWN;
DirectiveTemplate.secondaryColor = COLOR_BROWN;
// If the directive requires a certain RCL, add this static property
DirectiveTemplate.requriedRCL = 7;
DirectiveTemplate = DirectiveTemplate_1 = __decorate([
    profile
], DirectiveTemplate);
export { DirectiveTemplate };
