import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../src/frontend/FocusTreePanel.vue',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/frontend/App.vue',import.meta.url),'utf8');
const world=readFileSync(new URL('../src/frontend/WorldPanels.vue',import.meta.url),'utf8');
test('focus manager provides manual focus, AI control and individual decisions',()=>{
 for(const term of ['个人国策树','AI View','启用 AI 托管','接管人物','开始国策','取消国策','执行决议']) assert.ok(ui.includes(term),term);
 for(const cmd of ["type: 'set_control'","type:'start_focus'","type:'cancel_focus'","type:'choose_decision'"]) assert.ok(ui.includes(cmd),cmd);
});
test('focus is independent of faction advisers and uses no additional model request',()=>{
 assert.match(ui,/type: 'strategy'/);assert.doesNotMatch(ui,/runInteraction\(|\.generate\(|\.send\(/);
 assert.match(ui,/focusWeight/);assert.match(ui,/canStartFocus/);
 assert.doesNotMatch(ui,/appoint_advisor/);
});
test('focus menu is visible through existing app shell without replacing personal status',()=>{
 assert.match(app,/id: 'focus', title: '国策'/);
 assert.match(world,/import FocusTreePanel/);
 assert.match(world,/<FocusTreePanel :model="model" :actions="actions"\s*\/>/);
 assert.match(world,/panel === 'status'/);
});

test('two local branch artworks and route lock are present',()=>{
  for(const asset of ['crychic-branch.webp','mygo-branch.webp']) assert.ok(ui.includes(asset));
  assert.ok(ui.includes('focusBranchLocked'));
  assert.ok(ui.includes('互斥路线'));
});
