import '../../vendor/live2d/cubism2-runtime.js';
import { Application } from 'pixi.js';
import { Cubism2ModelSettings, Live2DModel, MotionPreloadStrategy, MotionPriority, config } from 'pixi-live2d-display/cubism2';
import { createSoyoAssetLease, getSoyoDefinition } from './live2d-soyo-assets';
import { createSoyoExpressionController } from './live2d-soyo-expression';
import { fitSoyoPortrait } from './live2d-soyo-fit';

config.sound = false;

export async function createSoyoPortrait(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  const lease = await createSoyoAssetLease(signal);
  let application: Application | undefined;
  let model: Live2DModel | undefined;
  let modelLoading = false;
  let disposed = false;
  let expressions: ReturnType<typeof createSoyoExpressionController> | undefined;
  const destroy = () => {
    if (disposed) return;
    disposed = true; expressions?.dispose();
    signal?.removeEventListener('abort', destroy);
    try {
      application?.stop();
      application?.destroy(false, { children: true, texture: true, baseTexture: true });
    } finally {
      // The loader does not accept AbortSignal. Let a pending local load settle
      // so its textures can be destroyed, instead of revoking URLs mid-decode.
      if (!modelLoading) lease.release();
    }
  };
  try {
    signal?.addEventListener('abort', destroy, { once: true });
    if (signal?.aborted) { destroy(); throw new Error('立绘已关闭。'); }
    const app = application = new Application({ view: canvas, width: 1, height: 1, backgroundAlpha: 0, antialias: true,
      autoStart: false, sharedTicker: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), powerPreference: 'low-power' });
    const definition = new Cubism2ModelSettings({ ...getSoyoDefinition(), url: 'soyo.model.json' });
    definition.resolveURL = file => lease.resolve(file);
    modelLoading = true;
    try {
      model = await Live2DModel.from(definition, { autoInteract: false, autoUpdate: false,
        idleMotionGroup: '默认', motionPreload: MotionPreloadStrategy.NONE });
    } finally { modelLoading = false; if (disposed) lease.release(); }
    if (disposed) { model.destroy({ children: true, texture: true, baseTexture: true }); throw new Error('立绘已关闭。'); }
    model.anchor.set(0.5, 1);
    app.stage.addChild(model);
    app.ticker.maxFPS = 30;
    app.ticker.add(() => { if (model && !disposed) model.update(Math.min(app.ticker.deltaMS, 50)); });
    const portrait = model;
    expressions = createSoyoExpressionController({
      cancelPendingExpression() {
        const manager = portrait.internalModel.motionManager.expressionManager;
        if (manager) manager.reserveExpressionIndex = -1;
      },
      stopMotions: () => portrait.internalModel.motionManager.stopAllMotions(),
      expression: name => portrait.expression(name),
      motion: group => portrait.motion(group, 0, MotionPriority.FORCE),
    });
    return {
      resize(width: number, height: number) {
        if (disposed || width <= 0 || height <= 0) return;
        const fit = fitSoyoPortrait(width, height, portrait.internalModel.width, portrait.internalModel.height);
        if (!fit) return;
        app.renderer.resize(width, height);
        portrait.scale.set(fit.scale);
        portrait.position.set(fit.x, fit.y);
        app.render();
      },
      setActive(active: boolean) {
        if (disposed) return;
        if (active) app.start(); else app.stop();
      },
      async setEmotion(value: string) {
        if (disposed) return false;
        return expressions!.apply(value);
      },
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
export type SoyoPortrait = Awaited<ReturnType<typeof createSoyoPortrait>>;
