import type { MemorySettings } from './settings';
import { loadMemorySettings } from './settings';
import { approximateTokens, requestEmbedding, requestMemoryJson } from './providers';
import { memoryExtractionInput, memoryExtractionPrompt, parseExtraction } from './extractor';
import { acquireJob, finalizeJob, ingestSources, memoryStats, one, put, recordPaidJobResponse, resetFailedJobs, rows, saveEmbeddingWithCharge } from './storage';
import { memoryArchiveBoundary } from './thresholds';
import { memoryKey } from './types';
import type { MemoryEvent, MemoryJob, MemorySource, MemoryVector } from './types';

const workingScopes = new Set<string>();
const pausedScopes = new Set<string>();
const activeRequests = new Map<string, AbortController>();
const activeWorkers = new Map<string, Promise<void>>();
const pauseVersions = new Map<string, number>();
const wakeups = new Map<string, ReturnType<typeof setTimeout>>();
function clearWakeup(scope: string): void {
  const timer = wakeups.get(scope);
  if (timer !== undefined) clearTimeout(timer);
  wakeups.delete(scope);
}
function wakeup(scope: string, delay: number): void {
  if (pausedScopes.has(scope) || !loadMemorySettings().enabled) return;
  clearWakeup(scope);
  wakeups.set(scope, setTimeout(() => {
    wakeups.delete(scope);
    const settings = loadMemorySettings();
    if (ready(settings) && !pausedScopes.has(scope)) void work(scope, settings).catch(() => {});
  }, Math.max(100, Math.min(600_000, delay))));
}
export function memoryPauseVersion(scope: string): number { return pauseVersions.get(scope) ?? 0; }
export function memoryIsPaused(scope: string): boolean { return pausedScopes.has(scope); }

/** Stop optional paid activity immediately without touching gameplay or deleting work. */
export function pauseMemoryWork(scope: string): Promise<void> {
  pausedScopes.add(scope);
  pauseVersions.set(scope, memoryPauseVersion(scope) + 1);
  activeRequests.get(scope)?.abort();
  clearWakeup(scope);
  return activeWorkers.get(scope) ?? Promise.resolve();
}
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
  if (jobs.some(j => j.state === 'pending' || j.state === 'working')) return;
  // A failed job must not hold unrelated future story sources hostage.
  const reserved = new Set(jobs.filter(j => j.state !== 'done').flatMap(j => j.sourceIds));
  const pending = (await rows<MemorySource>('sources', scope))
    .filter(s => !s.processed && !reserved.has(s.id)).sort((a, b) => {
      if (a.turn !== b.turn) return a.turn - b.turn;
      if (a.at !== b.at) return a.at - b.at;
      const part = /^(.*):part:(\d+)$/.exec(a.id);
      const other = /^(.*):part:(\d+)$/.exec(b.id);
      if (part && other && part[1] === other[1]) return Number(part[2]) - Number(other[2]);
      const rank = (id: string) => id.startsWith('input:') ? 0 : id.startsWith('story:') ? 1 : 2;
      return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
    });
  if (!pending.length) return;
  const lastScheduled = await meta(scope, 'lastScheduledTurn');
  const dueThrough = await meta(scope, 'dueThrough');
  // Preserve fixed 20-turn checkpoints; >75 unsummarized journals may archive
  // earlier, but major plot keywords alone must not schedule a summary.
  const schedulingThrough = memoryArchiveBoundary(pending, lastScheduled, dueThrough, settings.interval, forced);
  if (schedulingThrough === null) return;
  if (schedulingThrough > dueThrough) await setMeta(scope, 'dueThrough', schedulingThrough);
  const eligible = pending.filter(s => s.turn <= schedulingThrough);
  const selected = chunk(eligible, settings.inputBudget);
  if (!selected.length) return;
  const id = 'job:' + selected[0].id + ':' + selected[selected.length - 1].id;
  const job: MemoryJob = { key: memoryKey(scope, id), scope, id,
    sourceIds: selected.map(s => s.id), toTurn: Math.max(...selected.map(s => s.turn)),
    state: 'pending', attempts: 0, leaseUntil: 0, error: '', createdAt: Date.now() };
  await put('jobs', job);
  await setMeta(scope, 'lastScheduledTurn', Math.max(lastScheduled, schedulingThrough));
}
async function remainingBudget(scope: string, settings: MemorySettings, extra: number): Promise<boolean> {
  if (settings.budgetUsd <= 0) return true;
  // Hard budgets require explicit prices. Unknown pricing cannot be proven safe.
  if (!settings.inputPrice || !settings.outputPrice) return false;
  const current = await meta(scope, 'costUsd');
  return current + extra <= settings.budgetUsd;
}
async function runOne(scope: string, settings: MemorySettings): Promise<boolean> {
  if (pausedScopes.has(scope) || !loadMemorySettings().enabled) return false;
  const job = await acquireJob(scope);
  if (!job) return false;
  const controller = new AbortController();
  activeRequests.set(scope, controller);
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
      if (controller.signal.aborted || pausedScopes.has(scope)) throw new Error('整理已暂停');
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
          const vectorId = event.id + ':' + settings.embeddingModel;
          const cached = await one<MemoryVector>('vectors', scope, vectorId);
          if (cached && cached.model === settings.embeddingModel) {
            vectors.push(cached);
            continue;
          }
          const result = await requestEmbedding(settings, event.summary, controller.signal);
          const vector: MemoryVector = { key: memoryKey(scope, vectorId),
            scope, eventId: event.id, model: settings.embeddingModel,
            dimensions: result.vector.length, values: result.vector };
          await saveEmbeddingWithCharge(vector, result.tokens * settings.embeddingPrice / 1e6);
          vectors.push(vector);
        } catch {
          if (controller.signal.aborted || pausedScopes.has(scope)) throw new Error('整理已暂停');
          // A missing optional vector must not discard the structured event.
        }
      }
    }
    if (controller.signal.aborted || pausedScopes.has(scope)) throw new Error('整理已暂停');
    await finalizeJob(job, events, vectors);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '整理失败';
    // Preserve any already-paid response stored by recordPaidJobResponse.
    const existing = await one<MemoryJob>('jobs', scope, job.id);
    const deliberatelyPaused = pausedScopes.has(scope);
    await put('jobs', { ...existing, ...job,
      responseText: existing?.responseText,
      responseCostUsd: existing?.responseCostUsd,
      usageEstimated: existing?.usageEstimated,
      attempts: deliberatelyPaused ? Math.max(0, job.attempts - 1) : job.attempts,
      state: !deliberatelyPaused && job.attempts >= 2 ? 'failed' : 'pending',
      leaseUntil: deliberatelyPaused || job.attempts >= 2 ? 0 : Date.now() + 30_000 * (2 ** (job.attempts - 1)),
      error: deliberatelyPaused ? '' : reason.slice(0, 220) });
    return false;
  } finally {
    clearTimeout(timeout);
    if (activeRequests.get(scope) === controller) activeRequests.delete(scope);
  }
}
async function runWork(scope: string, settings: MemorySettings): Promise<void> {
  if (!ready(settings) || workingScopes.has(scope) || pausedScopes.has(scope)) return;
  workingScopes.add(scope);
  try {
    await schedule(scope, settings);
    for (let i = 0; i < 8; i++) {
      if (pausedScopes.has(scope)) break;
      if (!await runOne(scope, settings)) break;
      await schedule(scope, settings);
      const sources = (await rows<MemorySource>('sources', scope)).filter(s => !s.processed);
      if (!sources.length) await setMeta(scope, 'dueThrough', 0);
    }
  } finally {
    workingScopes.delete(scope);
    if (!pausedScopes.has(scope) && loadMemorySettings().enabled) {
      try {
        const jobs = await rows<MemoryJob>('jobs', scope);
        const active = jobs.filter(j => j.state === 'pending' || j.state === 'working');
        if (active.length) {
          const now = Date.now();
          const next = Math.min(...active.map(j => j.leaseUntil || now));
          wakeup(scope, Math.max(100, next - now));
        } else {
          // A scheduled window may exceed eight bounded model batches.
          // Resume the remaining due evidence without requiring another game turn.
          const through = await meta(scope, 'dueThrough');
          if (through > 0) {
            const failed = new Set(jobs.filter(j => j.state === 'failed').flatMap(j => j.sourceIds));
            const unfinished = (await rows<MemorySource>('sources', scope))
              .some(s => !s.processed && s.turn <= through && !failed.has(s.id));
            if (unfinished) wakeup(scope, 1000);
          }
        }
      } catch { /* Persistence failure has no impact on gameplay. */ }
    }
  }
}
function work(scope: string, settings: MemorySettings): Promise<void> {
  const existing = activeWorkers.get(scope);
  if (existing) return existing;
  const pending = runWork(scope, settings).finally(() => {
    if (activeWorkers.get(scope) === pending) activeWorkers.delete(scope);
  });
  activeWorkers.set(scope, pending);
  return pending;
}

export function scheduleMemoryWork(scope: string, sources: MemorySource[]): void {
  const settings = loadMemorySettings();
  if (!settings.enabled) return;
  pausedScopes.delete(scope);
  clearWakeup(scope);
  const archived = sources.length ? ingestSources(sources) : Promise.resolve();
  void archived.then(() => work(scope, settings)).catch(() => {
    // Optional sidecar has no authority to prevent a main-game save.
  });
}
/** Resume a persisted batch even when the visible recent story was pruned. */
export function resumeMemoryWork(scope: string): void {
  const settings = loadMemorySettings();
  if (!ready(settings)) return;
  pausedScopes.delete(scope);
  clearWakeup(scope);
  void work(scope, settings).catch(() => {});
}
export async function runMemoryNow(scope: string): Promise<void> {
  const settings = loadMemorySettings();
  if (!ready(settings)) throw new Error('请先配置长期记忆整理模型 API');
  pausedScopes.delete(scope);
  clearWakeup(scope);
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
