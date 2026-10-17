/** Hand-built illustrative silhouettes, not scale architectural reconstructions.
 * Approximate display locations are rounded for this atlas. Identity and broad
 * location were checked against the primary sources below on 2026-10-17.
 * No source prose, photographs, textures or third-party 3D models are bundled.
 */
export type AtlasLandmarkKind = 'wall' | 'eiffel' | 'liberty' | 'pyramid' | 'taj' | 'opera' | 'fuji' | 'kremlin' | 'clock' | 'christ';
export interface AtlasLandmark {
  id: string; name: string; countryId: string; lon: number; lat: number;
  kind: AtlasLandmarkKind; detail: string; source: string; worldPriority: number;
}
export const ATLAS_LANDMARKS: readonly AtlasLandmark[] = [
  { id: 'great-wall', name: '长城', countryId: 'CHN', lon: 116.0, lat: 40.4, kind: 'wall', worldPriority: 1, detail: '中国 · 长城的程序化地标缩影。坐标取北京周边代表位置，不表示整条长城范围。', source: 'https://whc.unesco.org/en/list/438/' },
  { id: 'eiffel', name: '埃菲尔铁塔', countryId: 'FRA', lon: 2.29, lat: 48.86, kind: 'eiffel', worldPriority: 1, detail: '法国 · 巴黎。以塔身与四脚结构构成的简化地标。', source: 'https://www.toureiffel.paris/en/access-map' },
  { id: 'liberty', name: '自由女神像', countryId: 'USA', lon: -74.04, lat: 40.69, kind: 'liberty', worldPriority: 1, detail: '美国 · 纽约港。简化为台座、像身与火炬的立体符号。', source: 'https://whc.unesco.org/en/list/307/' },
  { id: 'giza', name: '吉萨金字塔', countryId: 'EGY', lon: 31.13, lat: 29.98, kind: 'pyramid', worldPriority: 1, detail: '埃及 · 吉萨。以三座金字塔的低多边形组合表示。', source: 'https://whc.unesco.org/en/list/86/' },
  { id: 'taj-mahal', name: '泰姬陵', countryId: 'IND', lon: 78.04, lat: 27.18, kind: 'taj', worldPriority: 1, detail: '印度 · 阿格拉。穹顶与四座角塔为简化轮廓。', source: 'https://whc.unesco.org/en/list/252/' },
  { id: 'opera-house', name: '悉尼歌剧院', countryId: 'AUS', lon: 151.22, lat: -33.86, kind: 'opera', worldPriority: 1, detail: '澳大利亚 · 悉尼港。以交叠帆形薄壳表示建筑轮廓。', source: 'https://whc.unesco.org/en/list/166/' },
  { id: 'fuji', name: '富士山', countryId: 'JPN', lon: 138.73, lat: 35.36, kind: 'fuji', worldPriority: 2, detail: '日本 · 富士山。白色山顶与锥形山体为艺术化表现，非真实高程模型。', source: 'https://whc.unesco.org/en/list/1418/' },
  { id: 'red-square', name: '莫斯科红场', countryId: 'SUN', lon: 37.62, lat: 55.75, kind: 'kremlin', worldPriority: 2, detail: '架空世界 · 苏维埃社会主义共和国联盟。红场与克里姆林宫的塔楼缩影，不补充世界历史设定。', source: 'https://whc.unesco.org/en/list/545/' },
  { id: 'big-ben', name: '大本钟', countryId: 'GBR', lon: -.12, lat: 51.5, kind: 'clock', worldPriority: 3, detail: '英国 · 伦敦。伊丽莎白塔的钟面与尖顶简化轮廓；大本钟是塔内钟的通称。', source: 'https://www.parliament.uk/about/living-heritage/building/palace/architecture/palacestructure/towers-of-parliament/' },
  { id: 'christ-redeemer', name: '里约基督像', countryId: 'BRA', lon: -43.21, lat: -22.95, kind: 'christ', worldPriority: 1, detail: '巴西 · 里约热内卢。山顶上张开双臂的雕像剪影。', source: 'https://whc.unesco.org/en/list/1100/' },
];
