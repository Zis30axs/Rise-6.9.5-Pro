import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyRouteEventGesture, applyRouteEventTap, projectOldTokyoPosition, TOKYO_PIN_ELEVATION, tokyoLocationPosition } from '../src/frontend/tokyo-sandbox-map';
import { mapLocationPoint } from '../src/frontend/campus-map-layout';
import { mapSpriteObjectPosition } from '../src/frontend/map-character-avatar';

describe('sandbox route event pins', () => {
  it('carries kind, title and aria-label, with the green special style and a centered glyph', () => {
    const scene = readFileSync('src/frontend/CitySandboxScene.vue', 'utf8');
    const css = readFileSync('src/frontend/campus-map.css', 'utf8');
    expect(scene).toContain(':aria-label="event.label"');
    expect(scene).toContain(':title="event.title"');
    expect(scene).toContain(':data-event-kind="event.kind"');
    expect(scene).toContain("event.kind === 'special'");
    expect(scene).toContain('data-map-event');
    expect(scene).toContain('<span>{{ event.icon }}</span>');
    expect(css).toContain('display:grid; place-items:center;');
    expect(css).toContain('.world-map .tokyo-sandbox-event.special { background:#7e8552; }');
    expect(css).toContain('background:#bc7950');
  });

  it('opens the description once when the gesture and the follow-up click both arrive', () => {
    const opened = applyRouteEventGesture('', 'library');
    expect(opened).toEqual({ activeId: 'library', gestureAlreadyToggled: true });
    const leaked = applyRouteEventTap(opened.activeId, 'library', opened.gestureAlreadyToggled);
    expect(leaked.activeId).toBe('library');
    const again = applyRouteEventTap(leaked.activeId, 'library', leaked.gestureAlreadyToggled);
    expect(again.activeId).toBe('');
    const map = readFileSync('src/frontend/WorldMap.vue', 'utf8');
    expect(map).toContain('openRouteEvent(id, true)');
    expect(map).toContain('openRouteEvent($event, false)');
    expect(map).toContain('[data-map-event]');
    expect(map).not.toContain('activeEventId = activeEventId === $event');
  });
});

describe('sandbox pin projection', () => {
  it('puts a walking protagonist and a place pin on the same projected ground point', () => {
    const library = mapLocationPoint('library')!;
    expect(tokyoLocationPosition('library')).toEqual(projectOldTokyoPosition(library));
    expect(TOKYO_PIN_ELEVATION).toBe(8);
    const scene = readFileSync('src/frontend/CitySandboxScene.vue', 'utf8');
    const projections = scene.match(/project\([^)]*TOKYO_PIN_ELEVATION\)/g) ?? [];
    expect(projections.length).toBeGreaterThanOrEqual(4);
    expect(scene).toContain('tokyo-sandbox-leaders');
  });
});

describe('sandbox avatar and compact pins', () => {
  it('uses a true circle and a per-character crop instead of scaling the portrait', () => {
    const css = readFileSync('src/frontend/campus-map.css', 'utf8');
    expect(css).not.toContain('scale(3.1)');
    expect(css).toContain('width:44px; height:44px; min-width:44px; min-height:44px; max-width:44px;');
    expect(css).toContain('width:38px; height:38px; min-width:38px; min-height:38px; max-width:38px;');
    expect(mapSpriteObjectPosition({ name: '远野汉娜', personId: 'majo-hanna' })).toBe('center 12%');
    expect(mapSpriteObjectPosition({ name: '高松灯', personId: 'bang-tomori' })).toBe('center 4%');
    expect(mapSpriteObjectPosition({ name: '冰上梅露露', personId: 'majo-meruru' })).toBe('center top');
    expect(mapSpriteObjectPosition({ name: '长崎夫人', personId: 'nagasaki-mother' })).toBe('center 4%');
    expect(readFileSync('assets/map-avatars/majo-meruru.svg', 'utf8')).toContain('data:image/webp;base64,');
  });
});
