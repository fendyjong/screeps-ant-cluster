var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BarrierPlanner_1;
import { getCutTiles } from '../algorithms/minCut';
import { log } from '../console/log';
import { Mem } from '../memory/Memory';
import { profile } from '../profiler/decorator';
import { packCoord, packCoordList, unpackCoordListAsPosList } from '../utilities/packrat';
import { minMax } from '../utilities/utils';
import { BUNKER_RADIUS, bunkerLayout, insideBunkerBounds } from './layouts/bunker';
import { getAllStructureCoordsFromLayout, RoomPlanner, translatePositions } from './RoomPlanner';
const getDefaultBarrierPlannerMemory = () => ({
    barrierCoordsPacked: '',
});
let BarrierPlanner = BarrierPlanner_1 = class BarrierPlanner {
    constructor(roomPlanner) {
        this.roomPlanner = roomPlanner;
        this.colony = roomPlanner.colony;
        this.memory = Mem.wrap(this.colony.memory, 'barrierPlanner', getDefaultBarrierPlannerMemory);
        this.barrierPositions = [];
    }
    refresh() {
        this.memory = Mem.wrap(this.colony.memory, 'barrierPlanner', getDefaultBarrierPlannerMemory);
        this.barrierPositions = [];
    }
    computeBunkerBarrierPositions(bunkerPos, upgradeSitePos) {
        const rectArray = [];
        const padding = BarrierPlanner_1.settings.padding;
        if (bunkerPos) {
            const { x, y } = bunkerPos;
            const r = BUNKER_RADIUS - 1;
            let [x1, y1] = [Math.max(x - r - padding, 0), Math.max(y - r - padding, 0)];
            let [x2, y2] = [Math.min(x + r + padding, 49), Math.min(y + r + padding, 49)];
            // Make sure you don't leave open walls
            x1 = minMax(x1, 3, 50 - 3);
            x2 = minMax(x2, 3, 50 - 3);
            y1 = minMax(y1, 3, 50 - 3);
            y2 = minMax(y2, 3, 50 - 3);
            rectArray.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
        }
        // Get Min cut
        const barrierCoords = getCutTiles(this.colony.name, rectArray, false, 2, false);
        let positions = _.map(barrierCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
        positions = positions.concat(upgradeSitePos.availableNeighbors(true));
        return positions;
    }
    computeBarrierPositions(hatcheryPos, commandCenterPos, upgradeSitePos) {
        const rectArray = [];
        const padding = BarrierPlanner_1.settings.padding;
        if (hatcheryPos) {
            const { x, y } = hatcheryPos;
            const [x1, y1] = [Math.max(x - 5 - padding, 0), Math.max(y - 4 - padding, 0)];
            const [x2, y2] = [Math.min(x + 5 + padding, 49), Math.min(y + 6 + padding, 49)];
            rectArray.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
        }
        if (commandCenterPos) {
            const { x, y } = commandCenterPos;
            const [x1, y1] = [Math.max(x - 3 - padding, 0), Math.max(y - 0 - padding, 0)];
            const [x2, y2] = [Math.min(x + 0 + padding, 49), Math.min(y + 5 + padding, 49)];
            rectArray.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
        }
        if (upgradeSitePos) {
            const { x, y } = upgradeSitePos;
            const [x1, y1] = [Math.max(x - 1, 0), Math.max(y - 1, 0)];
            const [x2, y2] = [Math.min(x + 1, 49), Math.min(y + 1, 49)];
            rectArray.push({ x1: x1, y1: y1, x2: x2, y2: y2 });
        }
        // Get Min cut
        const barrierCoords = getCutTiles(this.colony.name, rectArray, true, 2, false);
        return _.map(barrierCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
    }
    init() {
    }
    /* Write everything to memory after roomPlanner is closed */
    finalize() {
        if (this.barrierPositions.length == 0) {
            if (this.roomPlanner.bunkerPos) {
                this.barrierPositions = this.computeBunkerBarrierPositions(this.roomPlanner.bunkerPos, this.colony.controller.pos);
            }
            else if (this.roomPlanner.storagePos && this.roomPlanner.hatcheryPos) {
                this.barrierPositions = this.computeBarrierPositions(this.roomPlanner.hatcheryPos, this.roomPlanner.storagePos, this.colony.controller.pos);
            }
            else {
                log.error(`${this.colony.print} BARRIER PLANNER: couldn't generate barrier plan!`);
                return;
            }
        }
        this.memory.barrierCoordsPacked = packCoordList(this.barrierPositions);
    }
    /* Quick lookup for if a barrier should be in this position. Barriers returning false won't be maintained. */
    barrierShouldBeHere(pos) {
        // Once you are high level, only maintain ramparts at bunker or controller
        if (this.colony.layout == 'bunker' && this.colony.level >= BarrierPlanner_1.settings.bunkerizeRCL) {
            return insideBunkerBounds(pos, this.colony) || pos.getRangeTo(this.colony.controller) == 1;
        }
        // Otherwise look up from memory
        if (this._barrierLookup == undefined) {
            this._barrierLookup = _.memoize((p) => this.memory.barrierCoordsPacked.includes(packCoord(p)));
        }
        return this._barrierLookup(pos);
    }
    /* Create construction sites for any buildings that need to be built */
    buildMissingRamparts() {
        // Max buildings that can be placed each tick
        let count = RoomPlanner.settings.maxSitesPerColony - this.colony.constructionSites.length;
        // Build missing ramparts
        const barrierPositions = unpackCoordListAsPosList(this.memory.barrierCoordsPacked, this.colony.room.name);
        // Add critical structures to barrier lookup
        const criticalStructures = _.compact([...this.colony.towers,
            ...this.colony.spawns,
            this.colony.storage,
            this.colony.terminal]);
        for (const structure of criticalStructures) {
            barrierPositions.push(structure.pos);
        }
        for (const pos of barrierPositions) {
            if (count > 0 && RoomPlanner.canBuild(STRUCTURE_RAMPART, pos) && this.barrierShouldBeHere(pos)) {
                const ret = pos.createConstructionSite(STRUCTURE_RAMPART);
                if (ret != OK) {
                    log.warning(`${this.colony.name}: couldn't create rampart site at ${pos.print}. Result: ${ret}`);
                }
                else {
                    count--;
                }
            }
        }
    }
    buildMissingBunkerRamparts() {
        if (!this.roomPlanner.bunkerPos)
            return;
        const bunkerCoords = getAllStructureCoordsFromLayout(bunkerLayout, this.colony.level);
        bunkerCoords.push(bunkerLayout.data.anchor); // add center bunker tile
        let bunkerPositions = _.map(bunkerCoords, coord => new RoomPosition(coord.x, coord.y, this.colony.name));
        bunkerPositions = translatePositions(bunkerPositions, bunkerLayout.data.anchor, this.roomPlanner.bunkerPos);
        let count = RoomPlanner.settings.maxSitesPerColony - this.colony.constructionSites.length;
        for (const pos of bunkerPositions) {
            if (count > 0 && !pos.lookForStructure(STRUCTURE_RAMPART)
                && pos.lookFor(LOOK_CONSTRUCTION_SITES).length == 0) {
                const ret = pos.createConstructionSite(STRUCTURE_RAMPART);
                if (ret != OK) {
                    log.warning(`${this.colony.name}: couldn't create bunker rampart at ${pos.print}. Result: ${ret}`);
                }
                else {
                    count--;
                }
            }
        }
    }
    run() {
        if (this.roomPlanner.active) {
            if (this.roomPlanner.bunkerPos) {
                this.barrierPositions = this.computeBunkerBarrierPositions(this.roomPlanner.bunkerPos, this.colony.controller.pos);
            }
            else if (this.roomPlanner.storagePos && this.roomPlanner.hatcheryPos) {
                this.barrierPositions = this.computeBarrierPositions(this.roomPlanner.hatcheryPos, this.roomPlanner.storagePos, this.colony.controller.pos);
            }
            this.visuals();
        }
        else {
            if (!this.roomPlanner.memory.relocating && this.colony.level >= BarrierPlanner_1.settings.buildBarriersAtRCL
                && this.roomPlanner.shouldRecheck(2)) {
                this.buildMissingRamparts();
                if (this.colony.layout == 'bunker' && this.colony.level >= 7) {
                    this.buildMissingBunkerRamparts();
                }
            }
        }
    }
    visuals() {
        for (const pos of this.barrierPositions) {
            this.colony.room.visual.structure(pos.x, pos.y, STRUCTURE_RAMPART);
        }
    }
};
BarrierPlanner.settings = {
    buildBarriersAtRCL: 3,
    padding: 3, // allow this much space between structures and barriers (if possible)
    bunkerizeRCL: 7
};
BarrierPlanner = BarrierPlanner_1 = __decorate([
    profile
], BarrierPlanner);
export { BarrierPlanner };
