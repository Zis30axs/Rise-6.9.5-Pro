import { assertMemoryEndpoint, memoryApiKey } from './settings';
import type { MemorySettings } from './settings';

type RequestKind = 'assistant' | 'embedding';

export interface PaidResponse {
  text: string;
  usage: { input: number; output: number };
  estimated: boolean;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function bounded(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function responseText(raw: unknown, format: 'chat' | 'responses'): string {
  const data = record(raw);
  if (!data) throw new Error('记忆接口回复无效');
  if (format === 'chat') {
    const choices = data.choices;
    const first = Array.isArray(choices) ? record(choices[0]) : null;
    const message = record(first?.message);
    return typeof message?.content === 'string' ? message.content
      : Array.isArray(message?.content) ? message.content.map(v => record(v)?.text ?? '').join('') : '';
  }
  if (typeof data.output_text === 'string') return data.output_text;
  if (!Array.isArray(data.output)) return '';
  return data.output.flatMap(v => {
    const items = record(v)?.content;
    return Array.isArray(items) ? items.map(p => record(p)?.text ?? '') : [];
  }).join('');
}

export async function requestMemoryJson(settings: MemorySettings, system: string, input: string,
  signal: AbortSignal): Promise<PaidResponse> {
  const url = assertMemoryEndpoint(settings.assistantEndpoint, settings.assistantFormat);
  const secret = memoryApiKey('assistant');
  const instructions = { role: 'system', content: system };
  const user = { role: 'user', content: input };
  const body = settings.assistantFormat === 'chat'
    ? { model: settings.assistantModel, stream: false, max_tokens: settings.outputBudget, messages: [instructions, user] }
    : { model: settings.assistantModel, store: false, max_output_tokens: settings.outputBudget,
      input: [instructions, user] };
  const response = await safeFetch(url, body, secret, signal);
  const text = responseText(response, settings.assistantFormat).trim();
  if (!text || text.length > 64000) throw new Error('记忆整理输出为空或过长');
  const usage = record(record(response)?.usage);
  const inputTokens = bounded(usage?.prompt_tokens) ?? bounded(usage?.input_tokens);
  const outputTokens = bounded(usage?.completion_tokens) ?? bounded(usage?.output_tokens);
  return { text,
    usage: { input: inputTokens ?? approximateTokens(system + input), output: outputTokens ?? approximateTokens(text) },
    estimated: inputTokens === null || outputTokens === null };
}

export async function requestEmbedding(settings: MemorySettings, input: string,
  signal: AbortSignal): Promise<{ vector: number[]; tokens: number; estimated: boolean }> {
  const url = assertMemoryEndpoint(settings.embeddingEndpoint, 'embeddings');
  const data = await safeFetch(url, { model: settings.embeddingModel, input }, memoryApiKey('embedding'), signal);
  const rows = record(data)?.data;
  const first = Array.isArray(rows) ? record(rows[0]) : null;
  const vector = first?.embedding;
  if (!Array.isArray(vector) || vector.length < 8 || vector.length > 8192
    || vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Embedding 向量格式错误');
  const usage = bounded(record(record(data)?.usage)?.total_tokens);
  return { vector, tokens: usage ?? approximateTokens(input), estimated: usage === null };
}
export function approximateTokens(text: string): number { return Math.ceil(text.length / 2); }

async function safeFetch(url: string, body: unknown, secret: string, signal: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = 'Bearer ' + secret;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body),
    signal, redirect: 'error' });
  if (!response.ok) throw new Error('记忆 API 返回 HTTP ' + response.status);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 1_000_000) throw new Error('记忆 API 回复体积超限');
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('记忆 API 回复体积超限');
  return JSON.parse(text) as unknown;
}
