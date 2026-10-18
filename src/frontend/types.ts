export interface ScenePresence {
  x: number;
  z: number;
  yaw: number;
  areaId: string;
  seed: string;
  encounterId: string | null;
}

/** A persisted high-altitude pass. Rendering never changes its start time. */
export interface AirlinerPass {
  id: string;
  source: 'ambient' | 'story';
  startedAt: number;
  durationMs: 40000;
  routeIndex: 0 | 1 | 2 | 3;
}

export interface AirTrafficState {
  sequence: number;
  nextAmbientAt: number;
  cooldownUntil: number;
  lastFlight: AirlinerPass | null;
}

/** Local room pose; the outdoor scene is retained separately for leaving. */
export interface InteriorRestRecord {
  optionId: string;
  minutes: number;
  energyRecovered: number;
}

export interface InteriorStudyRecord {
  interactionId: string;
  optionId: string;
  minutes: number;
  energyConsumed: number;
}

export interface InteriorPresence {
  roomId: string;
  x: number;
  z: number;
  yaw: number;
  activityId: string | null;
  lastRest: InteriorRestRecord | null;
  lastStudy: InteriorStudyRecord | null;
}

export interface TransitRide {
  id: string;
  vehicleId: 'btr82a' | 'zbd04a';
  fromStopId: string;
  toStopId: string;
  minutes: number;
  fare: number;
  at: string;
}

export interface TransitState {
  sequence: number;
  lastRide: TransitRide | null;
}

export interface WorldState {
  schema_version: '1.6.0';
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  scene: ScenePresence | null;
  interior: InteriorPresence | null;
  airTraffic: AirTrafficState;
  transit: TransitState;
  player: { energy: number; balance: number };
  phone: { id: string; npcId: string; text: string; read: boolean; at: string }[];
  contacts: { id: string; name: string; tag: string; summary: string; affinity: number; status: string }[];
  schedule: { id: string; title: string; locationId: string; time: string; done: boolean }[];
  journal: { id: string; text: string; at: string }[];
  story: { id: string; role: 'user' | 'assistant'; text: string }[];
}

export type WorldAction =
  | { type: 'air_traffic_tick'; now: number }
  | { type: 'enter_interior'; roomId: string }
  | { type: 'leave_interior' }
  | { type: 'interior_walk'; x: number; z: number; yaw: number }
  | { type: 'interior_interact'; interactionId: string }
  | { type: 'interior_rest'; optionId: string }
  | { type: 'interior_study'; interactionId: string; optionId: string }
  | { type: 'ride_transit'; vehicleId: string; stopId: string }
  | { type: 'travel'; locationId: string }
  | { type: 'walk'; x: number; z: number; yaw: number; seed: string }
  | { type: 'encounter'; personId: string }
  | { type: 'wait'; minutes: number }
  | { type: 'read_phone'; id: string }
  | { type: 'complete_schedule'; id: string };

export interface Location {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  x: number;
  y: number;
}

/** Validated narrative output. IDs, timestamps and read state are assigned by the runtime. */
export interface GeneratedStory {
  text: string;
  phoneMessages: { npcId: string; text: string }[];
  worldEvents?: { type: 'airliner_pass' }[];
}

export interface Bridge {
  kind: 'demo' | 'tavern';
  label: string;
  session(): string | null;
  load(): WorldState;
  save(state: WorldState): void;
  onSessionChange(callback: () => void): () => void;
  generate(text: string, state: WorldState): Promise<GeneratedStory>;
  cancel(): void;
  dispose(): void;
}

export interface ShellModel {
  mode: Bridge['kind'];
  state: WorldState;
  busy: boolean;
  notice: string;
  connection: string;
  externalPhoneAvailable: boolean;
  externalPhoneOpen: boolean;
  phoneStatus: 'idle' | 'loading' | 'ready' | 'error';
  phoneError: string;
  phoneSource: 'none' | 'extension' | 'embedded';
  phoneLinkStatus: 'idle' | 'loading' | 'ready' | 'error';
  phoneLinkError: string;
  phoneUnread: number;
  phoneContactUnread: { npcId: string; unread: number }[];
}

export interface ShellActions {
  dispatch(action: WorldAction): void;
  send(text: string): Promise<void>;
  exit(): void;
  switchChat(): void;
  openPhone(anchor?: HTMLElement): void;
  closePhone(): void;
  openPhoneContact(npcId: string): Promise<void>;
  retryPhoneSync(): void;
  setDismissHandler?(handler: (() => boolean) | undefined): void;
}
