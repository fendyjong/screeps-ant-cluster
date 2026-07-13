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

import { SpawnRequestData } from '../types';
import { deserializeBody, serializeBody } from './Body';

export function requestToMemory(req: SpawnRequest): SpawnRequestData {
	return {
		role: req.role,
		priority: req.priority,
		bodyMin: serializeBody(req.body.min),
		bodyIdeal: serializeBody(req.body.ideal),
		count: req.count,
		memory: req.memory,
		createdAt: req.createdAt,
		roomName: req.roomName,
	};
}

export function requestFromMemory(data: SpawnRequestData): SpawnRequest {
	return {
		role: data.role,
		priority: data.priority,
		body: {
			min: deserializeBody(data.bodyMin),
			ideal: deserializeBody(data.bodyIdeal),
		},
		count: data.count,
		memory: data.memory,
		createdAt: data.createdAt,
		roomName: data.roomName,
	};
}