export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, opts?: MoveToOpts): void {
  creep.moveTo(target, {
    visualizePathStyle: { stroke: '#ffffff' },
    ...opts
  });
}
