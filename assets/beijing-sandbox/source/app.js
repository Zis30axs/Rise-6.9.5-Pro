const by = id => document.getElementById(id);
const atlas = JSON.parse(by('atlas').textContent);
const places = new Map(atlas.places.map(place => [place.id, place]));
const { minX, maxX, minZ, maxZ } = atlas.bounds;
const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
const initial = { ...center, yaw: -.31, tilt: .93, zoom: 1 };
const camera = { ...initial };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const map = by('map');
const canvas = by('gl');
const overlay = by('overlay');
const ink = overlay.getContext('2d');
const pointerState = new Map();
let gl, program, mesh, lost = false, frame = 0, width = 1, height = 1, ratio = 1;
let selected = atlas.startId, current = atlas.startId, category = -1, activeTour = -1;
let focusedArea = -1;
let movement = null;
let cameraMove = null;
let query = '';
let displayedRoute = null;
let fallback = false;
let night = false;
let shadowDirty = true;
const SHADOW_SIZE = 2048;

function sunView(isNight) {
  const yaw = isNight ? -2.31 : -2.24;
  const tilt = isNight ? .55 : .84;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const e = Math.sin(tilt), t = Math.cos(tilt);
  const right = [c, 0, -s], up = [-s * e, t, -c * e], front = [s * t, e, c * t];
  const X = 1 / 149, Y = 1 / 132, D = 1 / 175;
  const tx = -center.x, tz = -center.z;
  return { direction: front, matrix: new Float32Array([
    right[0]*X, up[0]*Y, -front[0]*D, 0,
    0, up[1]*Y, -front[1]*D, 0,
    right[2]*X, up[2]*Y, -front[2]*D, 0,
    (right[0]*tx+right[2]*tz)*X, (up[0]*tx+up[2]*tz)*Y, -(front[0]*tx+front[2]*tz)*D, 1,
  ]) };
}
let sun = sunView(night);

const shadowVertex = `#version 300 es
  layout(location=0) in vec3 p;
  uniform mat4 lightView;
  void main(){ gl_Position=lightView*vec4(p,1.0); }`;
const shadowFragment = `#version 300 es
  precision highp float;
  void main(){}`;

async function readEmbeddedModel() {
  const source = atob(by('model').textContent.trim());
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i);
  const glb = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(glb).arrayBuffer();
}

function renderer(array) {
  gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL 2 unavailable');
  const shader = (type, code) => {
    const result = gl.createShader(type);
    gl.shaderSource(result, code);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  };
  const link = (vertex, fragment) => {
    const result = gl.createProgram();
    for (const item of [vertex, fragment]) gl.attachShader(result, item);
    gl.linkProgram(result);
    for (const item of [vertex, fragment]) gl.deleteShader(item);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
  };
  const vs = shader(gl.VERTEX_SHADER, `#version 300 es
    layout(location=0) in vec3 p;
    layout(location=1) in vec3 n;
    layout(location=2) in vec4 c;
    layout(location=3) in float lamp;
    uniform mat4 projection;
    uniform mat4 lightView;
    out vec3 normal;
    out vec3 color;
    out vec3 shadowPoint;
    out float altitude;
    out float glow;
    void main(){
      gl_Position=projection*vec4(p,1.0);
      shadowPoint=(lightView*vec4(p,1.0)).xyz*.5+.5;
      normal=n;
      color=c.rgb;
      altitude=p.y;
      glow=lamp;
    }`);
  const fs = shader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec3 normal;
    in vec3 color;
    in vec3 shadowPoint;
    in float altitude;
    in float glow;
    uniform vec3 lightDir;
    uniform bool night;
    uniform bool shadows;
    uniform highp sampler2D shadowDepth;
    out vec4 outColor;
    float incidentLight(float facing) {
      if(!shadows || any(lessThan(shadowPoint, vec3(0.))) || any(greaterThan(shadowPoint, vec3(1.)))) return 1.;
      float current=shadowPoint.z-(.00068+(1.-facing)*.00079);
      vec2 stride=1./vec2(textureSize(shadowDepth,0));
      float visible=0.;
      for(int i=-1;i<=1;++i) for(int j=-1;j<=1;++j){
        float closest=texture(shadowDepth,shadowPoint.xy+vec2(float(i),float(j))*stride).r;
        visible+=step(current,closest);
      }
      return .20+.80*visible/9.;
    }
    void main(){
      vec3 N=normalize(normal);
      if(abs(N.y)>.15 && N.y<0. && !gl_FrontFacing) N=-N;
      float facing=max(dot(N,lightDir),0.);
      float direct=facing*incidentLight(facing);
      float bounce=max(dot(N,normalize(vec3(.8,.45,.6))),0.);
      vec3 dayTint=vec3(.56,.61,.62)+direct*vec3(.64,.56,.42)+bounce*.08;
      vec3 nightTint=vec3(.115,.154,.224)+direct*vec3(.44,.27,.22)+bounce*vec3(.015,.031,.065);
      vec3 lit=color*(night?nightTint:dayTint);
      if(night) lit+=glow*color*(.54+.53*sqrt(max(color,vec3(0.))));
      vec3 srgb=1.055*pow(max(lit,vec3(.00001)),vec3(.4166667))-.055;
      float edge=smoothstep(-6.8,.8,altitude);
      outColor=vec4(srgb*mix(.88,1.,edge),1);
    }`);
  program = link(vs, fs);
  const header = new DataView(array);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2) throw new Error('Invalid GLB');
  const jsonLength = header.getUint32(12, true);
  const offset = 28 + jsonLength;
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(array, 20, jsonLength)));
  const primitive = doc.meshes[0].primitives[0];
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const source = (target, accessor) => {
    const view = doc.bufferViews[accessor.bufferView];
    gl.bindBuffer(target, gl.createBuffer());
    gl.bufferData(target, new Uint8Array(array, offset + view.byteOffset, view.byteLength), gl.STATIC_DRAW);
  };
  ['POSITION', 'NORMAL', 'COLOR_0', '_GLOW'].forEach((key, i) => {
    const accessor = doc.accessors[primitive.attributes[key]];
    source(gl.ARRAY_BUFFER, accessor);
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, [3, 3, 4, 1][i], accessor.componentType, Boolean(accessor.normalized), 0, 0);
  });
  const index = doc.accessors[primitive.indices];
  source(gl.ELEMENT_ARRAY_BUFFER, index);
  const uniforms = Object.fromEntries(['projection','lightView','lightDir','night','shadows','shadowDepth']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  const shadowProgram = link(shader(gl.VERTEX_SHADER, shadowVertex), shader(gl.FRAGMENT_SHADER, shadowFragment));
  const depth = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, depth);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  mesh = {
    vao, count: index.count, indexType: index.componentType, uniforms, shadowProgram, depth,
    lightMatrix: gl.getUniformLocation(shadowProgram, 'lightView'), shadowBuffer: complete ? shadowBuffer : null,
  };
  shadowDirty = true;
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
}

function drawShadows() {
  if (!shadowDirty || !mesh.shadowBuffer) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, mesh.shadowBuffer);
  gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(mesh.shadowProgram);
  gl.uniformMatrix4fv(mesh.lightMatrix, false, sun.matrix);
  gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  shadowDirty = false;
}

function basis() {
  const c = Math.cos(camera.yaw), s = Math.sin(camera.yaw);
  const e = Math.sin(camera.tilt), t = Math.cos(camera.tilt);
  return { right: [c, 0, -s], up: [-s * e, t, -c * e], front: [s * t, e, c * t] };
}
function fittedScale(right, up) {
  const mapWidth = maxX - minX, mapDepth = maxZ - minZ;
  const extentX = Math.abs(right[0]) * mapWidth + Math.abs(right[2]) * mapDepth;
  const extentY = Math.abs(up[0]) * mapWidth + Math.abs(up[2]) * mapDepth;
  return Math.min(width / (extentX + 16), height / (extentY + 34));
}
function projection() {
  const { right, up, front } = basis();
  const ppu = fittedScale(right, up) * camera.zoom;
  const dot = (v, x, y, z) => v[0] * x + v[1] * y + v[2] * z;
  const anchorX = dot(right, camera.x, 0, camera.z);
  const anchorY = dot(up, camera.x, 0, camera.z);
  const anchorD = dot(front, camera.x, 0, camera.z);
  const X = 2 * ppu / width, Y = 2 * ppu / height, D = 1 / 380;
  const matrix = new Float32Array([
    right[0] * X, up[0] * Y, -front[0] * D, 0,
    right[1] * X, up[1] * Y, -front[1] * D, 0,
    right[2] * X, up[2] * Y, -front[2] * D, 0,
    -anchorX * X, -anchorY * Y + .026, anchorD * D, 1,
  ]);
  const point = (x, y, z) => [
    width / 2 + (dot(right, x, y, z) - anchorX) * ppu,
    height * .487 - (dot(up, x, y, z) - anchorY) * ppu,
  ];
  return { matrix, ppu, point };
}

function addButton(parent, text, click, cls) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = text;
  if (cls) item.className = cls;
  item.addEventListener('click', click);
  parent.append(item);
  return item;
}

const filters = ['全部', ...atlas.categories.map(item => item.name)].map((item, index) =>
  addButton(by('filters'), item, () => {
    category = index - 1;
    focusedArea = -1;
    update();
  }));

const pins = new Map(atlas.places.map(place => {
  const pin = addButton(by('labels'), place.name, () => select(place.id), 'pin');
  pin.dataset.place = place.id;
  pin.style.setProperty('--point', atlas.categories[place.category].color);
  return [place.id, pin];
}));

const areaButtons = atlas.focusAreas.map((area, index) => addButton(by('areas'), area.name, () => {
  if (movement) return;
  focusedArea = index;
  selected = area.places[0];
  activeTour = -1;
  category = -1;
  query = '';
  by('search').value = '';
  if (area.view) {
    viewNeighborhood(area.view);
    update();
    return;
  }
  const members = area.places.map(id => places.get(id));
  const isSkyline = area.places[0] === 'beijing-cctv-headquarters';
  const yaw = isSkyline ? -.55 : -.32;
  const tilt = isSkyline ? .68 : .79;
  const c = Math.cos(yaw), s = Math.sin(yaw), e = Math.sin(tilt), t = Math.cos(tilt);
  const avg = axis => (Math.min(...members.map(place => place[axis])) + Math.max(...members.map(place => place[axis]))) / 2;
  const screenX = members.map(place => c * place.x - s * place.z);
  const screenY = members.map(place => -s * e * place.x + t * place.y - c * e * place.z);
  const span = values => Math.max(...values) - Math.min(...values);
  const fittedView = fittedScale([c, 0, -s], [-s*e, t, -c*e]);
  const ppu = Math.min((width - 112) / (span(screenX) + 11), (height - 156) / (span(screenY) + 13));
  cancelCamera({
    x: avg('x'), z: avg('z') - 2.3, yaw, tilt,
    zoom: Math.max(1.4, Math.min(width < 525 ? 5.5 : 5.1, ppu / fittedView)),
  });
  update();
}));

const tourButtons = atlas.tours.map((tour, index) => addButton(by('tours'), tour.name, () => {
  if (movement) return;
  focusedArea = -1;
  if (activeTour === index) {
    activeTour = -1;
  } else {
    activeTour = index;
    selected = tour.stops[0];
    category = -1;
    cancelCamera(initial);
  }
  update();
}));

for (const source of atlas.sources) {
  const a = document.createElement('a');
  a.textContent = source.name;
  a.href = source.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  by('sources').append(a);
}

function match(place) {
  return (category < 0 || place.category === category) &&
    (!query || [place.name, place.subtitle, place.description, ...(place.aliases ?? [])]
      .some(text => text.toLowerCase().includes(query)));
}

const overviewPinIds = [
  'water-cube','bird-nest','cctv-headquarters','china-zun','central-tv-tower','olympic-tower',
  'forbidden-city','summer-palace','temple-of-heaven','shichahai','tiananmen',
  'peking-university','tsinghua-university','ice-ribbon','798-art-zone','liangma-river','beijing-west',
].map(key => 'beijing-' + key);
function positionPins(p) {
  const used = [];
  const small = width < 525;
  const focus = camera.zoom > 1.55 || category >= 0 || Boolean(query);
  const area = atlas.focusAreas[focusedArea];
  const idOrder = [...new Set([
    selected, ...(area?.places ?? []), ...overviewPinIds,
    ...(focus || !small ? atlas.places.map(place => place.id) : []),
  ])];
  const safeTop = small ? 83 : 56;
  for (const id of idOrder) {
    const place = places.get(id);
    const pin = pins.get(id);
    if (id !== selected && !match(place)) continue;
    const [x, y] = p.point(place.x, place.y, place.z);
    if (x < -3 || x > width + 3 || y < 13 || y > height - 32) continue;
    pin.hidden = false;
    const w = pin.offsetWidth + 5, h = pin.offsetHeight + 5;
    let visible = false;
    const skew = w * .57 + 4;
    const away = x > width / 2 ? -1 : 1;
    const offsetChoices = [
      [0,-3],[away*skew,-9],[-away*skew,-9],[0,h+9],[0,-h-11],
      [away*skew,h+5],[-away*skew,h+5],[away*(skew+15),-h-10],[-away*(skew+15),-h-10],
      [0,2*h+9],
    ];
    for (const [dx, dy] of offsetChoices) {
      const px = x + dx, py = y + dy;
      const left = px - w / 2, top = py - h;
      if (left < 5 || left + w > width - 5 || top < safeTop || top + h > height - 48) continue;
      if (top < 68 && (left < (small ? 92 : 183) || left + w > width - 64)) continue;
      if (used.some(box => left < box[0] + box[2] && left + w > box[0] && top < box[1] + box[3] && top + h > box[1])) continue;
      pin.style.left = px + 'px';
      pin.style.top = py + 'px';
      used.push([left, top, w, h, id]);
      if (dx || dy || id === selected) {
        ink.beginPath();
        ink.moveTo(x, y);
        ink.lineTo(px, dy > 0 ? py - h + 5 : py - 1);
        ink.strokeStyle = id === selected ? '#85442fbd' : '#63584985';
        ink.lineWidth = 1;
        ink.stroke();
      }
      ink.beginPath();
      ink.arc(x, y, id === selected ? 3 : 1.75, 0, Math.PI * 2);
      ink.fillStyle = id === selected ? '#8e412e' : atlas.categories[place.category].color;
      ink.fill();
      visible = true;
      break;
    }
    if (!visible) pin.hidden = true;
  }
  const ids = new Set(used.map(box => box[4]));
  for (const [id, pin] of pins) if (!ids.has(id)) pin.hidden = true;
}

function setMapNotice(text) {
  by('loading').textContent = text;
  by('loading').hidden = !text;
}

function draw(time) {
  frame = 0;
  if (fallback || lost) return;
  if (cameraMove) {
    const { from, to, start } = cameraMove;
    const t = Math.min(1, Math.max(0, (time - start) / 445));
    const ease = 1 - (1 - t) ** 3;
    for (const key of Object.keys(camera)) camera[key] = from[key] + (to[key] - from[key]) * ease;
    if (t >= 1) cameraMove = null;
  }
  const p = projection();
  gl.bindVertexArray(mesh.vao);
  drawShadows();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  const u = mesh.uniforms;
  gl.uniformMatrix4fv(u.projection, false, p.matrix);
  gl.uniformMatrix4fv(u.lightView, false, sun.matrix);
  gl.uniform3fv(u.lightDir, sun.direction);
  gl.uniform1i(u.night, night ? 1 : 0);
  gl.uniform1i(u.shadows, mesh.shadowBuffer ? 1 : 0);
  gl.uniform1i(u.shadowDepth, 0);
  gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  ink.setTransform(ratio, 0, 0, ratio, 0, 0);
  ink.clearRect(0, 0, width, height);
  if (displayedRoute?.points.length > 1) {
    const drawRoute = (stroke, weight, dash = []) => {
      ink.beginPath();
      displayedRoute.points.forEach(([x, z], i) => {
        let [u,v] = p.point(x, .39, z);
        if (i === 0) ink.moveTo(u, v);
        else ink.lineTo(u, v);
      });
      ink.lineCap = 'round';
      ink.lineJoin = 'round';
      ink.lineWidth = weight;
      ink.strokeStyle = stroke;
      ink.setLineDash(dash);
      ink.stroke();
      ink.setLineDash([]);
    };
    drawRoute(night ? '#28252adf' : '#f8efd8df', 5);
    drawRoute(night ? '#fad095' : '#a54832', 2.2, activeTour >= 0 ? [] : [5, 4]);
  }
  let mover = places.get(current);
  let arrived = false;
  if (movement) {
    const t = Math.min(1, (time - movement.start) / movement.duration);
    const full = movement.distances.at(-1);
    const pos = full * Math.max(0, t);
    const index = t >= 1 ? movement.points.length - 1 : Math.max(1, movement.distances.findIndex(d => d >= pos));
    const start = movement.points[index - 1], end = movement.points[index];
    const a = (pos - movement.distances[index - 1]) / Math.max(.001, movement.distances[index] - movement.distances[index - 1]);
    mover = { x: start[0] + (end[0] - start[0]) * a, z: start[1] + (end[1] - start[1]) * a };
    arrived = t === 1;
  }
  if (mover) {
    const [x, y] = p.point(mover.x, .56, mover.z);
    ink.beginPath();
    ink.arc(x, y, 5.4, 0, Math.PI * 2);
    ink.fillStyle = '#9c472c';
    ink.fill();
    ink.strokeStyle = '#fff3dc';
    ink.lineWidth = 2;
    ink.stroke();
  }
  positionPins(p);
  by('needle').style.transform = 'rotate(' + camera.yaw + 'rad)';
  const wanted = 62 / p.ppu;
  const units = wanted > 36 ? 50 : wanted > 16 ? 25 : wanted > 7 ? 10 : wanted > 3 ? 5 : 2;
  by('scale').style.width = units * p.ppu + 'px';
  by('scaleLabel').textContent = units >= 10 ? units / 10 + ' 公里（约）' : units * 100 + ' 米（约）';
  if (arrived) finishMovement(movement.to);
  if (movement || cameraMove) requestFrame();
}

function requestFrame() {
  if (frame || fallback || lost || !mesh) return;
  frame = requestAnimationFrame(draw);
}
function resize() {
  width = Math.max(1, map.clientWidth);
  height = Math.max(1, map.clientHeight);
  ratio = Math.min(devicePixelRatio || 1, 1.65, Math.sqrt(1800000 / (width * height)));
  for (const layer of [canvas, overlay]) {
    layer.width = Math.round(width * ratio);
    layer.height = Math.round(height * ratio);
  }
  requestFrame();
}
function limit(next) {
  next.x = Math.max(minX, Math.min(maxX, next.x));
  next.z = Math.max(minZ, Math.min(maxZ, next.z));
  next.zoom = Math.max(.77, Math.min(16, next.zoom));
  next.tilt = Math.max(.42, Math.min(1.47, next.tilt));
  next.yaw = (next.yaw + Math.PI * 3) % (2 * Math.PI) - Math.PI;
}
function cancelCamera(to, animate = true) {
  cameraMove = null;
  const next = { ...camera, ...to };
  limit(next);
  if (animate && !reduced.matches) {
    const diff = next.yaw - camera.yaw;
    if (diff > Math.PI) next.yaw -= Math.PI * 2;
    if (diff < -Math.PI) next.yaw += Math.PI * 2;
    cameraMove = { from: { ...camera }, to: next, start: performance.now() };
  } else {
    Object.assign(camera, next);
  }
  requestFrame();
}
function pan(dx, dy) {
  cameraMove = null;
  const { right, up } = basis();
  const { ppu } = projection();
  camera.x += (-right[0] * dx + up[0] * dy / Math.sin(camera.tilt) ** 2) / ppu;
  camera.z += (-right[2] * dx + up[2] * dy / Math.sin(camera.tilt) ** 2) / ppu;
  limit(camera);
  requestFrame();
}
function gesture() {
  const [a, b] = pointerState.values();
  return b ? { x: (a.x+b.x)/2, y: (a.y+b.y)/2, d: Math.hypot(a.x-b.x,a.y-b.y) } : null;
}
canvas.addEventListener('pointerdown', event => {
  if (fallback || lost) return;
  if (event.pointerType === 'mouse' && ![0, 1, 2].includes(event.button)) return;
  canvas.setPointerCapture(event.pointerId);
  cameraMove = null;
  pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY, pan: event.button > 0 || event.shiftKey });
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  const old = pointerState.get(event.pointerId);
  if (!old) return;
  const before = gesture();
  const dx = event.clientX - old.x, dy = event.clientY - old.y;
  old.x = event.clientX;
  old.y = event.clientY;
  const after = gesture();
  if (before && after) {
    camera.zoom *= Math.max(1, after.d) / Math.max(1, before.d);
    limit(camera);
    pan(after.x - before.x, after.y - before.y);
  } else if (old.pan || event.shiftKey) {
    pan(dx, dy);
  } else {
    camera.yaw -= dx * .0085;
    camera.tilt += dy * .0044;
    limit(camera);
    requestFrame();
  }
});
function release(event) {
  pointerState.delete(event.pointerId);
  if (pointerState.size === 0) canvas.classList.remove('dragging');
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, release);
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const units = event.deltaMode === 0 ? 1 : event.deltaMode === 1 ? 18 : 200;
  cancelCamera({ zoom: camera.zoom * Math.exp(-event.deltaY * units * .0017) }, false);
}, { passive: false });
canvas.addEventListener('keydown', event => {
  const actions = {
    ArrowLeft: () => pan(38, 0), ArrowRight: () => pan(-38, 0),
    ArrowUp: () => pan(0, 38), ArrowDown: () => pan(0, -38),
    '+': () => zoom(1.34), '=': () => zoom(1.34), '-': () => zoom(1/1.34),
    q: () => cancelCamera({ yaw: camera.yaw - .45 }), e: () => cancelCamera({ yaw: camera.yaw + .45 }),
    Home: resetView,
  };
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
});
function zoom(multiplier) {
  cancelCamera({ zoom: (cameraMove?.to.zoom ?? camera.zoom) * multiplier });
}
by('plus').onclick = () => zoom(1.38);
by('minus').onclick = () => zoom(1 / 1.38);
by('spin').onclick = () => cancelCamera({ yaw: (cameraMove?.to.yaw ?? camera.yaw) + Math.PI / 4 });
function resetView() {
  focusedArea = -1;
  cancelCamera(initial);
  update();
}
by('reset').onclick = resetView;
by('light').onclick = () => {
  night = !night;
  sun = sunView(night);
  shadowDirty = true;
  map.classList.toggle('night', night);
  by('light').setAttribute('aria-pressed', String(night));
  requestFrame();
};
function viewNeighborhood(view) {
  const zoom = width < 525 ? view.zoom * .83 : view.zoom;
  cancelCamera({ ...view, zoom });
}
by('focus').onclick = () => {
  const area = atlas.focusAreas.find(item => item.view && item.places[0] === selected);
  if (area) {
    viewNeighborhood(area.view);
    return;
  }
  const place = places.get(selected);
  cancelCamera({ x: place.x, z: place.z + 1.9, yaw: -.40, tilt: .75, zoom: width < 655 ? 5.6 : 4.5 });
};
by('search').addEventListener('input', event => {
  query = event.target.value.toLowerCase().trim();
  focusedArea = -1;
  areaButtons.forEach(item => item.setAttribute('aria-pressed', 'false'));
  updateList();
  requestFrame();
});

function updateList() {
  const list = by('list');
  const shown = atlas.places.filter(match);
  by('count').textContent = shown.length + ' 处';
  list.replaceChildren();
  for (const place of shown) {
    const button = addButton(list, '', () => select(place.id), 'place');
    button.setAttribute('aria-current', place.id === selected ? 'true' : 'false');
    button.dataset.place = place.id;
    button.style.setProperty('--point', atlas.categories[place.category].color);
    const mark = document.createElement('span');
    mark.textContent = place.name;
    const location = document.createElement('span');
    location.textContent = place.id === current ? '当前位置' : place.subtitle.split(' · ')[0];
    button.append(mark, location);
  }
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '没有找到该地点。';
    list.append(empty);
  }
}

function selectedRoute() {
  if (activeTour < 0) return planRoute(atlas, current, selected);
  const tour = planTour(atlas, atlas.tours[activeTour]);
  const transfer = planRoute(atlas, current, tour.from);
  if (!transfer?.points.length) return tour;
  return {
    ...tour,
    from: current,
    minutes: tour.minutes + transfer.minutes,
    methods: [...new Set([...transfer.methods, ...tour.methods])],
    points: [...transfer.points, ...tour.points.slice(1)],
    transfer: true,
  };
}

function update(announcement = '') {
  const place = places.get(selected);
  const kind = atlas.categories[place.category];
  by('category').textContent = kind.name;
  by('category').style.setProperty('--category', kind.color);
  by('placeName').textContent = place.name;
  by('placeSub').textContent = place.subtitle;
  by('placeDesc').textContent = place.description;
  by('current').textContent = '当前位置 · ' + places.get(current).name;
  filters.forEach((item, index) => item.setAttribute('aria-pressed', String(category + 1 === index)));
  tourButtons.forEach((item, index) => item.setAttribute('aria-pressed', String(activeTour === index)));
  areaButtons.forEach((item, index) => item.setAttribute('aria-pressed', String(focusedArea === index)));
  for (const [id, pin] of pins) pin.setAttribute('aria-current', String(id === selected));
  const route = selectedRoute();
  displayedRoute = movement ?? route;
  const travel = by('travel');
  travel.disabled = Boolean(movement || !route || (activeTour < 0 && current === selected));
  travel.textContent = movement ? '行程中…' : activeTour >= 0 ? '开始行程' : current === selected ? '你在这里' : '前往' + place.name;
  const info = by('routeInfo');
  info.textContent = announcement || (route?.minutes ?
    (activeTour >= 0 ? atlas.tours[activeTour].name + ' · ' : '') + '约 ' +
    route.minutes + ' 分钟' +
    (route.transfer ? '（含前往起点）' : ' · ' + route.methods.join(' / ')) : '');
  info.hidden = !info.textContent;
  const focused = document.activeElement?.classList.contains('place') ? document.activeElement.dataset.place : null;
  const top = by('list').scrollTop;
  updateList();
  by('list').scrollTop = top;
  if (focused) [...by('list').children].find(item => item.dataset.place === focused)?.focus({ preventScroll: true });
  requestFrame();
}
function select(id) {
  if (movement || !places.has(id)) return;
  activeTour = -1;
  selected = id;
  update();
}
function finishMovement(destination) {
  movement = null;
  current = destination;
  selected = destination;
  activeTour = -1;
  update('已抵达 ' + places.get(destination).name);
}
by('travel').onclick = () => {
  if (movement) return;
  const route = selectedRoute();
  if (!route?.points.length) return;
  if (fallback || lost || !mesh || reduced.matches) {
    finishMovement(route.to);
    return;
  }
  const distances = [0];
  for (let i = 1; i < route.points.length; i++) {
    const [x,z] = route.points[i], [px,pz] = route.points[i-1];
    distances.push(distances.at(-1) + Math.hypot(x - px, z - pz));
  }
  movement = { ...route, distances, start: performance.now(), duration: Math.min(5400, 850 + distances.at(-1) * 32) };
  const view = projection();
  const pointsVisible = route.points.every(([x,z]) => {
    const [u,v] = view.point(x, 0, z);
    return u > 14 && u < width - 14 && v > 14 && v < height - 14;
  });
  if (!pointsVisible) cancelCamera(initial);
  update('前往 ' + places.get(route.to).name);
};
function staticView() {
  fallback = true;
  document.documentElement.dataset.renderer = 'fallback';
  canvas.hidden = true;
  overlay.hidden = true;
  by('labels').hidden = true;
  by('toolbar').hidden = true;
  by('focus').hidden = true;
  by('areas').hidden = true;
  const cover = by('cover').textContent.trim();
  if (cover) {
    by('fallback').src = 'data:image/webp;base64,' + cover;
    by('fallback').hidden = false;
  }
  setMapNotice('此设备暂无法显示 3D，可从地点列表继续浏览。');
}
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  lost = true;
  if (movement) finishMovement(movement.to);
  setMapNotice('立体视图暂时中断，正在恢复…');
});
canvas.addEventListener('webglcontextrestored', () => {
  try {
    renderer(embeddedModel);
    lost = false;
    setMapNotice('');
    resize();
  } catch (error) {
    console.error(error);
    staticView();
  }
});
let embeddedModel;
update();
readEmbeddedModel().then(bytes => {
  embeddedModel = bytes;
  renderer(embeddedModel);
  new ResizeObserver(resize).observe(map);
  resize();
  setMapNotice('');
  document.documentElement.dataset.renderer = 'ready';
}).catch(error => {
  console.error(error);
  staticView();
});
