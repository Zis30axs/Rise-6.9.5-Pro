// Offline compilation only. Ship paths and marker positions, never meshes, camera frames or tiles.
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const server = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
const load = file=>JSON.parse(readFileSync(file,'utf8'));
const plan = await server.ssrLoadModule('/src/frontend/tokyo-diorama/plan.ts');
const {mapDistricts} = await server.ssrLoadModule('/src/frontend/map-districts.ts');
const {novelDestinations} = await server.ssrLoadModule('/src/runtime/model.ts');
const names = new Map(novelDestinations.map(p=>[p.id,p.name]));
const near = x=>Math.round(x*10)/10;
const path = (ps,closed=false)=>ps.length<2?'':'M'+ps.map(p=>p.map(near).join(',')).join(' ')+(closed?'Z':'');
const box=(x,z,w,d)=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
const circle=(x,z,r)=>Array.from({length:24},(_,i)=>[x+r*Math.cos(i*Math.PI/12),z+r*Math.sin(i*Math.PI/12)]);
const maps={};
function area(key,name,bounds){return maps[key]={name,bounds,layers:{},pins:[]}}
function draw(m,k,points,closed=false){m.layers[k]=(m.layers[k]||'')+path(points,closed)}
function pin(m,id,name,x,y,group='',kind='place'){
 if(m.pins.some(p=>p.id===id)||![x,y].every(Number.isFinite)) throw Error('Invalid pin: '+id);
 m.pins.push({id,name:names.get(id)||name,x:near(x),y:near(y),group,kind})
}
const t=area('tokyo','东京',[-330,-260,420,345]);
const districts=new Map(mapDistricts.map(d=>[d.id,d.shortName]));
for(const s of [...plan.scenery,...plan.sites]) draw(t,['park','garden','mountain','forest','summit'].includes(s.form)?'green':'block',s.polygon,true);
for(const r of plan.streets)draw(t,r.walk?'trail':r.width>=5?'major':'road',[plan.nodes[r.a],plan.nodes[r.b]]);
draw(t,'water',[...plan.sections.map(s=>s.left),...plan.sections.map(s=>s.right).reverse()],true);
for(const [id,site] of plan.byId) if(names.has(id))pin(t,id,site.title,site.x,site.z,districts.get(site.district));
const rawTokyo=load('assets/models/unread-city-tokyo-sandbox-data.json');
for(const p of rawTokyo.landmarks)if(!t.pins.some(pin=>pin.id===p.id))pin(t,p.id,p.name,p.x,p.z,rawTokyo.districts.find(d=>d.id===p.district)?.shortName||'观景点','sight');
const b=load('assets/beijing-sandbox/sandbox.json'),bj=area('beijing','北京',[b.bounds.minX,b.bounds.minZ,b.bounds.maxX,b.bounds.maxZ]);
const bg=JSON.parse(execFileSync('python3',['-c',`import ast,json
tree=ast.parse(open('assets/beijing-sandbox/source/model.py').read()); out={}
for stmt in tree.body:
 if isinstance(stmt,ast.Assign) and isinstance(stmt.targets[0],ast.Name) and stmt.targets[0].id in ('PARKS','LAKES','roads') and isinstance(stmt.value,ast.List): out[stmt.targets[0].id]=ast.literal_eval(stmt.value)
print(json.dumps(out))`],{encoding:'utf8'}));
for(const p of bg.PARKS)draw(bj,'green',box(...p),true);
for(const [p] of bg.LAKES)draw(bj,'water',p,true);
for(const [p] of bg.roads)draw(bj,'major',p);
for(const r of b.routes)draw(bj,'trail',r.points);
for(const p of b.places)pin(bj,p.id,p.name,p.x,p.z,b.categories[p.category]?.name);
const c=load('assets/california-sandbox/sandbox.json'),ca=area('california','加州',[-216,-240,125,245]);
for(const poly of c.shore)draw(ca,'land',poly,true);
for(const r of c.routes)draw(ca,'major',r.points.filter((_,i,a)=>i%5===0||i===a.length-1).map(p=>[p.x,p.z]));
for(const p of c.landmarks)pin(ca,p.id,p.name,p.x,p.z,c.districts.find(d=>d.id===p.district)?.name);
for(const p of c.sights)pin(ca,p.id,p.name,p.x,p.z,'观景点','sight');
const pa=area('paris','巴黎',[-49,-31,49,31]);
const bank=(x,s)=>-2+3.6*Math.sin((x+12)/14)+.105*x+s*(3.3+3.95*Math.exp(-(((x-31)/10.8)**2)));
const xs=Array.from({length:49},(_,i)=>-47+94*i/48);
for(const x of [-40,-20,-11,2,9,22,31.5,40])draw(pa,'road',[[x-1.4,-31],[x+1.3,-17],[x-1.5,2],[x+.8,15],[x+4.6,30]]);
for(const y of [-24,-17,-6,8,16.4,23.6])draw(pa,'road',[[-49,y+1.3],[-28,y-1],[-10,y+.3],[9,y-1.4],[30,y+1.3],[49,y-.5]]);
draw(pa,'green',box(-30,9,13.8,30),true);
draw(pa,'water',[...xs.map(x=>[x,bank(x,-1)]),...xs.slice().reverse().map(x=>[x,bank(x,1)])],true);
for(const s of [-1,1])draw(pa,'major',xs.map(x=>[x,bank(x,s)+s]));
for(const x of [-33,-10.5,5,18,42.1])draw(pa,'major',[[x,bank(x,-1)-2.7],[x,bank(x,1)+2.7]]);
for(const p of load('assets/paris-sandbox/places.json'))pin(pa,'paris-'+p.id,p.name,p.target[0],p.target[2],p.area);
const cdg=area('cdg','戴高乐机场',[-45,-23,45,22]);
draw(cdg,'pavement',box(-10,-1,55,27),true);draw(cdg,'block',box(0,-19.6,89,4.5),true);
draw(cdg,'block',circle(-13,-1,8.75),true);draw(cdg,'green',circle(-13,-1,2.64),true);
draw(cdg,'block',box(24,6.05,12.2,6.7),true);
for(let k=0;k<6;k++){const a=(8+k*57)*Math.PI/180;draw(cdg,'block',circle(-13+12.25*Math.cos(a),-1+12.25*Math.sin(a),2.5),true)}
draw(cdg,'major',[[-10,8.7],[-4,12.8],[6,13.4],[15,9],[25,9]]);draw(cdg,'road',[[-44,16.6],[44,16.6]]);
for(const p of load('assets/paris-sandbox/airport.json'))pin(cdg,p.id,p.name,p.target[0],p.target[2],p.area);
const world=area('world','世界',[-180,-85,180,85]);
const {withAntarcticaCountry}=await server.ssrLoadModule('/src/frontend/atlas-globe.ts');
for(const f of withAntarcticaCountry(load('src/frontend/atlas-data.json').countries.features)){
 const g=f.geometry;if(!g)continue;
 for(const poly of g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[]){
  const ring=poly[0],ps=[];for(const [x,y] of ring){const last=ps.at(-1);if(!last||Math.hypot(x-last[0],-y-last[1])>1.5)ps.push([x,-y])}
  if(ps.length>=3)draw(world,'land',ps,true);
 }
}
for(const [id,x,y] of [['tokyo',139.7,-35.7],['beijing',116.4,-39.9],['california',-121,37*-1],['paris',2.35,-48.86]])pin(world,id,maps[id].name,x,y,'地区','region');
const {ATLAS_LANDMARKS}=await server.ssrLoadModule('/src/frontend/atlas-landmarks.ts');
for(const l of ATLAS_LANDMARKS)pin(world,'atlas-'+l.id,l.name,l.lon,-l.lat,'世界地标','sight');
const seen=new Map();for(const [region,m] of Object.entries(maps))for(const p of m.pins.filter(p=>p.kind==='place')){
 if(seen.has(p.id))throw Error('Duplicate destination '+p.id+' in '+region+'/'+seen.get(p.id));seen.set(p.id,region)
}
for(const id of names.keys())if(!seen.has(id))throw Error('Missing destination '+id);
// Source geometry for comparison with the hand-edited navigation sheets.
mkdirSync('dist/flat-maps', { recursive: true });
writeFileSync('dist/flat-maps/source-geometry.json',JSON.stringify(maps)+'\n');
console.info(Object.entries(maps).map(([id,m])=>id+': '+m.pins.length).join('; '));
} finally {await server.close()}
