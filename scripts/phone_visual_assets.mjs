import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const STATIC_SVG = /<(?:script|foreignObject|image)\b|\bon\w+\s*=|(?:href|src)\s*=|url\((?!#[\w-]+\))/i;

/** Only known original SVGs; missing/tampered build inputs fail before shipping. */
export async function loadPhoneArt(root) {
  const directory=path.join(root,'assets/phone-visuals');
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.schema!=='unread-city-phone-art-v1')throw Error('Unknown phone art manifest');
  const art={};
  for(const [file,entry] of Object.entries(manifest.assets)) {
    if(!/^(soyo|sakiko|emma|renako)\/(wallpaper|(?:icons|cards)\/[a-z]+)\.svg$/.test(file))throw Error(`Invalid phone art path: ${file}`);
    const raw=await readFile(path.join(directory,file));
    if(raw.length!==entry.bytes||createHash('sha256').update(raw).digest('hex')!==entry.sha256)throw Error(`Phone art hash mismatch: ${file}`);
    const svg=raw.toString('utf8');
    if(!svg.startsWith('<svg ')||STATIC_SVG.test(svg))throw Error(`Non-static phone art: ${file}`);
    art[file]=svg;
  }
  for(const owner of ['soyo','sakiko','emma','renako'])for(const file of ['wallpaper.svg','cards/gpt.svg','cards/claude.svg','cards/gemini.svg','icons/worldstyle.svg'])if(!art[`${owner}/${file}`])throw Error('Required phone art missing');

  // PR #16 Twiitch artwork: 13 self-contained SVGs, still original static data.
  const castRoot=path.join(root,'assets/majo-cast');
  const castManifest=JSON.parse(await readFile(path.join(castRoot,'manifest.json'),'utf8'));
  if(castManifest.schema!=='unread-city-majo-cast-art-v1')throw Error('Unknown majo cast manifest');
  for(const entry of castManifest.assets) {
    if(!/^twiitch\/[a-z-]+\.svg$/.test(entry.file))continue;
    const raw=await readFile(path.join(castRoot,entry.file));
    if(raw.length!==entry.bytes||createHash('sha256').update(raw).digest('hex')!==entry.sha256)throw Error(`Twiitch art hash mismatch: ${entry.file}`);
    const svg=raw.toString('utf8');
    if(!svg.startsWith('<svg ')||STATIC_SVG.test(svg))throw Error(`Non-static Twiitch art: ${entry.file}`);
    art[entry.file]=svg;
  }
  for(const file of ['twiitch/coco-avatar.svg','twiitch/coco-channel-cover.svg','twiitch/wordmark.svg','twiitch/offline-card.svg','twiitch/icon-default.svg','twiitch/icon-coco.svg'])
    if(!art[file])throw Error(`Required Twiitch art missing: ${file}`);
  return art;
}
