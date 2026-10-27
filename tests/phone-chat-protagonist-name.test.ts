import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('scripts/build_embedded_phone.mjs', 'utf8');
const oldDeclaration = "  const myName = () => profile().name || api.userName?.() || '我';";

function patchedDeclaration(): string {
  const needle = `code = replaceOnce(code, ${JSON.stringify(oldDeclaration)}, `;
  const start = builder.indexOf(needle);
  if (start < 0) throw new Error('Missing embedded chat identity patch');
  const match = /^("(?:\\.|[^"\\])*")/.exec(builder.slice(start + needle.length));
  if (!match) throw new Error('Cannot read the injected chat identity declaration');
  return JSON.parse(match[1]) as string;
}

describe('embedded phone chat header follows the current protagonist', () => {
  it('adds a real newline-terminated module import before the upstream chat source', () => {
    const line = builder.split('\n').find(row => row.includes('code = "import {worldPhoneState}'));
    expect(line).toBeDefined();
    const match = line!.match(/code = ("(?:\\.|[^"\\])*") \+ code;/);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1])).toBe("import {worldPhoneState} from 'virtual:unread-city-world-apps';\n");
  });

  it('reads the world-phone snapshot on each render, including all four protagonist switches', () => {
    const declaration = patchedDeclaration();
    expect(declaration).toContain('worldPhoneState(v.root)?.name');
    const screen = {};
    let current: { name: string } | null = { name: '长崎素世' };
    const reads: unknown[] = [];
    const displayName = new Function('worldPhoneState', 'profile', 'api', 'v',
      `${declaration}\nreturn myName;`)(
        (node: unknown) => { reads.push(node); return current; },
        () => ({ name: 'User' }),
        { userName: () => 'User' },
        { root: screen },
      ) as () => string;
    for (const name of ['长崎素世', '丰川祥子', '樱羽艾玛', '甘织玲奈子']) {
      current = { name };
      expect(displayName()).toBe(name);
    }
    expect(reads).toEqual([screen, screen, screen, screen]);

    current = null;
    expect(displayName()).toBe('User'); // Only standalone/disconnected phones use their original profile.
  });

  it('leaves the real phone profile and saved preferences unchanged', () => {
    const declaration = patchedDeclaration();
    expect(declaration).not.toContain('save');
    expect(declaration).not.toContain('profile().name =');
    expect(declaration).toContain("profile().name || api.userName?.() || '我'");
  });
});
