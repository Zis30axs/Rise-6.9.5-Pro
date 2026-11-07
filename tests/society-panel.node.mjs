import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/frontend/SocietyPanel.vue', import.meta.url),'utf8');
const world=readFileSync(new URL('../src/frontend/WorldPanels.vue', import.meta.url),'utf8');
const app=readFileSync(new URL('../src/frontend/App.vue', import.meta.url),'utf8');
const interactions=readFileSync(new URL('../src/frontend/interaction-controller.ts', import.meta.url),'utf8');

test('organization UI separates advisers, social circles, unions and contests',()=>{
  for(const tab of ['阵营与顾问','社交圈','广域联合体','竞争决议']) assert.ok(ui.includes(tab));
  assert.match(ui,/band\.founder===actor/);
  assert.match(ui,/type: 'appoint_advisor'/);
  assert.match(ui,/type: 'dismiss_advisor'/);
  assert.match(ui,/type:'leave_circle'/);
  assert.match(ui,/type:'leave_union'/);
});
test('administration stays local and never calls the story model',()=>{
  assert.match(ui,/props\.actions\.dispatch\(\{ type: 'society'/);
  assert.doesNotMatch(ui,/runInteraction\(|\.generate\(|\.send\(/);
  assert.match(interactions,/'strategy', 'society'/);
});
test('consent boundaries and local navigation remain visible',()=>{
  assert.match(ui,/accepted:true/);
  assert.match(ui,/accepted:false/);
  assert.match(ui,/不代表人物已同意/);
  assert.match(ui,/不会自动占用演出档期/);
  assert.match(app,/id: 'society', title: '阵营'/);
  assert.match(world,/import SocietyPanel/);
  assert.match(world,/<SocietyPanel :model="model" :actions="actions"\s*\/>/);
  assert.match(world,/panel === 'society'/);
});
