// Exact RGBA copies retain the original atlas coordinates and transparent RGB.
import deepseek from '../../assets/npc-portraits/expression-atlases-v3/lossless/deepseek.webp?inline';
import xiaoyang from '../../assets/npc-portraits/expression-atlases-v3/lossless/xiaoyang.webp?inline';
import claude from '../../assets/npc-portraits/expression-atlases-v3/lossless/claude.webp?inline';
import type { NovelNpcEmotion } from './novel-npc-emotions';
import type { NovelNpcPortraitId } from './novel-npc-portraits';

interface PortraitFrame { x: number; y: number; width: number; height: number }
interface PortraitAtlas { source: string; width: number; height: number; frames: Record<NovelNpcEmotion, PortraitFrame> }
const order: readonly NovelNpcEmotion[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'shy', 'thinking', 'serious', 'relieved'];
function frames(columns: readonly number[], rows: readonly number[], width: number, heights: number | readonly number[]) {
  return Object.fromEntries(order.map((emotion, index) => [emotion, {
    x: columns[index % 3], y: rows[Math.floor(index / 3)], width,
    height: typeof heights === 'number' ? heights : heights[Math.floor(index / 3)],
  }])) as Record<NovelNpcEmotion, PortraitFrame>;
}

// Image-tool output is not an exact equal grid. These inspected view rectangles
// select the original pixels without repainting, scaling or merging the assets.
export const novelNpcAtlases: Record<NovelNpcPortraitId, PortraitAtlas> = {
  deepseek: { source: deepseek, width: 1024, height: 1536, frames: frames([94, 386, 682], [8, 516, 1024], 256, 512) },
  xiaoyang: { source: xiaoyang, width: 1024, height: 1536, frames: frames([70, 375, 675], [50, 550, 1030], 290, 460) },
  claude: { source: claude, width: 1024, height: 1536, frames: frames([36, 368, 698], [0, 520, 1032], 312, [520, 512, 504]) },
};
