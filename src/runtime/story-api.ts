/**
 * Optional user-owned narrative transport. Preferences live on this device;
 * API keys stay in the current tab session. No credentials enter a character
 * save, PNG, Tavern-Helper variables, prompts or repository source.
 */
export type StoryApiFormat = 'chat' | 'responses';
export interface StoryApiSettings {
  mode: 'tavern' | 'custom';
  format: StoryApiFormat;
  endpoint: string;
  model: string;
  preset: string;
}
const SETTINGS_KEY = 'unread-city:story-api:v1';
const SECRET_KEY = 'unread-city:story-api-key:v1';
export const DEFAULT_STORY_API: StoryApiSettings = {
  mode: 'tavern', format: 'chat', endpoint: '', model: '', preset: '',
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function loadStoryApiSettings(): StoryApiSettings {
  try {
    const saved = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_STORY_API };
    const value = object(JSON.parse(saved));
    if (!value) return { ...DEFAULT_STORY_API };
    return {
      mode: value.mode === 'custom' ? 'custom' : 'tavern',
      format: value.format === 'responses' ? 'responses' : 'chat',
      endpoint: typeof value.endpoint === 'string' ? value.endpoint.slice(0, 2048) : '',
      model: typeof value.model === 'string' ? value.model.slice(0, 200) : '',
      preset: typeof value.preset === 'string' ? value.preset.slice(0, 4000) : '',
    };
  } catch { return { ...DEFAULT_STORY_API }; }
}

export function normalizeStoryEndpoint(endpoint: string, format: StoryApiFormat): string {
  let url: URL;
  try { url = new URL(endpoint.trim()); }
  catch { throw new Error('请输入完整的 API 地址。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('独立 API 只接受 HTTPS，或本机 localhost HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('API 地址中不能包含账号、密码、查询参数或片段。');
  }
  let path = url.pathname.replace(/\/+$/, '');
  const suffix = format === 'responses' ? '/responses' : '/chat/completions';
  if (!path) path = '/v1' + suffix;
  else if (path.endsWith('/v1')) path += suffix;
  url.pathname = path;
  return url.toString();
}

export function saveStoryApiSettings(settings: StoryApiSettings): void {
  const mode = settings.mode === 'custom' ? 'custom' : 'tavern';
  const format = settings.format === 'responses' ? 'responses' : 'chat';
  const model = settings.model.trim();
  const preset = settings.preset.trim();
  if (preset.length > 4000) throw new Error('独立叙事预设最多 4000 字。');
  if (mode === 'custom' && (!model || model.length > 200)) throw new Error('请填写有效的独立模型 ID。');
  const endpoint = mode === 'custom' ? normalizeStoryEndpoint(settings.endpoint, format) : settings.endpoint.trim().slice(0, 2048);
  try {
    globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, format, endpoint, model, preset }));
  } catch { throw new Error('本机无法保存接口设置，请检查浏览器存储权限。'); }
}

export function loadStoryApiKey(): string {
  try { return globalThis.sessionStorage?.getItem(SECRET_KEY) ?? ''; }
  catch { return ''; }
}

export function saveStoryApiKey(value: string): void {
  if (value.length > 4096) throw new Error('API 密钥长度超出限制。');
  try {
    if (value) globalThis.sessionStorage.setItem(SECRET_KEY, value);
    else globalThis.sessionStorage.removeItem(SECRET_KEY);
  } catch { throw new Error('当前标签页不允许存储 API 密钥。'); }
}

function readTextParts(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map(entry => {
    const item = object(entry);
    return typeof item?.text === 'string' ? item.text : '';
  }).join('');
}

function readResponseText(value: unknown, format: StoryApiFormat): string {
  const root = object(value);
  if (!root) return '';
  if (format === 'chat') {
    const choices = root.choices;
    const first = Array.isArray(choices) ? object(choices[0]) : null;
    return readTextParts(object(first?.message)?.content);
  }
  if (typeof root.output_text === 'string') return root.output_text;
  const outputs = Array.isArray(root.output) ? root.output : [];
  return outputs.map(entry => readTextParts(object(entry)?.content)).join('');
}

/** Direct browser request; failure never silently falls through to the Tavern model. */
export async function requestStoryFromCustomApi(settings: StoryApiSettings, userPrompt: string, systemPrompt: string, signal: AbortSignal): Promise<string> {
  if (settings.mode !== 'custom' || !settings.model.trim()) throw new Error('请先在状态 → 叙事引擎中配置独立模型。');
  const endpoint = normalizeStoryEndpoint(settings.endpoint, settings.format);
  const instructions = settings.preset.trim()
    ? '自定义叙事风格要求（结构化协议与世界状态优先）：\n' + settings.preset.trim() + '\n\n' + systemPrompt
    : systemPrompt;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = loadStoryApiKey();
  if (key) headers.Authorization = 'Bearer ' + key;
  const body = settings.format === 'chat'
    ? { model: settings.model.trim(), stream: false, messages: [{ role: 'system', content: instructions }, { role: 'user', content: userPrompt }] }
    : { model: settings.model.trim(), store: false, input: [
      { role: 'system', content: [{ type: 'input_text', text: instructions }] },
      { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
    ] };
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch {
    if (signal.aborted) throw new Error('本次模型请求已取消。');
    throw new Error('独立 API 连接失败：检查接口、跨域 CORS 和 TauriTavern 网络权限。');
  }
  if (!response.ok) throw new Error('独立 API 返回 HTTP ' + response.status + '；未修改剧情或世界状态。');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 1_000_000) throw new Error('独立 API 回复体积超过限制。');
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('独立 API 没有返回有效 JSON 响应。'); }
  const output = readResponseText(data, settings.format);
  if (!output.trim() || output.length > 160000) throw new Error('独立 API 未返回可识别的模型正文。');
  return output;
}
