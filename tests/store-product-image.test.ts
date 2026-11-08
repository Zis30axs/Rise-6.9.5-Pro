// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import StoreProductImage from '../src/frontend/StoreProductImage.vue';
import { getStoreProductImage } from '../src/frontend/store-product-images';

let app: App | undefined;
afterEach(() => { app?.unmount(); document.body.replaceChildren(); });

describe('local backpack images', () => {
  it('ships the complete CRYCHIC WebP payload, not a truncated image', () => {
    const bytes = readFileSync('assets/equipment/crychic-photo.webp');
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    expect(bytes.length).toBe(bytes.readUInt32LE(4) + 8);
    let offset = 12;
    while (offset < bytes.length) {
      expect(offset + 8).toBeLessThanOrEqual(bytes.length);
      const length = bytes.readUInt32LE(offset + 4);
      offset += 8 + length + length % 2;
      expect(offset).toBeLessThanOrEqual(bytes.length);
    }
    expect(offset).toBe(bytes.length);
  });

  it('recovers when the same image component changes to a different product', async () => {
    const root = document.createElement('div');document.body.append(root);
    const props = reactive({ itemId: 'crychic-photo', name: 'CRYCHIC 合照' });
    app = createApp({ components: { StoreProductImage }, setup: () => ({ props }),
      template: '<StoreProductImage v-bind="props" />' });
    app.mount(root);
    root.querySelector('img')!.dispatchEvent(new Event('error'));await nextTick();
    expect(root.querySelector('img')).toBeNull();
    props.itemId = 'meal-basic';props.name = '饭食';await nextTick();
    expect(root.querySelector('img')?.getAttribute('src')).toBe(getStoreProductImage('meal-basic'));
    props.itemId = 'crychic-photo';props.name = 'CRYCHIC 合照';await nextTick();
    expect(root.querySelector('img')?.getAttribute('src')).toBe(getStoreProductImage('crychic-photo'));
  });
});
