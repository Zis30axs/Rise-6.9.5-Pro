import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, protagonistForPerson } from './dual-protagonists';
import { activeProtagonist, personState, protagonistNames } from './protagonist-world';
import { allResidentCast } from './npc-cast';

/**
 * A private, read-only-to-the-narrator archive. Reading these pages in the
 * player interface NEVER grants knowledge to the controlled character.
 * Kept separate from the bounded in-world journal and seven-day memory.
 */
export interface NotebookPerson { id: string; name: string; group: '主角' | '居民' | '联系人' }
export interface NotebookDraft { personId: string; title: string; text: string }
export interface NotebookPage {
  id: string;
  personId: string;
  title: string;
  text: string;
  kind: 'character' | 'observer';
  at: number;
  turn: number;
  sourceId: string;
}
interface StoredPage extends NotebookPage { key: string; scope: string }

export function notebookPeople(state: WorldState): NotebookPerson[] {
  const people = new Map<string, NotebookPerson>();
  for (const id of PROTAGONISTS) people.set(id, { id, name: protagonistNames[id], group: '主角' });
  for (const person of allResidentCast) {
    const id = protagonistForPerson(person.id) ?? person.id;
    if (!people.has(id)) people.set(id, { id, name: person.name, group: '居民' });
  }
  for (const protagonist of PROTAGONISTS) {
    const contacts = state.protagonists
      ? personState(state, protagonist).contacts
      : protagonist === 'soyo' ? state.contacts : [];
    for (const person of contacts) {
      const id = person.sourcePersonId
        ? (protagonistForPerson(person.sourcePersonId) ?? person.sourcePersonId)
        : 'contact:' + person.id;
      if (!people.has(id)) people.set(id, { id, name: person.name, group: '联系人' });
    }
  }
  return [...people.values()];
}

function validText(text: unknown, max: number): text is string {
  return typeof text === 'string' && !!text.trim() && text.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
}

export function validateNotebookDrafts(raw: unknown, state: WorldState): NotebookDraft[] {
  if (!Array.isArray(raw) || raw.length > 2) throw new Error('手账一次最多记录两页');
  const known = new Set(notebookPeople(state).map(person => person.id));
  const used = new Set<string>();
  return raw.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('手账格式无效');
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== 'personId,text,title'
      || typeof item.personId !== 'string' || !known.has(item.personId)
      || !validText(item.title, 60) || !validText(item.text, 700)
      || used.has(item.personId)) throw new Error('手账人物或文字无效');
    used.add(item.personId);
    return { personId: item.personId, title: item.title.trim(), text: item.text.trim() };
  });
}

export const notebookMinute = (state: WorldState): number =>
  (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
export const notebookTurn = (state: WorldState): number =>
  state.protagonists?.narrativeTurn ?? 0;

function validPage(value: unknown): value is NotebookPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Partial<NotebookPage>;
  return typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 160
    && typeof p.personId === 'string' && p.personId.length > 0 && p.personId.length <= 160
    && validText(p.title, 60) && validText(p.text, 2000)
    && (p.kind === 'character' || p.kind === 'observer')
    && Number.isSafeInteger(p.at) && p.at! >= 0
    && Number.isSafeInteger(p.turn) && p.turn! >= 0
    && typeof p.sourceId === 'string' && p.sourceId.length <= 160;
}

export function notebookPageFromDraft(draft: NotebookDraft, state: WorldState,
  assistantId: string, index: number): NotebookPage {
  return {
    id: 'story:' + assistantId + ':' + index,
    personId: draft.personId, title: draft.title, text: draft.text,
    kind: 'character', at: notebookMinute(state),
    turn: notebookTurn(state), sourceId: assistantId,
  };
}

export function makePersonalNotebookPage(
  state: WorldState, personId: string, title: string, text: string,
): NotebookPage {
  if (!notebookPeople(state).some(person => person.id === personId)
    || !validText(title, 60) || !validText(text, 2000)) {
    throw new Error('请填写合法的手账人物、标题与正文');
  }
  const isSelf = personId === activeProtagonist(state);
  return {
    id: 'manual:' + (globalThis.crypto?.randomUUID?.()
      ?? (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))),
    personId, title: title.trim(), text: text.trim(),
    kind: isSelf ? 'character' : 'observer',
    at: notebookMinute(state), turn: notebookTurn(state), sourceId: '',
  };
}

const DB_NAME = 'unread-city-notebooks-v1';
let opening: Promise<IDBDatabase> | null = null;

function openBook(): Promise<IDBDatabase> {
  if (opening) return opening;
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前环境不支持长期本地存储'));
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pages')) {
        const pages = db.createObjectStore('pages', { keyPath: 'key' });
        pages.createIndex('by_scope', 'scope', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => { opening = null; reject(request.error ?? new Error('手账数据库无法打开')); };
    request.onblocked = () => { opening = null; reject(new Error('手账数据库被其他窗口占用')); };
  });
  return opening;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('手账保存被中断'));
    tx.onerror = () => reject(tx.error ?? new Error('手账保存失败'));
  });
}

function assertScope(scope: string): void {
  if (!scope || scope.length > 3000) throw new Error('当前聊天没有有效的手账存储分区');
}

export async function readNotebook(scope: string): Promise<NotebookPage[]> {
  assertScope(scope);
  const db = await openBook(), tx = db.transaction('pages', 'readonly');
  const finished = transactionDone(tx);
  const request = tx.objectStore('pages').index('by_scope').getAll(IDBKeyRange.only(scope));
  const result = await new Promise<StoredPage[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredPage[]);
    request.onerror = () => reject(request.error ?? new Error('无法读取手账'));
  });
  await finished;
  return result.filter(validPage).map(({ key: _key, scope: _scope, ...page }) => page)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export async function writeNotebook(scope: string, pages: readonly NotebookPage[]): Promise<void> {
  assertScope(scope);
  if (!pages.length) return;
  if (pages.some(page => !validPage(page))) throw new Error('手账内容未通过校验');
  const db = await openBook(), tx = db.transaction('pages', 'readwrite');
  const finished = transactionDone(tx);
  const store = tx.objectStore('pages');
  const unique = new Map(pages.map(page => [page.id, page]));
  for (const page of unique.values()) {
    // Never revise a committed page, including when a model turn is retried.
    // The read and conditional add stay inside one serialized IDB transaction.
    const key = JSON.stringify([scope, page.id]);
    const query = store.get(key);
    query.onsuccess = () => {
      if (!query.result) store.add({ ...page, scope, key } satisfies StoredPage);
    };
  }
  await finished;
}

export async function exportNotebook(scope: string): Promise<string> {
  const pages = await readNotebook(scope);
  return JSON.stringify({ version: 1, pages }, null, 2);
}

export async function importNotebook(scope: string, raw: string,
  state: WorldState): Promise<number> {
  assertScope(scope);
  if (raw.length > 30_000_000) throw new Error('备份文件过大');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('手账备份无效');
  const object = value as Record<string, unknown>;
  if (object.version !== 1 || !Array.isArray(object.pages)
    || object.pages.length > 20000) throw new Error('手账备份版本或数量无效');
  const known = new Set(notebookPeople(state).map(person => person.id));
  if (object.pages.some(p => !validPage(p) || !known.has(p.personId))) {
    throw new Error('备份包含未知角色或不合法的页面');
  }
  const pages = object.pages as NotebookPage[];
  if (new Set(pages.map(p => p.id)).size !== pages.length) throw new Error('备份存在重复页面');
  const current = await readNotebook(scope);
  const existing = new Set(current.map(p => p.id));
  const fresh = pages.filter(p => !existing.has(p.id)
    && p.at <= notebookMinute(state) && p.turn <= notebookTurn(state));
  await writeNotebook(scope, fresh);
  return fresh.length;
}
