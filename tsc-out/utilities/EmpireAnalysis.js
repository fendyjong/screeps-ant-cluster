var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { getAllColonies } from '../Colony';
import { DirectiveSKOutpost } from '../directives/colony/outpostSK';
import { profile } from '../profiler/decorator';
/**
 * Empire: Utilities on analyzing the overall empire
 */
let EmpireAnalysis = class EmpireAnalysis {
    static empireMineralDistribution() {
        const colonies = getAllColonies();
        const minedSKRooms = DirectiveSKOutpost.find(Object.values(Game.flags));
        const mineralDistribution = {};
        for (const colony of colonies) {
            const mineral = colony.room.find(FIND_MINERALS)[0];
            if (!mineralDistribution[mineral.mineralType]) {
                mineralDistribution[mineral.mineralType] = 0;
            }
            mineralDistribution[mineral.mineralType] += 1;
        }
        for (const skRoomFlag of minedSKRooms) {
            if (!skRoomFlag.room) {
                continue;
            }
            const mineral = skRoomFlag.room.find(FIND_MINERALS)[0];
            if (!mineralDistribution[mineral.mineralType]) {
                mineralDistribution[mineral.mineralType] = 0;
            }
            mineralDistribution[mineral.mineralType] += 1;
        }
        return mineralDistribution;
    }
};
EmpireAnalysis = __decorate([
    profile
], EmpireAnalysis);
export { EmpireAnalysis };
