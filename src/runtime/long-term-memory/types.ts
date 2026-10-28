import type { ProtagonistId } from '../dual-protagonists';

export type MemoryProtocol = 'tools' | 'tags';
export type MemoryKind = 'story' | 'journal' | 'message' | 'weekly' | 'decision' | 'promise' | 'relationship' | 'item' | 'discovery' | 'conflict' | 'resolution';
export type MemoryJobState = 'pending' | 'working' | 'done' | 'failed';

export interface MemorySource {
  key: string;
  scope: string;
  id: string;
  kind: MemoryKind;
  owner: ProtagonistId | null;
  /** Only directly observed, committed information belongs to character knowledge. */
  knownBy: ProtagonistId[];
  participants: string[];
  text: string;
  at: number;
  turn: number;
  processed: boolean;
}

export interface MemoryEvent {
  key: string;
  scope: string;
  id: string;
  sourceIds: string[];
  kind: MemoryKind;
  summary: string;
  at: number;
  turn: number;
  participants: string[];
  knownBy: ProtagonistId[];
  entities: string[];
  keywords: string[];
  importance: number;
  visibility: 'narrator' | 'character';
  factuality: 'confirmed' | 'inferred';
  status: 'active' | 'superseded' | 'disputed';
}

export interface MemoryEntity {
  key: string;
  scope: string;
  id: string;
  name: string;
  kind: 'person' | 'item' | 'place' | 'unknown';
  lastSeenAt: number;
}
export interface MemoryEntityLink {
  key: string;
  scope: string;
  id: string;
  eventId: string;
  entityId: string;
}

export interface MemoryJob {
  key: string;
  scope: string;
  id: string;
  sourceIds: string[];
  toTurn: number;
  state: MemoryJobState;
  attempts: number;
  leaseUntil: number;
  error: string;
  createdAt: number;
  /** A paid model response is saved before parsing, so retries cannot bill it twice. */
  responseText?: string;
  responseCostUsd?: number;
  usageEstimated?: boolean;
}

export interface MemoryVector {
  key: string;
  scope: string;
  eventId: string;
  model: string;
  dimensions: number;
  values: number[];
}

export type MemoryQueryOperation =
  | 'search_memory'
  | 'get_event_details'
  | 'get_entity_history'
  | 'get_relationship_history';

export interface MemoryQuery {
  operation: MemoryQueryOperation;
  query?: string;
  eventId?: string;
  entities?: string[];
  entityId?: string;
  otherId?: string;
}

export function memoryKey(scope: string, id: string): string {
  return JSON.stringify([scope, id]);
}
