export type V3 = [number, number, number];
export type Layer = 'terrain' | 'water' | 'buildings' | 'roads' | 'rail' | 'nature' | 'details';
export type Mode = 'golden' | 'day' | 'night' | 'blue';
export interface Facade { columns: number; rows: number; seed: number; style: 'glass' | 'warm' | 'stone'; }
export interface Face { points: V3[]; color: string; layer: Layer; glow?: number; doubleSided?: boolean; facade?: Facade; }
export interface Line { points: V3[]; color: string; width: number; layer: Layer; glow?: number; dashed?: boolean; }
export interface Landmark { id: string; name: string; en: string; category: string; description: string; position: V3; camera: { target: V3; yaw: number; pitch: number; distance: number }; accent: string; }
export interface Route { id: string; points: V3[]; color: string; kind: 'rail' | 'road' | 'boat'; speed: number; count: number; closed: boolean; }
export interface World { faces: Face[]; lines: Line[]; landmarks: Landmark[]; routes: Route[]; }
export interface CameraState { target: V3; yaw: number; pitch: number; distance: number; offsetY?: number; }
export interface RenderState { camera: CameraState; mode: Mode; layers: Record<Layer, boolean>; traffic: boolean; labels: boolean; time: number; selected: string | null; }
export interface ScreenPoint { x: number; y: number; depth: number; visible: boolean; scale: number; }
export interface CityRenderer { resize(width: number, height: number, dpr: number): void; render(state: RenderState): void; project(point: V3): ScreenPoint; dispose(): void; }
