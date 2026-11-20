"""Blender background script. Build a passenger-facing, illustrative CDG miniature."""
from pathlib import Path
import bpy
import gzip
import math
import tempfile
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/paris-sandbox'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'stills').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
mats={}
def material(color):
    if color not in mats:
        c=tuple(int(color[i:i+2],16)/255 for i in (0,2,4))
        m=bpy.data.materials.new(color);m.diffuse_color=tuple(((q+.055)/1.055)**2.4 if q>.04045 else q/12.92 for q in c)+(1,);mats[color]=m
    return mats[color]
parts={}
def facet(points,faces,color,label):
    verts,fs,colors=parts.setdefault(label,([],[],[]))
    start=len(verts);verts.extend((x,-y,z) for x,y,z in points)
    fs.extend(tuple(start+i for i in reversed(f)) for f in faces);colors.extend([color]*len(faces))
def rings(rows,color,label,caps=True):
    n=len(rows[0]);faces=[]
    for k in range(len(rows)-1):
        for i in range(n):
            j=(i+1)%n;faces.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
    if caps:faces.extend([tuple(reversed(range(n))),tuple(range((len(rows)-1)*n,len(rows)*n))])
    facet([p for row in rows for p in row],faces,color,label)
def slab(p,z,h,c,l):rings([[(x,y,z) for x,y in p],[(x,y,z+h) for x,y in p]],c,l)
def box(x,y,z,w,d,h,c,l,a=0):
    slab([(x+u*math.cos(a)-v*math.sin(a),y+u*math.sin(a)+v*math.cos(a)) for u,v in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]],z,h,c,l)
def disc(x,y,z,r1,r2,h,c,l,n=32):
    rings([[(x+r*math.cos(i*2*math.pi/n),y+r*math.sin(i*2*math.pi/n),height) for i in range(n)] for r,height in [(r1,z),(r2,z+h)]],c,l)
def annulus(x,y,z,r,R,h,c,l,n=64):
    for i in range(n):
        a,b=i*2*math.pi/n,(i+1)*2*math.pi/n
        pts=[(x+rr*math.cos(t),y+rr*math.sin(t)) for rr,t in [(r,a),(R,a),(R,b),(r,b)]]
        slab(pts,z,h,c,l)
def beam(a,b,width,depth,c,l):
    d=Vector(b)-Vector(a);u=d.cross(Vector((0,0,1)))
    if u.length<1e-6:u=Vector((1,0,0))
    u.normalize();v=d.normalized().cross(u)
    rings([[tuple(Vector(o)+u*i*width/2+v*j*depth/2) for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]] for o in [a,b]],c,l)
def text_obj(name,body,x,y,z,size,color,rotation=(0,0,0)):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.009
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.location=(x,-y,z);obj.rotation_euler=rotation;obj.data.materials.append(material(color))
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
sand='d8cab0';ivory='e8dfca';stone='c5bba7';teal='567a81';dark='3d555e';road='929799';pavement='b4b4ac';gold='c6a16a'
for z,w,d,h,col in [(-2.8,92,49,.44,'4e5148'),(-2.36,92.3,49.3,.15,gold),(-2.21,92.5,49.5,1.45,'80705b'),(-.76,92.5,49.5,.13,gold),(-.63,92.2,49.2,.63,'a0ad8a')]:
    box(0,0,z,w,d,h,col,'Socle')
box(0,24.85,-2.10,13,.14,1.14,'365352','Socle')
text_obj('Cartouche CDG','P A R I S   /   C D G',0,24.94,-1.53,1.0,'f2e4bf',(math.pi/2,0,0))
# Composed apron and a scenic strip of runway at the back of the model.
box(0,-19.6,.002,89,4.5,.055,'6e7c7c','Pistes')
for x in range(-40,42,3):box(x,-19.6,.06,1.4,.11,.018,'ede7d9','Pistes')
for x in [-42,42]:
    for j in range(6):box(x,-21+j*.54,.06,1.6,.20,.018,ivory,'Pistes')
box(-10,-1,.01,55,27,.07,pavement,'Aire civile')
for dx in range(-35,13,4):box(dx,-12.3,.085,2.5,.09,.012,'dfca83','Aire civile')
cx,cy=-13,-1
# A central open courtyard makes the ring terminal recognizable from above.
annulus(cx,cy,.11,2.64,8.75,.46,stone,'Aérogare 1')
for z,R,h,c in [(.57,8.43,.78,teal),(1.35,8.7,.21,ivory),(1.56,8.5,.87,teal),(2.43,8.75,.22,ivory),(2.65,8.50,.76,teal),(3.41,8.76,.24,ivory),(3.65,8.39,.71,teal),(4.36,8.60,.34,ivory),(4.70,8.25,.13,sand)]:
    annulus(cx,cy,z,2.64,R,h,c,'Aérogare 1')
annulus(cx,cy,4.83,2.58,2.89,.23,ivory,'Aérogare 1')
for k in range(56):
    a=2*math.pi*k/56
    box(cx+8.47*math.cos(a),cy+8.47*math.sin(a),.58,.18,.12,3.75,stone,'Aérogare 1',a)
for s in [-1,1]:
    beam((cx-2.62,cy+s*.81,1.9),(cx+2.62,cy-s*.81,4.27),.48,.42,'b2ccca','Passerelles')
for k in range(6):
    a=math.radians(8+k*57)
    x,y=cx+12.25*math.cos(a),cy+12.25*math.sin(a)
    disc(x,y,.1,2.12,2.5,.42,ivory,'Satellites',14);disc(x,y,.52,2.49,2.49,.92,teal,'Satellites',14);disc(x,y,1.44,2.74,2.33,.39,ivory,'Satellites',14)
    for off in [-.4,.4]:
        u=a+off;beam((x+1.95*math.cos(u),y+1.95*math.sin(u),.86),(x+3.14*math.cos(u),y+3.14*math.sin(u),.67),.39,.35,stone,'Satellites')
    disc(x,y,1.84,1.52,1.52,.065,stone,'Satellites',14)
    disc(x,y,1.905,1.13,1.13,.05,'92adaf','Satellites',14)
annulus(cx,cy,.091,9.13,10.10,.04,road,'Accès voyageurs')
for k in range(56):
    a=2*math.pi*k/56
    box(cx+9.62*math.cos(a),cy+9.62*math.sin(a),.143,.49,.045,.012,ivory,'Accès voyageurs',a+math.pi/2)
# CDGVAL elevated guideway into the landside rail concourse.
def track(a,b):
    beam((*a,1.06),(*b,1.06),.87,.22,stone,'CDGVAL')
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);ux,uy=-dy/length,dx/length
    for s in [-.28,.28]:beam((a[0]+ux*s,a[1]+uy*s,1.22),(b[0]+ux*s,b[1]+uy*s,1.22),.066,.07,dark,'CDGVAL')
    for i in range(math.ceil(length/3.5)):
        t=i/max(1,math.ceil(length/3.5));box(a[0]+t*dx,a[1]+t*dy,.04,.26,.30,.93,stone,'CDGVAL')
for a,b in zip([(-10,8.7),(-4,12.8),(6,13.4),(15,9)], [(-4,12.8),(6,13.4),(15,9),(25,9)]):track(a,b)
for i in range(2):
    box(2.65+2.26*i,13.22+.135*i,1.22,2.17,.70,.44,ivory,'Navette',.060)
    box(2.65+2.26*i,13.22+.135*i,1.59,2.16,.73,.27,dark,'Navette',.060)
    box(2.65+2.26*i,13.22+.135*i,1.86,2.16,.71,.10,'bd9162','Navette',.060)
# Rail hall and its parallel sawtooth skylights, plus an uncovered platform.
box(24,6.8,.05,13.4,9.1,.25,sand,'Roissypôle')
box(24,6.05,.30,12.2,6.7,1.89,teal,'Roissypôle')
for x in range(19,30):
    box(x,6.05,.28,.14,6.85,2.10,ivory,'Roissypôle')
    beam((x-.54,2.56,2.26),(x+.38,2.56,3.03),.12,.15,ivory,'Roissypôle')
    facet([(x-.52,2.40,2.29),(x+.39,2.40,2.99),(x+.39,9.63,2.99),(x-.52,9.63,2.29)],[(0,1,2,3)],'aac6c5','Roissypôle')
    box(x+.40,6,2.24,.12,7.35,.79,'85999a','Roissypôle')
for i in range(2):
    box(24,11.50+i*1.48,.04,24,.67,.13,'817e72','Rails')
    for s in [-.28,.28]:box(24,11.50+i*1.48+s,.17,24,.066,.08,'d3d1bb','Rails')
for i in range(4):
    x=18.0+i*3
    box(x,12.99,.25,2.86,.84,.62,ivory,'RER B');box(x,12.99,.78,2.8,.85,.33,teal,'RER B')
    box(x,12.99,1.11,2.77,.78,.1,'7897ae','RER B')
# Tower and the public passenger apron, with small original airliners.
disc(8,-5,.1,1.08,.74,4.65,ivory,'Tour');disc(8,-5,4.75,.85,1.60,.59,dark,'Tour',12);disc(8,-5,5.34,1.60,1.46,.68,'668b96','Tour',12);disc(8,-5,6.02,1.63,1.29,.28,ivory,'Tour',12);disc(8,-5,6.3,.09,.04,.62,stone,'Tour',8)
def aircraft(x,y,a,s,accent):
    def local(u,v,h):return (x+s*(u*math.cos(a)-v*math.sin(a)),y+s*(u*math.sin(a)+v*math.cos(a)),.12+s*h)
    rows=[]
    for u,r,h in [(-3.95,.09,.77),(-3.1,.33,.77),(-1.6,.49,.78),(1.8,.47,.78),(2.85,.39,.75),(3.48,.20,.64),(3.78,.045,.62)]:
        rows.append([local(u,r*math.cos(j*math.pi/6),h+r*math.sin(j*math.pi/6)) for j in range(12)])
    rings(rows,'eeeadb','Avions civils')
    for v in [-1,1]:
        facet([local(.78,v*.38,.76),local(-1.30,v*3.85,.94),local(-2.08,v*3.90,.98),local(-.93,v*.39,.77)],[(0,1,2,3)],ivory,'Avions civils')
        facet([local(-2.4,v*.25,.80),local(-3.35,v*1.51,1.00),local(-3.87,v*1.54,.99),local(-3.31,v*.21,.78)],[(0,1,2,3)],ivory,'Avions civils')
        beam(local(-.23,v*1.49,.65),local(.70,v*1.49,.65),.35*s,.36*s,'80929a','Avions civils')
        for j in range(12):
            p=local(-1.57+j*.32,v*.452,.88);box(*p,.14*s,.057*s,.083*s,teal,'Avions civils',a)
    facet([local(-2.38,0,1.00),local(-3.41,0,2.76),local(-3.93,0,2.77),local(-3.62,0,.96)],[(0,1,2,3)],accent,'Avions civils')
    for u in [-1.04,2.13]:
        p=local(u,0,.11);box(*p,.3*s,.38*s,.39*s,dark,'Avions civils',a)
for x,y,a,s,c in [(-34,-6,-.22,1.13,'526f96'),(-30,11,-.58,.96,'b86d50'),(-2,-10,2.51,.85,'638785'),(20,-15,.02,.88,'647ba1')]:aircraft(x,y,a,s,c)
for x,y in [(13,0),(16,0),(31,1),(33,12),(-37,14),(-32,16),(34,-6)]:
    beam((x,y,.08),(x,y,2.4),.09,.09,dark,'Mobilier');box(x,y,2.42,.90,.16,.12,ivory,'Mobilier')
for x in range(-37,39,4):
    for y in [18.8,21.6]:
        disc(x,y,.04,.11,.09,.85,'7d745c','Allée',8);disc(x,y,.88,.71,.77,.62,'90a37e','Allée',9);disc(x,y,1.50,.78,.32,.60,'91a77e','Allée',9)
box(0,16.6,.022,88,1.76,.043,road,'Accès voyageurs')
for x in range(-40,41,3):box(x,16.6,.066,.90,.06,.01,ivory,'Accès voyageurs')
text_obj('Aérogare · 1','1',cx,cy+5.1,4.846,3.0,'647e81')
text_obj('Station RER','R E R   B',23,15.10,.10,.79,dark)
for label,(verts,faces,colors) in parts.items():
    mesh=bpy.data.meshes.new(label);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(label,mesh);bpy.context.collection.objects.link(ob)
    palette=list(dict.fromkeys(colors))
    for c in palette:ob.data.materials.append(material(c))
    for face,c in zip(mesh.polygons,colors):face.material_index=palette.index(c)
for name,pos in [('cdg-airport',(cx,cy,2.4)),('paris-roissypole',(24,6.2,1.55))]:
    o=bpy.data.objects.new('poi_'+name,None);o.location=(pos[0],-pos[1],pos[2]);bpy.context.collection.objects.link(o)
with tempfile.TemporaryDirectory() as tmp:
    glb=Path(tmp)/'airport.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_yup=True)
    (OUT/'airport.glb.gz.bin').write_bytes(gzip.compress(glb.read_bytes(),compresslevel=9,mtime=0))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=35;scene.cycles.use_denoising=False
    scene.world=bpy.data.worlds.new('Sky');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.83,.89,1,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.56
    def look(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.light_add(type='SUN',location=(-65,-63,100));sun=bpy.context.object;look(sun,(0,0,0));sun.data.energy=2.48;sun.data.angle=.17;sun.data.color=(1,.93,.82)
    bpy.ops.mesh.primitive_plane_add(size=1400,location=(0,0,-2.82));bpy.context.object.data.materials.append(material('d0caba'))
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.clip_end=350;scene.camera=cam
    scene.render.image_settings.file_format='WEBP';scene.render.image_settings.quality=73
    scene.render.resolution_x=856;scene.render.resolution_y=570;scene.render.resolution_percentage=100
    for name,target,span,az,alt in [('cdg',(0,0,.6),106,.28,.59),('cdg-airport',(-13,1,2.3),33,.40,.51),('paris-roissypole',(24,-6.2,1.5),27,-.42,.44)]:
        lookdir=Vector((math.sin(az)*math.cos(alt),-math.cos(az)*math.cos(alt),math.sin(alt)))
        cam.location=Vector(target)+lookdir*110;look(cam,target);cam.data.ortho_scale=span
        scene.render.filepath=str(OUT/'stills'/(name+'.webp'));bpy.ops.render.render(write_still=True)
