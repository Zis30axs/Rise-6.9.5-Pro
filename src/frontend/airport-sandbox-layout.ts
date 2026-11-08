/** Scenic coordinates only. Airport travel continues to use the saved location ID. */
export const airportDistrict = {
  id: 'haneda-airport', name: '羽田机场区', shortName: '羽田机场区',
  description: '临湾的国际航站楼、塔台与停机坪，跑道沿海岸展开。南门交通站提供机场接驳。',
  x: -90, z: 260, minX: -186, maxX: 6, minZ: 198, maxZ: 322, color: 0xa7c6c8,
} as const;

// An isolated map anchor lets the existing switch camera use the airport without
// adding a walkable scene or changing any legacy district's saved coordinates.
export const airportLegacyCenter = { x: 480, z: 480 };
export const airportLegacyBounds = { minX: 384, maxX: 576, minZ: 418, maxZ: 542 };
export const airportLegacyArrival = { x: 455, z: 440 };
export const airportLandmark = {
  id: airportDistrict.id, name: '东京羽田国际机场', subtitle: '国际航站楼',
  district: airportDistrict.id, x: -115, z: 220,
  desc: '机场接驳车停靠在航站楼前，国际出发大厅通往旧金山航线。', services: [],
};
