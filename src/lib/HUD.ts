import { getHealth, computeEmergencyReserve } from './Cashflow';

function drawPanel(vis: RoomVisual, x: number, y: number, rows: string[][], width: number): void {
  const rowH = 0.85;
  const h = rows.length * rowH + 0.3;
  vis.rect(x - 0.2, y - 0.2, width, h, {
    fill: '#000000',
    opacity: 0.4,
    stroke: '#444444',
    strokeWidth: 0.05,
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowY = y + i * rowH;
    if (row[0]) {
      vis.text(row[0], x, rowY, {
        align: 'left',
        font: '7px monospace',
        color: '#888888',
      });
    }
    if (row[1]) {
      vis.text(row[1], x + width - 0.5, rowY, {
        align: 'right',
        font: '7px monospace',
        color: '#ffffff',
      });
    }
  }
}

function drawTopLeft(vis: RoomVisual, room: Room): void {
  const rcl = room.controller ? room.controller.level : 0;
  const sources = room.find(FIND_SOURCES);
  const harvesters = Object.values(Game.creeps).filter((c: Creep) =>
    c.memory.roomName === room.name && c.memory.role === 'harvester'
  );
  const sourceAssignments = sources.map((s: Source) => {
    const count = harvesters.filter((h: Creep) => h.memory.task?.targetId === s.id).length;
    const fill = s.energy / s.energyCapacity;
    return 'S' + (sources.indexOf(s) + 1) + '(' + count + ')';
  }).join(' ');

  const avgFill = sources.length > 0
    ? Math.round(sources.reduce((sum: number, s: Source) => sum + s.energy / s.energyCapacity, 0) / sources.length * 100)
    : 0;

  const myCreeps = Object.values(Game.creeps).filter((c: Creep) => c.memory.roomName === room.name);
  const idle = myCreeps.filter((c: Creep) => (c.memory._stuckTicks || 0) > 5).length;

  const cpuAtStart = (Memory.v1 as any).hud?.cpuTick?.[room.name] || 0;
  const cpuUsed = ((Game.cpu.getUsed() - cpuAtStart) / 25).toFixed(1);

  drawPanel(vis, 0.5, 0.5, [
    [room.name + '  RCL ' + rcl, ''],
    ['Sources: ' + sourceAssignments, avgFill + '%'],
    ['Creeps: ' + myCreeps.length + '  idle: ' + idle, idle > 0 ? Math.round(idle / myCreeps.length * 100) + '%' : ''],
    ['CPU: ' + cpuUsed + 'ms', ''],
  ], 13);
}

function drawTopRight(vis: RoomVisual, room: Room): void {
	const cf = Memory.v1.cashflow?.[room.name];
	const income = cf?.incomeRate || 0;
	const spawn = cf?.spawnRate || 0;
	const build = cf?.buildRate || 0;
	const net = income - spawn - build;

	const health = getHealth(room);
	const reserve = computeEmergencyReserve(room);

	drawPanel(vis, 35, 0.5, [
		['Cashflow', ''],
		['In: +' + income.toFixed(1) + '/t', ''],
		['Spawn: -' + spawn.toFixed(1) + '/t', ''],
		['Build: -' + build.toFixed(1) + '/t', ''],
		['Net:', (net >= 0 ? '+' : '') + net.toFixed(1) + '/t'],
		['Health: ' + health.toUpperCase(), 'Rsv: ' + reserve.toLocaleString()],
	], 16);
}

function drawBottomLeft(vis: RoomVisual, room: Room): void {
  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_TOWER
  });
  const towersOnline = towers.filter((t: StructureTower) => t.store[RESOURCE_ENERGY] > 0).length;
  const towerBar = towers.map((_t: StructureTower, i: number) => i < towersOnline ? '■' : '□').join('');

  const walls = room.find(FIND_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_WALL
  });
  const wallHealth = walls.length > 0
    ? Math.round(walls.reduce((sum: number, w: Structure) => sum + w.hits / w.hitsMax, 0) / walls.length * 100)
    : 0;

  const ramparts = room.find(FIND_STRUCTURES, {
    filter: (s: Structure) => s.structureType === STRUCTURE_RAMPART
  });
  const rampartHealth = ramparts.length > 0
    ? Math.round(ramparts.reduce((sum: number, r: Structure) => sum + r.hits / r.hitsMax, 0) / ramparts.length * 100)
    : 0;

  const hostiles = room.find(FIND_HOSTILE_CREEPS).length;
  const lastThreat = (Memory.v1 as any).hud?.lastThreat?.[room.name] || 0;
  const threatAgo = lastThreat > 0 ? (Game.time - lastThreat).toLocaleString() + ' ticks ago' : 'never';

  drawPanel(vis, 0.5, 35, [
    ['Towers: ' + towerBar, towersOnline + '/' + towers.length + ' online'],
    ['Walls: ' + wallHealth + '%', 'Ramparts: ' + rampartHealth + '%'],
    ['Hostiles: ' + hostiles, hostiles > 0 ? 'IN ROOM' : 'clear'],
    ['Last threat', threatAgo],
  ], 13);
}

function drawBottomRight(vis: RoomVisual, room: Room): void {
  const swap = room.memory.layout?.swap;
  const swapState = swap?.state || 'none';
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
  const pendingRoads = ((Memory.v1 as any).pathing?.pendingRoads || [])
    .filter((r: any) => r.roomName === room.name).length;
  const nextReplan = 100 - (Game.time % 100);

  drawPanel(vis, 35, 35, [
    ['Swap', swapState],
    ['Sites', sites + ' pending'],
    ['Roads pending', pendingRoads.toString()],
    ['Next replan', nextReplan + ' ticks'],
  ], 14);
}

function drawCreepLabels(vis: RoomVisual, creep: Creep): void {
  let label = '';
  let color = '#ffffff';
  const task = creep.memory.task;

  const taskLabel = task ? task.type.slice(0, 4).toUpperCase() : 'IDLE';

  switch (creep.memory.role) {
    case 'harvester':
      label = '[H:' + taskLabel + ']';
      color = '#4caf50';
      break;
    case 'hauler':
      label = '[HAUL:' + taskLabel + ']';
      color = '#00bcd4';
      break;
    case 'builder':
      label = '[BLD:' + taskLabel + ']';
      color = '#ffeb3b';
      break;
    case 'upgrader':
      label = '[UP:' + taskLabel + ']';
      color = '#9c27b0';
      break;
  }

  if (label) {
    vis.text(label, creep.pos.x, creep.pos.y - 0.5, {
      font: '5px monospace',
      color: color,
      stroke: '#000000',
      strokeWidth: 0.15,
    });
  }
}

export function run(room: Room): void {
  const vis = new RoomVisual(room.name);

  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.roomName !== room.name) continue;
    drawCreepLabels(vis, creep);
  }

  if (!(Memory.v1 as any).hud) (Memory.v1 as any).hud = {};
  if (!(Memory.v1 as any).hud.cpuTick) (Memory.v1 as any).hud.cpuTick = {};
  (Memory.v1 as any).hud.cpuTick[room.name] = Game.cpu.getUsed();

  drawTopLeft(vis, room);
  drawTopRight(vis, room);
  drawBottomLeft(vis, room);
  drawBottomRight(vis, room);

  if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    if (!(Memory.v1 as any).hud.lastThreat) (Memory.v1 as any).hud.lastThreat = {};
    (Memory.v1 as any).hud.lastThreat[room.name] = Game.time;
  }
}