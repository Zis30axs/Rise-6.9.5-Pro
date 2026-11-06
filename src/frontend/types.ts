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
  channel: 'classroom' | 'study-room' | 'bookshop' | 'court-hearing' | null;
  interactionId: string | null;
  energyConsumed: number | null;
  moraleChange: number | null;
  stressChange: number | null;
  /** Recorded stationery used for this completed study session. */
  equipmentId?: string;
}
export interface AcademicState {
  majorId: string;
  /** Explicit legacy major correction; allows retained earned points without a fabricated last gain. */
  correction?: { previousMajorId: string; keepProgress: boolean };
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
  /** Established relationship fact, such as an agreed romance. Absent for strangers and old saves. */
  relationNote?: string;
}

export interface ContactProfileInput {
  id: string;
  name: string;
  portraitId: CharacterPortraitId;
  summary: string;
  sourcePersonId?: string | null;
}
export type ContactProfileDraft = Omit<ContactProfileInput, 'id'> & { id?: string };

export interface InteractionEventRateState {
  version: 1;
  /** Hidden, bounded per-protagonist random-event checks; not story or journal entries. */
  checks: {
    owner: import('../runtime/dual-protagonists').ProtagonistId;
    at: number;
    locationId: string;
    arrival: boolean;
    offered: boolean;
  }[];
}

export interface WorldState {
  /** Persistent world currency; absent only in pre-Tokyo saves. */
  currency?: 'JPY';
  schema_version: '1.11.0' | '1.12.0' | '1.13.0';
  /** Shared daily forecast. Old saves receive it from the civil date on load. */
  weather?: import('../runtime/weather').WeatherState;
  /** Added lazily when a dual-protagonist feature is first used. */
  protagonists?: import('../runtime/protagonist-world').ProtagonistWorld;
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  scene: ScenePresence | null;
  interior: InteriorPresence | null;
  airTraffic: AirTrafficState;
  transit: TransitState;
  /** Absent in old saves; populated after the first eligible event check. */
  interactionEventRate?: InteractionEventRateState;
  /** Hidden SMS-agent checks and reserved tasks; time is the game clock. */
  autonomousSms?: import('../runtime/autonomous-sms').AutonomousSmsState;
  /** Authored cafe offers and per-protagonist daily gift receipts. */
  margoCafeDaily?: import('../runtime/margo-cafe').MargoCafeState;
  /** Shared confirmed bands, invitations and performance bookings; absent in older saves. */
  livehouse?: import('../runtime/livehouse').LivehouseState;
  /** Tickets already used and instrument practice. Absent on old saves; skill starts at 0. */
  livehouseVisit?: import('../runtime/livehouse-visit').LivehouseVisitState;
  /** Shared profession cases and rewards, keyed by the responsible protagonist. */
  lawCareer?: import('../runtime/law-career').LawCareerState;
  /** Shared court docket, active trial, filings and saved verdicts; absent in older saves. */
  courtroom?: import('../runtime/courtroom').CourtroomState;
  /** Shared NPC major / career records, excluding controlled protagonists. */
  npcProfessions?: import('../runtime/npc-professions').NpcProfessions;
  /** Shared counseling records with Dr. Fengjin; weekly per protagonist. */
  fengjinClinic?: import('../runtime/fengjin-clinic').FengjinClinicState;
  /** Per-protagonist cooking sessions. Absent until someone starts a dish. */
  cooking?: import('../runtime/cooking').CookingState;
  player: PlayerState;
  /** Quantities count individual uses, not purchased packages. */
  inventory: { itemId: string; quantity: number; equipped?: import('../runtime/equipment').EquipmentSlot }[];
  academics: AcademicState | null;
  phone: { id: string; npcId: string; text: string; read: boolean; at: string }[];
  contacts: CharacterContact[];
  schedule: { id: string; title: string; locationId: string; time: string; done: boolean }[];
  journal: { id: string; text: string; at: string }[];
  story: { id: string; role: 'user' | 'assistant'; text: string; participantIds?: string[];
    /** Dedicated viewing beats; never mistaken for dialogue the current hero witnessed. */
    otherSideBeats?: { protagonists: import('../runtime/dual-protagonists').ProtagonistId[]; text: string }[];
    /** Continuation of the current viewpoint following the simultaneous beat. */
    returnStory?: string;
  }[];
}

export type WorldAction =
  | { type: 'receive_cafe_gift'; offerId: string }
  | { type: 'switch_protagonist'; target: import('../runtime/dual-protagonists').ProtagonistId }
  | { type: 'phone_app'; requestId: string; owner: import('../runtime/dual-protagonists').ProtagonistId; command: import('../runtime/protagonist-world').PhoneCommand }
  | ({ type: 'save_contact' } & ContactProfileInput)
  | { type: 'choose_academics'; majorId: string }
  | { type: 'correct_academics'; majorId: string; keepProgress: boolean }
  | { type: 'buy_item'; itemId: string; quantity: number }
  | { type: 'equip_item'; itemId: string; slot: import('../runtime/equipment').EquipmentSlot | null }
  | { type: 'pack_item'; itemId: string; quantity: number }
  | { type: 'pack_service'; serviceId: string; quantity: number }
  | { type: 'gift_item'; itemId: string; quantity: number; npcId: string; affinityDelta: number; reason: string }
  | { type: 'use_item'; itemId: string }
  | { type: 'cook_begin'; recipeId: string }
  | { type: 'cook_cancel'; sessionId: string }
  | { type: 'cook_settle'; sessionId: string; position: number }
  | { type: 'location_service'; serviceId: string; minutes?: number; knowledgeGain?: number }
  | { type: 'law_case'; phase: 'accept' | 'investigate' | 'present' | 'sherry'; caseId?: string; evidenceId?: string }
  | { type: 'courtroom'; phase: 'filter' | 'accept-preset' | 'confirm-filing' | 'migrate-legacy' | 'sherry' | 'enroll-law' | 'accept-settlement' | 'reject-settlement' | 'withdraw' | 'pay-term' | 'collect-term' | 'fulfill-term' | 'return-office'; offerId?: string; termId?: string; categories?: import('../runtime/courtroom').CourtCategory[] }
  | { type: 'novel_travel'; locationId: string; vehicleId?: string }
  | { type: 'novel_approach'; interactionId: string }
  | { type: 'air_traffic_tick'; now: number }
  | { type: 'enter_interior'; roomId: string }
  | { type: 'leave_interior' }
  | { type: 'interior_walk'; x: number; z: number; yaw: number }
  | { type: 'interior_interact'; interactionId: string; registration?: import('../runtime/livehouse').BandRegistrationInput; booking?: import('../runtime/livehouse').BookingInput }
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
  | { type: 'go_home' }
  | { type: 'exchange_contact'; npcId: string; consentQuote: string }
  | { type: 'send_sms'; targetId: string; text: string }
  | { type: 'social_invite'; targetId: string; source: 'meeting' | 'sms'; locationId: string; day: number; time: string; message: string;
      outcome: 'pending' | 'accepted' | 'declined'; responseQuote?: string;
      agenda?: import('../runtime/social-agenda').SocialAgendaDraft }
  | { type: 'social_agenda'; invitationId: string; decision: 'plan' | 'revise' | 'cancel' | 'no_show';
      triggerId: string; reason: string; agenda?: import('../runtime/social-agenda').SocialAgendaDraft }
  | { type: 'travel'; locationId: string }
  | { type: 'rest'; minutes: number; kind: 'sleep' | 'rest' | 'wait' }
  // Court observation can use any integer duration; the narrator chooses its knowledge grant.
  | { type: 'service'; serviceId: string; minutes?: number; knowledgeGain?: number }
  | { type: 'buy'; itemId: string; quantity: number }
  | { type: 'equip'; itemId: string; slot: import('../runtime/equipment').EquipmentSlot | null }
  | { type: 'pack'; itemId: string; quantity: number }
  | { type: 'takeaway'; serviceId: string; quantity: number }
  | { type: 'gift'; itemId: string; quantity: number; npcId: string; affinityDelta: number; reason: string }
  | { type: 'use'; itemId: string }
  | { type: 'interact'; interactionId: string }
  | { type: 'study'; subjectId: string; minutes: number }
  | { type: 'schedule'; title: string; locationId: string; time: string }
  | { type: 'complete_schedule'; id: string }
  | { type: 'relationship'; npcId: string; delta: number; reason: string }
  | { type: 'social_skill'; skillId: import('../runtime/social-skills').SocialSkillId; deviation: import('../runtime/social-skills').SocialDeviation; reason: string; npcId?: string }
  | { type: 'transfer'; from: string; to: string; cents: number; reason: string }
  | { type: 'court_docket'; offers: import('../runtime/courtroom').CourtOffer[] }
  | { type: 'court_special'; offer: import('../runtime/courtroom').CourtOffer }
  | { type: 'court_open'; offerId: string; respondent: string; white: string; evidence: import('../runtime/courtroom').CourtEvidence[] }
  | { type: 'court_quote'; defendant: string; reason: string; risk: string; category: import('../runtime/courtroom').CourtCategory; lawyer: import('../runtime/dual-protagonists').ProtagonistId | null; sherry: boolean; courtFeeYen: number; lawyerFeeYen: number; sherryFeeYen: number }
  | { type: 'court_step'; key: string; kind: 'testimony' | 'insight' | 'contradiction'; summary: string }
  | { type: 'court_assist'; who: 'sherry' }
  | { type: 'court_settlement'; summary: string; defendantConsented: boolean; terms: import('../runtime/court-legal-effects').CourtTermDraft[] }
  | { type: 'court_fulfill'; termId: string; description: string }
  | { type: 'court_finish'; verdict: 'win' | 'loss' | 'settled' | 'withdrawn'; summary: string; order?: import('../runtime/courtroom').CourtJudgmentOrder }
  | { type: 'activity'; label: string; minutes: number; effects: { energy: number; morale: number; stress: number; health: number; balance: number; satiety: number; foodEnergy: number } };

/** A validated, persisted event in one non-controlled protagonist's viewpoint. */
export interface OtherSideEvent {
  /** A co-located group has exactly one event and one narrative, never duplicate tags. */
  protagonists: import('../runtime/dual-protagonists').ProtagonistId[];
  text: string;
  /** Optional shared destination. Omitting it preserves each person's position. */
  locationId?: string;
  /** Per-character relative changes only; no wallet, inventory, time or arbitrary patches. */
  variables?: Partial<Record<import('../runtime/dual-protagonists').ProtagonistId,
    Partial<Pick<PlayerState, 'energy' | 'health' | 'stress' | 'morale' | 'satiety' | 'foodEnergy'>>>>;
  /** Only currently co-located, eligible NPCs; never a switchable viewpoint. */
  npcs?: { id: string; locationId?: string; status?: string; affinityDelta?: number }[];
  /** Canonical two-sided off-screen SMS; sender must be part of this event. */
  messages?: { from: import('../runtime/dual-protagonists').ProtagonistId; to: import('../runtime/dual-protagonists').ProtagonistId; text: string }[];
}

export interface GeneratedStory {
  otherSide?: OtherSideEvent[];
  returnStory?: string;
  text: string;
  phoneMessages: { npcId: string; text: string }[];
  worldEvents?: { type: 'airliner_pass' }[];
  worldActions?: StoryAction[];
  contactRequests?: import('../runtime/npc-phone').ContactProposal[];
  phoneDecision?: 'silence';
  /** An NPC/other-protagonist SMS may decide one previously sent invitation. */
  inviteDecision?: import('../runtime/natural-interactions').SocialInvitationDecision;
  /** A recipient's planned actions are committed together with acceptance. */
  inviteAgenda?: import('../runtime/social-agenda').SocialAgendaDraft;
  /** Optional off-screen novel passage accompanying a manually requested SMS reply. */
  phoneSceneText?: string;
  autonomousSmsText?: string | null;
  bandDecision?: import('../runtime/livehouse').BandDecision;
  weeklySummary?: { week: number; text: string };
}

export type StoryGenerationOptions = {
  kind: 'autonomous_sms';
  ticketId: string;
} | {
  kind: 'phone_reply' | 'npc_phone_reply' | 'band_invitation_reply';
  messageId: string;
} | {
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
  detail?: string;
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
  memoryScope?: string;
  state: WorldState;
  busy: boolean;
  /** Temporary presentation lock; never serialized into WorldState. */
  switchingProtagonist?: boolean;
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
  /** Transient request to return from a message bubble to its saved novel entry. */
  phoneSceneJump?: { id: string; token: number };
}

export interface ShellActions {
  beginProtagonistSwitch?(target: import('../runtime/dual-protagonists').ProtagonistId): import('./protagonist-switch').ProtagonistSwitchLease | null;
  dispatch(action: WorldAction): void;
  interact?(action: WorldAction): Promise<boolean>;
  resolveInteraction?(accept: boolean): Promise<void>;
  cancelInteraction?(): void;
  /** Narrative-only recaps may not submit additional world effects. */
  send(text: string, mode?: 'story' | 'law_narration'): Promise<void>;
  exit(): void;
  switchChat(): void;
  openPhone(anchor?: HTMLElement): void;
  closePhone(): void;
  openPhoneContact(npcId: string): Promise<void>;
  openPhoneContactEditor?(sourcePersonId?: string): Promise<void>;
  retryPhoneSync(): void;
  setDismissHandler?(handler: (() => boolean) | undefined): void;
}


