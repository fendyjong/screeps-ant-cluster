import { recordWork } from '../../evolution';

/**
 * Reservation — holding a neighbouring room's controller so its sources yield
 * full output.
 *
 * Verified against `@screeps/common/lib/constants.js` on disk:
 * `SOURCE_ENERGY_NEUTRAL_CAPACITY = 1500` against `SOURCE_ENERGY_CAPACITY = 3000`,
 * so an unreserved remote source sustains 5 energy/tick and a reserved one 10.
 * Reservation therefore **doubles** the return on remote foraging that is already
 * happening, which makes it a better increment than adding new territory.
 * `CONTROLLER_RESERVE = 1` tick per CLAIM part per tick, decaying 1/tick, and
 * `CREEP_CLAIM_LIFE_TIME = 600`, so one [CLAIM, MOVE] reserver roughly sustains a
 * reservation provided it is replaced promptly. No GCL is required — unlike
 * claiming.
 *
 * **This is the one genuine caste in the colony, and it is worth being explicit
 * about why.** Everywhere else, behaviour comes from thresholds and any creep can
 * do any task. A reserver cannot: a [CLAIM, MOVE] body has no WORK and no CARRY,
 * so it physically cannot harvest, build or upgrade. The specialisation is
 * imposed by morphology rather than by policy — which is exactly how real ant
 * castes work, majors and minors being physically suited to different jobs
 * rather than assigned to them. So this creep is dispatched by its body, not by
 * the threshold system, and it is deliberately the only such exception.
 */

export function isReserver(creep: Creep): boolean {
  return creep.body.some(part => part.type === CLAIM);
}

export function run(creep: Creep): void {
  const target = creep.memory.remoteRoom;
  if (!target) {
    recordWork(creep);
    return;
  }

  if (creep.room.name !== target) {
    creep.moveTo(new RoomPosition(25, 25, target));
    recordWork(creep);
    return;
  }

  const controller = creep.room.controller;
  if (!controller) {
    // Room has no controller to reserve — forget it so a replacement picks
    // somewhere useful.
    delete creep.memory.remoteRoom;
    recordWork(creep);
    return;
  }

  const result = creep.reserveController(controller);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  recordWork(creep);
}
