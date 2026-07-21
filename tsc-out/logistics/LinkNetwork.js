var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { profile } from '../profiler/decorator';
/**
 * The link network controls the flow of energy through various links in a room and uses a greedy matching algorithm
 * to determine where to send energy to
 */
let LinkNetwork = class LinkNetwork {
    constructor(colony) {
        this.colony = colony;
        this.receive = [];
        this.transmit = [];
        this.settings = {
            linksTrasmitAt: LINK_CAPACITY - 100,
        };
    }
    refresh() {
        this.receive = [];
        this.transmit = [];
    }
    claimLink(link) {
        if (link) {
            _.remove(this.colony.availableLinks, l => l.id == link.id);
        }
    }
    requestReceive(link) {
        this.receive.push(link);
    }
    requestTransmit(link) {
        this.transmit.push(link);
    }
    /**
     * Number of ticks until a dropoff link is available again to deposit energy to
     */
    getDropoffAvailability(link) {
        const dest = this.colony.commandCenter ? this.colony.commandCenter.pos : this.colony.pos;
        const usualCooldown = link.pos.getRangeTo(dest);
        if (link.energy > this.settings.linksTrasmitAt) { // Energy will be sent next time cooldown == 0
            return link.cooldown + usualCooldown;
        }
        else {
            return link.cooldown;
        }
    }
    init() {
        // for (let link of this.colony.dropoffLinks) {
        // 	if (link.energy > this.settings.linksTrasmitAt) {
        // 		this.requestTransmit(link);
        // 	}
        // }
    }
    /**
     * Examine the link resource requests and try to efficiently (but greedily) match links that need energy in and
     * out, then send the remaining resourceOut link requests to the command center link
     */
    run() {
        // For each receiving link, greedily get energy from the closest transmitting link - at most 9 operations
        for (const receiveLink of this.receive) {
            const closestTransmitLink = receiveLink.pos.findClosestByRange(this.transmit);
            // If a send-receive match is found, transfer that first, then remove the pair from the link lists
            if (closestTransmitLink) {
                // Send min of (all the energy in sender link, amount of available space in receiver link)
                const amountToSend = _.min([closestTransmitLink.energy, receiveLink.energyCapacity - receiveLink.energy]);
                closestTransmitLink.transferEnergy(receiveLink, amountToSend);
                _.remove(this.transmit, link => link == closestTransmitLink);
                // _.remove(this.receive, link => link == receiveLink);
            }
        }
        // Now send all remaining transmit link requests to the command center
        if (this.colony.commandCenter && this.colony.commandCenter.link) {
            for (const transmitLink of this.transmit) {
                transmitLink.transferEnergy(this.colony.commandCenter.link);
            }
        }
    }
};
LinkNetwork = __decorate([
    profile
], LinkNetwork);
export { LinkNetwork };
