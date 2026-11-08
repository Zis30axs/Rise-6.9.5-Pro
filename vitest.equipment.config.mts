import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Local, targeted checks; no asset, phone, or release build hooks.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: [
      'tests/equipment.test.ts',
      'tests/equipment-ui.test.ts',
      'tests/store-product-image.test.ts',
      'tests/social-skills.test.ts',
      'tests/protagonist-academics.test.ts',
    ],
  },
});
