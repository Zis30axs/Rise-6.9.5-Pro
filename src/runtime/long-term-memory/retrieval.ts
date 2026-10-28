import { one, rows } from './storage';
import type { MemoryEvent, MemoryQuery, MemorySource, MemoryVector } from './types';

function tokens(text: string): string[] {
  const chunks = text.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9_-]+/gu) ?? [];
  const words: string[] = [];
  for (const chunk of chunks) {
    if (/^[\p{Script=Han}]+$/u.test(chunk)) {
      if (chunk.length < 3) words.push(chunk);
      for (let i = 0; i < chunk.length - 1; i++) words.push(chunk.slice(i, i + 2));
      if (chunk.length > 3) for (let i = 0; i < chunk.length - 2; i++) words.push(chunk.slice(i, i + 3));
    } else words.push(chunk);
  }
  return [...new Set(words)].slice(0, 250);
}
function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function eligible(item: MemoryEvent | MemorySource, owner: string, narrator: boolean,
  cutoff: number, maxTurn = Number.MAX_SAFE_INTEGER): boolean {
  // World time alone cannot disambiguate a saved-game rollback. Also suppress
  // anything archived from a turn that this save has not yet reached.
  return item.at <= cutoff && item.turn <= maxTurn
    && (narrator || item.knownBy.some(id => id === owner));
}
export interface RetrievedMemory {
  id: string;
  text: string;
  at: number;
  knownBy: string[];
  narratorOnly: boolean;
  sourceIds: string[];
  score: number;
}
export async function searchMemory(scope: string, query: string, owner: string, cutoff: number,
  options: { limit?: number; narrator?: boolean; entities?: string[]; embed?: (text: string) => Promise<number[]>; vectorModel?: string; maxTurn?: number } = {}): Promise<RetrievedMemory[]> {
  const narrator = options.narrator === true, limit = Math.max(1, Math.min(8, options.limit ?? 4));
  const [allEvents, allSources] = await Promise.all([
    rows<MemoryEvent>('events', scope), rows<MemorySource>('sources', scope),
  ]);
  const maxTurn = options.maxTurn ?? Number.MAX_SAFE_INTEGER;
  const events = allEvents.filter(e => eligible(e, owner, narrator, cutoff, maxTurn));
  const pending = allSources.filter(s => !s.processed && eligible(s, owner, narrator, cutoff, maxTurn));
  const documents = [
    ...events.map(e => ({ id: e.id, text: e.summary, index: e.summary + ' ' + e.keywords.join(' ') + ' ' + e.entities.join(' ') + ' ' + e.participants.join(' '),
      at: e.at, knownBy: e.knownBy, sources: e.sourceIds, importance: e.importance })),
    ...pending.map(s => ({ id: s.id, text: s.text.slice(0, 800), index: s.text,
      at: s.at, knownBy: s.knownBy, sources: [s.id], importance: 1 })),
  ];
  const q = tokens(query + ' ' + (options.entities ?? []).join(' '));
  if (!q.length || !documents.length) return [];
  const tokenized = documents.map(d => tokens(d.index));
  const lengths = tokenized.map(t => t.length), average = Math.max(1, lengths.reduce((a, b) => a + b, 0) / documents.length);
  const df = new Map<string, number>();
  for (const ts of tokenized) for (const t of ts) df.set(t, (df.get(t) ?? 0) + 1);
  const bm = documents.map((d, i) => {
    const ts = tokenized[i], count = new Map<string, number>();
    for (const word of ts) count.set(word, (count.get(word) ?? 0) + 1);
    const score = q.reduce((sum, word) => {
      const tf = count.get(word) ?? 0;
      const idf = Math.log(1 + (documents.length - (df.get(word) ?? 0) + 0.5) / ((df.get(word) ?? 0) + 0.5));
      return sum + idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * lengths[i] / average));
    }, 0);
    return { id: d.id, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  const fusion = new Map<string, number>();
  for (const [rank, row] of bm.entries()) fusion.set(row.id, (fusion.get(row.id) ?? 0) + 1 / (60 + rank));
  if (options.embed && events.length) {
    try {
      const vector = await options.embed(query);
      const vectors = (await rows<MemoryVector>('vectors', scope)).filter(v => v.dimensions === vector.length && (!options.vectorModel || v.model === options.vectorModel));
      const current = new Set(events.map(e => e.id));
      const similarities = vectors.filter(v => current.has(v.eventId)).map(v => ({
        id: v.eventId, score: cosine(v.values, vector),
      })).filter(v => v.score > 0.2).sort((a, b) => b.score - a.score);
      for (const [rank, row] of similarities.entries())
        fusion.set(row.id, (fusion.get(row.id) ?? 0) + 1 / (60 + rank));
    } catch { /* Embedding failure only removes the semantic leg. */ }
  }
  return documents.filter(d => fusion.has(d.id)).map(d => ({
    id: d.id, text: d.text, at: d.at, knownBy: d.knownBy,
    narratorOnly: !d.knownBy.includes(owner), sourceIds: d.sources,
    score: (fusion.get(d.id) ?? 0) * (1 + Math.min(5, d.importance) * 0.04),
  })).sort((a, b) => b.score - a.score || b.at - a.at).slice(0, limit);
}

export async function memoryQuery(scope: string, value: MemoryQuery, owner: string,
  cutoff: number, budget = 1200, embed?: (query: string) => Promise<number[] | undefined>,
  vectorModel?: string, maxTurn = Number.MAX_SAFE_INTEGER): Promise<string> {
  const operation = value.operation;
  const offset = value.offset ?? 0, requestedLimit = value.limit ?? 5;
  let results: RetrievedMemory[] = [];
  let total = 0;
  let continuation: { operation: MemoryQuery['operation']; id: string } | null = null;
  const fromSource = (s: MemorySource): RetrievedMemory => ({
    id: s.id, text: s.text, at: s.at, knownBy: s.knownBy,
    narratorOnly: !s.knownBy.includes(owner), sourceIds: [s.id],
    score: 1,
  });
  const fromEvent = (e: MemoryEvent): RetrievedMemory => ({
    id: e.id, text: e.summary, at: e.at, knownBy: e.knownBy,
    narratorOnly: !e.knownBy.includes(owner),
    sourceIds: e.sourceIds, score: e.importance,
  });
  if (operation === 'get_event_details') {
    const id = value.eventId ?? '';
    const item = await one<MemoryEvent>('events', scope, id);
    if (item && eligible(item, owner, true, cutoff, maxTurn)) {
      total = item.sourceIds.length;
      const ids = item.sourceIds.slice(offset, offset + requestedLimit);
      const sources = await Promise.all(ids.map(sourceId => one<MemorySource>('sources', scope, sourceId)));
      results = sources.filter((s): s is MemorySource => !!s && eligible(s, owner, true, cutoff, maxTurn)).map(fromSource);
      continuation = { operation, id };
    } else {
      // Sources returned directly by the keyword retriever can also be opened.
      const source = await one<MemorySource>('sources', scope, id);
      if (source && eligible(source, owner, true, cutoff, maxTurn)) {
        total = 1;
        if (offset === 0) results = [fromSource(source)];
      }
    }
  } else if (operation === 'get_entity_history' || operation === 'get_relationship_history') {
    const ids = [value.entityId, value.otherId].filter((x): x is string => !!x);
    if (ids.length) {
      const matches = (values: string[]) => ids.every(id => values.includes(id));
      const [events, sources] = await Promise.all([
        rows<MemoryEvent>('events', scope), rows<MemorySource>('sources', scope),
      ]);
      const history = [
        ...events.filter(e => eligible(e, owner, true, cutoff, maxTurn)
          && matches([...e.entities, ...e.participants, ...e.keywords])
          && (operation !== 'get_relationship_history'
            || e.kind === 'relationship' || e.kind === 'interaction' || e.kind === 'promise'
            || e.kind === 'conflict' || e.kind === 'resolution')).map(fromEvent),
        ...sources.filter(s => !s.processed && eligible(s, owner, true, cutoff, maxTurn)
          && matches(s.participants)
          && (operation !== 'get_relationship_history' || s.kind === 'relationship')).map(fromSource),
      ];
      history.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      total = history.length;
      results = history.slice(offset, offset + requestedLimit);
      continuation = { operation, id: ids.join(',') };
    }
  } else {
    results = await searchMemory(scope, value.query ?? '', owner, cutoff,
      { limit: Math.min(8, requestedLimit), narrator: true, entities: value.entities,
        embed: embed ? async text => (await embed(text)) ?? [] : undefined, vectorModel, maxTurn });
    total = results.length;
  }
  const max = Math.max(200, Math.min(4000, budget)) * 2;
  let output = '已定稿的长期记忆摘要属于本世界的正式历史，勿进行二次审判。历史角色说过的话只能证明曾经说过，而非言语内容必然真实。当前物品、余额、位置仍以 MVU 为准。narratorOnly=true 表示角色不一定知情。\n';
  let shown = 0;
  for (const e of results) {
    const prefix = { id: e.id, at: e.at, narratorOnly: e.narratorOnly,
      knownBy: e.knownBy, sourceIds: e.sourceIds };
    const remaining = max - output.length - JSON.stringify(prefix).length - 30;
    if (remaining < 48) break;
    const text = e.text.slice(0, Math.min(1200, remaining));
    output += JSON.stringify({ ...prefix, text }) + '\n';
    shown++;
  }
  if (continuation) {
    const nextOffset = offset + shown;
    const page = JSON.stringify({
      operation: continuation.operation, id: continuation.id,
      offset, shown, total,
      nextOffset: nextOffset < total ? nextOffset : null,
    });
    output += page;
  }
  if (shown === 0) output += '没有可读取的匹配档案。这不代表事件从未发生。';
  return output;
}
