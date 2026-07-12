# Screeps Bot - Goal-Driven Colony

TypeScript Screeps bot using goal-driven ant colony pattern.

## Architecture

- Colony reads room state → sets global goal
- Roles follow rules per goal
- Spawner counts targets and spawns creeps

## Goals

- ECONOMY: harvest, haul, build, upgrade
- DEFEND: repair structures, support towers (future)
- RECOVER: rebuild after attack (future)

## Build

```bash
npm install
npm run build
```

Output: `dist/main.js`

## Development

- `src/main.ts` - entry point
- `src/colony/` - goal system and orchestrator
- `src/roles/` - creep behavior per goal
- `src/spawn/` - spawn logic and body generation
- `src/lib/` - utilities (pathing, memory)
- `src/types/` - type definitions
