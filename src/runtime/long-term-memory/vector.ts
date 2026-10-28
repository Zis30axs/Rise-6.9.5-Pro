import { loadMemorySettings } from './settings';
import { requestEmbedding, approximateTokens } from './providers';
import { memoryKey } from './types';
import { one, saveEmbeddingWithCharge } from './storage';
import type { MemoryVector } from './types';

function hash(text: string): string {
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16) + '-' + text.length;
}
async function currentCost(scope: string): Promise<number> {
  const record = await one<{ value: number }>('metadata', scope, 'costUsd');
  return typeof record?.value === 'number' ? record.value : 0;
}
export async function embeddingForMemorySearch(scope: string, query: string): Promise<number[] | undefined> {
  const settings = loadMemorySettings();
  if (!settings.enabled || !settings.embeddingEndpoint || !settings.embeddingModel || !query.trim()) return;
  const id = 'query:' + settings.embeddingModel + ':' + hash(query);
  const cached = await one<MemoryVector>('vectors', scope, id);
  if (cached?.model === settings.embeddingModel && cached.values.length === cached.dimensions) return cached.values;
  const estimated = approximateTokens(query) * settings.embeddingPrice / 1e6;
  if (settings.budgetUsd > 0 && (!settings.embeddingPrice ||
    (await currentCost(scope)) + estimated > settings.budgetUsd)) return;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await requestEmbedding(settings, query, controller.signal);
    await saveEmbeddingWithCharge({ key: memoryKey(scope, id), scope, eventId: id, model: settings.embeddingModel,
      dimensions: response.vector.length, values: response.vector },
      response.tokens * settings.embeddingPrice / 1e6);
    return response.vector;
  } finally { clearTimeout(timeout); }
}
