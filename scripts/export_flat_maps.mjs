// Optional portable artwork: write the same SVG layers used in the card, plus a readable marker index.
import { createServer } from 'vite';
import { resolve,join } from 'node:path';
import { mkdirSync,writeFileSync } from 'node:fs';
import { h } from 'vue';
import { renderToString } from 'vue/server-renderer';
const dir=resolve(process.argv[2]||'dist/flat-maps');mkdirSync(dir,{recursive:true});
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {sheets,regions,labels}=await server.ssrLoadModule('/src/frontend/flat-map/maps.ts');
 const {default:MapLayers}=await server.ssrLoadModule('/src/frontend/flat-map/MapLayers.vue');
 const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
 const index=[];
 async function save(region,title,pins,bounds,filename){
  const sheet=sheets[region],w=1080,hgt=760,[a,b,c,d]=bounds,s=Math.min(960/(c-a),575/(d-b)),cx=(a+c)/2,cy=(b+d)/2;
  const xx=x=>(x-cx)*s+540,yy=y=>(y-cy)*s+403;
  const pts=[],seen=new Map();
  for(const pin of pins){const key=[pin.x,pin.y].join(',');if(seen.has(key)){seen.get(key).names.push(pin.name);continue}
   const p={pin,x:xx(pin.x),y:yy(pin.y),names:[pin.name]};seen.set(key,p);pts.push(p)}
  const layers=await renderToString(h(MapLayers,{sheet,transform:`translate(540 403) scale(${s}) translate(${-cx} ${-cy})`}));
  const list=pins.map(p=>p.name).join('、');
  const text=(x,y,content,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(content)}</text>`;
  const markerLabels=labels(pts,w,hgt,'','').map(p=>text(p.tx,p.y+4,p.pin.name,'font-size="14" font-weight="650" fill="#f2eedc" stroke="#253c4b" stroke-width="3" paint-order="stroke" text-anchor="'+p.anchor+'"')).join('');
  // A title on every dot keeps all additional names available in a browser.
  writeFileSync(join(dir,filename),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 760" width="1080" height="760" font-family="system-ui, sans-serif"><title>${esc(title)} · 未读之城</title><desc>${esc(list)}</desc><defs><clipPath id="map"><rect y="76" width="1080" height="628"/></clipPath></defs><rect width="1080" height="760" fill="#192e3d"/><rect y="76" width="1080" height="628" fill="${['california','world'].includes(region)?'#213f54':'#344c61'}"/><g clip-path="url(#map)">${layers}${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="${p.pin.kind==='sight'?'#96bbcb':'#edc48b'}" stroke="#213746" stroke-width="2"><title>${esc(p.names.join(' / '))}</title></circle>`).join('')}${markerLabels}</g>${text(32,27,'未 读 之 城   /   城 市 图 集','font-size="13" fill="#91c7c2"')}${text(32,59,title,'font-size="28" font-weight="700" fill="#ecefe6"')}${text(1044,49,'平面地图  /  2D','font-size="16" text-anchor="end" fill="#bdd4d8"')}${text(1017,111,'▲ 北','font-size="14" fill="#f2efe0"')}${text(32,738,'街区与地标 · '+pins.length+' 个条目','font-size="15" fill="#c7d7d8"')}${text(1046,738,'未读之城 · 校园生活图集','font-size="13" text-anchor="end" fill="#9cbdc4"')}</svg>\n`);
  index.push({file:filename,region,title,places:pins.map(({id,name,group,kind,x,y})=>({id,name,group,kind,x,y}))})
 }
 for(const [i,k] of regions.entries()){const s=sheets[k];await save(k,s.name+(k==='world'?'总览':''),s.pins,s.bounds,String(i+1).padStart(2,'0')+'-'+k+'.svg')}
 const t=sheets.tokyo,groups=[...new Set(t.pins.map(p=>p.group))];
 for(const [i,g] of groups.entries()){const pins=t.pins.filter(p=>p.group===g),x=pins.map(p=>p.x),y=pins.map(p=>p.y);
  await save('tokyo','东京 · '+g,pins,[Math.min(...x)-13,Math.min(...y)-13,Math.max(...x)+13,Math.max(...y)+13],'tokyo-'+String(i+1).padStart(2,'0')+'-'+g+'.svg')}
 writeFileSync(join(dir,'地点索引.json'),JSON.stringify(index,null,2)+'\n');console.info(index.length+' maps');
}finally{await server.close()}
