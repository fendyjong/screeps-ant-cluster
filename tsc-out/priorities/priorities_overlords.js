/**
 * Default ordering for processing spawning requests and prioritizing overlords
 */
export let OverlordPriority = {
    emergency: {
        bootstrap: 0
    },
    core: {
        queen: 100,
        manager: 101,
    },
    powerCreeps: {
        default: 150,
    },
    defense: {
        meleeDefense: 200,
        rangedDefense: 201,
    },
    warSpawnCutoff: 299, // Everything past this is non-critical and won't be spawned in case of emergency
    offense: {
        destroy: 300,
        healPoint: 301,
        siege: 302,
        controllerAttack: 399,
    },
    colonization: {
        claim: 400,
        pioneer: 401,
        remoteUpgrading: 410,
    },
    priorityOwnedRoom: {
        priorityUpgrade: 450,
        priorityTransport: 451,
    },
    ownedRoom: {
        firstTransport: 500, // High priority to spawn the first transporter
        mine: 501,
        work: 502,
        mineralRCL8: 503,
        transport: 510, // Spawn the rest of the transporters
        mineral: 520
    },
    outpostDefense: {
        outpostDefense: 550,
        guard: 551,
    },
    outpostOffense: {
        harass: 560,
        roomPoisoner: 561,
    },
    upgrading: {
        upgrade: 600,
    },
    collectionUrgent: {
        haul: 700
    },
    throttleThreshold: 799, // Everything past this may be throttled in the event of low CPU
    scouting: {
        stationary: 800,
        randomWalker: 801
    },
    remoteRoom: {
        reserve: 900,
        mine: 901,
        roomIncrement: 5, // remote room priorities are incremented by this for each outpost
    },
    remoteSKRoom: {
        sourceReaper: 1000,
        mineral: 1001,
        mine: 1002,
        roomIncrement: 5,
    },
    powerMine: {
        cool: 1050,
        drill: 1051,
        roomIncrement: 5
    },
    tasks: {
        haul: 1100,
        dismantle: 1101
    },
    default: 99999 // Default overlord priority to ensure it gets run last
};
