var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../../profiler/decorator';
import { Directive } from '../Directive';
const getDefaultDirectiveEmptyMemory = () => ({});
/**
 * DOCUMENTATION GOES HERE
 */
let DirectiveEmpty = class DirectiveEmpty extends Directive {
    constructor(flag) {
        super(flag);
        _.defaultsDeep(this.memory, getDefaultDirectiveEmptyMemory());
        this.refresh();
        // TODO
    }
    refresh() {
        super.refresh();
        // TODO
    }
    spawnMoarOverlords() {
        // TODO
    }
    init() {
    }
    run() {
    }
};
DirectiveEmpty.directiveName = 'empty';
DirectiveEmpty.color = COLOR_BROWN;
DirectiveEmpty.secondaryColor = COLOR_BROWN;
DirectiveEmpty = __decorate([
    profile
], DirectiveEmpty);
export { DirectiveEmpty };
