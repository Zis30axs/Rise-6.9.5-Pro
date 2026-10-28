import type { MemorySettings } from './settings';
import { loadMemorySettings } from './settings';
import { approximateTokens, requestEmbedding, requestMemoryJson } from './providers';
import { memoryExtractionInput, memoryExtractionPrompt, parseExtraction } from './extractor';
import { acquireJob, finalizeJob, ingestSources, memoryStats, one, put, recordPaidJobResponse, resetFailedJobs, rows, saveEmbeddingWithCharge } from './storage';
import { importantCandidate } from './source';
import { memoryKey } from './types';
import type { MemoryEvent, MemoryJob, MemorySource, MemoryVector } from './types';

const workingScopes = new Set<string>();
interface Meta { key: string; scope: string; id: string; value: number }
async function meta(scope: string, id: string): Promise<number> {
  return (await one<Meta>('metadata', scope, id))?.value ?? 0;
}
async function setMeta(scope: string, id: string, value: number): Promise<void> {
  await put('metadata', { key: memoryKey(scope, id), scope, id, value });
}
function price(usage: { input: number; output: number }, settings: MemorySettings): number {
  return usage.input * settings.inputPrice / 1e6 + usage.output * settings.outputPrice / 1e6;
}
function ready(settings: MemorySettings): boolean {
  return !!(settings.enabled && settings.assistantEndpoint && settings.assistantModel);
}
export function chunk(sources: MemorySource[], maxTokens: number): MemorySource[] {
  const selected: MemorySource[] = [];
  let remaining = maxTokens - 800;
  for (const source of sources) {
    const tokens = approximateTokens(source.text) + 100;
    if (tokens > remaining) {
      if (!selected.length) throw new Error('单条记忆来源超过输入预算，请缩短分段或提高预算');
      break;
    }
    selected.push(source);
    remaining -= tokens;
    if (selected.length >= 40) break;
  }
  return selected;
}
async function schedule(scope: string, settings: MemorySettings, forced = false): Promise<void> {
  if (!ready(settings)) return;
  const jobs = await rows<MemoryJob>('jobs', scope);
  if (jobs.some(j => j.state === 'pending' || j.state === 'working' || (j.state === 'failed' && !forced))) return;
  const pending = (await rows<MemorySource>('sources', scope))
    .filter(s => !s.processed).sort((a, b) => a.turn - b.turn || a.at - b.at || a.id.localeCompare(b.id));
  if (!pending.length) return;
  const latestTurn = Math.max(...pending.map(s => s.turn));
  const lastScheduled = await meta(scope, 'lastScheduledTurn');
  const dueThrough = await meta(scope, 'dueThrough');
  const important = settings.important && pending.some(s => importantCandidate(s.text));
  if (!forced && latestTurn - lastScheduled < settings.interval && !important && !dueThrough) return;
  if (latestTurn > dueThrough) await setMeta(scope, 'dueThrough', latestTurn);
  const eligible = pending.filter(s => s.turn <= Math.max(latestTurn, dueThrough));
  const selected = chunk(eligible, settings.inputBudget);
  if (!selected.length) return;
  const id = 'job:' + selected[0].id + ':' + selected[selected.length - 1].id;
  const job: MemoryJob = { key: memoryKey(scope, id), scope, id,
    sourceIds: selected.map(s => s.id), toTurn: latestTurn,
    state: 'pending', attempts: 0, leaseUntil: 0, error: '', createdAt: Date.now() };
  await put('jobs', job);
  await setMeta(scope, 'lastScheduledTurn', latestTurn);
}
async function remainingBudget(scope: string, settings: MemorySettings, extra: number): Promise<boolean> {
  if (settings.budgetUsd <= 0) return true;
  // Hard budgets require explicit prices. Unknown pricing cannot be proven safe.
  if (!settings.inputPrice || !settings.outputPrice) return false;
  const current = await meta(scope, 'costUsd');
  return current + extra <= settings.budgetUsd;
}
async function runOne(scope: string, settings: MemorySettings): Promise<boolean> {
  const job = await acquireJob(scope);
  if (!job) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const sources = (await Promise.all(job.sourceIds.map(id =>
      one<MemorySource>('sources', scope, id)))).filter((s): s is MemorySource => !!s);
    if (sources.length !== job.sourceIds.length) throw new Error('部分历史来源缺失');
    const system = memoryExtractionPrompt(), input = memoryExtractionInput(sources);
    let responseText = job.responseText;
    if (!responseText) {
      if (!await remainingBudget(scope, settings,
        price({ input: approximateTokens(system + input), output: settings.outputBudget }, settings))) {
        throw new Error('长期记忆费用预算已满或价格未配置');
      }
      const response = await requestMemoryJson(settings, system, input, controller.signal);
      // Persist the paid response before validating or constructing embeddings.
      // If a subsequent step fails, the next attempt reuses these paid tokens.
      await recordPaidJobResponse(job, response.text, price(response.usage, settings), response.estimated);
      responseText = response.text;
    }
    const events = parseExtraction(scope, sources, responseText);
    const vectors: MemoryVector[] = [];
    if (settings.embeddingEndpoint && settings.embeddingModel
      && (settings.budgetUsd === 0 || settings.embeddingPrice > 0)) {
      for (const event of events) {
        try {
          const estimated = approximateTokens(event.summary) * settings.embeddingPrice / 1e6;
          if (settings.budgetUsd > 0 && (await meta(scope, 'costUsd')) + estimated > settings.budgetUsd) break;
          const result = await requestEmbedding(settings, event.summary, controller.signal);
          const vector: MemoryVector = { key: memoryKey(scope, event.id + ':' + settings.embeddingModel),
            scope, eventId: event.id, model: settings.embeddingModel,
            dimensions: result.vector.length, values: result.vector };
          await saveEmbeddingWithCharge(vector, result.tokens * settings.embeddingPrice / 1e6);
          vectors.push(vector);
        } catch { /* Keep structured memories searchable without embeddings. */ }
      }
    }
    await finalizeJob(job, events, vectors);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '整理失败';
    // Preserve any already-paid response stored by recordPaidJobResponse.
    const existing = await one<MemoryJob>('jobs', scope, job.id);
    await put('jobs', { ...existing, ...job,
      responseText: existing?.responseText,
      responseCostUsd: existing?.responseCostUsd,
      usageEstimated: existing?.usageEstimated,
      state: job.attempts >= 2 ? 'failed' : 'pending',
      leaseUntil: job.attempts >= 2 ? 0 : Date.now() + 30_000 * (2 ** (job.attempts - 1)),
      error: reason.slice(0, 220) });
    return false;
  } finally { clearTimeout(timeout); }
}
async function work(scope: string, settings: MemorySettings): Promise<void> {
  if (!ready(settings) || workingScopes.has(scope)) return;
  workingScopes.add(scope);
  try {
    await schedule(scope, settings);
    for (let i = 0; i < 8; i++) {
      if (!await runOne(scope, settings)) break;
      await schedule(scope, settings);
      const sources = (await rows<MemorySource>('sources', scope)).filter(s => !s.processed);
      if (!sources.length) await setMeta(scope, 'dueThrough', 0);
    }
  } finally { workingScopes.delete(scope); }
}
export function scheduleMemoryWork(scope: string, sources: MemorySource[]): void {
  const settings = loadMemorySettings();
  if (!settings.enabled || !sources.length) return;
  void ingestSources(sources).then(() => work(scope, settings)).catch(() => {
    // Optional sidecar has no authority to prevent a main-game save.
  });
}
/** Resume a persisted batch even when the visible recent story was pruned. */
export function resumeMemoryWork(scope: string): void {
  const settings = loadMemorySettings();
  if (!ready(settings)) return;
  void work(scope, settings).catch(() => {});
}
export async function runMemoryNow(scope: string): Promise<void> {
  const settings = loadMemorySettings();
  if (!ready(settings)) throw new Error('请先配置长期记忆整理模型 API');
  await resetFailedJobs(scope);
  await schedule(scope, settings, true);
  await work(scope, settings);
}
export async function memoryStatus(scope: string) {
  const jobs = await rows<MemoryJob>('jobs', scope);
  const latestProblem = jobs.filter(j => j.state === 'failed' || j.error)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return { ...(await memoryStats(scope)), lastTurn: await meta(scope, 'lastScheduledTurn'),
    lastError: latestProblem?.error ?? '', enabled: loadMemorySettings().enabled };
}
