import { getTerrainMatrix, isWalkable } from '../lib/PathFinder';

const BUNKER_RADIUS = 6;

class Dinic {
	private graph: { to: number; rev: number; cap: number }[][];
	private level: number[];
	private it: number[];

	constructor(n: number) {
		this.graph = new Array(n).fill(0).map(() => []);
		this.level = new Array(n).fill(0);
		this.it = new Array(n).fill(0);
	}

	addEdge(from: number, to: number, cap: number): void {
		this.graph[from].push({ to, rev: this.graph[to].length, cap });
		this.graph[to].push({ to: from, rev: this.graph[from].length - 1, cap: 0 });
	}

	private bfs(s: number, t: number): boolean {
		this.level.fill(-1);
		const q: number[] = [s];
		this.level[s] = 0;
		while (q.length > 0) {
			const v = q.shift()!;
			for (const e of this.graph[v]) {
				if (e.cap > 0 && this.level[e.to] < 0) {
					this.level[e.to] = this.level[v] + 1;
					q.push(e.to);
				}
			}
		}
		return this.level[t] >= 0;
	}

	private dfs(v: number, t: number, f: number): number {
		if (v === t) return f;
		for (let i = this.it[v]; i < this.graph[v].length; i++) {
			const e = this.graph[v][i];
			if (e.cap > 0 && this.level[v] < this.level[e.to]) {
				const d = this.dfs(e.to, t, Math.min(f, e.cap));
				if (d > 0) {
					e.cap -= d;
					this.graph[e.to][e.rev].cap += d;
					return d;
				}
			}
			this.it[v]++;
		}
		return 0;
	}

	maxFlow(s: number, t: number): number {
		let flow = 0;
		const INF = 1e9;
		while (this.bfs(s, t)) {
			this.it.fill(0);
			while (true) {
				const f = this.dfs(s, t, INF);
				if (f === 0) break;
				flow += f;
			}
		}
		return flow;
	}

	reachableFromSource(s: number): boolean[] {
		const visited = new Array(this.graph.length).fill(false);
		const q: number[] = [s];
		visited[s] = true;
		while (q.length > 0) {
			const v = q.shift()!;
			for (const e of this.graph[v]) {
				if (e.cap > 0 && !visited[e.to]) {
					visited[e.to] = true;
					q.push(e.to);
				}
			}
		}
		return visited;
	}
}

export function computeBarriers(room: Room, anchor: RoomPosition): RoomPosition[] {
	const roomName = room.name;
	const matrix = getTerrainMatrix(roomName);

	const margin = 3;
	const x1 = Math.max(anchor.x - BUNKER_RADIUS - margin, 0);
	const x2 = Math.min(anchor.x + BUNKER_RADIUS + margin, 49);
	const y1 = Math.max(anchor.y - BUNKER_RADIUS - margin, 0);
	const y2 = Math.min(anchor.y + BUNKER_RADIUS + margin, 49);

	const zoneWidth = x2 - x1 + 1;
	const zoneHeight = y2 - y1 + 1;
	const totalNodes = zoneWidth * zoneHeight + 2;
	const SRC = totalNodes - 2;
	const SNK = totalNodes - 1;

	function zoneNodeId(x: number, y: number): number {
		return (y - y1) * zoneWidth + (x - x1);
	}

	const dinic = new Dinic(totalNodes);
	const interiorRadius = BUNKER_RADIUS - 1;

	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			const id = zoneNodeId(x, y);
			const walkable = isWalkable(matrix, x, y);
			const dist = Math.sqrt((x - anchor.x) ** 2 + (y - anchor.y) ** 2);
			const isInterior = dist <= interiorRadius;

			if (isInterior) {
				dinic.addEdge(SRC, id, 1e9);
			}

			if (x < x2) {
				const rightId = zoneNodeId(x + 1, y);
				if (walkable && isWalkable(matrix, x + 1, y)) {
					dinic.addEdge(id, rightId, 1);
					dinic.addEdge(rightId, id, 1);
				}
			}
			if (y < y2) {
				const downId = zoneNodeId(x, y + 1);
				if (walkable && isWalkable(matrix, x, y + 1)) {
					dinic.addEdge(id, downId, 1);
					dinic.addEdge(downId, id, 1);
				}
			}

			const isEdge = x === 0 || y === 0 || x === 49 || y === 49;
			if (isEdge || !walkable) {
				dinic.addEdge(id, SNK, 1e9);
			}
		}
	}

	dinic.maxFlow(SRC, SNK);
	const reachable = dinic.reachableFromSource(SRC);

	const barriers: RoomPosition[] = [];
	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			const id = zoneNodeId(x, y);
			if (!reachable[id]) continue;
			const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
			for (const [dx, dy] of dirs) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < x1 || nx > x2 || ny < y1 || ny > y2) {
					barriers.push(new RoomPosition(x, y, roomName));
					break;
				}
				const nid = zoneNodeId(nx, ny);
				if (!reachable[nid]) {
					barriers.push(new RoomPosition(x, y, roomName));
					break;
				}
			}
		}
	}

	const structures = room.find(FIND_MY_STRUCTURES, {
		filter: s => s.structureType === STRUCTURE_SPAWN
			|| s.structureType === STRUCTURE_STORAGE
			|| s.structureType === STRUCTURE_TERMINAL
			|| s.structureType === STRUCTURE_TOWER
	});
	for (const s of structures) {
		if (!barriers.some(b => b.isEqualTo(s.pos))) {
			barriers.push(s.pos);
		}
	}

	return barriers;
}