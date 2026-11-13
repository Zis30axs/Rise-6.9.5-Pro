export type CaliforniaMapScope = 'bay' | 'silicon' | 'la' | 'close' | 'state';
export interface CaliforniaMapPoint { x: number; z: number; y?: number }
export interface CaliforniaMapLandmark extends CaliforniaMapPoint {
  id: string;
  name: string;
  district: string;
}
export interface CaliforniaMapSight extends CaliforniaMapPoint {
  id: string;
  name: string;
  pinY: number;
  region: string;
}
export interface CaliforniaMapRoute {
  from: string;
  to: string;
  points?: readonly CaliforniaMapPoint[];
}
export interface CaliforniaMapData {
  landmarks: readonly CaliforniaMapLandmark[];
  sights: readonly CaliforniaMapSight[];
  structures: readonly (CaliforniaMapPoint & { name: string })[];
  shore: readonly (readonly (readonly number[])[])[];
  routes: readonly (CaliforniaMapRoute & { points: readonly CaliforniaMapPoint[] })[];
}
export interface CaliforniaMapOptions {
  /** Current authoritative runtime location; locations outside this atlas stay unmarked. */
  locationId?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onSightSelect?: (id: string | null) => void;
}
export interface CaliforniaMapUpdate {
  locationId?: string;
  selectedId?: string;
  /** Existing runtime route legs; geometry is resolved from the atlas when omitted. */
  route?: readonly CaliforniaMapRoute[] | null;
}
export interface CaliforniaMapController {
  update(next: CaliforniaMapUpdate): void;
  setScope(scope: CaliforniaMapScope): void;
  zoomBy(factor: number, anchor?: { x: number; y: number }): void;
  rotate(): void;
  selectSight(id: string): void;
  reset(): void;
  destroy(): void;
}
/** Mounts only map presentation and pointer controls. It never changes game state. */
export function mountCaliforniaMap(
  root: HTMLElement,
  data: CaliforniaMapData,
  glbDataUrl: string,
  options?: CaliforniaMapOptions,
): CaliforniaMapController;
