import { execFileSync } from 'node:child_process';
import { mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

// Compare the unrelated clinic failure with the unchanged, committed backdrop selector.
const committedBackgrounds = execFileSync('git', ['show', 'HEAD:src/frontend/novel-backgrounds.ts'], { encoding: 'utf8' });
export default mergeConfig(base, {
  plugins: [{
    name: 'committed-backdrops-baseline', enforce: 'pre' as const,
    load(id: string) {
      if (id.replaceAll('\\', '/').endsWith('/src/frontend/novel-backgrounds.ts')) return committedBackgrounds;
    },
  }],
});
