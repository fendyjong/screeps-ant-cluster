import { Directive } from '../Directive';
export class DefenseDirective extends Directive {
    constructor(flag) {
        super(flag);
        Overmind.overseer.combatPlanner.directives.push(this);
    }
}
