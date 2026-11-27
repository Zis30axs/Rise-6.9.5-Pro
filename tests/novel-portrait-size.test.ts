import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLayout, repairLegacyPortraitRect } from '../src/frontend/shell-layout';

const legacy = {
  portrait: { x: 0.38, y: 0.48, w: 0.22, h: 0.19 },
  dock: { x: 0.1, y: 0.85, w: 0.8, h: 0.1 },
};

describe('novel NPC portrait stage regression', () => {
  it('repairs old mobile thumbnail geometry without resetting other HUD layout', () => {
    const parsed = parseLayout(JSON.stringify(legacy));
    const repaired = repairLegacyPortraitRect(parsed, true);
    expect(repaired.portrait).toBeUndefined();
    expect(repaired.dock).toEqual(legacy.dock);
    expect(parsed.portrait).toEqual(legacy.portrait);
  });

  it('repairs old desktop thumbnail geometry', () => {
    expect(repairLegacyPortraitRect(parseLayout(JSON.stringify(legacy)), false).portrait).toBeUndefined();
  });

  it('does not modify a properly sized user portrait', () => {
    for (const mobile of [true, false]) {
      const layout = parseLayout(JSON.stringify({ ...legacy, portrait: { ...legacy.portrait, h: 0.8 } }));
      expect(repairLegacyPortraitRect(layout, mobile)).toBe(layout);
    }
  });

  it('uses a full-height generic atlas stage on desktop, mobile and short mobile', () => {
    const css = readFileSync('src/frontend/novel-npc-portrait.css', 'utf8');
    expect(css).toMatch(/\.novel-npc-portrait\s*\{[^}]*inset:\s*52px calc\(var\(--col,\s*480px\)\s*\+\s*var\(--rail,\s*80px\)\) 0 0/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{\s*\.novel-npc-portrait\s*\{\s*inset:\s*52px 8px calc\(var\(--navh,\s*62px\)/s);
    expect(css).toMatch(/@media\s*\(max-height:\s*640px\) and \(max-width:\s*760px\)\s*\{\s*\.novel-npc-portrait\s*\{\s*inset:\s*46px 6px calc\(var\(--navh,\s*62px\)/s);
    expect(css).toMatch(/\.novel-npc-portrait__sprite\s*\{[^}]*object-fit:\s*contain;/s);
  });
});
