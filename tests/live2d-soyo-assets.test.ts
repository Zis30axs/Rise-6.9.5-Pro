import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSoyoAssetLease, getSoyoAssetReferences, getSoyoDefinition, isSoyoSpeaker, resolveSoyoEmotion, soyoEmotionMap } from '../src/frontend/live2d-soyo-assets';

afterEach(() => vi.unstubAllGlobals());

describe('embedded Cubism 2 Soyo asset boundary', () => {
  it('keeps all real model assets, distinct expressions and no source tracking controllers', () => {
    const model = getSoyoDefinition();
    expect(model.model).toBe('model.moc');
    expect(model.textures).toEqual(['texture-0.png', 'texture-1.png']);
    expect(Object.keys(model.motions)).toHaveLength(47);
    expect(model.expressions).toHaveLength(33);
    expect(new Set(model.expressions.map(item => item.name)).size).toBe(33);
    expect(model.expressions.some(item => item.file === model.physics)).toBe(false);
    expect(model).not.toHaveProperty('controllers');
    expect(model).not.toHaveProperty('options');
    expect(getSoyoAssetReferences()).toHaveLength(84);
    expect(getSoyoAssetReferences().every(file => /^[A-Za-z0-9._-]+$/.test(file))).toBe(true);
    model.textures[0] = 'https://example.invalid/texture.png';
    expect(getSoyoDefinition().textures[0]).toBe('texture-0.png');
  });

  it('uses only authored expressions and motions for all nine emotions', () => {
    const model = getSoyoDefinition();
    expect(Object.keys(soyoEmotionMap)).toHaveLength(9);
    for (const [emotion, mapping] of Object.entries(soyoEmotionMap)) {
      expect(resolveSoyoEmotion(emotion)).toBe(emotion);
      expect(model.expressions.some(item => item.name === mapping.expression)).toBe(true);
      expect(Object.hasOwn(model.motions, mapping.motion)).toBe(true);
    }
    for (const unknown of ['constructor', '__proto__', '<script>', 'https://evil.invalid/']) expect(resolveSoyoEmotion(unknown)).toBe('平静');
    expect(isSoyoSpeaker('素世')).toBe(true);
    expect(isSoyoSpeaker('旁白')).toBe(true);
    expect(isSoyoSpeaker('  ')).toBe(true);
    expect(isSoyoSpeaker('林同学')).toBe(false);
    expect(isSoyoSpeaker('__proto__')).toBe(false);
  });

  it('resolves each bundled file to a private blob, rejects every foreign reference, and revokes once', () => {
    const create = vi.fn(() => `blob:test-${create.mock.calls.length}`);
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const lease = createSoyoAssetLease();
    for (const file of getSoyoAssetReferences()) {
      const first = lease.resolve(file);
      expect(first).toMatch(/^blob:test-/);
      expect(lease.resolve(file)).toBe(first);
    }
    expect(create).toHaveBeenCalledTimes(84);
    for (const path of ['https://example.invalid/model.moc', '//evil.test/a', '../model.moc', 'model.moc?url=x', 'constructor']) {
      expect(() => lease.resolve(path)).toThrow(/未打包/);
    }
    lease.release(); lease.release();
    expect(revoke).toHaveBeenCalledTimes(84);
    expect(() => lease.resolve('model.moc')).toThrow(/已释放/);
  });
});
