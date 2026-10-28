import { memoryKey } from './types';
import type { MemoryEntity, MemoryEntityLink, MemoryEvent, MemoryJob, MemorySource, MemoryVector } from './types';

const DB_NAME = 'unread-city-memory-v1';
type Table = 'sources' | 'events' | 'entities' | 'entity_links' | 'vectors' | 'jobs' | 'metadata';
let cached: Promise<IDBDatabase> | null = null;

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('读取长期记忆失败'));
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('记忆事务失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('记忆事务被中断'));
  });
}
export function openMemoryDb(): Promise<IDBDatabase> {
  if (cached) return cached;
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('当前设备不支持 IndexedDB'));
  cached = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const table of ['sources', 'events', 'entities', 'entity_links', 'vectors', 'jobs', 'metadata'] as Table[]) {
        if (!db.objectStoreNames.contains(table)) {
          const store = db.createObjectStore(table, { keyPath: 'key' });
          store.createIndex('by_scope', 'scope', { unique: false });
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); cached = null; };
      resolve(db);
    };
    request.onerror = () => { cached = null; reject(request.error ?? new Error('无法打开长期记忆库')); };
    request.onblocked = () => { cached = null; reject(new Error('长期记忆库暂时被另一窗口占用')); };
  });
  return cached;
}

export async function rows<T>(table: Table, scope: string): Promise<T[]> {
  const db = await openMemoryDb(), tx = db.transaction(table, 'readonly');
  const done = completed(tx);
  const result = await requested(tx.objectStore(table).index('by_scope').getAll(scope));
  await done;
  return result as T[];
}
export async function one<T>(table: Table, scope: string, id: string): Promise<T | undefined> {
  const db = await openMemoryDb(), tx = db.transaction(table, 'readonly');
  const done = completed(tx);
  const value = await requested(tx.objectStore(table).get(memoryKey(scope, id)));
  await done;
  return value as T | undefined;
}
export async function put<T extends { key: string }>(table: Table, value: T): Promise<void> {
  const db = await openMemoryDb(), tx = db.transaction(table, 'readwrite');
  const done = completed(tx);
  tx.objectStore(table).put(value);
  await done;
}
export async function ingestSources(sources: MemorySource[]): Promise<void> {
  if (!sources.length) return;
  const db = await openMemoryDb(), tx = db.transaction('sources', 'readwrite');
  const done = completed(tx), store = tx.objectStore('sources');
  // Do not reset the processed marker when replaying a committed event.
  for (const source of sources) {
    const request = store.get(source.key);
    request.onsuccess = () => {
      const existing = request.result as MemorySource | undefined;
      if (!existing) store.put(source);
    };
  }
  await done;
}
export async function finalizeJob(job: MemoryJob, events: MemoryEvent[], vectors: MemoryVector[]): Promise<void> {
  const db = await openMemoryDb();
  const tx = db.transaction(['sources', 'events', 'entities', 'entity_links', 'vectors', 'jobs', 'metadata'], 'readwrite');
  const done = completed(tx);
  const sources = tx.objectStore('sources');
  for (const sourceId of job.sourceIds) {
    const request = sources.get(memoryKey(job.scope, sourceId));
    request.onsuccess = () => {
      const item = request.result as MemorySource | undefined;
      if (item) sources.put({ ...item, processed: true });
    };
  }
  const entityStore = tx.objectStore('entities');
  const linkStore = tx.objectStore('entity_links');
  for (const event of events) {
    tx.objectStore('events').put(event);
    const participants = new Set(event.participants);
    for (const name of new Set([...event.participants, ...event.entities].filter(Boolean).slice(0, 32))) {
      if (name.length > 100) continue;
      const entity: MemoryEntity = {
        key: memoryKey(job.scope, name), scope: job.scope, id: name,
        name, kind: participants.has(name) ? 'person' : 'unknown', lastSeenAt: event.at,
      };
      const id = JSON.stringify([event.id, name]);
      const link: MemoryEntityLink = { key: memoryKey(job.scope, id),
        scope: job.scope, id, eventId: event.id, entityId: name };
      entityStore.put(entity);
      linkStore.put(link);
    }
  }
  for (const vector of vectors) tx.objectStore('vectors').put(vector);
  tx.objectStore('jobs').put({ ...job, state: 'done', leaseUntil: 0, error: '' });
  tx.objectStore('metadata').put({
    key: memoryKey(job.scope, 'lastTurn'), scope: job.scope, id: 'lastTurn', value: job.toTurn,
  });
  await done;
}
/** Save model output and the financial receipt in one IndexedDB transaction. */
export async function recordPaidJobResponse(job: MemoryJob, text: string,
  costUsd: number, estimated: boolean): Promise<void> {
  if (!text || text.length > 64000 || !Number.isFinite(costUsd) || costUsd < 0)
    throw new Error('整理模型计费记录无效');
  const db = await openMemoryDb();
  const tx = db.transaction(['jobs', 'metadata'], 'readwrite');
  const done = completed(tx), jobs = tx.objectStore('jobs'), metadata = tx.objectStore('metadata');
  const request = jobs.get(job.key);
  request.onsuccess = () => {
    const stored = request.result as MemoryJob | undefined;
    if (!stored || stored.state !== 'working') { tx.abort(); return; }
    if (stored.responseText) return;
    jobs.put({ ...stored, responseText: text, responseCostUsd: costUsd, usageEstimated: estimated });
    if (costUsd > 0) {
      const total = metadata.get(memoryKey(job.scope, 'costUsd'));
      total.onsuccess = () => {
        const existing = total.result as { value?: number } | undefined;
        metadata.put({ key: memoryKey(job.scope, 'costUsd'), scope: job.scope,
          id: 'costUsd', value: (existing?.value ?? 0) + costUsd });
      };
    }
  };
  await done;
}

/** A stored vector and its cost receipt either both land or neither does. */
export async function saveEmbeddingWithCharge(vector: MemoryVector, costUsd: number): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error('Embedding 费用无效');
  const db = await openMemoryDb(), tx = db.transaction(['vectors', 'metadata'], 'readwrite');
  const done = completed(tx), vectors = tx.objectStore('vectors'), metadata = tx.objectStore('metadata');
  const request = vectors.get(vector.key);
  request.onsuccess = () => {
    if (request.result) return;
    vectors.put(vector);
    if (costUsd <= 0) return;
    const total = metadata.get(memoryKey(vector.scope, 'costUsd'));
    total.onsuccess = () => {
      const existing = total.result as { value?: number } | undefined;
      metadata.put({ key: memoryKey(vector.scope, 'costUsd'), scope: vector.scope,
        id: 'costUsd', value: (existing?.value ?? 0) + costUsd });
    };
  };
  await done;
}

export async function acquireJob(scope: string): Promise<MemoryJob | null> {
  const all = await rows<MemoryJob>('jobs', scope);
  const now = Date.now();
  const target = all.filter(j => (j.state === 'pending' && j.leaseUntil <= now) || (j.state === 'working' && j.leaseUntil < now))
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!target) return null;
  const db = await openMemoryDb(), tx = db.transaction('jobs', 'readwrite');
  const done = completed(tx), store = tx.objectStore('jobs');
  let acquired: MemoryJob | null = null;
  const request = store.get(target.key);
  request.onsuccess = () => {
    const current = request.result as MemoryJob | undefined;
    if (!current || !((current.state === 'pending' && current.leaseUntil <= now) || (current.state === 'working' && current.leaseUntil < now))) return;
    acquired = { ...current, state: 'working', attempts: current.attempts + 1, leaseUntil: now + 120_000 };
    store.put(acquired);
  };
  await done;
  return acquired;
}

/** Manual retry intentionally resets exhausted work, but never replays a committed game action. */
export async function resetFailedJobs(scope: string): Promise<number> {
  const db = await openMemoryDb();
  const tx = db.transaction('jobs', 'readwrite'), done = completed(tx);
  const store = tx.objectStore('jobs');
  let count = 0;
  const request = store.index('by_scope').getAll(scope);
  request.onsuccess = () => {
    for (const job of request.result as MemoryJob[]) {
      if (job.state !== 'failed') continue;
      store.put({ ...job, state: 'pending', leaseUntil: 0, attempts: 0, error: '',
        // A manual retry deliberately allows correcting a malformed paid reply.
        responseText: undefined, responseCostUsd: undefined, usageEstimated: undefined });
      count++;
    }
  };
  await done;
  return count;
}

export interface MemoryBackup {
  version: 1;
  sources: MemorySource[];
  events: MemoryEvent[];
  entities?: MemoryEntity[];
  entity_links?: MemoryEntityLink[];
  vectors: MemoryVector[];
  jobs: MemoryJob[];
  metadata: { key: string; scope: string; id: string; value: unknown }[];
}
export async function exportMemory(scope: string): Promise<MemoryBackup> {
  const [sources, events, entities, entity_links, vectors, jobs, metadata] = await Promise.all([
    rows<MemorySource>('sources', scope), rows<MemoryEvent>('events', scope),
    rows<MemoryEntity>('entities', scope), rows<MemoryEntityLink>('entity_links', scope),
    rows<MemoryVector>('vectors', scope), rows<MemoryJob>('jobs', scope),
    rows<{ key: string; scope: string; id: string; value: unknown }>('metadata', scope),
  ]);
  return { version: 1, sources, events, entities, entity_links, vectors, jobs, metadata };
}
export async function importMemory(scope: string, raw: unknown): Promise<void> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('备份文件格式无效');
  const data = raw as Partial<MemoryBackup>;
  if (data.version !== 1 || !Array.isArray(data.sources) || !Array.isArray(data.events)
    || !Array.isArray(data.jobs) || !Array.isArray(data.vectors) || !Array.isArray(data.metadata)
    || data.sources.length > 100000 || data.events.length > 100000) throw new Error('备份版本或容量无效');
  const db = await openMemoryDb();
  const tables = ['sources', 'events', 'entities', 'entity_links', 'vectors', 'jobs', 'metadata'] as const;
  const tx = db.transaction(tables, 'readwrite'), done = completed(tx);
  for (const table of tables) {
    const collection = data[table] ?? [];
    if (!Array.isArray(collection) || collection.length > 100000) {
      tx.abort(); throw new Error('备份条目数量无效');
    }
    for (const value of collection) {
      if (!value || typeof value !== 'object' || typeof value.key !== 'string') {
        tx.abort(); throw new Error('备份记录无效');
      }
      // Vectors have eventId rather than an id field. Preserve their composite
      // model-scoped key when rebinding a backup to a new chat.
      let identity: unknown;
      try {
        const original = JSON.parse(value.key) as unknown;
        identity = Array.isArray(original) && original.length === 2 ? original[1] : null;
      } catch { identity = null; }
      if (typeof identity !== 'string' || !identity || identity.length > 500) {
        tx.abort(); throw new Error('备份记录索引无效');
      }
      const record = { ...value, scope, key: memoryKey(scope, identity) };
      tx.objectStore(table).put(record);
    }
  }
  await done;
}
export async function memoryStats(scope: string): Promise<{ sources: number; events: number; pending: number; costUsd: number }> {
  const [sources, events, jobs, cost] = await Promise.all([
    rows<MemorySource>('sources', scope), rows<MemoryEvent>('events', scope),
    rows<MemoryJob>('jobs', scope), one<{ value: number }>('metadata', scope, 'costUsd'),
  ]);
  return { sources: sources.length, events: events.length, pending: jobs.filter(j => j.state !== 'done').length,
    costUsd: cost?.value ?? 0 };
}
