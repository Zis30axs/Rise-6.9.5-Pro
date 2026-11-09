import { describe, expect, it } from 'vitest';
import { renderWorldMessenger } from '../integration/dual-protagonists/phone-messenger.js';

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const helpers = {
  esc,
  btn: (action, label, _kind, attrs = '') => '<button type="button" data-action="' + action + '" ' + attrs + '>' + esc(label) + '</button>',
  heading: () => '',
  time: () => '第 1 天 21:14',
};
const base = {
  owner: 'soyo', name: '长崎素世', now: 1274,
  others: [{ id: 'sakiko', name: '丰川祥子' }],
  npcPhone: { contacts: [], groups: [], messages: [], requests: [] },
  notifications: [], music: { canManage: false },
  conversation: [
    { id: 'dual:demo', from: 'soyo', to: 'sakiko', direction: 'outgoing', text: '你还好吗？', at: 1274, replyTo: null, expectsReply: true, answered: true },
    { id: 'dual:demo:reply', from: 'sakiko', to: 'soyo', direction: 'incoming', text: '我很好。', at: 1274, replyTo: 'dual:demo' },
  ],
};
const render = data => renderWorldMessenger({
  data, recipient: 'protagonist:sakiko', mode: 'thread', drafts: new Map(), pending: null,
}, helpers).html;

describe('on-demand phone perspective handoff', () => {
  it('places the option under the corresponding SMS and not inside the main novel', () => {
    const html = render({ ...base, phoneScenes: [{ messageId: 'dual:demo:reply', storyId: 'phone-scene:dual:demo:reply' }] });
    const reply = html.indexOf('data-message-id="dual:demo:reply"');
    const action = html.indexOf('data-phone-scene-id="phone-scene:dual:demo:reply"');
    expect(reply).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(reply);
    expect(html.slice(action)).toContain('查看TA的视角');
    expect(html.slice(action)).toContain('aria-label="查看丰川祥子的视角"');
    expect(html.slice(action)).not.toContain('返回正文 · 继续剧情');
  });

  it('does not show the option without a linked saved off-screen scene', () => {
    expect(render({ ...base, phoneScenes: [] })).not.toContain('data-phone-scene-id=');
  });
});
