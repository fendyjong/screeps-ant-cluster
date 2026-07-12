// src/types/index.ts

import { BunkerLayout, SwapPlan } from '../colony/LayoutPlanner';

export enum Goal {
  ECONOMY = 'economy',
  DEFEND = 'defend',
  RECOVER = 'recover',
}

export interface RoleTargets {
  harvester: number;
  hauler: number;
  builder: number;
  upgrader: number;
}

export interface CreepMemory {
  role: string;
  roomName: string;
}

export interface LayoutMemory {
  bunker?: BunkerLayout;
  swap?: SwapPlan;
  lastUpdated?: number;
}

export interface RoomMemory {
  goal: Goal;
  layout?: LayoutMemory;
}

export interface TerrainCache {
  matrix: number[];
  tick: number;
}

export interface PathingMemory {
  terrain: Record<string, TerrainCache>;
}

declare global {
  interface Memory {
    pathing?: PathingMemory;
  }
}
