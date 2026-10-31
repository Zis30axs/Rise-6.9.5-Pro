import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKYO_SANDBOX_MODEL_SHA256 } from '../src/frontend/tokyo-sandbox-map';

const pack = JSON.parse(readFileSync('integration/tokyo-sandbox/pack.json', 'utf8')) as {
  bytes: number; sha256: string; archive: string; separateFrom: string; loader: string;
  source: string; id: string; manifestSchema: string;
};

describe('Tokyo sandbox separate asset pack', () => {
  it('matches the committed GLB to the pack registration', () => {
    const bytes = readFileSync(pack.source);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(bytes.length).toBe(pack.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pack.sha256);
    expect(pack.sha256).toBe(TOKYO_SANDBOX_MODEL_SHA256);
    expect(pack.bytes).toBe(6_232_488);
    expect(pack.id).toBe('tokyo-sandbox');
    expect(pack.archive).toBe('unread-city-tokyo-sandbox.zip');
    expect(pack.separateFrom).toBe('unread-city-lite-assets.zip');
    expect(pack.loader).toBe('__UC_TOKYO_SANDBOX_ASSET__');
    expect(pack.manifestSchema).toBe('unread-city-tokyo-sandbox-v1');
  });

  it('keeps the model out of the core Lite ZIP and wires the scene', () => {
    const release = readFileSync('scripts/build_lite_release.py', 'utf8');
    const loader = readFileSync('scripts/lite_asset_loader.js', 'utf8');
    const scene = readFileSync('src/frontend/CitySandboxScene.vue', 'utf8');
    const card = readFileSync('scripts/build_lite_card.py', 'utf8');
    const workflow = readFileSync('.github/workflows/lite-prerelease.yml', 'utf8');
    expect(release).toContain('东京沙盘不得写入主 Lite ZIP');
    expect(release).toContain('__UC_TOKYO_SANDBOX_ASSET__');
    expect(release).not.toContain('未被拆分进 Lite ZIP');
    expect(loader).toContain('unread-city-tokyo-sandbox-v1');
    expect(loader).toContain('function __UC_TOKYO_SANDBOX_ASSET__');
    expect(loader).toContain("buttonId: 'unread-city-tokyo-sandbox-import'");
    expect(scene).toContain("import tokyoModelAsset from '../../assets/models/unread-city-tokyo-sandbox.glb?inline'");
    expect(scene).toContain('TOKYO_SANDBOX_MODEL_SHA256');
    expect(card).toContain("archive': TOKYO_SANDBOX_ARCHIVE");
    expect(workflow).toContain('dist/unread-city-tokyo-sandbox.zip');
    expect(workflow).toContain('tokyoSandboxInCoreZip');
  });
});
