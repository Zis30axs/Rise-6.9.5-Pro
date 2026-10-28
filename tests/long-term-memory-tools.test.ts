import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { DEFAULT_MEMORY_SETTINGS } from '../src/runtime/long-term-memory/settings';
import { runNativeMemoryTools } from '../src/runtime/long-term-memory/protocol';
import type { StoryApiSettings } from '../src/runtime/story-api';

const settings: StoryApiSettings = {
  mode: 'custom', format: 'chat',
  endpoint: 'https://api.example.invalid/v1',
  model: 'fictional-model', preset: '',
};
const response = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
afterEach(() => vi.unstubAllGlobals());

describe('native memory tools: real protocol shapes without external API charges', () => {
  it('sends structured Chat Completions tool calls and returns a normal story', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ choices: [{ message: {
        role: 'assistant', content: null, tool_calls: [{
          id: 'call-1', type: 'function', function: { name: 'search_memory', arguments: '{"query":"项链"}' },
        }],
      } }] }))
      .mockResolvedValueOnce(response({ choices: [{ message: {
        role: 'assistant', content: '<story>回忆起那一天。</story>',
      } }] }));
    vi.stubGlobal('fetch', fetcher);
    const text = await runNativeMemoryTools(settings,
      { ...DEFAULT_MEMORY_SETTINGS, protocol: 'tools' }, 'test-chat', createInitialState(),
      '继续回忆', '输出完整故事协议', new AbortController().signal);
    expect(text).toContain('<story>');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetcher.mock.calls[0][1].body));
    const second = JSON.parse(String(fetcher.mock.calls[1][1].body));
    expect(first.tools.some((tool: { function: { name: string } }) =>
      tool.function.name === 'search_memory')).toBe(true);
    expect(second.messages.some((message: { role: string; tool_call_id?: string }) =>
      message.role === 'tool' && message.tool_call_id === 'call-1')).toBe(true);
    expect(second.tool_choice).toBe('none');
  });

  it('refuses a second tool request after reaching the configured limit', async () => {
    const tool = { role: 'assistant', content: null, tool_calls: [{
      id: 'call-2', type: 'function', function: { name: 'search_memory', arguments: '{"query":"信件"}' },
    }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ choices: [{ message: tool }] }))
      .mockResolvedValueOnce(response({ choices: [{ message: tool }] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(runNativeMemoryTools(settings, {
      ...DEFAULT_MEMORY_SETTINGS, protocol: 'tools', maxLookups: 1,
    }, 'test-chat', createInitialState(), '回忆过去', '输出完整故事协议',
    new AbortController().signal)).rejects.toThrow('上限');
  });
});
