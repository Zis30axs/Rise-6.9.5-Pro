import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/frontend/FocusTreePanel.vue', import.meta.url), 'utf8');
const routeUi = readFileSync(new URL('../src/frontend/RoutePanel.vue', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/frontend/App.vue', import.meta.url), 'utf8');

test('focus manager provides manual focus, player-friendly direction controls, and unified route panel', () => {
  for (const term of ['开始国策', '取消国策']) assert.ok(ui.includes(term), term);
  assert.match(ui, /type:\s*'start_focus'/);
  assert.match(ui, /type:\s*'cancel_focus'/);
  for (const term of ['让她自己决定方向', '剧情参考已选路线']) assert.ok(app.includes(term), term);
  assert.match(app, /type:\s*'set_control'/);
  const uiTemplate = ui.slice(ui.indexOf('<template>'));
  const appTemplate = app.slice(app.indexOf('<template>'));
  for (const banned of ['AI View', '启用 AI 托管', ' // ', '演示内容', '本地演示']) {
    assert.ok(!uiTemplate.includes(banned), `FocusTreePanel template should not contain ${banned}`);
    assert.ok(!appTemplate.includes(banned), `App template should not contain ${banned}`);
  }
});

test('focus is independent of faction advisers and uses no additional model request', () => {
  assert.match(ui, /type:\s*'strategy'/);
  assert.doesNotMatch(ui, /runInteraction\(|\.generate\(|\.send\(/);
  assert.match(ui, /canStartFocus/);
  assert.doesNotMatch(ui, /appoint_advisor/);
});

test('route entry is visible in 5-item shell nav and hosts FocusTreePanel + DecisionsPanel', () => {
  assert.match(app, /id:\s*'route',\s*title:\s*'路线'/);
  assert.match(routeUi, /import FocusTreePanel/);
  assert.match(routeUi, /import DecisionsPanel/);
  assert.match(routeUi, /<FocusTreePanel/);
});

test('two local branch artworks and route lock are present', () => {
  for (const asset of ['crychic-branch.webp', 'mygo-branch.webp']) assert.ok(ui.includes(asset));
  assert.ok(ui.includes('focusBranchLocked'));
  assert.ok(ui.includes('互斥路线'));
  for (const token of ['focus-tree-viewport', 'focus-detail-modal', 'openFocusDetail', 'onTreeWheel', 'zoomTree', 'resetTreeView']) {
    assert.ok(ui.includes(token), token);
  }
});
