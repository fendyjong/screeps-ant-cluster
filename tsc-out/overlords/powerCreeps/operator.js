import { OverlordPriority } from '../../priorities/priorities_overlords';
import { PowerOverlord } from '../PowerOverlord';
const getDefaultOperatorOverlordMemory = () => ({
    ["T" /* MEM.TICK */]: Game.time,
});
export class OperatorOverlord extends PowerOverlord {
    constructor(directive, priority = OverlordPriority.powerCreeps.default) {
        super(directive, 'operator', priority, getDefaultOperatorOverlordMemory);
        this.operators = this.powerZerg('baseOperator');
    }
    init() {
    }
    run() {
    }
}
