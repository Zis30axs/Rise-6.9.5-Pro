/** Schematic city coordinates. Keep the district beyond the former city bounds
 * so no historical road or neighboring park position changes identity. */
export const asukayamaPark = {
  id: 'asukayama-park', name: '王子·飞鸟山公园', shortName: '飞鸟山公园',
  description: '从王子站一侧入园，树间的步道沿石阶通向喷泉广场。广场边的石墙旁设有长椅。',
  x: 282, z: -55, minX: 265, maxX: 310, minZ: -80, maxZ: -36, color: 0x81a576,
} as const;
