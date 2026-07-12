// src/types/index.ts

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

export interface RoomMemory {
  goal: Goal;
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
