import type { MemoryProtocol } from './types';

export interface MemorySettings {
  enabled: boolean;
  passive: boolean;
  interval: number;
  important: boolean;
  protocol: MemoryProtocol;
  tokenBudget: number;
  maxLookups: number;
  assistantEndpoint: string;
  assistantModel: string;
  assistantFormat: 'chat' | 'responses';
  embeddingEndpoint: string;
  embeddingModel: string;
  inputBudget: number;
  outputBudget: number;
  budgetUsd: number;
  inputPrice: number;
  outputPrice: number;
  embeddingPrice: number;
}

const KEY = 'unread-city:long-term-memory:settings:v1';
const SECRET = 'unread-city:long-term-memory:api-key:v1';
const EMBEDDING_SECRET = 'unread-city:long-term-memory:embedding-key:v1';

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  passive: true,
  interval: 20,
  important: true,
  protocol: 'tags',
  tokenBudget: 1200,
  maxLookups: 1,
  assistantEndpoint: '',
  assistantModel: '',
  assistantFormat: 'chat',
  embeddingEndpoint: '',
  embeddingModel: '',
  inputBudget: 12000,
  outputBudget: 1500,
  budgetUsd: 0,
  inputPrice: 0,
  outputPrice: 0,
  embeddingPrice: 0,
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
}
function string(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}
function normalizeSettings(raw: unknown): MemorySettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_MEMORY_SETTINGS };
  const v = raw as Record<string, unknown>, d = DEFAULT_MEMORY_SETTINGS;
  return {
    enabled: v.enabled === undefined ? d.enabled : v.enabled === true,
    passive: v.passive === undefined ? d.passive : v.passive === true,
    important: v.important === undefined ? d.important : v.important === true,
    interval: Math.round(bounded(v.interval, d.interval, 5, 100)),
    protocol: v.protocol === 'tools' ? 'tools' : 'tags',
    tokenBudget: Math.round(bounded(v.tokenBudget, d.tokenBudget, 200, 4000)),
    maxLookups: Math.round(bounded(v.maxLookups, d.maxLookups, 1, 2)),
    assistantEndpoint: string(v.assistantEndpoint, 2048),
    assistantModel: string(v.assistantModel, 200),
    assistantFormat: v.assistantFormat === 'responses' ? 'responses' : 'chat',
    embeddingEndpoint: string(v.embeddingEndpoint, 2048),
    embeddingModel: string(v.embeddingModel, 200),
    inputBudget: Math.round(bounded(v.inputBudget, d.inputBudget, 2000, 24000)),
    outputBudget: Math.round(bounded(v.outputBudget, d.outputBudget, 200, 4000)),
    budgetUsd: bounded(v.budgetUsd, d.budgetUsd, 0, 1000),
    inputPrice: bounded(v.inputPrice, d.inputPrice, 0, 1000),
    outputPrice: bounded(v.outputPrice, d.outputPrice, 0, 1000),
    embeddingPrice: bounded(v.embeddingPrice, d.embeddingPrice, 0, 1000),
  };
}
export function loadMemorySettings(): MemorySettings {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return saved ? normalizeSettings(JSON.parse(saved)) : { ...DEFAULT_MEMORY_SETTINGS };
  } catch { return { ...DEFAULT_MEMORY_SETTINGS }; }
}
export function saveMemorySettings(settings: MemorySettings): void {
  const clean = normalizeSettings(settings);
  if (clean.assistantEndpoint) assertMemoryEndpoint(clean.assistantEndpoint, clean.assistantFormat);
  if (clean.embeddingEndpoint) assertMemoryEndpoint(clean.embeddingEndpoint, 'embeddings');
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(clean)); }
  catch { throw new Error('长期记忆设置无法保存。'); }
}

export function assertMemoryEndpoint(endpoint: string, kind: 'chat' | 'responses' | 'embeddings'): string {
  const url = new URL(endpoint);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('仅允许 HTTPS 或本机 HTTP 接口。');
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能包含凭据、查询参数或片段。');
  const suffix = kind === 'chat' ? '/chat/completions' : kind === 'responses' ? '/responses' : '/embeddings';
  let path = url.pathname.replace(/\/+$/, '');
  for (const alt of ['/chat/completions', '/responses', '/embeddings']) {
    if (path.endsWith(alt)) { path = path.slice(0, -alt.length); break; }
  }
  if (!path) path = '/v1';
  if (!path.endsWith('/v1')) path += '/v1';
  url.pathname = path + suffix;
  return url.toString();
}

export function memoryApiKey(which: 'assistant' | 'embedding'): string {
  try { return globalThis.sessionStorage?.getItem(which === 'assistant' ? SECRET : EMBEDDING_SECRET) ?? ''; }
  catch { return ''; }
}
export function saveMemoryApiKey(which: 'assistant' | 'embedding', secret: string): void {
  if (secret.length > 4096) throw new Error('API 密钥过长。');
  const key = which === 'assistant' ? SECRET : EMBEDDING_SECRET;
  if (secret) globalThis.sessionStorage?.setItem(key, secret);
  else globalThis.sessionStorage?.removeItem(key);
}
