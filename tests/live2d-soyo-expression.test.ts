import { describe, expect, it, vi } from 'vitest';
import { createSoyoExpressionController } from '../src/frontend/live2d-soyo-expression';

describe('Soyo expression changes', () => {
  it('returning to the visible expression cancels an older load and its later motion', async () => {
    let visible = '默认';
    let reserved = '';
    let finish: (() => void) | undefined;
    const motion = vi.fn(async () => true);
    const controller = createSoyoExpressionController({
      cancelPendingExpression: () => { reserved = ''; },
      stopMotions: vi.fn(), motion,
      expression: async name => {
        // Cubism 2 returns immediately if the expression is already visible.
        if (name === visible) return false;
        reserved = name;
        await new Promise<void>(resolve => { finish = resolve; });
        if (reserved !== name) return false;
        visible = name;
        return true;
      },
    });
    const old = controller.apply('开心');
    await controller.apply('平静');
    finish!(); await old;
    expect(visible).toBe('默认');
    expect(motion.mock.calls).toEqual([['默认']]);
  });

  it('never starts a late motion after the portrait is disposed', async () => {
    let finish: ((changed: boolean) => void) | undefined;
    const motion = vi.fn(async () => true);
    const cancel = vi.fn();
    const controller = createSoyoExpressionController({ cancelPendingExpression: cancel, stopMotions: vi.fn(), motion,
      expression: () => new Promise(resolve => { finish = resolve; }),
    });
    const loading = controller.apply('生气');
    controller.dispose(); finish!(true); await loading;
    expect(motion).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(await controller.apply('开心')).toBe(false);
  });
});
