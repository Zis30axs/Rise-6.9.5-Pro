export const novelNpcEmotions = {
  平静: 'neutral',
  开心: 'happy',
  难过: 'sad',
  生气: 'angry',
  惊讶: 'surprised',
  害羞: 'shy',
  思考: 'thinking',
  严肃: 'serious',
  安心: 'relieved',
} as const;

Object.freeze(novelNpcEmotions);

export type NovelNpcEmotion = (typeof novelNpcEmotions)[keyof typeof novelNpcEmotions];

export function resolveNovelNpcEmotion(input: string): NovelNpcEmotion {
  const emotion = input.trim();
  return Object.prototype.hasOwnProperty.call(novelNpcEmotions, emotion)
    ? novelNpcEmotions[emotion as keyof typeof novelNpcEmotions]
    : 'neutral';
}
