import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Only known original SVGs; missing/tampered build inputs fail before shipping. */
export async function loadPhoneArt(root) {
  const directory=path.join(root,'assets/phone-visuals');
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.schema!=='unread-city-phone-art-v1')throw Error('Unknown phone art manifest');
  const art={};
  for(const [file,entry] of Object.entries(manifest.assets)) {
    if(!/^(soyo|sakiko)\/(wallpaper|(?:icons|cards)\/[a-z]+)\.svg$/.test(file))throw Error(`Invalid phone art path: ${file}`);
    const raw=await readFile(path.join(directory,file));
    if(raw.length!==entry.bytes||createHash('sha256').update(raw).digest('hex')!==entry.sha256)throw Error(`Phone art hash mismatch: ${file}`);
    const svg=raw.toString('utf8');
    if(!svg.startsWith('<svg ')||/<(?:script|foreignObject|image)\b|\bon\w+\s*=|(?:href|src)\s*=|url\((?!#[\w-]+\))/i.test(svg))throw Error(`Non-static phone art: ${file}`);
    art[file]=svg;
  }
  for(const owner of ['soyo','sakiko'])for(const file of ['wallpaper.svg','cards/gpt.svg','cards/claude.svg','cards/gemini.svg','icons/worldstyle.svg'])if(!art[`${owner}/${file}`])throw Error('Required phone art missing');
  return art;
}
