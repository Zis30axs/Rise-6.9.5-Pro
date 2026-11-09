import { resolveSoyoEmotion, soyoEmotionMap } from './live2d-soyo-assets';

interface ExpressionTarget {
  cancelPendingExpression(): void;
  stopMotions(): void;
  expression(name: string): Promise<boolean>;
  motion(group: string): Promise<unknown>;
}

/** Cancel even when the requested expression is already visible: the upstream
 * manager otherwise leaves an older, still-loading expression reserved. */
export function createSoyoExpressionController(target: ExpressionTarget, resolve: (value:string) => {expression?:string;motion?:string} = value => soyoEmotionMap[resolveSoyoEmotion(value)]) {
  let generation = 0;
  let dead = false;
  return {
    async apply(value: string) {
      if (dead) return false;
      const current = ++generation;
      target.cancelPendingExpression();
      target.stopMotions();
      const mapping = resolve(value);
      const changed = mapping.expression ? await target.expression(mapping.expression) : false;
      if (dead || current !== generation) return false;
      if (mapping.motion) await target.motion(mapping.motion);
      return changed;
    },
    dispose() { dead = true; generation++; target.cancelPendingExpression(); },
  };
}
