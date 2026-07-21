var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/* Generate stable matching between string-indexed bipartite groups with possibly unequal numbers using Gale-Shapley */
import { profile } from '../profiler/decorator';
let Matcher = class Matcher {
    constructor(menPrefs, womenPrefs) {
        this.menPrefs = menPrefs;
        this.womenPrefs = womenPrefs;
        this.men = _.keys(menPrefs);
        this.women = _.keys(womenPrefs);
        this.menFree = _.zipObject(this.men, _.map(this.men, man => true));
        this.womenFree = _.zipObject(this.women, _.map(this.women, woman => true));
        this.couples = {};
    }
    /* Return whether the woman prefer man1 over man2 */
    prefers(woman, man1, man2) {
        return _.indexOf(this.womenPrefs[woman], man1) < _.indexOf(this.womenPrefs[woman], man2);
    }
    /* Engage a couple <3 */
    engage(man, woman) {
        this.menFree[man] = false;
        this.womenFree[woman] = false;
        _.remove(this.menPrefs[man], w => w == woman); // Remove the woman that the man proposed to
        // Don't remove from women prefs since we're matching from men side
        this.couples[man] = woman;
    }
    /* Break up a couple... </3 :'( */
    breakup(man, woman) {
        this.menFree[man] = true;
        this.womenFree[woman] = true;
        // Don't do anything to the preferences of men or women since they've already proposed
        delete this.couples[man];
    }
    /* Return the first free man who still has someone left to propose to */
    nextMan() {
        return _.find(this.men, man => this.menFree[man] && this.menPrefs[man].length > 0);
    }
    match() {
        const MAX_ITERATIONS = 1000;
        let count = 0;
        let man = this.nextMan();
        while (man) { // While there exists a free man who still has someone to propose to
            if (count > MAX_ITERATIONS) {
                console.log('Stable matching timed out!');
                return this.couples;
            }
            const woman = _.first(this.menPrefs[man]); // Get first woman on man's list
            if (this.womenFree[woman]) { // If woman is free, get engaged
                this.engage(man, woman);
            }
            else { // Else if woman prefers this man to her current, swap men
                const currentMan = _.findKey(this.couples, w => w == woman);
                if (this.prefers(woman, man, currentMan)) {
                    this.breakup(currentMan, woman);
                    this.engage(man, woman);
                }
                else {
                    _.remove(this.menPrefs[man], w => w == woman); // Record an unsuccessful proposal
                }
            }
            man = this.nextMan();
            count++;
        }
        return this.couples;
    }
};
Matcher = __decorate([
    profile
], Matcher);
export { Matcher };
