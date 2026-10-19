import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STORY_API, loadStoryApiKey, loadStoryApiSettings, normalizeStoryEndpoint,
  requestStoryFromCustomApi, saveStoryApiKey, saveStoryApiSettings,
} from '../src/runtime/story-api';
import type { StoryApiSettings } from '../src/runtime/story-api';

const settings: StoryApiSettings = {
  mode: 'custom', format: 'chat', endpoint: 'https://models.example/v1',
  model: 'story-writer-v1', preset: '叙事尽量贴近现实。',
};
function answer(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
}

describe('independent card narrative API', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

  it('persists model configuration separately from tab-session credentials', () => {
    saveStoryApiSettings(settings);
    saveStoryApiKey('test-only-private-token');
    expect(loadStoryApiSettings()).toEqual(settings);
    expect(loadStoryApiKey()).toBe('test-only-private-token');
    expect(localStorage.getItem('unread-city:story-api:v1')).not.toContain('test-only-private-token');
    expect(JSON.stringify(DEFAULT_STORY_API)).not.toContain('test-only-private-token');
    saveStoryApiKey('');
    expect(loadStoryApiKey()).toBe('');
  });

  it('separates independent model, preset and endpoint from the host Tavern generator', async () => {
    saveStoryApiKey('example-token');
    const fetchMock = vi.fn(async () => answer({ choices: [{ message: { content: '<story>独立模型回应。</story><phone_messages>[]</phone_messages>' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestStoryFromCustomApi(settings, '玩家观察衣柜。', '严格结构化协议', new AbortController().signal);
    expect(result).toContain('独立模型回应');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('https://models.example/v1/chat/completions');
    expect(options.redirect).toBe('error');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer example-token');
    const request = JSON.parse(options.body as string);
    expect(request.model).toBe('story-writer-v1');
    expect(request.stream).toBe(false);
    expect(request.messages[0].content).toContain(settings.preset);
    expect(request.messages[0].content).toContain('严格结构化协议');
    expect(request.messages[1].content).toContain('玩家观察衣柜');
  });

  it('supports Responses-style outputs and never silently falls back after HTTP errors', async () => {
    const responses: StoryApiSettings = { ...settings, format: 'responses', endpoint: 'https://models.example/v1' };
    const fetchMock = vi.fn(async () => answer({ output: [{ content: [{ type: 'output_text', text: '<story>回复内容</story>' }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestStoryFromCustomApi(responses, '动作', '规则', new AbortController().signal)).toBe('<story>回复内容</story>');
    const [endpoint, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('https://models.example/v1/responses');
    expect(JSON.parse(options.body as string).store).toBe(false);
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 403, headers: { get: () => null } }) as never);
    await expect(requestStoryFromCustomApi(responses, '动作', '规则', new AbortController().signal)).rejects.toThrow(/HTTP 403/);
  });

  it('rejects insecure or credential-bearing API URLs and oversized returned data', async () => {
    expect(() => normalizeStoryEndpoint('https://models.example/v1?key=secret', 'chat')).toThrow(/查询参数/);
    expect(() => normalizeStoryEndpoint('http://other-host.example/v1', 'chat')).toThrow(/HTTPS/);
    expect(normalizeStoryEndpoint('http://localhost:8080/v1', 'chat')).toContain('http://localhost:8080');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      text: async () => 'x'.repeat(1_000_001),
    })));
    await expect(requestStoryFromCustomApi(settings, '动作', '规则', new AbortController().signal)).rejects.toThrow(/体积超过限制/);
  });
});