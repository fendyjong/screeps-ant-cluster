var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../profiler/decorator';
import { CombatOverlord } from './CombatOverlord';
/**
 * SwarmOverlords extend the base CombatOverlord class, providing additional methods for spawning and controlling swarms
 */
let SwarmOverlord = class SwarmOverlord extends CombatOverlord {
    /* Wishlist of creeps to simplify spawning logic; includes automatic reporting */
    // TODO: at the moment, this assumes that every swarm within an overlord is the same configuration
    swarmWishlist(swarmQuantity, config) {
        // Make tables to log current and needed creep quantities
        const creepQuantities = {};
        const neededQuantities = {};
        // Handle filling out existing swarms first
        const validSwarms = _.filter(this.swarms, swarm => !swarm.isExpired);
        for (const swarm of validSwarms) {
            for (const creepType of config) {
                const { setup, amount } = creepType;
                const priority = creepType.priority || this.priority;
                const existingCreepsOfRole = _.filter(swarm.creeps, creep => creep.roleName == setup.role);
                // Log current and needed amounts for reporting
                if (!creepQuantities[setup.role])
                    creepQuantities[setup.role] = 0;
                creepQuantities[setup.role] += existingCreepsOfRole.length;
                if (!neededQuantities[setup.role])
                    neededQuantities[setup.role] = 0;
                neededQuantities[setup.role] += amount;
                // Spawn the needed quantity of creeps
                const spawnQuantity = amount - existingCreepsOfRole.length;
                for (let i = 0; i < spawnQuantity; i++) {
                    this.requestCreep(setup, { priority: priority });
                }
            }
        }
        // Spawn new swarms as needed
        const numRemainingSwarms = swarmQuantity - validSwarms.length;
        for (let n = 0; n < numRemainingSwarms; n++) {
            for (const creepType of config) {
                const { setup, amount } = creepType;
                const priority = creepType.priority || this.priority;
                if (!neededQuantities[setup.role])
                    neededQuantities[setup.role] = 0;
                neededQuantities[setup.role] += amount;
                for (let i = 0; i < amount; i++) {
                    this.requestCreep(setup, { priority: priority + 0.5 });
                }
            }
        }
        // Report creep amounts
        for (const role of _.keys(neededQuantities)) {
            this.creepReport(role, creepQuantities[role] || 0, neededQuantities[role]);
        }
    }
};
SwarmOverlord = __decorate([
    profile
], SwarmOverlord);
export { SwarmOverlord };
