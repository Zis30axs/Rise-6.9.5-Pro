import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Authoritative crop sources: never use the newly generated decorative Grok/Image2 sheets.
const sourceById: Record<string, string> = {
  sakiko: 'assets/downtown-art/characters/sakiko/casual/neutral.webp',
  anon: 'assets/downtown-art/characters/anon/uniform/smile.webp',
  taki: 'assets/downtown-art/characters/taki/uniform/neutral.webp',
  rana: 'assets/downtown-art/characters/raana/uniform/neutral.webp',
  mutsumi: 'assets/downtown-art/characters/mutsumi/uniform/neutral.webp',
  'majo-emma': 'assets/majo-runtime/emma/neutral.webp',
  'majo-hiro': 'assets/majo-runtime/characters/majo-hiro/neutral.webp',
  'majo-anan': 'assets/majo-runtime/characters/majo-anan/neutral.webp',
  'majo-noa': 'assets/majo-runtime/characters/majo-noa/neutral.webp',
  'majo-milia': 'assets/majo-runtime/characters/majo-milia/casual/neutral.webp',
  'majo-margo': 'assets/majo-runtime/characters/majo-margo/neutral.avif',
  'majo-nanoka': 'assets/majo-runtime/characters/majo-nanoka/neutral.webp',
  'majo-arisa': 'assets/majo-runtime/characters/majo-arisa/neutral.webp',
  'majo-sherry': 'assets/majo-runtime/characters/majo-sherry/neutral.webp',
  'majo-hanna': 'assets/majo-runtime/characters/majo-hanna/neutral.webp',
  'majo-yuki': 'assets/majo-runtime/characters/majo-yuki/neutral.png',
  'wata-renako': 'assets/watanare-runtime/renako/neutral.webp',
  'wata-mai': 'assets/watanare-runtime/characters/watanare-mai/neutral.webp',
  'wata-ajisai': 'assets/watanare-runtime/characters/watanare-ajisai/neutral.webp',
  'wata-satsuki': 'assets/watanare-runtime/characters/watanare-satsuki/neutral.webp',
  'wata-kaho': 'assets/watanare-runtime/characters/watanare-kaho/neutral.webp',
  'wata-haruna': 'assets/watanare-runtime/characters/watanare-haruna/neutral.webp',
};

describe('identity-safe offline map headshots', () => {
  it('keeps Soyo original headshot and all 22 approved crops without restricting future avatars', () => {
    const files = new Set(readdirSync(resolve('assets/map-avatars')));
    expect(files.has('soyo.webp')).toBe(true);
    for (const id of Object.keys(sourceById)) expect(files.has(id + '.svg'), id + ' crop missing').toBe(true);
    expect(readFileSync(resolve('assets/map-avatars/soyo.webp')).byteLength).toBeGreaterThan(100);
  });

  it('embeds the exact original illustration bytes, not newly generated art', () => {
    for (const [id, source] of Object.entries(sourceById)) {
      const content = readFileSync(resolve('assets/map-avatars', id + '.svg'), 'utf8');
      expect(content).toContain('width="256" height="256"');
      expect(content).toContain('viewBox="0 0 256 256"');
      expect(content).toContain('<clipPath id="crop">');
      const embedded = content.match(/<image\b[^>]*href="data:(image\/(?:webp|png|avif));base64,([A-Za-z0-9+/=]+)"/);
      expect(embedded, id + ' missing self-contained binary image').not.toBeNull();
      expect(Buffer.from(embedded![2], 'base64').equals(readFileSync(resolve(source))), id + ' not byte-identical to existing art').toBe(true);
      expect(content).not.toMatch(/\bhref="https?:/i);
    }
  });

  it('uses the generated icons first but preserves the original sprite fallback', () => {
    const logic = readFileSync(resolve('src/frontend/map-character-avatar.ts'), 'utf8');
    const component = readFileSync(resolve('src/frontend/MapCharacterAvatar.vue'), 'utf8');
    expect(logic).toContain('assets/map-avatars/*.svg');
    expect(logic).toContain("query: '?offline-map-headshot'");
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8');
    expect(vite).toContain("name: 'unread-city-map-headshot-base64'");
    expect(vite).toContain("'data:image/svg+xml;base64,'");
    expect(logic).toContain('ignoreNewHeadshot');
    expect(logic).toContain('soyoHeadshot');
    expect(component).toContain('resolveMapCharacterAvatar(props, true)');
  });
});
