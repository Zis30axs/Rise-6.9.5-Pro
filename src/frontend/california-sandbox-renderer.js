// Map-only adaptation of the user-provided California sandbox. Runtime state stays with the host.
const regions = {
  state: { center:[0,2], limit:[-204,200,-232,235], fit:[445,420], min:.88, max:3.4 },
  bay: { center:[-128,-25.25], limit:[-143,-113,-36,-15], fit:[21,19], min:.82, max:4 },
  silicon: { center:[-115.1,-7.0], limit:[-122,-105,-14,0], fit:[17,15], min:.78, max:3.9 },
  la: { center:[34.8,160.6], limit:[19,47,150,174], fit:[25,20], min:.8, max:4 },
};
const clamp = (value,lo,hi) => Math.max(lo,Math.min(hi,value));
function constrainCamera(view, f) {
  if (!(f.zoom>0)) return;
  const [xmin,xmax,zmin,zmax] = f.limits;
  const a = -view.x / f.zoom;
  const b = -view.y / (f.zoom*f.pitch);
  const visibleX = a*f.cos+b*f.sin;
  const visibleZ = -a*f.sin+b*f.cos;
  // Reserve some of the view for the selected region even at minimum zoom.
  const halfX = f.w / (2*f.zoom), halfZ = f.h / (2*f.zoom*f.pitch);
  const marginX = Math.min((xmax-xmin)*.45,(Math.abs(f.cos)*halfX+Math.abs(f.sin)*halfZ)*.42);
  const marginZ = Math.min((zmax-zmin)*.45,(Math.abs(f.sin)*halfX+Math.abs(f.cos)*halfZ)*.42);
  const x = clamp(visibleX,xmin-f.cx+marginX,xmax-f.cx-marginX);
  const z = clamp(visibleZ,zmin-f.cz+marginZ,zmax-f.cz-marginZ);
  view.x = -(x*f.cos-z*f.sin)*f.zoom;
  view.y = -(x*f.sin+z*f.cos)*f.zoom*f.pitch;
}

export function mountCaliforniaMap(root, data, glbDataUrl, options = {}) {
const map = root;
const doc = root.ownerDocument;
const win = doc.defaultView;
if (!win) throw new Error('California map requires a browser window');
let destroyed = false;
let glbBytes = null;
let glContext = null;
const modelAbort = new win.AbortController();
const cleanups = [];
const ownedNodes = [];
const listen = (node, type, handler, config) => {
  node.addEventListener(type, handler, config);
  cleanups.push(() => node.removeEventListener(type, handler, config));
};
function element(tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function own(node) { map.append(node); ownedNodes.push(node); return node; }
const hadMapClass = map.classList.contains('map');
map.classList.add('map', 'california-sandbox-map');
const terrainCanvas = own(element('canvas', 'terrain'));
terrainCanvas.dataset.role = 'terrain';
terrainCanvas.setAttribute('aria-label', '加州沙盘地形');
const overlay = own(element('canvas', 'routes'));
overlay.dataset.role = 'routes';
overlay.setAttribute('aria-label', '拖动平移地图，滚轮或双指缩放');
overlay.style.touchAction = 'none';
const ctx = overlay.getContext('2d');
if (!ctx) { ownedNodes.forEach(node => node.remove()); throw new Error('Canvas 2D is unavailable'); }
const pinsLayer = own(element('div', 'pins'));
const top = own(element('div', 'map-top'));
const switcher = element('div', 'map-switch');
switcher.setAttribute('aria-label', '地图范围');
const scopeNodes = new Map();
for (const [scope, label] of [['bay','湾区'],['silicon','硅谷'],['la','洛杉矶'],['close','地点近景'],['state','全州']]) {
  const button = element('button', '', label);
  button.type = 'button'; button.dataset.scope = scope;
  button.setAttribute('aria-pressed', String(scope === 'bay'));
  scopeNodes.set(scope, button); switcher.append(button);
}
const compass = element('div', 'north');
compass.setAttribute('aria-label', '指北针');
const north = element('i', '');
compass.append(element('span', '', 'N'), north);
top.append(switcher, compass);
const bottom = own(element('div', 'map-bottom'));
const legend = element('div', 'legend');
for (const [className, text] of [['','地点'],['here','当前位置'],['leg','选中路线']]) {
  const item = element('span', ''); item.append(element('i', className), doc.createTextNode(text)); legend.append(item);
}
const tools = element('div', 'map-tools');
tools.setAttribute('aria-label', '地图操作');
const toolNodes = new Map();
for (const [key, symbol, label] of [['rotate','↻','旋转地图'],['zoom-out','−','缩小'],['zoom-in','+','放大'],['reframe','⌖','复位视角']]) {
  const button = element('button', '', symbol); button.type = 'button';
  button.title = label; button.setAttribute('aria-label', label); button.dataset.action = key;
  tools.append(button); toolNodes.set(key, button);
}
bottom.append(legend, tools);
const byId = id => id === 'north' ? north : scopeNodes.get(id.replace('-view','')) ?? toolNodes.get(id);
let locationId = options.locationId;
let selected = options.selectedId ?? data.landmarks[0]?.id;
if (!data.landmarks.length) { ownedNodes.forEach(node => node.remove()); throw new Error('California map has no landmarks'); }
let selectedRoute = [];
function clearSight() {
  if (selectedSight) { selectedSight = null; options.onSightSelect?.(null); }
}
function choose(id) {
  if (!locations.has(id)) return;
  clearSight();
  const changed = selected !== id;
  selected = id;
  if (changed) setScope(locations.get(id).district === 'bay-area' ? 'bay' : 'state');
  requestDraw();
  options.onSelect?.(id);
}
function chooseSight(id) {
  if (destroyed || !sights.has(id)) return;
  selectedSight = sights.get(id); setScope('close');
  options.onSightSelect?.(id);
}
const locations = new Map(data.landmarks.map(place => [place.id, place]));
const bayPlaces = new Set(data.landmarks.filter(place => place.district === 'bay-area').map(place => place.id));
const core = new Set(['california-openai', 'california-anthropic']);
const labels = { 'sfo-airport':'旧金山国际机场', 'california-openai':'OpenAI', 'california-anthropic':'Anthropic', 'california-market':'二手交易市场', 'california-yosemite':'优胜美地', 'california-death-valley':'死亡谷' };
const start = 'sfo-airport';
const view = { scope:'bay', scale:1, angle:0, x:0, y:0 };
const localScope = () => view.scope !== 'state';
const sights = new Map(data.sights.map(sight => [sight.id,sight]));
let selectedSight = null;
const scopeButtons = {bay:'bay-view',silicon:'silicon-view',la:'la-view',state:'state-view',close:'close-view'};
const pins = data.landmarks.map(place => {
  const button = doc.createElement('button');
  const text = doc.createElement('span');
  button.className = `pin${core.has(place.id) ? ' core' : ''}${/国家公园/.test(place.name) ? ' park' : ''}`;
  button.dataset.location = place.id;
  button.setAttribute('aria-label', place.name);
  text.className = `pin-label${core.has(place.id) ? ' core' : ''}`;
  text.textContent = labels[place.id] ?? place.name;
  listen(button, 'click', () => choose(place.id));
  pinsLayer.append(button, text);
  return {place, button, text};
});
function mapPoint(lat, lon, y = 0) {
  return { x:(lon + 119.25) * (480 / 9.5) * .7984, z:(37.25 - lat) * (480 / 9.5), y };
}
const notes = [
  {scope:'state', pos:mapPoint(35.35,-123.55), title:'PACIFIC OCEAN', style:'ocean'},
  {scope:'state', pos:mapPoint(40.35,-117.9), title:'NEVADA', style:''},
  {scope:'state', pos:mapPoint(38.35,-120.1,41), title:'SIERRA NEVADA', style:''},
  {scope:'bay', pos:mapPoint(37.85,-122.65), title:'太平洋', style:'water'},
  {scope:'bay', pos:mapPoint(37.65,-122.22), title:'旧金山湾', style:'water'},
  {scope:'bay', pos:mapPoint(37.83,-122.19,1.6), title:'奥克兰', style:''},
  ...data.structures.filter(point => /金门|泛美|恶魔岛|湾区大桥/.test(point.name)).map(point => ({scope:/金门|恶魔岛/.test(point.name)?'bay':'close', pos:point, title:point.name, style:'landmark'}))
].map(note => {
  const node = doc.createElement('span');
  node.className = `map-note ${note.style}`;
  node.textContent = note.title;
  pinsLayer.append(node);
  return {...note,node};
});
const stateBorder = [[42,-124.2],[42,-120],[39,-120],[35.0,-114.63],[34.87,-114.63],[34.3,-114.14],[33.42,-114.63],[32.72,-114.72],[32.53,-117.06]].map(point => mapPoint(...point, 4));

function readGlb() {
  const bin = glbBytes;
  if (!bin || bin.byteLength < 28) throw new Error('Invalid GLB data');
  const header = new DataView(bin.buffer);
  if (header.getUint32(0,true)!==0x46546c67 || header.getUint32(4,true)!==2) throw new Error('Invalid GLB header');
  const length = header.getUint32(12,true);
  const gltf = JSON.parse(new TextDecoder().decode(bin.subarray(20,20 + length)));
  const binaryOffset = 28 + length;
  function accessor(index) {
    const ref = gltf.accessors[index];
    const part = gltf.bufferViews[ref.bufferView];
    return { bytes:bin.subarray(binaryOffset + part.byteOffset, binaryOffset + part.byteOffset + part.byteLength), ref };
  }
  return {gltf, accessor};
}
function createTerrain(canvas) {
  if (!glbBytes) return null;
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true});
  if (!gl) return null;
  glContext = gl;
  const buffers = [], shaderObjects = [];
  let program = null;
  const release = () => {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const shader of shaderObjects) gl.deleteShader(shader);
    if (program) gl.deleteProgram(program);
    buffers.length = 0; shaderObjects.length = 0; program = null;
  };
  try {
    const {gltf, accessor} = readGlb();
    program = gl.createProgram();
    const shaders = [
      [gl.VERTEX_SHADER, `attribute vec3 position, normal, color;
        uniform vec2 center, offset, angle, pixels;
        uniform float scale, pitch, height, baseY;
        varying mediump vec3 vPos, vNormal, vColor;
        void main(){
          vec2 p=position.xz-center;
          float x=p.x*angle.x-p.y*angle.y;
          float z=p.x*angle.y+p.y*angle.x;
          vec2 at=vec2(x,z*pitch-(position.y-baseY)*height)*scale+offset;
          gl_Position=vec4(at.x*2.0/pixels.x,-at.y*2.0/pixels.y,(-z*height-position.y*pitch)/720.0,1.0);
          vPos=position;vNormal=normal;vColor=color;
        }`],
      [gl.FRAGMENT_SHADER, `precision mediump float;
        varying mediump vec3 vPos, vNormal, vColor;
        uniform vec3 tint;
        uniform float kind, bay;
        void main(){
          vec3 c=vColor*tint;
          vec3 n=normalize(vNormal);
          float light=.71+.48*max(0.0,dot(n,normalize(vec3(-.62,.68,-.48))));
          if(kind<.5 && vPos.y<-.18){
            float wave=sin(vPos.z*15.0+sin(vPos.x*4.8)*.8)*.5+.5;
            c*=.96+wave*(.085+.055*bay);
            light=1.0;
          }
          vec3 rgb=pow(max(vec3(0.0),c*light),vec3(.4545));
          gl_FragColor=vec4(rgb,1.0);
        }`]
    ];
    for (const [type, source] of shaders) {
      const shader = gl.createShader(type);
      shaderObjects.push(shader);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = Object.fromEntries('center offset angle pixels scale pitch height baseY tint kind bay'.split(' ').map(name => [name,gl.getUniformLocation(program,name)]));
    const attributes = Object.fromEntries('position normal color'.split(' ').map(name => [name,gl.getAttribLocation(program,name)]));
    function upload(index, target) {
      const {bytes,ref} = accessor(index);
      const buffer = gl.createBuffer();
      buffers.push(buffer);
      gl.bindBuffer(target,buffer);
      gl.bufferData(target,bytes,gl.STATIC_DRAW);
      return {buffer,...ref};
    }
    const objects = gltf.meshes.flatMap(mesh => mesh.primitives.map(item => {
      const attrs = item.attributes;
      return {
        position:upload(attrs.POSITION,gl.ARRAY_BUFFER), normal:upload(attrs.NORMAL,gl.ARRAY_BUFFER),
        color:attrs.COLOR_0 === undefined ? null : upload(attrs.COLOR_0,gl.ARRAY_BUFFER),
        index:upload(item.indices,gl.ELEMENT_ARRAY_BUFFER),
        tint:gltf.materials[item.material].pbrMetallicRoughness.baseColorFactor.slice(0,3),
        kind:item.material
      };
    }));
    gl.enable(gl.DEPTH_TEST);
    const render = frame => {
      if (gl.isContextLost()) return false;
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.center,frame.cx,frame.cz);
      gl.uniform2f(uniforms.offset,view.x,view.y);
      gl.uniform2f(uniforms.angle,frame.cos,frame.sin);
      gl.uniform2f(uniforms.pixels,frame.w,frame.h);
      gl.uniform1f(uniforms.scale,frame.zoom);
      gl.uniform1f(uniforms.pitch,frame.pitch);
      gl.uniform1f(uniforms.height,frame.lift);
      gl.uniform1f(uniforms.baseY,frame.baseY);
      gl.uniform1f(uniforms.bay,localScope() ? 1 : 0);
      for (const mesh of objects) {
        for (const [key, loc] of Object.entries(attributes)) {
          const attr = mesh[key];
          if (!attr) {
            gl.disableVertexAttribArray(loc);
            gl.vertexAttrib3f(loc,1,1,1);
            continue;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER,attr.buffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc,attr.type === 'VEC4' ? 4 : 3,attr.componentType,key === 'color',0,0);
        }
        gl.uniform3fv(uniforms.tint,mesh.tint);
        gl.uniform1f(uniforms.kind,mesh.kind);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index.buffer);
        gl.drawElements(gl.TRIANGLES,mesh.index.count,mesh.index.componentType,0);
      }
      return true;
    };
    render.destroy = release;
    return render;
  } catch (error) {
    release();
    console.warn('California terrain fallback',error);
    return null;
  }
}
let drawTerrain = createTerrain(terrainCanvas);
listen(terrainCanvas, 'webglcontextlost', event => {event.preventDefault(); drawTerrain?.destroy(); drawTerrain = null; requestDraw();});
listen(terrainCanvas, 'webglcontextrestored', () => {drawTerrain?.destroy(); drawTerrain = createTerrain(terrainCanvas); requestDraw();});
function frame() {
  const {width:w,height:h}=map.getBoundingClientRect();
  const close=view.scope==='close';
  const point=selectedSight ?? locations.get(selected) ?? locations.get(locationId) ?? data.landmarks[0];
  const area=regions[view.scope];
  const [cx,cz]=close?[point.x,point.z]:area.center;
  const limits=close?[cx-3.4,cx+3.4,cz-3.4,cz+3.4]:area.limit;
  const fit=close?[6.3,5.5]:area.fit;
  const pitch=.79;
  const zoom=view.scale*Math.min(Math.max(1,w-(localScope()?8:30))/fit[0],Math.max(1,h-(localScope()?12:76))/fit[1]);
  return {w,h,cx,cz,limits,zoom,baseY:close?point.y:0,cos:Math.cos(view.angle),sin:Math.sin(view.angle),pitch,lift:close?.93:view.scope==='state'?.65:.64};
}
function project(point, f) {
  const x = point.x - f.cx, z = point.z - f.cz;
  return {x:f.w/2 + view.x + (x*f.cos-z*f.sin)*f.zoom,
    y:f.h/2 + view.y + ((x*f.sin+z*f.cos)*f.pitch-((point.y ?? 0)-f.baseY)*f.lift)*f.zoom};
}
function trace(points, f) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const p = project(point,f);
    if (i) ctx.lineTo(p.x,p.y);
    else ctx.moveTo(p.x,p.y);
  });
}
function drawFallback(f) {
  const gradient=ctx.createLinearGradient(0,0,f.w,f.h);
  gradient.addColorStop(0,'#596f56');gradient.addColorStop(1,'#9f9062');
  ctx.fillStyle=gradient;ctx.strokeStyle='#a4a77c';ctx.lineWidth=1;
  const focus=selectedSight ?? locations.get(selected) ?? locations.get(locationId) ?? data.landmarks[0];
  const bay=view.scope==='bay'||view.scope==='silicon'||(view.scope==='close'&&focus.x<-95&&focus.x>-150&&focus.z>-65&&focus.z<25);
  const contours=bay?data.shore.slice(1):data.shore.slice(0,1);
  for(const outline of contours){
    trace(outline.map(([x,z])=>({x,z,y:f.baseY})),f);
    ctx.closePath();ctx.fill();ctx.stroke();
  }

}
function drawRoutes(f, trip) {
  ctx.lineJoin='round';ctx.lineCap='round';
  if (view.scope === 'state') {
    trace(stateBorder,f);
    ctx.setLineDash([3,5]);ctx.strokeStyle='#e1d7ae67';ctx.lineWidth=1;ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const route of data.routes) {
    if (localScope() && (view.scope!=='bay'||!bayPlaces.has(route.from)||!bayPlaces.has(route.to))) continue;
    trace(route.points,f);
    ctx.strokeStyle=view.scope === 'bay' ? '#e7e4c16c' : '#d6dcac75';ctx.lineWidth=1.25;ctx.stroke();
  }
  trip.forEach((route,i) => {
    trace(route.points,f);
    ctx.setLineDash(i ? [5,5] : []);
    ctx.strokeStyle='#182822cc';ctx.lineWidth=i ? 4 : 6;ctx.stroke();
    ctx.strokeStyle=i ? '#e9c081bb' : '#ffd18a';ctx.lineWidth=i ? 2 : 3;ctx.stroke();
  });
  ctx.setLineDash([]);
}
const bayCallouts = {
  'california-anthropic':[-1,-1], 'california-openai':[1,-1], 'california-market':[-1,1], 'sfo-airport':[1,1]
};
function drawPins(f) {
  const bay = view.scope==='bay'||(view.scope==='close'&&!selectedSight&&locations.get(selected)?.district==='bay-area');
  const rectangles = [];
  const byPriority = [...pins].sort((a,b) => priority(b.place.id)-priority(a.place.id));
  function priority(id) {return id === selected ? 4 : id === locationId ? 3 : core.has(id) ? 2 : 1;}
  for (const {place,button,text} of byPriority) {
    const p = project({...place,y:place.y+(bay?.18:1.25)},f);
    const grouped = place.district === 'bay-area' && place.id !== start;
    const eligible = view.scope==='state'?!grouped:bay?place.district==='bay-area':!selectedSight&&(view.scope==='close'?place.id===selected: view.scope==='la'&&place.id==='california-los-angeles');
    const visible = p.x >= 11 && p.x <= f.w-11 && p.y >= 50 && p.y <= f.h-48
      && eligible;
    button.hidden = !visible;
    text.hidden = !visible;
    if (!visible) {
      button.classList.remove('current', 'selected');
      button.setAttribute('aria-pressed', 'false');
      text.classList.remove('emphasis');
      continue;
    }
    const current = place.id === locationId || (!bay && place.id === start && locations.get(locationId)?.district === 'bay-area');
    const picked = place.id === selected || (!bay && place.id === start && locations.get(selected)?.district === 'bay-area');
    button.classList.toggle('current',current);
    button.classList.toggle('selected',picked);
    button.setAttribute('aria-pressed',String(picked));
    text.classList.toggle('emphasis',picked);
    text.classList.toggle('bay-lead',bay);
    text.textContent = !bay && place.id === start ? '旧金山湾区' : labels[place.id] ?? place.name;
    const width = text.offsetWidth, height = text.offsetHeight;
    let x,y,px=p.x,py=p.y;
    if (bay) {
      const [dx,dy] = bayCallouts[place.id] ?? [1,-1];
      const distance = f.w < 500 ? 26 : 55;
      const offsetY = place.id === start ? 46 : 35;
      x = p.x + dx*distance - (dx < 0 ? width : 0);
      y = p.y + dy*offsetY - (dy < 0 ? height : 0);
      x = Math.max(8,Math.min(f.w-width-8,x));y=Math.max(57,Math.min(f.h-height-57,y));
      const end = dx < 0 ? x+width : x;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(end+dx*-10,y+height/2);ctx.lineTo(end,y+height/2);
      ctx.strokeStyle=picked ? '#ffe0a2' : '#d3e1c49e';ctx.lineWidth=picked ? 1.4 : 1;ctx.stroke();
      px=x+width/2;py=y+height/2;
    } else {
      x=p.x+10;y=p.y-height/2;
      if(x+width>f.w-6) x=p.x-width-10;
      if (rectangles.some(box=>x<box.x+box.w+4&&x+width>box.x-4&&y<box.y+box.h+4&&y+height>box.y-4)) text.hidden = true;
      if (!text.hidden) rectangles.push({x,y,w:width,h:height});
    }
    if (bay) {
      ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle=picked?'#ffe0a2':'#d3e1c4';ctx.fill();
    }
    button.classList.toggle('callout',bay);
    button.style.width=bay ? `${width}px` : '';
    button.style.height=bay ? `${Math.max(height,28)}px` : '';
    button.style.left=`${px}px`;button.style.top=`${py}px`;
    text.style.left=`${x}px`;text.style.top=`${y}px`;
  }
  drawSights(f,rectangles);
  for (const note of notes) {
    const p = project(note.pos,f);
    const skipLandmark = note.style === 'landmark' && f.w < 500;
    note.node.hidden=note.scope!==view.scope||skipLandmark||p.x<25||p.x>f.w-70||p.y<65||p.y>f.h-65;
    note.node.style.left=`${p.x}px`;note.node.style.top=`${p.y}px`;
  }
}
const sightPins = [...sights.values()].map(sight=>{
  const button=doc.createElement('button');
  button.className='sight-pin';
  button.dataset.sight=sight.id;
  button.textContent=sight.name.split(' · ')[0];
  button.setAttribute('aria-label',sight.name);
  listen(button, 'click',()=>chooseSight(sight.id));
  pinsLayer.append(button);
  return {sight,button};
});
function drawSights(f,rectangles) {
  for(const {sight,button} of sightPins) {
    const point=project({...sight,y:sight.pinY},f);
    const active=selectedSight?.id===sight.id;
    const visible=view.scope==='close'?active:view.scope==='state'?sight.region==='state':view.scope===sight.region;
    button.hidden=!visible||point.x<9||point.x>f.w-9||point.y<55||point.y>f.h-57;
    button.setAttribute('aria-pressed',String(active));
    if(button.hidden) continue;
    const w=button.offsetWidth,h=button.offsetHeight;
    const x=clamp(point.x+7,5,Math.max(5,f.w-w-5));
    const desired=point.y+8;
    const candidates=[desired,desired-h-17,desired+h+3,desired-2*h-20];
    const y=candidates.find(v=>v>49&&v+h<f.h-48&&!rectangles.some(r=>x<r.x+r.w+4&&x+w>r.x-4&&v<r.y+r.h+4&&v+h>r.y-4));
    if(y===undefined){button.hidden=true;continue;}
    rectangles.push({x,y,w,h});
    button.style.left=`${x}px`;
    button.style.top=`${y}px`;
    ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(x,y+h/2);ctx.strokeStyle='#d4c99dc4';ctx.lineWidth=1;ctx.stroke();
  }
}
let pendingFrame = 0;
function requestDraw() {
  if (!destroyed && !pendingFrame) pendingFrame = win.requestAnimationFrame(draw);
}
function draw() {
  pendingFrame=0;
  if (destroyed) return;
  const f=frame();
  constrainCamera(view,f);
  if(f.w<1||f.h<1) return;
  const ratio=Math.min(win.devicePixelRatio || 1,1.75);
  for(const canvas of [terrainCanvas,overlay]){
    const w=Math.round(f.w*ratio),h=Math.round(f.h*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,f.w,f.h);
  const rendered = drawTerrain?.(f);
  terrainCanvas.style.visibility=rendered?'visible':'hidden';
  map.dataset.renderer=rendered?'webgl':'canvas';
  if(!rendered) drawFallback(f);
  drawRoutes(f,selectedRoute);drawPins(f);
  byId('north').style.transform=`rotate(${view.angle}rad)`;
}
function setScope(scope) {
  if (destroyed || (scope !== 'close' && !regions[scope])) return;
  if (scope !== 'close') clearSight();
  view.scope=scope;
  Object.assign(view,{scale:1,angle:0,x:0,y:0});
  for(const [key,id] of Object.entries(scopeButtons)) byId(id).setAttribute('aria-pressed',scope===key);
  requestDraw();
}
function zoomBy(factor, anchor) {
  if (destroyed || !Number.isFinite(factor) || factor <= 0) return;
  const before=view.scale;
  const area=regions[view.scope] ?? {min:.72,max:3.6};
  view.scale=clamp(before*factor,area.min,area.max);
  if(anchor){
    const f=frame(),delta=view.scale/before;
    view.x=anchor.x-f.w/2-(anchor.x-f.w/2-view.x)*delta;
    view.y=anchor.y-f.h/2-(anchor.y-f.h/2-view.y)*delta;
  }
  constrainCamera(view,frame());
  requestDraw();
}
for(const [scope,id] of Object.entries(scopeButtons)) listen(byId(id), 'click',()=>setScope(scope));
listen(byId('reframe'), 'click',()=>setScope(view.scope));
function rotate() { if (destroyed) return; view.angle=(view.angle+Math.PI/8)%(2*Math.PI);constrainCamera(view,frame());requestDraw(); }
listen(byId('rotate'), 'click',rotate);
listen(byId('zoom-in'), 'click',()=>zoomBy(1.25));
listen(byId('zoom-out'), 'click',()=>zoomBy(.8));
listen(overlay, 'wheel',event=>{
  if(!event.ctrlKey && !event.metaKey && Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
  event.preventDefault();
  zoomBy(Math.exp(-event.deltaY*.0014),{x:event.offsetX,y:event.offsetY});
},{passive:false});
const touches=new Map();
function gesture(){
  const points=[...touches.values()];
  const [a,b]=points;
  if (!b) return {x:a.x,y:a.y,dist:0};
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,dist:Math.hypot(a.x-b.x,a.y-b.y)};
}
listen(overlay, 'pointerdown',event=>{
  if(event.button!==0) return;
  touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  overlay.setPointerCapture(event.pointerId);
  overlay.classList.add('dragging');
});
listen(overlay, 'pointermove',event=>{
  if(!touches.has(event.pointerId)) return;
  const before=gesture();
  touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const after=gesture();
  view.x+=after.x-before.x;view.y+=after.y-before.y;
  if(before.dist>0&&after.dist>0){
    const rect=overlay.getBoundingClientRect();
    zoomBy(after.dist/before.dist,{x:after.x-rect.left,y:after.y-rect.top});
  }
  constrainCamera(view,frame());
  requestDraw();
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) {
  listen(overlay, event, e=>{touches.delete(e.pointerId);if(!touches.size)overlay.classList.remove('dragging');});
}
const observer = new win.ResizeObserver(requestDraw);
observer.observe(map);
function update(next = {}) {
  if (destroyed) return;
  if ('locationId' in next) locationId = next.locationId;
  if (typeof next.selectedId === 'string') {
    const changed = selected !== next.selectedId || selectedSight !== null;
    selected = next.selectedId;
    clearSight();
    if (changed) setScope(locations.get(selected)?.district === 'bay-area' ? 'bay' : 'state');
  }
  if ('route' in next) selectedRoute = (next.route ?? []).flatMap(leg => {
    if (Array.isArray(leg.points)) return [leg];
    const forward = data.routes.find(route => route.from === leg.from && route.to === leg.to);
    if (forward) return [forward];
    const reverse = data.routes.find(route => route.to === leg.from && route.from === leg.to);
    return reverse ? [{...reverse, from:leg.from, to:leg.to, points:[...reverse.points].reverse()}] : [];
  });
  requestDraw();
}
function destroy() {
  if (destroyed) return;
  destroyed = true;
  modelAbort.abort();
  if (pendingFrame) win.cancelAnimationFrame(pendingFrame);
  pendingFrame = 0; observer.disconnect();
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const pointerId of touches.keys()) {
    if (overlay.hasPointerCapture(pointerId)) overlay.releasePointerCapture(pointerId);
  }
  touches.clear();
  drawTerrain?.destroy(); drawTerrain = null;
  glContext?.getExtension('WEBGL_lose_context')?.loseContext();
  glContext = null; glbBytes = null;
  for (const node of ownedNodes) node.remove();
  if (!hadMapClass) map.classList.remove('map');
  map.classList.remove('california-sandbox-map');
  delete map.dataset.renderer;
}
async function loadModel() {
  try {
    let bytes;
    if (glbDataUrl.startsWith('data:') && glbDataUrl.slice(0, glbDataUrl.indexOf(',')).endsWith(';base64')) {
      const raw = win.atob(glbDataUrl.slice(glbDataUrl.indexOf(',') + 1));
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else if (glbDataUrl.startsWith('blob:')) {
      const response = await win.fetch(glbDataUrl, {signal:modelAbort.signal});
      if (!response.ok) throw new Error('California model could not be loaded');
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      throw new Error('California model must be an embedded data or Blob URL');
    }
    if (destroyed) return;
    glbBytes = bytes;
    drawTerrain = createTerrain(terrainCanvas);
    requestDraw();
  } catch (error) {
    if (!destroyed) console.warn('California terrain fallback', error);
  }
}
setScope(locations.get(selected)?.district === 'bay-area' ? 'bay' : 'state');
void loadModel();
return {update, setScope, zoomBy, rotate, selectSight:chooseSight, reset:() => setScope(view.scope), destroy};
}

