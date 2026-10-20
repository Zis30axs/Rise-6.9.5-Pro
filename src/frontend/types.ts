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

export interface PlayerState {
  /** Immediate energy, 0..100 in exact hundredths. */
  energy: number;
  /** Legacy-compatible projection; in 1.12 Appie Pay is authoritative. */
  balance: number;
  health: number;
  stress: number;
  morale: number;
  satiety: number;
  /** Game food reserve, in kcal; separate from immediate energy. */
  foodEnergy: number;
}

export interface AcademicGain {
  subjectId: string;
  minutes: number;
  points: number;
  totalPoints: number;
  at: string;
  /** Null means a 1.9 historical record without outcome evidence. */
  outcome: 'normal' | 'inspiration' | 'confusion' | null;
  channel: 'classroom' | 'study-room' | 'bookshop' | null;
  interactionId: string | null;
  energyConsumed: number | null;
  moraleChange: number | null;
  stressChange: number | null;
}
export interface AcademicState {
  majorId: string;
  /** Per-subject progress uses exact half points. */
  subjects: { subjectId: string; points: number }[];
  lastGain: AcademicGain | null;
}

export type CharacterPortraitId = 'deepseek' | 'xiaoyang' | 'claude';

export interface CharacterContact {
  id: string;
  name: string;
  tag: string;
  summary: string;
  affinity: number;
  status: string;
  portraitId: CharacterPortraitId;
  /** Stable pedestrian identity, retained after the player leaves the scene. */
  sourcePersonId: string | null;
  isMain: boolean;
}

export interface ContactProfileInput {
  id: string;
  name: string;
  portraitId: CharacterPortraitId;
  summary: string;
  sourcePersonId?: string | null;
}
export type ContactProfileDraft = Omit<ContactProfileInput, 'id'> & { id?: string };

export interface WorldState {
  schema_version: '1.11.0' | '1.12.0';
  /** Added lazily when a dual-protagonist feature is first used. */
  protagonists?: import('../runtime/protagonist-world').ProtagonistWorld;
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  scene: ScenePresence | null;
  interior: InteriorPresence | null;
  airTraffic: AirTrafficState;
  transit: TransitState;
  player: PlayerState;
  /** Quantities count individual uses, not purchased packages. */
  inventory: { itemId: string; quantity: number }[];
  academics: AcademicState | null;
  phone: { id: string; npcId: string; text: string; read: boolean; at: string }[];
  contacts: CharacterContact[];
  schedule: { id: string; title: string; locationId: string; time: string; done: boolean }[];
  journal: { id: string; text: string; at: string }[];
  story: { id: string; role: 'user' | 'assistant'; text: string; participantIds?: string[] }[];
}

export type WorldAction =
  | { type: 'switch_protagonist'; target: import('../runtime/dual-protagonists').ProtagonistId }
  | { type: 'phone_app'; requestId: string; owner: import('../runtime/dual-protagonists').ProtagonistId; command: import('../runtime/protagonist-world').PhoneCommand }
  | ({ type: 'save_contact' } & ContactProfileInput)
  | { type: 'choose_academics'; majorId: string }
  | { type: 'buy_item'; itemId: string; quantity: number }
  | { type: 'pack_item'; itemId: string; quantity: number }
  | { type: 'pack_service'; serviceId: string; quantity: number }
  | { type: 'gift_item'; itemId: string; quantity: number; npcId: string; affinityDelta: number; reason: string }
  | { type: 'use_item'; itemId: string }
  | { type: 'location_service'; serviceId: string }
  | { type: 'novel_travel'; locationId: string; vehicleId?: string }
  | { type: 'novel_approach'; interactionId: string }
  | { type: 'air_traffic_tick'; now: number }
  | { type: 'enter_interior'; roomId: string }
  | { type: 'leave_interior' }
  | { type: 'interior_walk'; x: number; z: number; yaw: number }
  | { type: 'interior_interact'; interactionId: string }
  | { type: 'interior_rest'; optionId: string }
  | { type: 'interior_study'; interactionId: string; optionId: string; subjectId: string }
  | { type: 'read_subject'; subjectId: string; optionId: string }
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
export type StoryAction =
  | { type: 'travel'; locationId: string }
  | { type: 'rest'; minutes: number; kind: 'sleep' | 'rest' | 'wait' }
  | { type: 'service'; serviceId: string }
  | { type: 'buy'; itemId: string; quantity: number }
  | { type: 'pack'; itemId: string; quantity: number }
  | { type: 'takeaway'; serviceId: string; quantity: number }
  | { type: 'gift'; itemId: string; quantity: number; npcId: string; affinityDelta: number; reason: string }
  | { type: 'use'; itemId: string }
  | { type: 'interact'; interactionId: string }
  | { type: 'study'; subjectId: string; minutes: number }
  | { type: 'schedule'; title: string; locationId: string; time: string }
  | { type: 'complete_schedule'; id: string }
  | { type: 'relationship'; npcId: string; delta: number; reason: string }
  | { type: 'activity'; label: string; minutes: number; effects: { energy: number; morale: number; stress: number; health: number; balance: number; satiety: number; foodEnergy: number } };

export interface GeneratedStory {
  text: string;
  phoneMessages: { npcId: string; text: string }[];
  worldEvents?: { type: 'airliner_pass' }[];
  worldActions?: StoryAction[];
}

export type StoryGenerationOptions = {
  kind: 'interaction_event';
  interaction: { label: string; action: WorldAction };
} | {
  kind: 'contact_introduction';
  contact: { id?: string; name: string; portraitId: CharacterPortraitId; sourcePersonId: string | null; summary: string };
};

export interface InteractionPresentation {
  phase: 'progress' | 'choice' | 'generating' | 'error';
  label: string;
  progress: number;
  error?: string;
}

export interface Bridge {
  kind: 'demo' | 'tavern';
  label: string;
  session(): string | null;
  load(): WorldState;
  save(state: WorldState): void;
  onSessionChange(callback: () => void): () => void;
  generate(text: string, state: WorldState, options?: StoryGenerationOptions): Promise<GeneratedStory>;
  cancel(): void;
  dispose(): void;
}

export interface ShellModel {
  mode: Bridge['kind'];
  state: WorldState;
  busy: boolean;
  interaction?: InteractionPresentation | null;
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
  interact?(action: WorldAction): Promise<boolean>;
  resolveInteraction?(accept: boolean): Promise<void>;
  cancelInteraction?(): void;
  send(text: string): Promise<void>;
  exit(): void;
  switchChat(): void;
  openPhone(anchor?: HTMLElement): void;
  closePhone(): void;
  openPhoneContact(npcId: string): Promise<void>;
  openPhoneContactEditor?(sourcePersonId?: string): Promise<void>;
  retryPhoneSync(): void;
  setDismissHandler?(handler: (() => boolean) | undefined): void;
}
