import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/frontend/SocietyPanel.vue', import.meta.url), 'utf8');
const decisionsUi = readFileSync(new URL('../src/frontend/DecisionsPanel.vue', import.meta.url), 'utf8');
const routeUi = readFileSync(new URL('../src/frontend/RoutePanel.vue', import.meta.url), 'utf8');
const meUi = readFileSync(new URL('../src/frontend/MePanel.vue', import.meta.url), 'utf8');
const strategyRuntime = readFileSync(new URL('../src/runtime/strategy.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/frontend/App.vue', import.meta.url), 'utf8');
const interactions = readFileSync(new URL('../src/frontend/interaction-controller.ts', import.meta.url), 'utf8');

test('organization UI separates advisers, social circles, and unions and removes faction contest decisions', () => {
  for (const tab of ['乐队与顾问', '社交圈', '联合体']) assert.ok(ui.includes(tab), tab);
  assert.doesNotMatch(ui, /竞争决议|open_contest/);
  assert.doesNotMatch(ui.slice(ui.indexOf('<template>')), / \/\/ /);
  assert.match(ui, /band\.founder\s*===\s*actor/);
  assert.match(ui, /type:\s*'appoint_advisor'/);
  assert.match(ui, /type:\s*'dismiss_advisor'/);
  assert.match(ui, /type:\s*'leave_circle'/);
  assert.match(ui, /type:\s*'leave_union'/);
});

test('administration stays local and never calls the story model', () => {
  assert.match(ui, /props\.actions\.dispatch\(\{\s*type:\s*'society'/);
  assert.doesNotMatch(ui, /runInteraction\(|\.generate\(|\.send\(/);
  assert.match(interactions, /'strategy',\s*'society'/);
});

test('consent boundaries and MePanel relationship integration remain visible', () => {
  assert.match(ui, /accepted:\s*true/);
  assert.match(ui, /accepted:\s*false/);
  assert.match(ui, /不代表人物已同意/);
  assert.match(ui, /不会自动占用演出档期/);
  assert.match(app, /id:\s*'me',\s*title:\s*'我'/);
  assert.match(meUi, /import SocietyPanel/);
  assert.match(meUi, /<SocietyPanel :model="model" :actions="actions"\s*\/>/);
});

test('compact decisions list lives under RoutePanel with SVG and energy-backed foundational decisions', () => {
  assert.match(app, /id:\s*'route',\s*title:\s*'路线'/);
  assert.match(routeUi, /import DecisionsPanel/);
  assert.match(routeUi, /<DecisionsPanel/);
  assert.match(decisionsUi, /data-testid="decisions-panel"/);
  assert.doesNotMatch(decisionsUi.slice(decisionsUi.indexOf('<template>')), / \/\/ /);
  assert.match(decisionsUi, /<svg/);
  assert.match(strategyRuntime, /soyo_practice_bass/);
  assert.match(strategyRuntime, /练习贝斯/);
  assert.match(strategyRuntime, /energyCost:\s*25/);
});
