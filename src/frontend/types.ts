export interface WorldState {
  schema_version: '1.0.0';
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  player: { energy: number; balance: number };
  phone: { id: string; npcId: string; text: string; read: boolean; at: string }[];
  contacts: { id: string; name: string; tag: string; summary: string; affinity: number; status: string }[];
  schedule: { id: string; title: string; locationId: string; time: string; done: boolean }[];
  journal: { id: string; text: string; at: string }[];
  story: { id: string; role: 'user' | 'assistant'; text: string }[];
}

export type WorldAction =
  | { type: 'travel'; locationId: string }
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
