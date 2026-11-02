import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Embed one approved local ZIP as a data URL. The card never fetches it. */
export function unreadCityOfflinePackPlugin(): Plugin {
  const query = '?offline-pack';
  return {
    name: 'unread-city-offline-pack',
    enforce: 'pre',
    load(id) {
      if (!id.includes(query)) return null;
      const filename = id.slice(0, id.indexOf(query));
      const normalized = filename.replaceAll('\\', '/');
      if (!normalized.endsWith('assets/circle-livehouse/packs/unread-city-circle-sandbox.zip')) {
        throw new Error('未登记的离线资源包：' + id);
      }
      const encoded = readFileSync(filename).toString('base64');
      return `export default ${JSON.stringify('data:application/zip;base64,' + encoded)};`;
    },
  };
}
