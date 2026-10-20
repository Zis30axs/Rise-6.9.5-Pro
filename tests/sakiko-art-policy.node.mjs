import assert from 'node:assert/strict';
import test from 'node:test';
import { sakikoSpriteIds, downtownBackgroundIds, isSakikoSpeaker, resolveSakikoExpression,
  resolveSakikoOutfit, selectSakikoSprite } from '../src/frontend/sakiko-art-policy.ts';

test('exactly twelve unique sprite IDs, six in each outfit', () => {
  assert.equal(sakikoSpriteIds.length, 12);
  assert.equal(new Set(sakikoSpriteIds).size, 12);
  for (const outfit of ['casual', 'home']) assert.equal(sakikoSpriteIds.filter(id => id.startsWith(`sakiko_${outfit}_`)).length, 6);
});
test('six unique required backgrounds, piano close-up is not mandatory', () => {
  assert.equal(downtownBackgroundIds.length, 6);
  assert.equal(new Set(downtownBackgroundIds).size, 6);
});
test('stable aliases, not arbitrary substring matches', () => {
  assert.equal(isSakikoSpeaker(' Sakiko '), true);
  assert.equal(isSakikoSpeaker('\u4e30\u5ddd\u7965\u5b50'), true);
  assert.equal(isSakikoSpeaker('soyo'), false);
  assert.equal(isSakikoSpeaker('not-sakiko'), false);
  assert.equal(isSakikoSpeaker({ toString: () => 'sakiko' }), false);
});
test('the nine existing emotions have deliberate six-frame mappings', () => {
  const source = ['\u5e73\u9759','\u5f00\u5fc3','\u96be\u8fc7','\u751f\u6c14','\u60ca\u8bb6','\u5bb3\u7f9e','\u601d\u8003','\u4e25\u8083','\u5b89\u5fc3'];
  assert.deepEqual(source.map(resolveSakikoExpression), ['neutral','smile','sad','annoyed','surprised','troubled','troubled','neutral','smile']);
});
test('unknown and prototype keys safely fall back to neutral', () => {
  for (const x of ['__proto__', 'constructor', '../../bad', null, {}, 1]) assert.equal(resolveSakikoExpression(x), 'neutral');
});
test('home context never overrides an explicit outfit', () => {
  assert.equal(resolveSakikoOutfit('auto','toyokawa-house'), 'home');
  assert.equal(resolveSakikoOutfit('auto','toyokawa-salon'), 'home');
  assert.equal(resolveSakikoOutfit('auto','downtown'), 'casual');
  assert.equal(resolveSakikoOutfit('casual','toyokawa-house'), 'casual');
  assert.equal(resolveSakikoOutfit('home','downtown'), 'home');
});
test('selection is pure and does not replace another character', () => {
  const context = Object.freeze({speaker:'sakiko',expression:'annoyed',locationId:'toyokawa-house'});
  assert.deepEqual(selectSakikoSprite(context), {id:'sakiko_home_annoyed',outfit:'home',expression:'annoyed'});
  assert.equal(selectSakikoSprite({speaker:'soyo',expression:'happy'}), null);
});
