import modelDefinition from '../../assets/live2d-soyo/model.json';

const embedded = import.meta.glob<string>([
  '../../assets/live2d-soyo/*.moc', '../../assets/live2d-soyo/*.png',
  '../../assets/live2d-soyo/*.mtn', '../../assets/live2d-soyo/*.exp.json', '../../assets/live2d-soyo/*.physics.json',
], { eager: true, query: '?url&inline', import: 'default' });

export const soyoEmotionMap = {
  平静: { expression: '默认', motion: '默认' },
  开心: { expression: '笑容01', motion: '笑' },
  难过: { expression: '难过01', motion: '难过' },
  生气: { expression: '生气01', motion: '生气01' },
  惊讶: { expression: '惊讶01', motion: '惊讶' },
  害羞: { expression: '羞耻01', motion: 'shame' },
  思考: { expression: '思考01', motion: '思考' },
  严肃: { expression: '严肃01', motion: 'serious' },
  安心: { expression: '安心', motion: '安心' },
} as const;
export type SoyoEmotion = keyof typeof soyoEmotionMap;

export function resolveSoyoEmotion(value: string): SoyoEmotion {
  return Object.hasOwn(soyoEmotionMap, value) ? value as SoyoEmotion : '平静';
}
export function isSoyoSpeaker(value: string): boolean {
  return ['', '旁白', '素世', '长崎素世', '長崎そよ', 'Soyo', 'soyo'].includes(value.trim());
}

export function getSoyoDefinition() { return structuredClone(modelDefinition); }
export function getSoyoAssetReferences(): string[] {
  return [modelDefinition.model, ...modelDefinition.textures, modelDefinition.physics,
    ...Object.values(modelDefinition.motions).flatMap(group => group.map(motion => motion.file)),
    ...modelDefinition.expressions.map(expression => expression.file)];
}

/** Only names from the packaged model may resolve. No model-provided network URLs. */
export function createSoyoAssetLease() {
  const allowed = new Set(getSoyoAssetReferences());
  const urls = new Map<string, string>();
  let released = false;
  return {
    resolve(file: string): string {
      if (released) throw new Error('立绘素材已释放。');
      if (!allowed.has(file) || !/^[A-Za-z0-9._-]+$/.test(file)) throw new Error('立绘引用了未打包的素材。');
      const cached = urls.get(file);
      if (cached) return cached;
      const source = embedded[`../../assets/live2d-soyo/${file}`];
      const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=]+)$/.exec(source ?? '');
      if (!match) throw new Error('立绘素材未完整内嵌。');
      const decoded = atob(match[2]);
      const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: match[1] || 'application/octet-stream' }));
      urls.set(file, url);
      return url;
    },
    release() {
      if (released) return;
      released = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
