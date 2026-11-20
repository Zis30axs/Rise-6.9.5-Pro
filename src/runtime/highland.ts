/** Fictional upland neighborhood in the Tokyo setting, in schematic map units. */
export const highland = {
  id: 'highland', name: '高原住宅区', shortName: '高原住宅区',
  description: '沿坡脚的巴士站上行，穿过挡土石墙和树影，台阶尽头是若叶家的临街院门。',
  x: 352, z: -84, minX: 316, maxX: 388, minZ: -108, maxZ: -60, color: 0x91a789,
} as const;

export const highlandStop = { x: highland.x, z: highland.z + 10.5 };
export const wakabaEntrance = { x: highland.x + 12, z: highland.z - 5, yaw: 0 };
