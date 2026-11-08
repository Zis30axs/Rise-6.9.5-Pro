import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Build-only whitelist. Runtime account IDs never become paths or remote URLs. */
export async function loadNetworkArt(root) {
  const base = path.join(root, 'assets/network');
  const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'unread-city-network-art-v1') throw Error('Unknown network art manifest');
  const avatars = {}, wallpapers = {};
  for (const [file, row] of Object.entries(manifest.assets)) {
    if (!/^(avatars|lockscreens)\/[a-z0-9-]+\.webp$/.test(file)) throw Error('Invalid network asset path');
    const bytes = await readFile(path.join(base, file));
    if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error(`Network asset hash mismatch: ${file}`);
    const target = file.startsWith('avatars/') ? avatars : wallpapers;
    if (target[row.personId]) throw Error('Duplicate network avatar identity');
    target[row.personId] = 'data:image/webp;base64,' + bytes.toString('base64');
  }
  const svg = {};
  for (const name of ['default', 'xitter', 'wordmark', 'mygo', 'avemujica', 'crychic', 'news', 'weather', 'transit', 'city', 'midnight', 'campus', 'livehouse', 'plants']) {
    const raw = await readFile(path.join(base, name + '.svg'), 'utf8');
    if (!raw.startsWith('<svg ') || /<(?:script|foreignObject|image)\b|\bon\w+\s*=|(?:href|src)\s*=|url\((?!#[\w-]+\))/i.test(raw)) throw Error('Non-static network SVG: ' + name);
    svg[name] = raw;
  }
  const data = name => 'data:image/svg+xml;base64,' + Buffer.from(svg[name]).toString('base64');
  avatars.default = data('default');
  for (const [id, name] of Object.entries({'band:mygo':'mygo', 'band:avemujica':'avemujica', 'band:crychic':'crychic', 'institution:reuters':'news', 'institution:nhk':'news', 'institution:weather':'weather', 'institution:transit':'transit', 'institution:tokyo':'city', 'chatter:midnight':'midnight', 'chatter:campus':'campus', 'chatter:livehouse':'livehouse', 'chatter:plants':'plants'})) avatars[id] = data(name);
  return {avatars, wallpapers, icon: svg.xitter, wordmark: svg.wordmark};
}
