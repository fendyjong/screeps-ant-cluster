import { BodyPartConstant } from 'screeps';

export enum Priority {
	CRITICAL = 0,
	HIGH = 100,
	NORMAL = 300,
	LOW = 600,
	IDLE = 900,
}

export interface SpawnRequest {
	role: string
	priority: number
	body: { min: BodyPartConstant[]; ideal: BodyPartConstant[] }
	count: number
	memory: Record<string, unknown>
	createdAt: number
	roomName: string
}