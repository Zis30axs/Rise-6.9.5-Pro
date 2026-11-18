"""Create the Paris exhibition miniature. Run with Python 3, NumPy and GDAL's ogr."""
import gzip
import io
from PIL import Image, ImageDraw, ImageFont
import json
import math
import random
import struct
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from osgeo import ogr

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/paris-sandbox'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(75001)
pi, sin, cos = math.pi, math.sin, math.cos
groups = {}
current = None
def group(name):
    global current
    current = groups.setdefault(name, ([], [], [], [], {}))

stone='#e7d2b0'; light='#f5e4c4'; trim='#dbc5a1'; shade='#b99c79'
blue='#566873'; roof='#596774'; zinc='#83949b'; dark='#364b55'
iron='#6b4d3d'; bronze='#886345'; gold='#ce9c42'; gild='#f2c466'
pave='#ccc1ac'; road='#a9a59b'; lawn='#98ad77'; hedge='#799161'
greens=['#789366','#91a66d','#839d72','#a3ac6f','#718c63']
glass='#79bec0'; water='#59a5aa'; quay='#d8c6a6'
houses=['#eeddbf','#dfc6a2','#e5d0ae','#e8d8bc','#d5bba0','#f1e0c9','#d9c9b3']
roofs=['#667786','#617280','#78848a','#747c82','#526774','#778285']
colors={}
def linear_rgb(h):
    if h not in colors:
        v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
        colors[h]=tuple(round(255*((c+0.055)/1.055)**2.4) if c>0.04045 else round(c/12.92*255) for c in v)+(255,)
    return colors[h]
def face(points, color):
    if len(points)<3: return
    a,b,c=points[:3]
    ux,uy,uz=(b[i]-a[i] for i in range(3)); vx,vy,vz=(c[i]-a[i] for i in range(3))
    nx,ny,nz=uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx
    length=(nx*nx+ny*ny+nz*nz)**.5
    if length<1e-8: return
    norm=(round(nx/length,5),round(nz/length,5),round(ny/length,5))
    positions,normals,cols,indices,lookup=current
    ids=[]
    for x,y,z in points:
        pos=(round(x,4),round(z,4),round(y,4)); key=(pos,norm,color)
        idx=lookup.get(key)
        if idx is None:
            idx=len(positions);lookup[key]=idx;positions.append(pos);normals.append(norm);cols.append(linear_rgb(color))
        ids.append(idx)
    for i in range(1,len(ids)-1):indices.extend((ids[0],ids[i+1],ids[i]))
def area(p):return sum(x*v-y*u for (x,y),(u,v) in zip(p,p[1:]+p[:1]))*.5
def ccw(p):return p if area(p)>0 else p[::-1]
def polygon(p):
    ring=ogr.Geometry(ogr.wkbLinearRing)
    for x,y in p+[p[0]]:ring.AddPoint_2D(x,y)
    g=ogr.Geometry(ogr.wkbPolygon);g.AddGeometry(ring);return g
def line(p):
    g=ogr.Geometry(ogr.wkbLineString)
    for x,y in p:g.AddPoint_2D(x,y)
    return g
def shape(x,y,w,d):return [(x-w/2,y-d/2),(x+w/2,y-d/2),(x+w/2,y+d/2),(x-w/2,y+d/2)]
def rect(x,y,w,d):return polygon(shape(x,y,w,d))
def polys(g):
    if not g or g.IsEmpty(): return
    if g.GetGeometryName()=='POLYGON':yield g
    elif g.GetGeometryName() in ('MULTIPOLYGON','GEOMETRYCOLLECTION'):
        for i in range(g.GetGeometryCount()):yield from polys(g.GetGeometryRef(i))
def points(g):return [(p[0],p[1]) for p in g.GetGeometryRef(0).GetPoints()[:-1]]
def sides(a,b,col):
    for i in range(len(a)):
        j=(i+1)%len(a);face([a[i],a[j],b[j],b[i]],col)
def ring3(p,z):return [(x,y,z) for x,y in p]
def triangulate(p,z,col):
    p=ccw(p)
    if len(p)<3:return
    if len(p)<=4 and all((p[(i+1)%len(p)][0]-p[i][0])*(p[(i+2)%len(p)][1]-p[(i+1)%len(p)][1])-(p[(i+1)%len(p)][1]-p[i][1])*(p[(i+2)%len(p)][0]-p[(i+1)%len(p)][0])>=-1e-8 for i in range(len(p))):
        face(ring3(p,z),col);return
    # Clip ears. Boundary polygons used here have no holes.
    ids=list(range(len(p)))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    while len(ids)>2:
        for i in range(len(ids)):
            a,b,c=(p[ids[j%len(ids)]] for j in (i-1,i,i+1))
            turn=cross(a,b,c)
            if abs(turn)<1e-8:
                ids.pop(i);break
            if turn<0:continue
            if any(cross(a,b,p[k])>1e-7 and cross(b,c,p[k])>1e-7 and cross(c,a,p[k])>1e-7 for k in ids if p[k] not in (a,b,c)):continue
            face(ring3([a,b,c],z),col);ids.pop(i);break
        else: break
def prism(p,z0,z1,col,top=None):
    p=ccw(p);sides(ring3(p,z0),ring3(p,z1),col);triangulate(p,z1,top or col)
def box(x,y,z,w,d,h,col,a=0):
    p=shape(0,0,w,d);prism([(x+u*cos(a)-v*sin(a),y+u*sin(a)+v*cos(a)) for u,v in p],z,z+h,col)
def ring(x,y,r,n=12,ry=None):
    return [(x+r*cos(2*pi*i/n),y+(r if ry is None else ry)*sin(2*pi*i/n)) for i in range(n)]
def frustum(x,y,z,h,r,R,col,n=12,ratio=1):
    a=ring(x,y,r,n,r*ratio); b=ring(x,y,max(.001,R),n,max(.001,R)*ratio)
    sides(ring3(a,z),ring3(b,z+h),col);face(ring3(b,z+h),col)
def rod(a,b,r,col,n=5,r2=None):
    x,y,z=(b[i]-a[i] for i in range(3));l=(x*x+y*y+z*z)**.5
    if l<1e-6:return
    x,y,z=x/l,y/l,z/l
    if abs(z)>.92:u=(1.,0.,-x/z)
    else:u=(-y,x,0.)
    s=sum(q*q for q in u)**.5;u=tuple(q/s for q in u);v=(y*u[2]-z*u[1],z*u[0]-x*u[2],x*u[1]-y*u[0])
    def rr(o,rad):return [tuple(o[j]+rad*(u[j]*cos(2*pi*i/n)+v[j]*sin(2*pi*i/n)) for j in range(3)) for i in range(n)]
    A,B=rr(a,r),rr(b,r if r2 is None else r2);sides(A,B,col);face(B,col)
def slab(x,y,z,w,d,h,col,cut=.08):
    a=w/2;b=d/2;c=min(cut,a*.6,b*.6)
    prism([(x+u,y+v) for u,v in [(-a+c,-b),(a-c,-b),(a,-b+c),(a,b-c),(a-c,b),(-a+c,b),(-a,b-c),(-a,-b+c)]],z,z+h,col)
def dome(x,y,z,r,h,col,n=18):
    a=ring3(ring(x,y,r,n),z)
    for i in range(1,8):
        t=pi*i/14;b=ring3(ring(x,y,max(.002,r*cos(t)),n),z+h*sin(t));sides(a,b,col);a=b
def quad_win(a,b,z,w,h,col):
    x,y=a;dx,dy=b
    face([(x-dx*w/2,y-dy*w/2,z),(x+dx*w/2,y+dy*w/2,z),(x+dx*w/2,y+dy*w/2,z+h),(x-dx*w/2,y-dy*w/2,z+h)],col)
def arch_window(x,y,z,w,h,axis,col):
    dx,dy=axis;r=w/2;s=h-r
    p=[(-r,0),(r,0),(r,s)]+[(r*cos(i*pi/10),s+r*sin(i*pi/10)) for i in range(1,11)]
    face([(x+dx*u,y+dy*u,z+v) for u,v in p],col)
def archwall(x,y,z,width,depth,h,opening,spring,col,axis='x',n=14):
    # A real through arch assembled from piers and the vaulted spandrel.
    def tr(u,v,k):return (x+u,y+v,z+k) if axis=='x' else (x-v,y+u,z+k)
    r=opening/2
    for a,b in [(-width/2,-r),(r,width/2)]:
        p=[tr(a,-depth/2,0),tr(b,-depth/2,0),tr(b,depth/2,0),tr(a,depth/2,0)]
        q=[(u,v,z+h) for u,v,_ in p];sides(p,q,col);face(q,col)
    for i in range(n):
        a=pi*(1-i/n);b=pi*(1-(i+1)/n);u,v=r*cos(a),r*cos(b);ka,kb=spring+r*sin(a),spring+r*sin(b)
        for dep in [-depth/2, depth/2]:
            q=[tr(u,dep,ka),tr(v,dep,kb),tr(v,dep,h),tr(u,dep,h)]
            face(q if dep<0 else q[::-1],col)
        face([tr(u,-depth/2,ka),tr(u,depth/2,ka),tr(v,depth/2,kb),tr(v,-depth/2,kb)],col)
    face([tr(-r,-depth/2,h),tr(r,-depth/2,h),tr(r,depth/2,h),tr(-r,depth/2,h)],col)

def path(p,w,z,col):
    g=line(p).Buffer(w/2,3)
    for f in polys(g):triangulate(points(f),z,col)
def tree(x,y,s=1):
    z=.26
    frustum(x,y,z,1.02*s,.095*s,.072*s,'#7c7053',6)
    rad=.64*s;n=7;offset=rng.random()*.7
    prev=None
    c=rng.choice(greens)
    for level,(rr,hh) in enumerate([(.36,.70),(.91,.99),(1.0,1.44),(.71,1.90),(.12,2.12)]):
        row=[(x+rad*rr*cos(2*pi*i/n+offset+(.19 if level%2 else 0)),y+rad*rr*sin(2*pi*i/n+offset+(.19 if level%2 else 0)),z+hh*s) for i in range(n)]
        if prev:
            for i in range(n):
                j=(i+1)%n;face([prev[i],prev[j],row[i]],c);face([prev[j],row[j],row[i]],c)
        prev=row
    face(prev,c)
def fence(a,b,h=.37,gap=.8,col=dark):
    l=math.dist(a,b); n=max(1,round(l/gap))
    rod((*a,h+.24),(*b,h+.24),.039,col,4)
    for i in range(n+1):
        t=i/n;x=a[0]*(1-t)+b[0]*t;y=a[1]*(1-t)+b[1]*t
        box(x,y,.24,.09,.09,h,col)
def lamp(x,y,s=1):
    frustum(x,y,.23,.20*s,.13*s,.09*s,dark,6);rod((x,y,.35),(x,y,.23+1.20*s),.045*s,dark)
    frustum(x,y,.23+1.20*s,.23*s,.10*s,.12*s,'#f8e6b8',6);frustum(x,y,.23+1.43*s,.14*s,.15*s,.018*s,dark,6)

# The Seine meanders through a miniature north-up plan. Distances are composed for display.
def river(x):return -2+3.6*sin((x+12)/14)+.105*x
def half(x):return 3.3+3.95*math.exp(-((x-31)/10.8)**2)
def bank(x,side):return river(x)+side*half(x)
xs=[-47+i*94/64 for i in range(65)]
outline=shape(0,0,94,57)
group('Plinth · walnut and brass')
slab(0,0,-2.95,95,58,.42,'#3f3835',.75);slab(0,0,-2.53,95.4,58.4,.20,'#bb9761',.78)
slab(0,0,-2.33,95.7,58.7,1.43,'#775844',.82);slab(0,0,-.90,95.6,58.6,.12,'#c3a574',.7)
slab(0,0,-.78,95.3,58.3,.39,'#947654',.75)
group('Seine · embankments')
prism(outline,-.40,-.30,water)
lands=[]
for side in [-1,1]:
    edge=[(x,bank(x,side)) for x in xs]
    p=ccw(edge+[(47,side*28.5),(-47,side*28.5)])
    lands.append(polygon(p));prism(p,-.31,.16,quay,road)
    ribbon=[(x,bank(x,side)) for x in xs]+[(x,bank(x,side)+side*.72) for x in reversed(xs)]
    prism(ribbon,.16,.22,quay,'#ebd9bc')
    for x in np.arange(-45,46,2.4):
        j=float(x);rod((j,bank(j,side),-.18),(j,bank(j,side),.13),.036,'#b7a384',4)
for _ in range(300):
    x=rng.uniform(-46.6,46.6);y=river(x)+rng.uniform(-half(x)+.42,half(x)-.42)
    L=rng.uniform(.18,1.11);w=rng.uniform(.015,.065)
    face([(x-L/2,y,-.286),(x+.08,y-w,-.286),(x+L/2,y,-.286),(x+.03,y+w,-.286)],rng.choice(['#83bdba','#6cafaF','#9fceca']))
isle=[(19.8,river(20)),(23.3,river(23)-1.7),(28,river(28)-2.25),(34.8,river(35)-2.35),(39.6,river(40)-1.2),(42.5,river(42)),(39,river(39)+1.45),(33.2,river(33)+2.35),(27,river(27)+2.05),(23.3,river(23)+1.35)]
prism(isle,-.30,.24,quay,'#c9ba9c')

# Champ de Mars and the iron lattice tower
ex,ey=-30,7
group('Champ de Mars · parterres')
slab(ex,9,.17,12.6,28.6,.07,'#d2c3a4',.65)
for x in [ex-4.55,ex+4.55]:
    for y in np.arange(-3,23,2.05):tree(x,float(y),.78)
for y in [16.1,20.4]:
    for s in [-1,1]:
        slab(ex+1.65*s,y,.24,2.45,3.2,.10,hedge,.18);slab(ex+1.65*s,y,.34,2.12,2.86,.025,lawn,.16)
for sx in [-1,1]:
    for sy in [-1,1]:slab(ex+sx*3.55,ey+sy*3.55,.25,1.8,1.8,.34,light,.18)
group('Tour Eiffel')
# radius of each leg from tower axis, and half-width of each lattice leg
levels=[(.58,3.60,.56),(1.9,3.13,.49),(3.5,2.60,.43),(5.0,2.17,.37),(6.2,1.95,.34),(7.45,1.79,.31),(9.0,1.48,.28),(10.7,1.15,.24),(12.25,.92,.20),(13.9,.75,.17),(15.7,.59,.145),(17.4,.47,.12),(19.1,.36,.10),(20.7,.27,.085),(22.0,.19,.065)]
for sx in [-1,1]:
    for sy in [-1,1]:
        prev=None
        for z,r,w in levels:
            row=[(ex+sx*r+u*w,ey+sy*r+v*w,z) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            if prev:
                thick=.093 if z<7 else (.066 if z<14 else .038)
                for i in range(4):
                    j=(i+1)%4
                    rod(prev[i],row[i],thick*1.48,iron,5);rod(prev[i],row[j],thick*.65,bronze,4)
                    rod(prev[j],row[i],thick*.65,bronze,4);rod(row[i],row[j],thick,iron,4)
            prev=row
for z,w in [(5.85,5.5),(6.18,5.4),(10.6,3.3),(10.92,3.15),(21.8,1.15)]:
    slab(ex,ey,z,w,w,.16,bronze,.08)
    if z in [6.18,10.92,21.8]:
        for s in [-1,1]:
            for flip in [0,1]:
                def edge(t,h):return (ex+(s*w/2 if flip else t),ey+(t if flip else s*w/2),h)
                rod(edge(-w/2,z+.46),edge(w/2,z+.46),.05,iron)
                for t in np.linspace(-w/2,w/2,10):rod(edge(t,z+.14),edge(t,z+.46),.031,iron,4)
for axis in [0,1]:
    for s in [-1,1]:
        for offset in [0,.27]:
            curve=[]
            for i in range(19):
                a=pi*i/18
                u=3.35*cos(a);h=1.25+3.85*sin(a)+offset
                side=s*(3.35-.97*sin(a))
                curve.append((ex+(side if axis else u),ey+(u if axis else side),h))
            for a,b in zip(curve,curve[1:]):rod(a,b,.09 if offset==0 else .061,iron,5)
for lo,hi,r1,r2 in [(6.48,8.8,1.85,1.45),(8.8,10.5,1.45,1.13),(11.3,13.8,1,.75),(13.8,16,.75,.55),(16,18,.55,.43),(18,20.6,.43,.27)]:
    for s in [-1,1]:
        for flip in [0,1]:
            def pt(t,r,h):return (ex+(s*r if flip else t*r),ey+(t*r if flip else s*r),h)
            for t in [-1,1]:rod(pt(t,r1,lo),pt(-t,r2,hi),.062 if lo<11 else .042,bronze,4)
frustum(ex,ey,22,.85,.40,.24,iron,8);rod((ex,ey,22.6),(ex,ey,24.35),.095,bronze,6,.025)

# Arc de Triomphe in the centre of its étoile.
ax,ay=-31,-19
group('Place Charles-de-Gaulle')
frustum(ax,ay,.17,.08,5.18,5.18,'#d6c8af',44);frustum(ax,ay,.25,.075,4.3,4.3,'#bdaf95',44)
for k in range(32):
    a=2*pi*k/32
    rod((ax+4.58*cos(a),ay+4.58*sin(a),.263),(ax+4.83*cos(a),ay+4.83*sin(a),.263),.027,'#e8d9c1',4)
group('Arc de Triomphe')
az=.325
for sy in [-1,1]:archwall(ax,ay+sy*.97,az,5.15,.60,3.95,2.18,1.52,stone)
for sx in [-1,1]:
    archwall(ax+sx*1.82,ay,az,2.55,1.45,3.92,1.10,1.21,stone,'y')
for z,w,d,h,c in [(3.9,5.36,2.89,.18,light),(4.08,5.51,2.95,.15,trim),(4.23,5.25,2.73,.54,stone),(4.77,5.48,2.92,.14,light),(4.91,5.30,2.78,.10,trim)]:
    box(ax,ay,az+z,w,d,h,c)
for s in [-1,1]:
    yy=ay+s*1.29
    for dx in [-1.84,1.84]:
        box(ax+dx,yy,az+.25,1.12,.13,.31,trim)
        for n in range(5):
            X=ax+dx+(n-2)*.17
            frustum(X,yy+s*.09,az+.60,.65+.26*sin(n),.14,.10,shade,6)
            dome(X,yy+s*.09,az+1.30+.26*sin(n),.12,.18,shade,7)
        box(ax+dx,yy,az+2.55,1.04,.12,.53,trim)
    for i in range(13):box(ax+(i-6)*.37,ay+s*1.377,az+4.37,.24,.052,.20,trim)
    for i in range(13):
        a=i*pi/12
        rod((ax+1.12*cos(a),yy+s*.005,az+1.52+1.12*sin(a)),(ax+1.34*cos(a),yy+s*.01,az+1.52+1.34*sin(a)),.045,light,4)

# French roofs and façades, reused for the palace wings as well as the street fabric.
def hip(x,y,z,w,d,h,c,topc=None):
    p=shape(x,y,w,d);q=shape(x,y,max(w-.48,.11),max(d-.49,.12))
    sides(ring3(p,z),ring3(q,z+h*.76),c)
    if w>=d:r=[(x-w*.37,y,z+h),(x+w*.37,y,z+h)]
    else:r=[(x,y-d*.37,z+h),(x,y+d*.37,z+h)]
    k=ring3(q,z+h*.76)
    if w>=d:
        face([k[0],k[1],r[1],r[0]],topc or c);face([k[1],k[2],r[1]],c);face([k[2],k[3],r[0],r[1]],topc or c);face([k[3],k[0],r[0]],c)
    else:
        face([k[0],k[1],r[0]],c);face([k[1],k[2],r[1],r[0]],topc or c);face([k[2],k[3],r[1]],c);face([k[3],k[0],r[0],r[1]],topc or c)
def palace(x,y,w,d,h,grand=False):
    z=.26
    box(x,y,z,w,d,h,stone)
    for zz,off,t,col in [(.12,.16,.16,trim),(h*.47,.11,.09,light),(h-.16,.20,.16,light)]:
        box(x,y,z+zz,w+off,d+off,t,col)
    p=.64 if grand else .70
    for axis,L,D in [(0,w,d),(1,d,w)]:
        n=max(2,round(L/p))
        for s in [-1,1]:
            for i in range(n):
                u=((i+.5)/n-.5)*L
                q=(x+s*(D/2+.012),y+u) if axis else (x+u,y+s*(D/2+.012))
                direction=(0,1) if axis else (1,0)
                arch_window(*q,z+.27,.29 if grand else .25,h*.29,direction,'#778183')
                quad_win(q,direction,z+h*.56,.25,h*.27,'#647680')
            if L>3:
                for i in range(0,n+1,2):
                    u=(i/n-.5)*L;X,Y=(x+s*D/2,y+u) if axis else (x+u,y+s*D/2)
                    box(X,Y,z+.17,.13,.13,h-.23,light)
    hip(x,y,z+h,w+.16,d+.16,1.02 if grand else .64,roof,zinc)
    for t in [-.35,.35]:box(x+w*t,y,z+h+.30,.25,.33,.65,shade)
group('Jardin des Tuileries')
slab(-1.5,-12.3,.17,15.9,8.5,.09,'#d3c7a6',.34)
for y in [-15.0,-9.6]:
    for x in [-7.3,-4.3,-1.3,1.7,4.1]:
        slab(x,y,.26,2.08,1.62,.14,hedge,.22);slab(x,y,.40,1.80,1.34,.025,lawn,.22)
for x in [-6.6,3.2]:
    frustum(x,-12.3,.265,.09,.99,.99,light,16,.73);frustum(x,-12.3,.355,.017,.83,.84,glass,16,.70)
for x in np.arange(-8,5.7,1.8):
    for y in [-16.25,-8.35]:tree(float(x),y,.68)
group('Musée du Louvre')
lx,ly=13,-12.3
slab(lx,ly,.17,15.1,8.5,.09,'#dfceb0',.26)
palace(lx,ly-3.22,13.5,1.47,2.02);palace(lx,ly+3.22,13.5,1.47,2.02);palace(lx+5.88,ly,1.75,6.43,2.20)
for x in [lx-6.45,lx+5.95]:
    for y in [ly-3.22,ly+3.22]:palace(x,y,2.12,2.12,2.57,True)
palace(lx+5.87,ly,2.54,2.18,2.88,True)
def pyramid(x,y,z,r,h):
    p=ring3(shape(x,y,r*2,r*2),z);ap=(x,y,z+h)
    for k in range(4):
        a,b=p[k],p[(k+1)%4];face([a,b,ap],['#81b5b7','#a4cac6','#72a4aa','#a5c7bd'][k]);rod(a,ap,.042,light,4)
        for j in range(1,5):
            t=j/5
            left=tuple(a[d]*(1-t)+ap[d]*t for d in range(3));right=tuple(b[d]*(1-t)+ap[d]*t for d in range(3))
            rod(left,right,.022,'#d0dfd5',4)
            point=tuple(a[d]*(1-t)+b[d]*t for d in range(3));rod(point,left,.021,'#d0dfd5',4)
pyramid(lx-.65,ly,.27,1.67,2.07)
for X,Y in [(lx-3.38,ly-1.32),(lx-3.38,ly+1.32),(lx+1.86,ly)]:pyramid(X,Y,.27,.47,.55)

# Hôtel des Invalides: court, drum, gilded dome and lantern.
group('Hôtel des Invalides')
ix,iy=-4,15.4
slab(ix,iy,.17,12.9,13.2,.09,'#d4c8ad',.27)
palace(ix,iy-4.60,10.9,1.28,1.48)
for s in [-1,1]:palace(ix+s*4.63,iy-1.57,1.24,6.7,1.46)
palace(ix,iy+1.38,10.25,1.40,1.65)
cx,cy=ix,iy+1.55
box(cx,cy,.26,4.05,3.98,2.13,stone);box(cx,cy,2.39,4.26,4.22,.17,light)
for s in [-1,1]:
    for t in [-1,1]:
        X,Y=cx+s*1.87,cy+t*1.78;frustum(X,Y,2.4,.50,.37,.37,stone,10);dome(X,Y,2.90,.45,.43,roof,10)
for z,h,r,col in [(2.46,.34,1.93,trim),(2.8,1.22,1.67,stone),(4.02,.25,1.79,light),(4.27,.56,1.56,roof),(4.83,.15,1.68,gold)]:
    frustum(cx,cy,z,h,r,r,col,24)
for i in range(16):
    a=2*pi*i/16;X=cx+1.68*cos(a);Y=cy+1.68*sin(a);rod((X,Y,2.88),(X,Y,3.94),.089,light,7)
dome(cx,cy,4.97,1.60,2.14,gold,24)
for i in range(12):
    v=2*pi*i/12
    p=[(cx+1.614*cos(t)*cos(v),cy+1.614*cos(t)*sin(v),4.98+2.14*sin(t)) for t in np.linspace(0,pi/2,10)]
    for a,b in zip(p,p[1:]):rod(a,b,.042,gild,5)
frustum(cx,cy,7.06,.19,.44,.42,gild,12);frustum(cx,cy,7.25,.60,.24,.24,stone,10)
dome(cx,cy,7.85,.34,.38,gold,12);rod((cx,cy,8.18),(cx,cy,8.8),.055,gild);rod((cx-.18,cy,8.59),(cx+.18,cy,8.59),.043,gild)
for x in [ix-2.7,ix+2.7]:
    for y in [iy-2.4,iy-.2]:slab(x,y,.26,1.27,1.55,.14,hedge,.16)

# Notre-Dame's west towers, rose, crossing spire and flying buttresses.
group('Notre-Dame de Paris')
nx,ny=32,river(32)
box(nx,ny,.245,7.08,2.22,2.08,stone)
def gable(x,y,z,w,d,h,c):
    p=ring3(shape(x,y,w,d),z);a=(x-w/2,y,z+h);b=(x+w/2,y,z+h)
    face([p[0],p[1],b,a],c);face([p[2],p[3],a,b],c);face([p[1],p[2],b],stone);face([p[3],p[0],a],stone)
gable(nx,ny,2.325,7.23,2.38,1.28,roof)
box(nx+.6,ny,.25,1.38,3.42,2.30,stone);gable(nx+.6,ny,2.55,1.49,3.53,.85,roof)
frustum(nx+3.28,ny,.25,1.85,1.15,1.15,stone,12);frustum(nx+3.28,ny,2.10,.88,1.22,.35,roof,12)
for s in [-1,1]:
    for k in range(8):
        xx=nx-2.4+k*.77
        arch_window(xx,ny+s*1.123,1.27,.37,.77,(1,0),'#506d77')
        box(xx,ny+s*1.57,.25,.18,.28,1.20,trim)
        rod((xx,ny+s*1.56,1.39),(xx,ny+s*1.13,2.06),.091,light,5)
        frustum(xx,ny+s*1.55,1.45,.62,.13,.009,stone,4)
    tx,ty=nx-3.30,ny+s*.79
    box(tx,ty,.25,1.12,1.12,4.02,stone)
    for zz in [1.22,2.18,3.02,4.25]:box(tx,ty,zz,1.24,1.24,.09,light)
    box(tx,ty,4.34,1.03,1.02,.045,dark)
    for dx in [-.49,.49]:
        for dy in [-.49,.49]:
            box(tx+dx,ty+dy,.4,.11,.11,3.98,light);frustum(tx+dx,ty+dy,4.37,.24,.086,.018,light,5)
    for u in [-.19,.19]:
        arch_window(tx-.568,ty+u,3.18,.24,.87,(0,1),dark)
        arch_window(tx+u,ty+s*.568,3.18,.24,.87,(1,0),dark)
for u in [-.62,0,.62]:
    arch_window(nx-3.873,ny+u,.25,.51,.84,(0,1),'#8e806e')
box(nx-3.40,ny,1.38,1.00,1.16,1.60,stone)
def rose(x,y,z,r):
    rod((x+.02,y,z),(x-.025,y,z),r,light,20)
    rod((x-.03,y,z),(x-.05,y,z),r*.80,'#647c88',20)
    for k in range(10):
        a=2*pi*k/10
        rod((x-.064,y,z),(x-.064,y+r*.79*cos(a),z+r*.79*sin(a)),.021,light,4)
rose(nx-3.91,ny,2.18,.45)
frustum(nx+.58,ny,3.32,.46,.38,.25,zinc,8);frustum(nx+.58,ny,3.78,2.45,.25,.038,roof,8);rod((nx+.58,ny,6.20),(nx+.58,ny,6.66),.033,gold,5)
for j in [-1,1]:
    for i in [0,1,2]:
        tree(24.5+i*1.35,river(25)+j*.85,.54)
for xx in [38,39.3]:tree(xx,river(xx),.66)

# Bridges sit on the quays and span real openings. Alexandre III has four gilded pylons.
def bridge(x,width,c='normal',island=False):
    mid=river(x);lo,hi=(bank(x,-1)-.8,bank(x,1)+.8)
    if island:lo,hi=(mid+.8,hi)
    span=hi-lo;middle=(lo+hi)/2;deck=.63 if c=='gold' else .48
    box(x,middle,deck,width,span,.14,'#c9b898')
    for s in [-1,1]:
        xx=x+s*width*.455
        if c=='gold':
            # Shallow single steel arch. Vertical hangers are visible above the river.
            pts=[(xx,lo+span*t,-.20+.77*4*t*(1-t)) for t in np.linspace(0,1,18)]
            for a,b in zip(pts,pts[1:]):rod(a,b,.095,'#6c9790',6)
            for t in np.linspace(.05,.95,15):
                y=lo+span*t;rod((xx,y,-.19+.77*4*t*(1-t)),(xx,y,deck+.01),.037,'#82a59b',4)
        else:
            arches=3 if span>6.2 else 2
            for k in range(arches):
                m=lo+span*(k+.5)/arches;w=span/arches
                pathp=[(xx,m+w*.46*cos(a),-.22+.69*sin(a)) for a in np.linspace(0,pi,11)]
                for a,b in zip(pathp,pathp[1:]):rod(a,b,.11,quay,5)
            for k in range(1,arches):box(x,lo+span*k/arches,-.3,width+.12,.27,.81,quay)
        rod((xx,lo,deck+.52),(xx,hi,deck+.52),.043,bronze if c=='gold' else trim,5)
        for y in np.arange(lo,hi+.01,.42):rod((xx,y,deck+.14),(xx,y,deck+.52),.042,trim,4)
        for t in [.25,.5,.75]:lamp(xx,lo+span*t,1 if c=='gold' else .70)
        for y in [lo+.22,hi-.22]:
            if c=='gold':
                for z,w,h,col in [(.78,.65,.22,trim),(1.0,.47,1.35,stone),(2.35,.60,.17,light)]:box(xx,y,z,w,w,h,col)
                frustum(xx,y,2.5,.16,.27,.21,gold,8)
                rod((xx-.13,y,2.75),(xx+.12,y,2.93),.11,gild,6);rod((xx+.07,y,2.92),(xx+.19,y,3.12),.064,gild,5)
                for s2 in [-1,1]:rod((xx,y,2.87),(xx-.19,y+.19*s2,3.16),.067,gild,5,.016)
    for y in [lo,hi]:box(x,y,.23,width,1.3,deck-.10,pave)
group('Pont Alexandre III');bridge(-10.5,2.04,'gold')
group('Ponts et bateaux')
for x in [-33,5.0,18.0,42.1]:bridge(x,1.17)
bridge(28.25,1.07,island=True)
def boat(x,y,L,s):
    w=L*.23
    pts=[(x-L*.52,y),(x-L*.36,y-w/2),(x+L*.35,y-w/2),(x+L*.52,y),(x+L*.36,y+w/2),(x-L*.36,y+w/2)]
    prism(pts,-.275,-.09,'#735b50',light)
    box(x-.04,y,-.09,L*.67,w*.80,.22,'#f2dbad')
    box(x-.04,y,.13,L*.65,w*.78,.08,s)
    for i in range(6):
        xx=x+L*(-.28+.11*i)
        for ss in [-1,1]:box(xx,y+ss*w*.409,-.05,L*.074,.018,.14,'#4b7580')
    box(x+L*.33,y,-.06,L*.13,w*.58,.22,s)
for x,s,off in [(-22,'#c5ddd4',1.3),(-3,'#86b6b6',-1.7),(12,'#e8d6ad',1.4),(32,'#a8c5c4',-4.4)]:boat(x,river(x)+off,3.25,s)

# Build the surrounding city from street cuts, with tapered junctions and perimeter courtyards.
reserves=[rect(ex,9,13.8,30.0),rect(lx,ly,16.2,9.4),rect(-1.5,-12.3,16.4,9.4),rect(ix,iy,14.0,14.1)]
arc_plaza=ogr.CreateGeometryFromWkt(f'POINT ({ax} {ay})').Buffer(6.28,14);reserves.append(arc_plaza)
roads=[]
def street(p,w):roads.append((p,w))
for x in [-40,-20,-11,2,9,22,31.5,40]:
    street([(x-1.4,-31),(x+1.3,-17),(x-1.5,2),(x+.8,15),(x+4.6,30)],1.12)
for y in [-24,-17,-6,8,16.4,23.6]:
    street([(-49,y+1.3),(-28,y-1),(-10,y+.3),(9,y-1.4),(30,y+1.3),(49,y-.5)],1.10)
street([(-49,-26),(ax,ay),(-11,-12.3),(5,-12.3)],2.05)
street([(ax,ay),(-15,-29)],1.34);street([(ax,ay),(-45,-5)],1.6)
street([(ax,ay),(-20,-4.0)],1.30);street([(-47,16),(-31,22),(-11,7),(5,4),(24,-4),(47,-13)],1.55)
street([(0,-29),(6,-20),(26,-13),(47,-16)],1.48)
street([(-17,29),(-8,12),(-10.5,-5),(-9,-28)],1.63)
for s in [-1,1]:street([(x,bank(x,s)+s*1.02) for x in xs],1.30)
for x in [-33,-10.5,5,18,42.1]:street([(x,bank(x,-1)-2.7),(x,bank(x,1)+2.7)],1.15)
group('Paris · boulevards')
# Road crossings share one surface. The base already supplies the road colour.
group('Squares · fountains')
for px,py,ww,dd in [(32,-19.5,7.0,6.3),(-39,-7,6.9,5.6),(17.9,17.4,6.0,5.0)]:
    reserves.append(rect(px,py,ww+.45,dd+.45))
    slab(px,py,.17,ww,dd,.095,'#d8cdb1',.26)
    for sx in [-1,1]:
        for sy in [-1,1]:
            slab(px+sx*ww*.275,py+sy*dd*.27,.265,ww*.33,dd*.33,.13,hedge,.30)
            tree(px+sx*ww*.345,py+sy*dd*.345,.88)
    frustum(px,py,.27,.12,.80,.82,light,20);frustum(px,py,.39,.025,.68,.68,glass,20)
    frustum(px,py,.415,.32,.14,.09,trim,10);frustum(px,py,.735,.10,.24,.28,light,12)
urban=lands[0].Union(lands[1]).Intersection(rect(0,0,93.4,56.5))
for r in reserves:urban=urban.Difference(r)
for p,w in roads:urban=urban.Difference(line(p).Buffer(w/2,3))
def split(g):
    xmin,xmax,ymin,ymax=g.GetEnvelope()
    if g.GetArea()<.78:return
    if max(xmax-xmin,ymax-ymin)<4.75 and g.GetArea()<14.5:
        yield g;return
    x=(xmax+xmin)/2;y=(ymax+ymin)/2
    if xmax-xmin>ymax-ymin:
        t=x+.13*(xmax-xmin)*rng.uniform(-1,1)
        ranges=[rect((xmin+t)/2-.001,y,t-xmin+.002,ymax-ymin+.1),rect((xmax+t)/2+.001,y,xmax-t+.002,ymax-ymin+.1)]
    else:
        t=y+.13*(ymax-ymin)*rng.uniform(-1,1)
        ranges=[rect(x,(ymin+t)/2-.001,xmax-xmin+.1,t-ymin+.002),rect(x,(ymax+t)/2+.001,xmax-xmin+.1,ymax-t+.002)]
    for r in ranges:
        for q in polys(g.Intersection(r)):yield from split(q)
def building(g):
    p=ccw(points(g.SimplifyPreserveTopology(.065)));A=g.Area()
    if len(p)<3 or A<.90:return
    x,y,_=g.Centroid().GetPoint();h=rng.uniform(1.05,2.03)+(0.20 if A>5 else 0);z=.256
    c=rng.choice(houses);rc=rng.choice(roofs)
    prism(p,z,z+h,c)
    q=[(x+(X-x)*1.025,y+(Y-y)*1.025) for X,Y in p]
    prism(q,z+h-.04,z+h+.072,light)
    # Two roof pitches give a distinct continuous zinc mansard silhouette.
    top=[(x+(X-x)*.74,y+(Y-y)*.74) for X,Y in p]
    rh=.46 if A<5 else .59
    sides(ring3(q,z+h+.072),ring3(top,z+h+rh),rc);triangulate(top,z+h+rh,rc)
    for i,(a,b) in enumerate(zip(p,p[1:]+p[:1])):
        dx,dy=b[0]-a[0],b[1]-a[1];L=math.hypot(dx,dy)
        if L<.73:continue
        dx,dy=dx/L,dy/L;ox,oy=dy,-dx
        n=max(1,round(L/.67))
        for k in range(n):
            t=(k+.5)/n;X=a[0]+(b[0]-a[0])*t;Y=a[1]+(b[1]-a[1])*t
            for fl in [.19,.60]:
                quad_win((X+ox*.012,Y+oy*.012),(dx,dy),z+h*fl,.20 if L<2.4 else .245,h*.235,'#75838a' if (k+i)%3 else '#63737b')
        if L>2.3 and A>4 and (i+int(A))%3==0:
            # An iron balcony with a stone edge underneath the upper-floor windows.
            X=(a[0]+b[0])/2;Y=(a[1]+b[1])/2;angle=math.atan2(dy,dx)
            box(X+ox*.065,Y+oy*.065,z+h*.58,L*.90,.17,.045,light,angle)
            rod((X-dx*L*.44+ox*.14,Y-dy*L*.44+oy*.14,z+h*.71),(X+dx*L*.44+ox*.14,Y+dy*L*.44+oy*.14,z+h*.71),.022,dark,4)
        if L>1.7 and i%2==0:
            X=(a[0]+b[0])/2;Y=(a[1]+b[1])/2
            xx=x+(X-x)*.89;yy=y+(Y-y)*.89
            box(xx,yy,z+h+.17,.28,.26,.32,trim,math.atan2(dy,dx))
            box(xx,yy,z+h+.49,.32,.29,.065,rc,math.atan2(dy,dx))
        if L>1.7 and rng.random()<.16:
            X=(a[0]+b[0])/2;Y=(a[1]+b[1])/2;canopy=rng.choice(['#b77b62','#69938e','#8c9b70'])
            box(X+.12*ox,Y+.12*oy,z+h*.34,L*.70,.33,.10,canopy,math.atan2(dy,dx))
    if A>3:
        X=x+(p[0][0]-x)*.41;Y=y+(p[0][1]-y)*.41
        box(X,Y,z+h+rh,.22,.26,.35,'#cba992');box(X,Y,z+h+rh+.35,.26,.29,.065,trim)
count=0
for k,g in enumerate(polys(urban)):
    if g.Area()<1.2:continue
    group('Rues et îlots '+str(k%5+1))
    for outer in polys(g.Buffer(-.08,2)):
        if outer.Area()<1:continue
        # Whole-block sidewalk surfaces retain their holes around landmarks.
        if outer.GetGeometryCount()==1:prism(points(outer.SimplifyPreserveTopology(.07)),.175,.248,'#bab2a0','#d2c9b7')
        B=outer.Buffer(-.23,2)
        inner=outer.Buffer(-2.05,2)
        if outer.Area()>31 and inner and not inner.IsEmpty():B=B.Difference(inner)
        for m in polys(B):
            for parcel in split(m):
                for f in polys(parcel.Buffer(-.038,1)):
                    if f.GetGeometryCount()==1:building(f);count+=1
# Tree-lined quays and scattered street furniture.
group('Promenades · allées')
for s in [-1,1]:
    for x in np.arange(-45.9,46,2.5):
        if any(abs(x-b)<1.1 for b in [-33,-10.5,5,18,42.1]):continue
        X=float(x);Y=bank(X,s)+s*1.38
        if any(r.Contains(ogr.CreateGeometryFromWkt(f'POINT ({X} {Y})')) for r in reserves):continue
        tree(X,Y,rng.uniform(.61,.83))
        if rng.random()<.34:lamp(X+.65,bank(X,s)+s*.5,.64)
for x in np.arange(-24.5,-10,1.75):
    t=(x-ax)/20;y=ay+t*6.7
    for s in [-1,1]:tree(float(x),y+s*1.11,.72)
group('Les rues · voitures')
for p,w in roads[:22]:
    roadline=line(p)
    for _ in range(2):
        t=rng.uniform(1,roadline.Length()-1);a=roadline.Value(t);b=roadline.Value(t+.1)
        x,y,_=a.GetPoint();u,v,_=b.GetPoint()
        if abs(x)>45.8 or abs(y)>27.4 or abs(y-river(x))<half(x)+1.65:continue
        if any(r.Contains(a) for r in reserves):continue
        angle=math.atan2(v-y,u-x);x-=sin(angle)*.24;y+=cos(angle)*.24
        col=rng.choice(['#a85843','#5d827e','#b59856','#6b7d8a','#c6b5a0'])
        box(x,y,.24,.73,.32,.19,col,angle)
        box(x,y,.43,.39,.27,.14,'#72878a',angle);box(x,y,.57,.33,.25,.04,col,angle)
        for t in [-.23,.22]:
            for side in [-.16,.16]:
                xx=x+cos(angle)*t-sin(angle)*side;yy=y+sin(angle)*t+cos(angle)*side
                box(xx,yy,.22,.13,.06,.13,dark,angle)
# A quiet line of benches in the garden.
for xx in [-7,-4,-1,2,4]:
    for yy in [-10.9,-13.65]:
        box(xx,yy,.36,.56,.17,.08,'#947858');box(xx,yy+.075,.42,.56,.055,.17,'#9d8060')
        for dx in [-.19,.19]:box(xx+dx,yy,.26,.055,.16,.12,dark)
# Discreet brass measuring marks on the plinth's front edge.
group('Socle · repères')
for i in range(-44,45):
    if abs(i)<8:continue
    box(i,29.303,-1.97,.027,.022,.19 if i%5==0 else .085,'#bca072')
box(0,29.375,-2.38,14.7,.17,1.36,'#b19b71')
box(0,29.474,-2.32,14.52,.07,1.24,'#375452')
for x in [-7.05,7.05]:
    for z in [-2.10,-1.32]:rod((x,29.50,z),(x,29.55,z),.073,'#cfae71',8)
for x in [-45.6,45.6]:
    for y in [-27.0,27.0]:frustum(x,y,.165,.04,.14,.14,'#b29a69',10)

places=[
    ('eiffel','埃菲尔铁塔','Tour Eiffel','战神广场','四组桁架从广场向内收拢，两层观景台横跨塔腿，细长的塔尖从中央升起。',ex,ey,11.45,37),
    ('arc','凯旋门','Arc de Triomphe','戴高乐广场','从环岛望去，可以穿过中央拱洞看到对面的街道。转到侧面，还能看见横向的小拱门。',ax,ay,2.5,19),
    ('louvre','卢浮宫','Musée du Louvre','拿破仑庭院','沿杜乐丽花园的中轴线望去，玻璃金字塔坐落在宫殿两翼之间。',lx-.65,ly,1.8,27),
    ('notre-dame','巴黎圣母院','Notre-Dame de Paris','西岱岛','西立面的双塔、玫瑰窗与交叉部尖塔共同构成教堂的轮廓，飞扶壁沿中殿两侧排开。',nx,ny,2.2,20),
    ('invalides','荣军院','Hôtel des Invalides','左岸','金色穹顶立在柱鼓之上。转过庭院，能看见环绕圆顶的肋线与顶端的小灯亭。',ix,iy+1.55,3,24),
    ('alexandre','亚历山大三世桥','Pont Alexandre III','塞纳河','桥面两端各立着一对饰金桥柱。沿河面望去，可以看清低矮的钢拱与桥上的灯列。',-10.5,river(-10.5),1.3,19),
]
metadata=[dict(id=i,name=n,fr=f,area=a,description=d,target=[round(x,3),round(z,3),round(y,3)],span=s) for i,n,f,a,d,x,y,z,s in places]
(OUT/'places.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
def export():
    doc=dict(asset=dict(version='2.0',generator='Unread City | Paris miniature'),scene=0,scenes=[dict(nodes=[])],nodes=[],meshes=[],buffers=[],bufferViews=[],accessors=[],materials=[dict(name='Architectural colours',doubleSided=True,pbrMetallicRoughness=dict(metallicFactor=0,roughnessFactor=.90))])
    binary=bytearray()
    def acc(arr,typ,n,kind):
        while len(binary)%4:binary.append(0)
        off=len(binary);raw=arr.tobytes();binary.extend(raw);v=len(doc['bufferViews'])
        doc['bufferViews'].append(dict(buffer=0,byteOffset=off,byteLength=len(raw),target=34963 if typ=='SCALAR' else 34962))
        a=dict(bufferView=v,componentType=kind,count=len(arr),type=typ)
        if n=='pos':a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
        if n=='color':a['normalized']=True
        doc['accessors'].append(a);return len(doc['accessors'])-1
    total=0
    for name,(p,n,c,idx,_) in groups.items():
        if not idx:continue
        idx_type=5123 if len(p)<=65535 else 5125
        attrs=dict(POSITION=acc(np.array(p,dtype='<f4'),'VEC3','pos',5126),NORMAL=acc(np.array(n,dtype='<f4'),'VEC3','norm',5126),COLOR_0=acc(np.array(c,dtype='u1'),'VEC4','color',5121))
        indices=acc(np.array(idx,dtype='<u2' if idx_type==5123 else '<u4'),'SCALAR','idx',idx_type)
        k=len(doc['nodes']);doc['nodes'].append(dict(name=name,mesh=k));doc['scenes'][0]['nodes'].append(k)
        doc['meshes'].append(dict(name=name,primitives=[dict(attributes=attrs,indices=indices,material=0)]));total+=len(idx)//3
    for pl in metadata:
        k=len(doc['nodes']);doc['nodes'].append(dict(name='poi_'+pl['id'],translation=pl['target'],extras={'placeId':pl['id']}));doc['scenes'][0]['nodes'].append(k)
    # Embedded enamel nameplate lettering stays readable in standard glTF viewers.
    pim=Image.new('RGB',(1024,96),'#375452');draw=ImageDraw.Draw(pim)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',65)
    draw.text((512,46),'P  A  R  I  S',anchor='mm',font=font,fill='#ecddb9',stroke_width=0)
    payload=io.BytesIO();pim.save(payload,format='PNG');raw=payload.getvalue()
    while len(binary)%4:binary.append(0)
    view=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(raw)));binary.extend(raw)
    doc['images']=[dict(bufferView=view,mimeType='image/png')];doc['textures']=[dict(source=0)]
    doc['materials'].append(dict(name='Enamel plaque',pbrMetallicRoughness=dict(baseColorTexture=dict(index=0),metallicFactor=0,roughnessFactor=.82)))
    pa=acc(np.array([[-6.65,-1.16,29.512],[6.65,-1.16,29.512],[6.65,-2.22,29.512],[-6.65,-2.22,29.512]],dtype='<f4'),'VEC3','pos',5126)
    uv=acc(np.array([[0,0],[1,0],[1,1],[0,1]],dtype='<f4'),'VEC2','uv',5126)
    ix=acc(np.array([0,2,1,0,3,2],dtype='<u2'),'SCALAR','idx',5123)
    mesh=len(doc['meshes']);doc['meshes'].append(dict(primitives=[dict(attributes=dict(POSITION=pa,TEXCOORD_0=uv),indices=ix,material=1)]))
    doc['scenes'][0]['nodes'].append(len(doc['nodes']));doc['nodes'].append(dict(mesh=mesh,name='Paris · cartouche'))
    while len(binary)%4:binary.append(0)
    doc['buffers']=[dict(byteLength=len(binary))]
    j=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    out=struct.pack('<4sII',b'glTF',2,28+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    (OUT/'sandbox.glb').write_bytes(out)
    (OUT/'sandbox.glb.gz.bin').write_bytes(gzip.compress(out,compresslevel=9,mtime=0))
    print(f'{count} building parcels; {len(doc["meshes"])} meshes; {total:,} triangles; {len(out):,} bytes')
if __name__=='__main__':export()
