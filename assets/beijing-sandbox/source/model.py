import math
import random
import json
import struct
from array import array
from pathlib import Path
from data import LOC, ATLAS, MINX, MAXX, MINZ, MAXZ

R=random.Random(93)
pi=math.pi
sin,cos,sqrt=math.sin,math.cos,math.sqrt
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'output'
POSITION=array('f')
NORMAL=array('f')
COLOR=array('B')
GLOW=array('f')
INDICES=array('I')
PALETTE={}
LINEAR={}
def rgb(hexcolor):
    if hexcolor not in PALETTE:
        s=hexcolor.lstrip('#')
        if len(s) != 6: raise ValueError(s)
        PALETTE[hexcolor]=tuple(int(s[i:i+2],16) for i in (0,2,4))+(255,)
    return PALETTE[hexcolor]

def face(v,color,flip=False,normal=None,glow=0):
    if flip: v=v[::-1]
    if normal is None:
        a,b,c=v[:3]
        p=[b[i]-a[i] for i in range(3)]
        q=[c[i]-a[i] for i in range(3)]
        no=(p[1]*q[2]-p[2]*q[1], p[2]*q[0]-p[0]*q[2], p[0]*q[1]-p[1]*q[0])
        d=sqrt(sum(x*x for x in no))
        if d<1e-7: return
        normal=tuple(x/d for x in no)
    index=len(POSITION)//3
    if color not in LINEAR:
        LINEAR[color]=tuple(round(255*((v/255+.055)/1.055)**2.4) if v>10 else round(v/12.92) for v in rgb(color)[:3])+(255,)
    col=LINEAR[color]
    for item in v:
        POSITION.extend(item); NORMAL.extend(normal); COLOR.extend(col); GLOW.append(glow)
    for i in range(1,len(v)-1): INDICES.extend((index,index+i,index+i+1))

def solid(layers,colors,top=None,bottom=None):
    for layer,(lower,upper) in enumerate(zip(layers,layers[1:])):
        choices=colors[layer] if isinstance(colors,(list,tuple)) and len(colors)==len(layers)-1 else colors
        for i in range(len(lower)):
            j=(i+1)%len(lower)
            face([lower[i],upper[i],upper[j],lower[j]], choices[i%len(choices)] if not isinstance(choices,str) else choices)
    if top: face(layers[-1],top,flip=True)
    if bottom: face(layers[0],bottom)

def rect(cx,cz,w,d,y,rot=0,chamfer=0):
    x,z=w/2,d/2
    if chamfer:
        p=[(-x+chamfer,-z),(x-chamfer,-z),(x,-z+chamfer),(x,z-chamfer),
            (x-chamfer,z),(-x+chamfer,z),(-x,z-chamfer),(-x,-z+chamfer)]
    else: p=[(-x,-z),(x,-z),(x,z),(-x,z)]
    return [(cx+a*cos(rot)-b*sin(rot),y,cz+a*sin(rot)+b*cos(rot)) for a,b in p]

def box(x,z,w,d,y,h,color,top=None,rot=0,chamfer=0,bottom=None):
    solid([rect(x,z,w,d,y,rot,chamfer),rect(x,z,w,d,y+h,rot,chamfer)],color,top or (color if isinstance(color,str) else color[1]),bottom)

def oval(x,z,rx,rz,y,n=20,rot=0):
    return [(x+rx*cos(t)*cos(rot)-rz*sin(t)*sin(rot),y,z+rx*cos(t)*sin(rot)+rz*sin(t)*cos(rot))
            for t in (i*2*pi/n for i in range(n))]

def disc(x,z,rx,rz,y,h,col,top=None,n=20,rot=0):
    solid([oval(x,z,rx,rz,y,n,rot),oval(x,z,rx,rz,y+h,n,rot)],col,top or col)

def tube(a,b,r,col,n=5):
    d=tuple(b[i]-a[i] for i in range(3)); L=sqrt(sum(i*i for i in d))
    if L<1e-6: return
    u=tuple(i/L for i in d)
    v=(u[2],0,-u[0])
    V=sqrt(sum(i*i for i in v))
    v=tuple(i/V for i in v) if V>.001 else (1,0,0)
    w=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
    def ring(p):
        return [tuple(p[j]+r*(v[j]*cos(t)+w[j]*sin(t)) for j in range(3)) for t in (2*pi*i/n for i in range(n))]
    p,q=ring(a),ring(b)
    for i in range(n):
        j=(i+1)%n
        face([p[i],p[j],q[j],q[i]],col)
    face(q,col); face(p,col,flip=True)

def line(points,width,y,col,glow=0):
    for (x,z),(xx,zz) in zip(points,points[1:]):
        length=math.hypot(xx-x,zz-z)
        if length<.001:continue
        ox,oz=-(zz-z)*width/(2*length),(xx-x)*width/(2*length)
        face([(x+ox,y,z+oz),(xx+ox,y,zz+oz),(xx-ox,y,zz-oz),(x-ox,y,z-oz)],col,normal=(0,1,0),glow=glow)

def flat(x,z,w,d,y,col,rot=0,glow=0):
    face(rect(x,z,w,d,y,rot),col,flip=True,glow=glow)

def mix(a,b,t):
    ca,cb=rgb(a),rgb(b)
    return ''.join(f'{round(x+(y-x)*t):02x}' for x,y in zip(ca[:3],cb[:3]))

def dist_seg(x,z,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
    return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)

def dist_line(x,z,p):
    return min(dist_seg(x,z,a,b) for a,b in zip(p,p[1:]))

def smooth(p,steps=3,closed=False):
    seq=p if closed else [p[0],*p,p[-1]]
    out=[]
    n=len(seq)
    for i in range(n if closed else n-3):
        a,b,c,d=[seq[(i+j-(1 if closed else 0))%n] for j in range(4)]
        for j in range(steps):
            t=j/steps
            out.append(tuple(.5*((2*k1)+(-k0+k2)*t+(2*k0-5*k1+4*k2-k3)*t*t+(-k0+3*k1-3*k2+k3)*t*t*t)
                for k0,k1,k2,k3 in zip(a,b,c,d)))
    if not closed: out.append(p[-1])
    return out

def inside(x,z,poly):
    test=False
    a=poly[-1]
    for b in poly:
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]: test=not test
        a=b
    return test

def polygon(p,y,col):
    # Ear clipping keeps curved lake outlines concave.
    if sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))<0: p=p[::-1]
    def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    ids=list(range(len(p)))
    while len(ids)>3:
        for j,b in enumerate(ids):
            a,c=ids[j-1],ids[(j+1)%len(ids)]
            if cross(p[a],p[b],p[c]) < 1e-7: continue
            if any(min(cross(p[a],p[b],p[k]),cross(p[b],p[c],p[k]),cross(p[c],p[a],p[k]))>=-1e-7 for k in ids if k not in (a,b,c)): continue
            face([(p[k][0],y,p[k][1]) for k in (a,c,b)],col)
            ids.pop(j)
            break
        else: raise ValueError('self-crossing polygon')
    face([(p[k][0],y,p[k][1]) for k in ids[::-1]],col)

def scoped(slug,fn):
    L=LOC[slug]
    fn(L['x'],L['z'])

def terrain(x,z):
    profile=[
        (-113,-60,18,35,7.5),(-116,-18,11,26,5.9),(-112,-86,13,13,5.4),
        (-110,13,12,23,3.7),(-101,-87,10,6,2.0)
    ]
    west=max(0,min(1,(-x-93)/13))
    e=sum(h*math.exp(-((x-u)/wx)**2-((z-v)/wz)**2) for u,v,wx,wz,h in profile)
    e+=west*(.75*sin(x*.8+z*.29)+.55*cos(z*.46-x*.31)+.35*sin(z*.76))
    # Leave the Kunming Lake basin and the Summer Palace grounds level.
    garden=max(0,min(1,(x+112)/5))*max(0,min(1,(z+84)/5,( -48-z)/6))
    return max(0,e*west*(1-garden))

# Base layers and gridded sculpted ground.
cx,cz=(MINX+MAXX)/2,(MINZ+MAXZ)/2
W,D=MAXX-MINX,MAXZ-MINZ
solid([rect(cx,cz,W+.3,D+.3,-6.9,chamfer=2.6),rect(cx,cz,W+1.8,D+1.8,-5.8,chamfer=2.6),
       rect(cx,cz,W+1.8,D+1.8,-5.4,chamfer=2.6),rect(cx,cz,W+.6,D+.6,-4.9,chamfer=2.3)],
       ['4e4940','8d7350','766044'], '9b8864',bottom='48453c')
box(cx,cz,W,D,-4.9,4.89,['9e9071','c0a988','a28c68','c3ad88'],'d5cbae',bottom='9d8464')
for z in range(MINZ,MAXZ,3):
    for x in range(MINX,MAXX,3):
        xx,zz=min(x+3,MAXX), min(z+3,MAXZ)
        coords=[(x,z),(xx,z),(xx,zz),(x,zz)]
        pts=[(a,terrain(a,b),b) for a,b in coords]
        elev=sum(p[1] for p in pts)/4
        shade=max(0,min(1,(elev-.02)/3.2+max(0,(-x-80)/37)*.42))
        color=mix('cecab0','76845a',shade*.9+R.random()*.08)
        face([pts[0],pts[2],pts[1]],color)
        face([pts[0],pts[3],pts[2]],color)
for wall in ([[MINX,z] for z in range(MINZ,MAXZ+1)],[[x,MAXZ] for x in range(MINX,MAXX+1)],[[x,MINZ] for x in range(MAXX,MINX-1,-1)]):
    for (x,z),(u,v) in zip(wall,wall[1:]):
        a,b=terrain(x,z),terrain(u,v)
        if a+b>.01: face([(x,-.025,z),(x,a,z),(u,b,v),(u,-.025,v)],'a99c78')

LAKES=[
 ([(-28,-22),(-22,-24),(-16,-19),(-14,-16),(-10,-15),(-9,-12),(-12,-10),(-16,-11),(-20,-15),(-24,-15),(-29,-18)],'64a1a1'),
 ([(-14,-6),(-11,-5),(-10,-2),(-8,1),(-9,4),(-12,5),(-15,2),(-16,-2)],'6ca8a7'),
 ([(-16,5),(-13,6),(-14,10),(-12,14),(-14,19),(-14,23),(-17,25),(-21,22),(-21,16),(-18,12),(-19,8)],'6ca6a3'),
 ([(-106,-71),(-101,-75),(-95,-72),(-91,-69),(-88,-62),(-89,-55),(-94,-52),(-100,-54),(-104,-58),(-107,-64)],'68a5a4'),
 ([(-82,-90),(-79,-89),(-79,-86.1),(-82,-84.7),(-86,-85.2),(-88,-87.2),(-86,-89.4)],'689a98'),
 ([(-23,-90),(-19,-87),(-19,-84),(-15,-83),(-14,-79),(-17,-77),(-24,-78),(-26,-84)],'71aaa5'),
 ([(-81,13),(-78,11),(-74,11.6),(-72,12.8),(-67,12.1),(-65,13.9),(-67,16.8),(-72,16.3),(-74,17.2),(-79,16.7)],'639fa3'),
 ([(-88,-68),(-87,-71.2),(-84,-72),(-82,-71),(-78,-70.4),(-77,-68.8),(-80.8,-67.5),(-84.5,-68.3)],'619d9e'),
 ([(-15,28),(-11,28),(-11,33),(-17,33),(-18,31),(-17,29)],'80ada8')
]
LAKES=[(smooth(v,4,True),c) for v,c in LAKES]

PARKS=[
 (-14,-14,36,28),(-11,2,16,19),(-17,15,15,28),(-99,-66,29,32),(-77,-83,18,15),
 (-15,-85,36,16),(-6,-68,23,16),(10,53,20,18),(-1,64,11,7),
 (-3,6,9.4,7.4),(-.2,13,16,17),(28,-51,16,12),(62,-10,15,25),(30,54,16,15),(-74.8,14.2,20.5,12.7),
 (-81.0,-66.6,18,13),(-63.0,-80.6,15,15),(-24.3,-95.0,14,11),(62,-25,23,13)]
for a,b,w,d in PARKS:
    face(rect(a,b,w,d,.025,0,min(w,d)*.19),'9aa87b',flip=True)

# Secondary tree rows and allotment paths leave the water and landmarks clear.
for idx,(p,col) in enumerate(LAKES):
    mx=sum(x for x,_ in p)/len(p); mz=sum(z for _,z in p)/len(p)
    shore=[(mx+(x-mx)*1.07,mz+(z-mz)*1.07) for x,z in p]
    polygon(shore,.105,'b0ae83')
    polygon(p,.135,col)
    for _ in range(11 if idx<5 else 6):
        x=R.uniform(min(v[0] for v in p),max(v[0] for v in p))
        z=R.uniform(min(v[1] for v in p),max(v[1] for v in p))
        d=R.uniform(.4,2.5)
        if inside(x,z,p) and inside(x+d,z,p) and inside(x+d*.5,z,p):
            line([(x,z),(x+d,z-.07)],.045,.141,'a6c7b7')
    line(shore+[shore[0]],.065,.139,'bdc096')

canals=[
 smooth([(-111,65),(-83,67),(-57,71),(-35,70),(-13,72),(0,70),(20,69),(36,70),(58,74),(79,76)],5),
 smooth([(32,-31),(41,-28),(45,-24),(54,-22.4),(62,-20),(75,-19),(90,-15)],5),
]
for points in canals:
    line(points,1.3,.145,'aebc99')
    line(points,.86,.151,'6ea3a1')
    line([(x,z+.17) for x,z in points],.05,.155,'95b8af')

# Schematic district grid and arterial roads.
XROADS=[-88,-78,-68,-58,-48,-38,-29,-20,-11,-5,2.5,10,18,26,34,43,51,60,70,80]
ZROADS=[-94,-86,-77,-69,-59,-49,-38,-28,-20,-12,-4,4,12,21,29,38,47,56,65,74,83]
def inpark(x,z,pad=0):
    return any(abs(x-a)<w*.5+pad and abs(z-b)<d*.5+pad for a,b,w,d in PARKS) or (x<-87 and z<-47)
def inwater(x,z):
    return any(inside(x,z,p) for p,_ in LAKES) or any(dist_line(x,z,p)<.69 for p in canals)
# These parcels reserve room for secondary lanes and internal courtyards.
HUTONG_ZONES = [(-.3,12.7,-15.1,1.1),(5.1,17.2,-23.4,-16.1),(-26.1,-17.0,0.2,7.0),
                (-25.2,-6.8,36.2,47.8),(3.8,9.9,36.7,44.8)]
HOUSING_ZONES = [(9.0,30.1,71.4,90.1),(33,49,-36.4,-27.3),(-42,-29,33,45),(-62,-49,40,52)]
def in_zones(x,z,zones):
    return any(west < x < east and north < z < south for west,east,north,south in zones)
def offroad(x,z):
    return in_zones(x,z,HUTONG_ZONES+HOUSING_ZONES) or inpark(x,z) or inwater(x,z) or (-26<x<4 and 27<z<34) or any(
        abs(x-L['x']) < RX and abs(z-L['z']) < RZ for slug,RX,RZ in EXCLUDE for L in [LOC[slug]])
EXCLUDE=[
 ('ncp',4.8,4),('bell-drum',3.9,5.9),('qianmen',3.4,6.8),('beijing-south',8,5.4),
 ('beijing-station',6.9,4.3),('cbd',6.6,7.0),('sanlitun',5.0,5.4),('wangfujing',4.0,5.5),
 ('cctv-headquarters',6.4,6.3),('china-zun',2.5,3.5),('olympic-tower',4.5,4.8),
 ('central-tv-tower',4.4,4.1),('798-art-zone',7.1,5.3),('beijing-west',9.4,6.3)]
for x in XROADS:
    for z in range(MINZ+2,MAXZ-2):
        if not offroad(x,z+.5):
            line([(x,z),(x,z+1)], .54 if x%2==0 else .65,.037,'bcb9a4')
for z in ZROADS:
    for x in range(MINX+11,MAXX-1):
        if not offroad(x+.5,z):
            line([(x,z),(x+1,z)],.58,.04,'bcb9a4')

roads=[
 ([(-116,28),(-80,28),(-53,28),(-30,28),(-11,27),(-2,26),(13,27),(34,26),(53,24),(90,24)],1.65,'969d94'),
 ([(-51,-28),(-33,-29),(-15,-29),(6,-28),(20,-27),(28,-24),(32,-17),(32,41),(30,48),(25,53),(15,56),(-25,57),(-45,55),(-53,49),(-56,38),(-56,-17),(-54,-24),(-51,-28)],1.02,'a3a698'),
 ([(-78,-48),(-66,-54),(-23,-55),(14,-55),(35,-54),(47,-50),(52,-40),(52,52),(49,63),(39,70),(-54,74),(-68,72),(-77,64),(-81,56),(-82,-30),(-80,-43),(-78,-48)],1.42,'999e94'),
 ([(-109,-79),(-100,-77),(-91,-72),(-82,-74),(-71,-72),(-62,-70),(-42,-69),(-23,-65),(-11,-61),(-5,-61),(14,-62),(45,-64),(79,-64)],1.05,'a5a99a'),
 ([(-22,-40),(-12,-41),(-3,-42),(4,-41),(16,-42),(28,-42),(44,-43),(67,-43),(90,-45)],.72,'a7aa9a'),
 ([(-91,11),(-77,10),(-65,8),(-55,4),(-40,0),(-26,-3),(-4,-5),(21,-6),(42,-7),(69,-7),(90,-6)],.89,'a4a99a'),
 ([(-8,-104),(-8,-72),(-8,-65),(-4,-57),(-2,-52),(-2.5,-41),(-2.7,-30),(-2.8,-19),(-2.9,-12)],1.03,'9eaa9a'),
 ([(-1,36),(-1.8,42),(-1.6,47),(-1.3,55),(-1.2,67)],1.1,'b4A98b'),
 ([(-100,-94),(-81,-93),(-64,-91),(-46,-91),(-34,-90),(-31,-87),(-17,-88),(-7,-94),(14,-97),(55,-94),(86,-91)],1.02,'969f93'),
 ([(59,-72),(65,-65),(73,-63),(83,-63),(88,-58),(88,-47),(83,-41),(82,-27),(90,-22)],1.01,'9ea599'),
 ([(-85,35),(-73,34),(-65,33),(-54,36),(-39,36),(-32,33)],.92,'a0a295'),
 ([(4,71),(12,70.5),(21,70.8),(32,71.1),(38,72.4)],.85,'a3a298')
]
roads=[(smooth(p,6),wide,col) for p,wide,col in roads]
for idx,(p,w,col) in enumerate(roads):
    line(p,w+.4,.163,'dbd2ba')
    line(p,w,.167,col)
    for j in range(0,len(p)-1,2):
        line(p[j:j+2],.045,.173,'dad0b7')
        if j%6==0:
            for sign in (-1,1):
                x,z=p[j]
                flat(x,z+sign*w*.54,.115,.115,.181,'e5bb79',glow=.78)

def tree(x,z,size=1,palette=0,y=None):
    y=terrain(x,z) if y is None else y
    s=size
    trunk='8e7854'
    box(x,z,.12*s,.12*s,y,.55*s,trunk)
    c=[('748658','8e9b69','a0a674'),('59784e','728958','8d9c65'),
       ('849051','a3aa6b','b5b478'),('8c8156','a79464','bfaa76')][palette]
    n=6
    solid([oval(x,z,.28*s,.28*s,y+.35*s,n,.4),oval(x,z,.52*s,.47*s,y+.72*s,n,.4),
        oval(x-.09*s,z-.10*s,.33*s,.31*s,y+1.12*s,n,.4),
        oval(x-.10*s,z-.12*s,.055*s,.055*s,y+1.44*s,n,.4)],c,c[-1])

def pine(x,z,s,y=.09):
    box(x,z,.17*s,.17*s,y,.55*s,'826b4c')
    for a in range(3):
        xx=x+a*.055*s
        r=(.56-a*.12)*s
        solid([oval(xx,z,r,r,y+(.30+a*.30)*s,6,.5),oval(xx-.07*s,z-.06*s,.04*s,.04*s,y+(1.16+a*.28)*s,6,.5)],
              ['617b52','748e5c','8d9d6b'],'8a9a64')

def shadow(x,z,w,d,h,y=.188):
    flat(x+min(h,5)*.29,z+min(h,5)*.25,w+.15,d+.15,y,'aaa795')

def near_arterial(x,z,pad):
    return any(dist_line(x,z,p)<w*.5+pad for p,w,_ in roads)

BLOCKS=[
 ('a79b84','c9bea6'),('a39b8d','beb7a3'),('ada79a','d3cbb4'),('a09f94','bebcb1'),
 ('b2a38c','cebea0'),('aeb0a1','cbcbbc'),('a99481','c7ad92'),('b0a99a','d7cfc1'),
 ('8b9692','b0b5a8'),('96988d','bcbaa4'),('b1a897','ded0b6')
]

def facade_panel(x,z,w,y,h,color,glow=0):
    face([(x-w/2,y,z),(x+w/2,y,z),(x+w/2,y+h,z),(x-w/2,y+h,z)],color,
         normal=(0,0,1),glow=glow)

def residential(x,z,w,d,floors,style,detail,rng):
    brick,roof,trim,glass=[
        ('af8772','b6a697','d5baa0','677f82'),
        ('c7ad88','bfb7a5','d8c8a9','6d8586'),
        ('8d9791','999b93','c5bbb0','58767d'),
    ][style]
    base=.21
    storey=.55 if detail else .43
    h=floors*storey+.24
    box(x,z,w+.12,d+.11,base,.13,'9f9882','b6ac91')
    if style==2 and detail:
        box(x,z,w,d,base+.13,h,brick,roof,chamfer=.15)
        box(x-w*.22,z+d*.25,w*.31,d*.44,base+.14,h*.91,'a6a49a','b6b5a4')
        box(x+w*.19,z-d*.26,w*.24,d*.40,base+.13,h*.74,'9ba59d','a4ad9f')
    else:
        box(x,z,w,d,base+.13,h,brick,roof)
    if detail and style!=2:
        facade_panel(x,z+d*.5+.007,w*.98,base+.14,.35,mix(brick,'867260',.46))
        facade_panel(x,z+d*.5+.008,w*.99,h+base-.17,.105,trim)
        for sign in (-1,1):
            facade_panel(x+sign*w*.388,z+d*.5+.008,.125,base+.46,h-.45,mix(brick,trim,.65))
    top=base+.13+h
    # Coping and stair headhouses make roofs readable at city scale.
    box(x,z,w+.08,d+.08,top-.04,.105,trim,roof)
    box(x-w*.23,z-d*.17,w*.21,d*.27,top+.07,.28,brick,'bfc2ae')
    if detail:
        box(x+w*.26,z+d*.17,w*.18,d*.20,top+.07,.14,'97a4a0','abb9b4')
        flat(x,z,w*.36,d*.38,top+.067,'a8a28f')
    bays=max(2,min(9,round(w/(.48 if detail else .68))))
    ledges=(style!=0 or detail) and w>1.8
    for level in range(floors):
        y=base+.31+level*storey
        if ledges and level>0 and (detail or level%2==0):
            # Two recessed stacks of enclosed balconies.
            count=2 if w>2.8 else 1
            for b in range(count):
                u=x+(b-(count-1)/2)*w*.49
                ww=min(.89,w*.30)
                box(u,z+d*.5+.075,ww,.25,y-.032,.067,trim,trim)
                facade_panel(u,z+d*.5+.203,ww*.84,y+.037,.197 if style==0 else .271,glass,.54 if rng.random()<.48 else 0)
                if detail:
                    facade_panel(u,z+d*.5+.205,.039,y+.035,.197 if style==0 else .271,trim)
                    if style==1:
                        facade_panel(u,z+d*.5+.208,ww*.91,y+.205,.036,trim)
        for b in range(bays):
            u=x+(b+.5-bays/2)*w/bays
            if detail and level>0 and b%3==1:
                continue
            ww=min(.31,w/bays*.61)
            facade_panel(u,z+d*.5+.009,ww,y+.035,.195,glass,.52 if rng.random()<.23 else 0)
            facade_panel(u,z-d*.5-.009,ww,y+.041,.174,glass,.43 if rng.random()<.18 else 0)
            if detail and b%2==0:
                facade_panel(u,z+d*.5+.012,ww+.061,y+.017,.039,trim)
        if detail and level%2==0:
            for sign in (-1,1):
                xx=x+sign*(w/2+.009)
                for off in (-.27,.20):
                    zz=z+off*d
                    face([(xx,y+.03,zz-.14),(xx,y+.03,zz+.14),(xx,y+.24,zz+.14),(xx,y+.24,zz-.14)],
                         glass,normal=(sign,0,0),glow=.32 if rng.random()<.31 else 0)
    for dx in ([-w*.25,w*.25] if w>2.6 else [0]):
        facade_panel(x+dx,z+d*.5+.011,.28,base+.14,.36,'605c51',.16)
        box(x+dx,z+d*.5+.106,.43,.23,base+.49,.057,trim,trim)
        if detail:
            box(x+dx,z+d*.5+.11,.43,.22,base,.08,'a99f8d','c4b797')
            for f in range(1,floors):
                facade_panel(x+dx,z+d*.5+.016,.16,base+.37+f*storey,.235,glass,.30 if f%3==1 else 0)

def sloped_house(x,z,w,d,y,h,wall,tile,turn=False,detail=False):
    # Orientation follows the enclosing side of the courtyard.
    if turn: w,d=d,w
    orient=pi/2 if turn else 0
    box(x,z,w,d,y,.13+h,wall,mix(wall,'aba899',.34),orient)
    cornice=y+.13+h
    ridge=cornice+.33*min(1.2,d/.56)
    def pts(a,b,H):
        return rect(x,z,a,b,H,orient)
    lower=pts(w+.15,d+.16,cornice)
    shoulder=pts(w+.06,d*.65,cornice+(ridge-cornice)*.35)
    upper=pts(w-.035,.03,ridge)
    solid([lower,shoulder,upper],[[tile,mix(tile,'595f5f',.43),mix(tile,'a0a399',.32),tile]]*2,tile)
    if not detail:return
    box(x,z,w+.02,.031,ridge,.023,mix(tile,'b5ae97',.44),rot=orient)
    for idx in range(1,max(2,round(w/.15))):
        share=idx/max(2,round(w/.15))
        for k,j in ((0,1),(3,2)):
            path=[tuple(a[k][dim]*(1-share)+a[j][dim]*share for dim in range(3)) for a in [lower,shoulder,upper]]
            c='858984' if idx%3==0 else '727874'
            for start,end in zip(path,path[1:]):
                a,b,g=start
                u,v,f=end
                off=.011
                if turn:
                    face([(a,b+.016,g-off),(u,v+.016,f-off),(u,v+.016,f+off),(a,b+.016,g+off)],c)
                else:
                    face([(a-off,b+.016,g),(u-off,v+.016,f),(u+off,v+.016,f),(a+off,b+.016,g)],c)
    if not turn:
        for sign in [-1,1]:
            for k in range(max(1, round(w/.54))):
                count=max(1,round(w/.54))
                u=x+(k-(count-1)/2)*min(.48,w/count)
                facade_panel(u,z+sign*(d/2+.008),.22,y+.23,.19,'594f43',.40 if k%2==0 else 0)
                facade_panel(u,z+sign*(d/2+.009),.25,y+.2,.032,'aa9b83')

def courtyard(x,z,w,d,rng,detail=False,gates=True):
    brick,tile=rng.choice([('9f9888','777d77'),('a89d8a','787a72'),('9d9b8e','6e7472'),
                           ('b0a18e','656c6d'),('989788','86877b')])
    y=.205
    flat(x,z,w,d,y,'aca18b')
    flat(x,z+.055,w*.89,d*.92,y+.012,'c4b392')
    N=min(rng.uniform(.41,.54),d*.21)
    S=min(.39,d*.16)
    E=min(rng.uniform(.35,.48),w*.20)
    W=E
    sloped_house(x,z-d/2+N*.66,w*rng.uniform(.79,.94),N,y,rng.uniform(.32,.46),brick,tile,detail=detail)
    sloped_house(x+w/2-E*.64,z+.045,E,d*.55,y,.28,brick,tile,True)
    if w>1.1:
        if rng.random()<.82:
            sloped_house(x-w/2+W*.64,z+.02,W,d*rng.uniform(.43,.62),y,.30,brick,tile,True)
        else:
            box(x-w/2+.045,z+.03,.09,d*.72,y,.38,brick,'86877a')
    gate_w=min(.38,w*.24)
    gate_x=x+w*rng.uniform(.12,.28)
    front=z+d/2-.033
    if gates and w>=1.15:
        more=gate_x-gate_w/2-(x-w/2)
        less=x+w/2-(gate_x+gate_w/2)
        for sign,segment in [(-1,more),(1,less)]:
            cx=gate_x+sign*(gate_w+segment)*.5
            box(cx,front,segment,.087,y,.39,brick,'8d887a')
            box(cx,front,segment+.02,.15,y+.39,.036,'676d68','777972')
        sloped_house(gate_x,front,gate_w+.21,.30,y+.28,.13,brick,tile,detail=detail)
        facade_panel(gate_x,front+.053,gate_w*.84,y+.034,.37,rng.choice(['795142','91604c','64594e']))
        facade_panel(gate_x,front+.055,.024,y+.04,.36,'58483e')
        flat(gate_x,front+.125,gate_w+.13,.29,y+.02,'b6ad94')
    else:
        sloped_house(x,front-S*.54,w*.87,S,y,.24,brick,tile)
    flat(x,z,w*.28,d*.57,y+.025,'b7ad92')
    if detail and rng.random()<.67:
        tx=x-w*.15; tz=z+d*.11
        box(tx,tz,.31,.34,y,.046,'a79572','8d8b65')
        tree(tx,tz,rng.uniform(.38,.64),rng.randrange(3),y+.05)
    if detail and w>=1.4 and rng.random()<.68:
        flat(x+w*.19,z-d*.14,.31,.30,y+.027,'a1906d')
        box(x+w*.19,z-d*.14,.12,.12,y+.04,.08,'948977','bbb19b')
    if detail and w>=1.52 and rng.random()<.46:
        flat(x-w*.13,z-d*.14,.28,.35,y+.028,'b8a485')
        for j in range(3):
            flat(x-w*.13,z-d*.14+(j-1)*.11,.32,.012,y+.03,'a39479')

# Low courtyard blocks in the center and mid-rise clusters toward the east.
for xi,(lx,rx) in enumerate(zip([-107,*XROADS],[*XROADS,MAXX-1])):
    for zi,(start,end) in enumerate(zip([MINZ+2,*ZROADS],[*ZROADS,MAXZ-2])):
        if rx-lx<3 or end-start<3: continue
        pocket=R.random()
        core=-30<lx<18 and -24<start<46
        if pocket<.1:
            for i in range(5):
                x,z=R.uniform(lx+1,rx-1),R.uniform(start+1,end-1)
                if not offroad(x,z) and not near_arterial(x,z,1.03) and terrain(x,z)<.2:
                    tree(x,z,R.uniform(.55,1),R.randrange(3),.11)
            continue
        for xk in (.22,.51,.78):
            for zk in (.25,.54,.81):
                x=lx+(rx-lx)*xk+R.uniform(-.22,.22)
                z=start+(end-start)*zk+R.uniform(-.28,.28)
                if offroad(x,z) or near_arterial(x,z,.91) or terrain(x,z)>.28 or R.random()<.08: continue
                if R.random()<.10:
                    tree(x,z,R.uniform(.62,1.05),R.randrange(4),.1)
                    continue
                w=min((rx-lx)*.27,R.uniform(.92,2.45)); d=min((end-start)*.26,R.uniform(.81,2.31))
                wall,top=R.choice(BLOCKS)
                if core:
                    h=R.uniform(.28,1.11); wall,top=R.choice([('9d8d79','666963'),('b3a18b','71736a'),('a4937e','858273'),('a59580','73776c')])
                else:
                    rise=max(0,1-math.hypot((x-48)/41,(z-13)/43))
                    h=R.uniform(.48,2.35)+rise*R.uniform(.4,3.55)
                    if pocket>.8: h+=R.uniform(.25,1.4)
                y=max(.2,terrain(x,z)+.03)
                shadow(x,z,w,d,h,y-.004)
                box(x,z,w,d,y,h,wall,top)
                if core and R.random()<.7:
                    solid([rect(x,z,w+.13,d+.13,y+h),rect(x,z,w*.2,d*.86,y+h+.22)],top,top)
                    if w>1.5 and d>1.15:
                        facade_panel(x,z+d*.5+.01,.40,y+.033,h*.63,'75635a',.19)
                if not core and h>1.39:
                    detail_rng=random.Random(2177+xi*403+zi*71+int(xk*100)+int(zk*100)*4)
                    levels=min(5,max(2,round(h/.55)))
                    for f in range(levels):
                        row=y+.15+(h-.19)*(f+.35)/levels
                        for col in range(2 if w<1.76 else 3):
                            cols=2 if w<1.76 else 3
                            xx=x+(col-(cols-1)/2)*w/(cols+.38)
                            facade_panel(xx,z+d*.5+.009,min(.39,w/(cols+.9)),row,.127,
                                         '7a8178',.39 if detail_rng.random()<.19 else 0)
                    if h>2.65:
                        box(x-.10*w,z+.09*d,w*.37,d*.37,y+h,.24,wall,top)
                        for f in (.31,.67):
                            box(x,z,w+.026,d+.026,y+h*f,.031,mix(wall,'737d76',.37),top)

# Sparse woodland sculpted over the western relief.
for _ in range(525):
    x,z=R.uniform(-116,-86),R.uniform(-92,81)
    y=terrain(x,z)
    if y<.46 or inwater(x,z) or near_arterial(x,z,1.2) or (x>-108 and -81<z<-52):continue
    tree(x,z,R.uniform(.55,1.6),R.randrange(3),y-.08)

for idx,(a,b,w,d) in enumerate(PARKS):
    if idx in (11,12,13): count=42
    else: count=80 if idx in (0,1,2,3,4,5,7) else 38
    for j in range(count):
        x,z=a+R.uniform(-w*.48,w*.48),b+R.uniform(-d*.47,d*.47)
        if inwater(x,z) or near_arterial(x,z,.63):continue
        if idx==6 and not (x<-17 or x>4.7 or z<-73.3):continue
        if idx==7 and (math.hypot(x-5.6,(z-54.1)*.63)<5.65 or abs(x-5.5)<1.0):continue
        if idx in (8,9,10,15,16,17,18):continue
        if idx==5 and math.hypot(x-LOC['olympic-tower']['x'],z-LOC['olympic-tower']['z'])<4.5:continue
        if idx==3 and (-110<x<-90 and -79<z<-69):continue
        if idx in (0,1,2) and x>-9.5:continue
        if idx==7 or (idx==5 and j%3==0):
            pine(x,z,R.uniform(.48,1.06),max(.1,terrain(x,z)))
        else: tree(x,z,R.uniform(.6,1.17),R.randrange(3),max(.1,terrain(x,z)))

# Monumental architecture.
RED='a64e38'
DEEP='863c2d'
STONE='c7bc9f'
TILE='c5803d'
GOLD='e2a852'
ROOF_SH=['cf8e43','be7134','b96a32','de9f4f']
GRAY=['6e766b','656d65','7d7e70','808473']
BLUE=['477594','385979','3c6785','5583a3']
GREEN=['638476','55776c','638878','739685']

def roof(x,z,y,w,d,h,palette=ROOF_SH,rot=0):
    r=lambda W,D,Y:rect(x,z,W,D,Y,rot,min(.17,D*.08))
    solid([r(w,d,y),r(w*.90,d*.88,y+h*.15),r(w*.58,d*.50,y+h*.46),
           r(w*.40,d*.10,y+h*.86),r(w*.42,d*.045,y+h*.91)], [palette]*4,palette[0])
    ridge=d*.055
    box(x,z,w*.47,ridge,y+h*.90,h*.13,palette[3],rot=rot)
    # Upturned ridge ends and corner caps.
    for s in (-1,1):
        xx=x+s*w*.24*cos(rot); zz=z+s*w*.24*sin(rot)
        disc(xx,zz,d*.045,d*.045,y+h*.91,h*.18,palette[3],n=5)
    for dx,dz in ((-.48,-.48),(.48,-.48),(.48,.48),(-.48,.48)):
        xx=x+dx*w*cos(rot)-dz*d*sin(rot); zz=z+dx*w*sin(rot)+dz*d*cos(rot)
        disc(xx,zz,d*.035,d*.035,y,h*.20,palette[3],n=5)

def hall(x,z,w,d,y=0.24,tiers=1,body=RED,pal=ROOF_SH,rot=0):
    box(x,z,w+1.05,d+.9,y,.27,'aaa18b',STONE,rot)
    box(x,z,w+.64,d+.6,y+.27,.18,'b5a991','dfd1ae',rot)
    h=min(1.36,max(.48,d*.51))
    box(x,z,w*.94,d*.84,y+.45,h,body,'8f4a35',rot)
    for side in (-1,1):
        for i in range(5 if w<4.5 else 7):
            dx=(i/(4 if w<4.5 else 6)-.5)*w*.89
            dz=d*.43*side
            xx=x+dx*cos(rot)-dz*sin(rot); zz=z+dx*sin(rot)+dz*cos(rot)
            box(xx,zz,.13,.14,y+.49,h*.94,'773a2c','9d523b',rot)
    box(x,z,w*1.04,d*.91,y+.43+h,.14,'664f42','936b4e',rot)
    roof(x,z,y+h+.55,w*1.17,d*1.2,max(.32,d*.32),pal,rot)
    if tiers==2:
        H=y+h+.61+max(.32,d*.32)*.53
        box(x,z,w*.72,d*.52,H,h*.58,body,rot=rot)
        roof(x,z,H+h*.54,w*.95,d*.83,max(.30,d*.27),pal,rot)

def stairs(x,z,w,d,y,height,n=5):
    for i in range(n):
        step=d/n
        box(x,z-d/2+step*(i+.5),w,step+.035,y,height*(n-i)/n,'b3a78d','dcd0b1')

def gate(x,z,w,d,y=.23,pal=ROOF_SH):
    shadow(x,z,w+1,d+.25,3.8,y-.01)
    box(x,z,w+.52,d+.5,y,.26,'aaa087','d7c9a7')
    solid([rect(x,z,w,d,y+.26),rect(x,z,w*.92,d*.86,y+1.35)],'a5533f','b5684b')
    for j in (-1,0,1):
        xx=x+j*w*.235
        box(xx,z, w*.09,d+.035,y+.265,.51,'634c40','634c40')
        disc(xx,z,w*.043,d*.508,y+.74,.095,'6a4c3f',n=8)
    hall(x,z,w*.8,d*.66,y+1.19,2,RED,pal)

def bridge(x,z,w,d,rot=0):
    box(x,z,w,d,.14,.28,'aaa98e','e0d5b4',rot)
    for a in [-.39,.39]:
        dx=w*a
        px,pz=x+dx*cos(rot),z+dx*sin(rot)
        box(px,pz,.075,d,.40,.12,'d7ceb6','e1d8bf',rot)

def obelisk(x,z):
    box(x,z,1.7,1.7,.23,.19,'c9baa0','ded4b9')
    box(x,z,1.30,1.30,.42,.17,'b7ae99','dcd3b9')
    solid([rect(x,z,.68,.64,.59),rect(x,z,.43,.44,2.07),rect(x,z,.62,.58,2.13),rect(x,z,.42,.42,2.25)],
          ['c1b59e','ded0b5','bcb19e'],'e6dac0')

# The Forbidden City presents moats, corner towers, a wall, and three parallel rows.
def forbidden(x,z):
    X=x+.05
    flat(X,z-.2,11.3,15.6,.195,'9c9d77')
    flat(X,z-.23,10.76,15.08,.204,'78a7a5')
    flat(X,z-.23,9.15,13.46,.214,'b49f76')
    flat(X,z-.19,8.57,12.92,.220,'c7b28c')
    for sign in (-1,1):
        box(X+sign*4.27,z-.15,.38,13.0,.23,.68,RED,'c28b56')
        box(X,z+sign*6.38,8.55,.40,.23,.70,RED,'b98453')
        for end in (-1,1):
            hall(X+sign*4.24,z+end*6.43,1.0,.83,.53,2,RED)
    for row in (-4.7,-3.35,-1.4,.65,2.45,4.15):
        flat(X,z+row,7.9,1.5,.234,'d3b993')
        for sig in (-1,1):
            hall(X+sig*2.5,z+row,1.52,.83,.25,1,'a15e40')
            if row<-1: hall(X+sig*3.42,z+row+.47,.58,.58,.24,1,'964e3a')
    for off,w,d,tiers in [(-4.85,2.6,1.25,1),(-2.97,3.1,1.32,1),(-.90,2.52,1.3,1),(.90,2.42,1.30,1),(2.70,3.57,1.48,2),(4.57,2.75,1.02,1)]:
        hall(X,z+off,w,d,.48,tiers)
        if off>0:stairs(X,z+off+d*.6+.32,1.1,.65,.24,.51,4)
    for off in [-6.42,6.40]:
        gate(X,z+off,4.15,1.63,.23)
        bridge(X,z+(off*.99+(.96 if off>0 else -.96)),1.5,1.85)

scoped('forbidden-city',forbidden)

def jingshan(x,z):
    for i in range(6):
        disc(x,z,4.3-i*.53,2.5-i*.27,.11+i*.42,.48,['a0a371','989e6d','8c9764','7d8e5d','7b895b','889465'][i],
             '96a16f',18)
    for i in range(29):
        a=R.random()*2*pi; r=R.uniform(1.52,3.86)
        tree(x+cos(a)*r,z+sin(a)*r*.58,R.uniform(.62,1.12),i%3, max(.15,(4.1-r)*.61))
    for m in (-2,-1,0,1,2):
        hall(x+m*1.45,z+abs(m)*.24,1.42 if not m else .79,.95 if not m else .64,
            2.72-abs(m)*.61,2 if not m else 1,RED,ROOF_SH if m==0 else GREEN)
    stairs(x,z+1.7,.46,1.87,.18,2.22,17)
scoped('jingshan',jingshan)

def bells(x,z):
    flat(x,z,7.43,9.98,.201,'b7ac8f')
    gate(x,z+1.58,4.1,2.25,.26)
    gate(x-.18,z-2.58,2.68,2.07,.27,GRAY)
    for a in (-1,1):
        for i in range(3): tree(x+a*3.15,z+2.7-i*2.4,.63,1,.21)
scoped('bell-drum',bells)

def tiananmen(x,z):
    flat(x,z+1.25,7.28,10.3,.201,'bbb8a6')
    for i in range(-4,7):line([(x-3.5,z+i*.9),(x+3.5,z+i*.9)],.034,.205,'a39e90')
    for i in [-2.3,0,2.3]:line([(x+i,z-3.8),(x+i,z+5.6)],.045,.205,'ded3b7')
    gate(x,z-4.94,6.65,1.65,.245)
    for i in range(-2,3):
        bridge(x+i*.89,z-3.81,.52,.73)
    obelisk(x,z+.36)
    hall(x,z+3.22,4.72,2.02,.24,1,'a1947e',['9b9a84','777e73','92937d','aeaa92'])
    for s in [-1,1]:
        xx=x+s*6.37
        box(xx,z+.06,3.4,6.85,.205,.34,'aba48f','cfc8ab')
        box(xx,z+.25,3.0,6.39,.54,1.32,'bab198','dad0b6')
        for k in range(9):box(xx-s*1.48,z-2.50+k*.65,.21,.18,.54,1.02,'e5d7b5')
    for k in range(12): tree(x-4,z-2.65+k*.70,.56,k%3,.23);tree(x+4,z-2.65+k*.70,.56,k%3,.23)
scoped('tiananmen',tiananmen)

def qianmen(x,z):
    flat(x,z,5.9,10.3,.201,'c4b89e')
    gate(x,z-3.72,4.0,1.72,.25,GRAY)
    gate(x,z-1.05,2.46,1.22,.25,GRAY)
    line([(x,z-1.0),(x,z+5.4)],1.3,.22,'d8ccae')
    for i in range(7):
        for s in (-1,1):
            xx=x+s*(1.27+R.random()*.50); zz=z+.5+i*.71
            hall(xx,zz,R.uniform(.62,1.1),R.uniform(.46,.66),.25,1,R.choice(['86786a','9c8871','a79983']),GRAY,s*pi/2)
    for i in range(9):
        zz=z-.19+i*.58
        for s in [-1,1]:box(x+s*.66,zz,.055,.055,.23,.43,'705d4e','c98a53')
scoped('qianmen',qianmen)

def temple(x,z):
    flat(x,z,11.5,12.5,.232,'9cab80')
    for s in [-1,1]:
        line([(x+s*5.55,z-5.5),(x+s*5.55,z+5.5)],.15,.25,'ad7a5d')
        line([(x-5.55,z+s*5.5),(x+5.55,z+s*5.5)],.15,.25,'ad7a5d')
    line([(x,z-5.0),(x,z+5.2)],.91,.245,'c9bd9e')
    for i in range(3):disc(x,z,2.82-i*.41,2.82-i*.41,.28+i*.25,.25,'c8c0ab','e0d9c2',32)
    stairs(x,z+2.65,.80,1.15,.25,.82,7)
    for u,v,y,rad in [(x,z,1.01,1.55),(x,z,2.27,1.17),(x,z,3.26,.79)]:
        disc(u,v,rad*.80,rad*.80,y,.65,RED,'8b4939',24)
        n=32
        solid([oval(u,v,rad*1.05,rad*1.05,y+.56,n),
            oval(u,v,rad*.91,rad*.91,y+.65,n),oval(u,v,rad*.63,rad*.63,y+.88,n),
            oval(u,v,rad*.29,rad*.29,y+1.13,n)], [BLUE]*3,'5e86a0')
    disc(x,z,.17,.17,4.29,.32,'c79947','e6ba64',12)
    for off in [-4.44,4.58]: hall(x,z+off,2.0,.73,.245,1,RED,BLUE)
    for s in [-1,1]:
        for i in range(5):
            pine(x+s*3.7,z-4.1+2.01*i,.8,.25)
scoped('temple-of-heaven',temple)

def yongding(x,z):
    flat(x,z,5.5,4.42,.26,'bdb08c')
    gate(x,z,3.63,1.66,.27,GRAY)
    for s in (-1,1):box(x+s*2.34,z,1.45,.57,.26,.65,'9f826a','b69778')
scoped('yongdingmen',yongding)

def shichahai(x,z):
    bridge(x+.5,z-.8,.55,2.24,-pi/4)
    for i in range(9):
        xx=x-4.9+i*.65; zz=z+1.9+sin(i*.77)*.33
        if not inwater(xx,zz):hall(xx,zz,.66,.56,.25,1,'aa9781',GRAY)
    for dx,dz,rot in [(2.1,-1.1,.65),(-2.4,-2.65,-.15),(-1.11,.31,1.18)]:
        if inwater(x+dx,z+dz):
            box(x+dx,z+dz,.18,.63,.15,.11,'b19a68','e2c094',rot,.07)
scoped('shichahai',shichahai)

def beihai(x,z):
    for i in range(4): disc(x,z,2.11-i*.39,1.83-i*.31,.15+i*.38,.40,'82905c','a2a477',16)
    box(x,z,1.25,1.26,1.65,.35,'b3aa95','e7debf')
    solid([oval(x,z,.49,.49,1.96,16),oval(x,z,.62,.62,2.23,16),
        oval(x,z,.53,.53,2.75,16),oval(x,z,.25,.25,3.1,16),
        oval(x,z,.108,.11,3.73,16)],'e2dbc1','e7e3cf')
    disc(x,z,.37,.37,3.72,.18,'b2a88d','ede3c5',14)
    disc(x,z,.095,.095,3.89,.34,'9a8b64','c0aa74',9)
    bridge(x-.33,z+2.45,.54,2.3,.34)
    for j in range(10):
        a=j*.68;tree(x+cos(a)*1.62,z+sin(a)*1.2,.62,j%3,.65)
scoped('beihai',beihai)

def summer(x,z):
    for i in range(7):
        disc(x-.35,z-.7,7.0-i*.73,3.11-i*.31,.21+i*.41,.45,'7f9064','95a171',24)
    for j in range(39):
        xx=x+R.uniform(-6.3,6.2); zz=z+R.uniform(-2.2,1.8)
        if abs(xx-x)<2.4 and zz>z-1.5:continue
        y=max(.25,2.4*(1-math.hypot((xx-x)/7.,(zz-z+.7)/3.6)))
        tree(xx,zz,R.uniform(.75,1.28),j%3,y)
    for i in range(3): disc(x,z,.99-i*.09,.99-i*.09,2.8+i*.68,.63,RED,'ac6146',8)
    for i in range(3):
        n=8; r=1.34-i*.15; y=3.19+i*.68
        solid([oval(x,z,r,r,y,n),oval(x,z,r*.78,r*.78,y+.16,n),oval(x,z,r*.26,r*.26,y+.49,n)],TILE,GOLD)
    disc(x,z,.10,.10,5.05,.42,'be9b63','e6bd75',8)
    stairs(x,z+2.04,1.31,1.92,.20,2.89,16)
    hall(x,z+3.31,3.3,1.25,.27,1,RED)
    for i in range(13):
        xx=x-6.68+i*.99
        zz=z+3.55+sin(i*.40)*.32
        hall(xx,zz,.83,.54,.24,1,'a0664d',GREEN)
    disc(x+4.26,z+10.74,1.66,1.13,.15,.24,'8d9b72','a6ac77',18)
    hall(x+4.26,z+10.74,.9,.7,.40,1,RED)
    for i in range(11):
        xx=x+4.29+i*.42; zz=z+10.68-i*.12
        bridge(xx,zz,.43,.4,-.24)
scoped('summer-palace',summer)

def yuanming(x,z):
    flat(x,z,7.0,3.9,.22,'bdb99a')
    line([(x-3,z+.72),(x+3,z+.72)],.07,.23,'9b987f')
    box(x,z,5.31,.68,.24,.19,'b4ae96','d0c5a7')
    for i in range(8):
        xx=x+(i-3.5)*.62
        box(xx,z,.22,.23,.43,.52+(i%3)*.22,'b7ab92','e0d1b3')
        box(xx,z,.27,.27,.43,.10,'c6ba9c','dbcaac')
    for dx,dz in [(2.2,1.4),(-2.6,1.13),(-1.6,-1),(1.75,-1.2)]:
        box(x+dx,z+dz,.37,.27,.23,.24,'b6ac90','ddd1b4',.55)
scoped('yuanmingyuan',yuanming)

def olympic(x,z):
    flat(x,z-1.2,2.4,10.1,.233,'c7caba')
    for i in range(-4,4):
        flat(x,z+i*1.12,1.66,.23,.237,'b0b8ae')
        for s in [-1,1]:box(x+s*1.08,z+i*1.12,.046,.046,.24,.52,'888b7e','c9c7b7')
    for j,color in enumerate(['617d9b','bea64c','666f69','719267','a95849']):
        px=x+(j-2)*.4
        p=[(px+cos(2*pi*i/26)*.23,z-.9+(.21 if j%2 else 0)+sin(2*pi*i/26)*.23) for i in range(27)]
        line(p,.057,.25,color)
scoped('olympic',olympic)

def bird(x,z):
    disc(x,z,4.33,3.03,.205,.26,'bcb9ab','d4caba',32)
    n=40;rot=-.19
    a=oval(x,z,3.55,2.52,.47,n,rot)
    b=[(u,2.61+.34*cos(i*4*pi/n+.9),v) for i,(u,_,v) in enumerate(oval(x,z,3.53,2.48,0,n,rot))]
    mid=oval(x,z,2.64,1.58,2.25,n,rot)
    inner=oval(x,z,1.68,1.02,1.20,n,rot)
    seats=oval(x,z,1.41,.82,.89,n,rot)
    for i in range(n):
        j=(i+1)%n
        face([a[i],b[i],b[j],a[j]],'8e8475')
        face([b[i],mid[i],mid[j],b[j]],'aa9b86',normal=(0,1,0))
        face([mid[i],inner[i],inner[j],mid[j]],'a7614c',normal=(0,1,0))
        face([inner[i],seats[i],seats[j],inner[j]],'b87b62',normal=(0,1,0))
        tube(a[i],b[(i+3)%n],.075,'ded6c2' if i%2 else 'bcb9ae')
        tube(a[i],b[(i-4)%n],.057,'b0a99b')
        tube(b[i],b[j],.067,'ded7c7')
        if i%2==0: tube(b[i],mid[(i+3)%n],.065,'c2baaa')
        if i%3==0: tube(b[i],mid[(i-5)%n],.052,'d9cebb')
    for i in range(0,n,2):
        u,ht,v=b[i]
        a0,_,b0=mid[i]
        face([(u,ht-.075,v),(a0,2.29,b0),(a0+.028,2.31,b0+.026),(u+.032,ht-.073,v+.028)],
             'cda679',glow=.69)
    flat(x,z,2.21,1.15,.91,'84936e',rot)
    flat(x,z,.034,1.07,.917,'d2cf9e',rot)
scoped('bird-nest',bird)

def watercube(x,z):
    box(x,z,6.6,5.25,.21,.23,'9ea8a3','d4d6c6',-.09)
    w,d,h,base=5.4,4.32,2.85,.44
    box(x,z,w,d,base,h,['4c8da9','569fb9','448eaf','5091b0'],'74bbcd',-.09,.12)
    angle=-.09
    rng=random.Random(55)

    def foam(u,v,origin):
        return tuple(origin[k]+u[0][k]*u[1]+v[0][k]*v[1] for k in range(3))

    def panel(origin,u,v,U,V,rows,cols,normal,colors):
        points=[(U*(i+.52+rng.uniform(-.43,.43))/cols,
                 V*(j+.52+rng.uniform(-.43,.43))/rows)
                for j in range(rows) for i in range(cols)]
        for index,(x0,y0) in enumerate(points):
            cell=[(0,0),(U,0),(U,V),(0,V)]
            for idx,(x1,y1) in enumerate(points):
                if idx==index:continue
                dx,dy=x1-x0,y1-y0
                mx,my=(x0+x1)/2,(y0+y1)/2
                clipped=[]
                for a,b in zip(cell,cell[1:]+cell[:1]):
                    A=(a[0]-mx)*dx+(a[1]-my)*dy
                    B=(b[0]-mx)*dx+(b[1]-my)*dy
                    if A<=0:clipped.append(a)
                    if (A<0) != (B<0):
                        t=A/(A-B)
                        clipped.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
                cell=clipped
            center=foam((u,x0),(v,y0),origin)
            vertices=[foam((u,px),(v,py),origin) for px,py in cell]
            offset=lambda point,a: tuple(point[i]+(center[i]-point[i])*a for i in range(3))
            # Pale joints surround the bulging blue cells on all walls and on the roof.
            outer=[offset(pt,.075) for pt in vertices]
            inner=[tuple(pt[k]+normal[k]*.044 for k in range(3)) for pt in [offset(pt,.27) for pt in vertices]]
            face(outer,'a7d6e2',normal=normal)
            for a,b,c,e in zip(outer,outer[1:]+outer[:1],inner[1:]+inner[:1],inner):
                face([a,b,c,e],colors[index%len(colors)],normal=normal)
            face(inner,colors[(index+2)%len(colors)],normal=normal,glow=.28+.20*(index%3==0))

    cs,sn=cos(angle),sin(angle)
    ux=(cs,0,sn); uz=(-sn,0,cs); up=(0,1,0)
    palette=['82bfd3','549fc1','71b4d0','a1d4df','59a7c7','8cc7d9']
    for sign in [-1,1]:
        normal=tuple(sign*a for a in uz)
        origin=(x-ux[0]*(w-.24)/2+normal[0]*(d/2+.012),base+.025,
                z-ux[2]*(w-.24)/2+normal[2]*(d/2+.012))
        panel(origin,ux,up,w-.24,h-.05,5,10,normal,palette)
        normal=tuple(sign*a for a in ux)
        origin=(x-uz[0]*(d-.24)/2+normal[0]*(w/2+.012),base+.025,
                z-uz[2]*(d-.24)/2+normal[2]*(w/2+.012))
        panel(origin,uz,up,d-.24,h-.05,5,8,normal,palette)
    origin=(x-ux[0]*(w-.24)/2-uz[0]*(d-.24)/2,base+h+.011,
            z-ux[2]*(w-.24)/2-uz[2]*(d-.24)/2)
    panel(origin,ux,uz,w-.24,d-.24,8,10,up,palette)
scoped('water-cube',watercube)

def theatre(x,z):
    flat(x,z,7.5,6.36,.202,'b2b6a7')
    flat(x,z,6.9,5.64,.222,'8bb3b1')
    n=38
    rings=[oval(x,z,3.0*cos(i*pi/2/8),2.12*cos(i*pi/2/8),.24+2.16*sin(i*pi/2/8),n) for i in range(8)]
    rings.append(oval(x,z,.014,.014,2.41,n))
    for i,(a,b) in enumerate(zip(rings,rings[1:])):
        for j in range(n):
            k=(j+1)%n
            pal=('8cadaa','78989c','91afad','9eb9b7') if abs(cos(j*2*pi/n))<.29 else ('c1c8bd','b4bdb7','c5cabe','bac3bd')
            face([a[j],b[j],b[k],a[k]],pal[j%4])
    line([(x,z-3.08),(x,z-2.00)],.24,.248,'d4d5bf')
scoped('ncp',theatre)

def market(x,z):
    flat(x,z,6.83,9.06,.21,'c5baaa')
    line([(x,z-4.3),(x,z+4.25)],1.2,.25,'d9cfba')
    for i in range(5):
        for s in [-1,1]:
            xx=x+s*1.92
            zz=z+(i-2)*1.6
            h=R.uniform(1.05,2.48)
            w=R.uniform(1.3,1.7)
            col=R.choice(['aea593','bcb09e','a29b8e','ac9e8c'])
            box(xx,zz,w,1.2,.27,h,col,'c8c2b4')
            for seg in range(3):
                box(xx,zz,w+.018,1.208,.27+h*(.23+.24*seg),.058,'8a9088','a3aba0')
            box(xx-s*w*.50,zz,.26,1.1,.55,.09,R.choice(['aa5b43','a69370','83978b']),'c5a485')
    for i in range(10):tree(x+(.56 if i%2 else -.56),z-3.7+.81*i,.47,i%3,.25)
scoped('wangfujing',market)

def taikooli(x,z):
    flat(x,z,9.25,9.85,.22,'c0b7a4')
    for a,b,w,d,h,tint in [
        (-2.5,-3.1,2.7,2.15,2.2,'8c9893'),(.6,-3.5,2.7,1.84,3.36,'91a6a3'),
        (2.9,-1.4,2.4,2.8,2.51,'aab6ac'),(-3.1,.1,2.1,2.35,1.89,'a08d78'),
        (2.3,2.47,2.55,2.45,2.11,'b9b19b'),(-2.3,3.1,2.46,2.14,2.64,'a89f8d'),
    ]:
        xx,zz=x+a,z+b
        box(xx,zz,w,d,.23,h,tint,mix(tint,'e2d9c4',.48),0,.16)
        box(xx,zz,w*.88,d*.88,.24+h,.12,'b7b2a2','929e97',0,.11)
        for f in [.26,.67]:
            box(xx,zz,w+.025,d+.025,.24+h*f,.085,'c6bbab','c9c7b5',0,.16)
    for i in range(6):tree(x+sin(i*2.4)*.8,z-3+i*1.22,.73,i%3,.25)
scoped('sanlitun',taikooli)

def tower(x,z,w,d,h,col,facade,rot=0):
    shadow(x,z,w,d,h,.218)
    box(x,z,w+.3,d+.3,.225,.36,'acaa9e','c5beaa',rot,.16)
    box(x,z,w,d,.58,h,col,mix(col,'e0d6ba',.48),rot,.16)
    for i in range(int(h/.41)):
        box(x,z,w+.022,d+.022,.73+i*.41,.047,facade,facade,rot,.16)
    if h>5.7:box(x,z,w*.51,d*.50,.56+h,.40,facade,'c3bfb1',rot,.09)
def cbd(x,z):
    flat(x,z,12.5,14.2,.219,'afb4a8')
    for u,v,w,d,h,col,fac in [
        (-3.9,1.9,2.2,1.6,6.5,'989e99','b6b8ae'),(-1.8,3.27,1.7,1.24,5.8,'8c9c9c','b9bfb6'),
        (1.8,3.8,1.76,1.69,7.34,'859b9d','a6b5b0'),(3.5,1.3,1.25,1.5,5.0,'95a39e','b5bfb6'),
        (4.7,-2.6,1.31,1.65,4.5,'a1a9a0','c1c7b7'),(-4.88,-2.43,1.35,1.46,5.65,'839998','b6c3b9'),
        (-2.5,-3.26,1.53,1.4,7.5,'879b9a','b1bdb0'),(0.40,-4.88,1.47,1.37,4.78,'a2aaa0','b9c2b3'),
        (3.1,-4.75,1.50,1.9,5.6,'8b9998','acb7ad')
    ]:tower(x+u,z+v,w,d,h,col,fac,.10)
scoped('cbd',cbd)

def china_zun(x,z):
    box(x,z,4.8,4.4,.226,.27,'a9b0a9','d5cbb5',.17,.38)
    rows=[(.49,3.08),(2.8,2.57),(6.36,2.05),(9.4,1.91),(11.9,2.05),(14.2,2.37),(16.34,2.74),(16.61,2.57)]
    rings=[rect(x,z,w,w*.94,y,.17,.26) for y,w in rows]
    solid(rings,['53767f','658e9a','9eb7b6','799ba2'],'bad0c9')
    for (y,w),(ny,nw) in zip(rows,rows[1:]):
        for i in range(int((ny-y)/.22)):
            a=(i+.34)*.22/(ny-y); yw=(1-a)*w+a*nw
            p=rect(x,z,yw+.024,yw*.94+.024,y+a*(ny-y),.17,.26)
            for j in range(len(p)):
                tube(p[j-1],p[j],.013,'a9bec0',4)
    for j in range(8):
        for lower,upper in zip(rings,rings[1:]):
            tube(lower[j],upper[j],.017,'c1c7be',4)
    box(x,z,1.38,1.30,16.61,.15,'8da2a1','c8ccc0',.17,.1)
    for i in range(1,len(rows)-1):
        y,w=rows[i]
        ring=rect(x,z,w+.02,w*.94+.02,y+.018,.17,.26)
        for k in range(8):
            a,b=ring[k-1],ring[k]
            face([a,b,(b[0],b[1]-.048,b[2]),(a[0],a[1]-.048,a[2])],'d6bc85',glow=.55)
scoped('china-zun',china_zun)

def cctv(x,z):
    flat(x-1.60,z-1.6,9.8,5.2,.228,'b2b6a8')
    wall=['5f7980','748e95','668892','506970']
    steel='b3c3bf'
    def facade(layers, top):
        solid(layers,[wall]* (len(layers)-1),top)
        for k,(a,b) in enumerate(zip(layers,layers[1:])):
            for j in range(4):
                n=(j+1)%4
                tube(a[j],b[j],.042,steel,4)
                tube(b[j],b[n],.036,steel,4)
                tube(a[j],b[n],.044,steel,4)
                if (j+k)%2==0:
                    tube(a[n],b[j],.031,steel,4)
    box(x-1.5,z-1.45,7.6,5.0,.24,.79,'647b80','a7b4ad',.02,.19)
    ends=[]
    for index,(u,v,tx,tz) in enumerate([(-4.25,-.08,-3.27,-.65),(1.08,-2.9,.34,-2.08)]):
        high=9.82+index*.76
        layers=[]
        for i in range(7):
            t=i/6
            layers.append(rect(x+u+(tx-u)*t,z+v+(tz-v)*t,2.09-t*.25,2.38-t*.28,1.02+(high-1.02)*t,.09))
        facade(layers,'839c9d')
        ends.append((x+tx,z+tz))
    (ax,az),(bx,bz)=ends
    # An L-shaped span bridges the two towers, with an open void below.
    q=[(ax-.98,az+1.02),(bx+1.0,az+1.02),(bx+1.0,bz-1.04),
       (bx-.98,bz-1.04),(bx-.98,az-.96),(ax-.98,az-.96)]
    floor,roof_y=9.75,12.02
    pts=[(u,floor,v) for u,v in q]
    top=[(u,roof_y,v) for u,v in q]
    for i in range(len(q)):
        j=(i+1)%len(q)
        face([pts[i],pts[j],top[j],top[i]],wall[i%4])
        L=math.hypot(q[j][0]-q[i][0],q[j][1]-q[i][1])
        count=max(1,round(L/.95))
        for k in range(count):
            a=k/count;b=(k+1)/count
            A=[pts[i][t]*(1-a)+pts[j][t]*a for t in range(3)]
            B=[pts[i][t]*(1-b)+pts[j][t]*b for t in range(3)]
            TA=(A[0],roof_y,A[2]); TB=(B[0],roof_y,B[2])
            tube(A,TA,.041,steel,4)
            tube(A,TB,.039,steel,4)
            if k%2==0:tube(B,TA,.030,steel,4)
        tube(pts[i],pts[j],.040,steel,4)
        tube(top[i],top[j],.046,steel,4)
    polygon(q,roof_y,'8f9c9a')
    polygon(q,floor-.012,'78898a')
scoped('cctv-headquarters',cctv)

def tv_tower(x,z):
    disc(x,z,3.7,3.4,.23,.30,'b4af98','dad0b7',24)
    disc(x,z,2.0,1.95,.52,.74,'9da8a6','babfb6',24)
    n=24
    rows=[(1.22,1.05),(3.2,.84),(7.6,.62),(9.18,.70),(9.66,1.54),(10.4,1.72),
          (10.77,1.43),(11.42,1.34),(11.76,.69),(13.4,.43),(14.12,.29)]
    solid([oval(x,z,r,r,y,n) for y,r in rows],
          ['a49d8c','b6b3a5','b9b3a2','b3ac9a','a49c8b','617a7f','a7ab9b','b5b4a4','b8b0a0','a99e8a'],
          'd2c6ac')
    for h,r,col in [(9.62,1.57,'d3c8ae'),(10.30,1.73,'d4c9b5'),(10.80,1.44,'ada48f'),(11.36,1.36,'667f85')]:
        disc(x,z,r,r,h,.10,col,col,24)
    for i in range(6):
        rad=.205-.024*i
        col='a94e40' if i%2==0 else 'ded4bc'
        disc(x,z,rad,rad,14.09+i*.36,.36,col,col,12)
    for n in range(9):
        a=n*2*pi/9
        tree(x+cos(a)*3.3,z+sin(a)*3.0,.78,n%3,.52)
scoped('central-tv-tower',tv_tower)

def yuyuantan(x,z):
    walkway=smooth([(x-8,z+2.65),(x-4,z+3.94),(x,z+3.53),(x+4.3,z+3.5),(x+7.2,z+2.45)],6)
    line(walkway,.37,.185,'e4cfa9')
    bridge(x+.4,z-.15,.56,5.1,-.12)
    for i in range(13):
        a,z0=walkway[i*2-1] if i else walkway[0]
        if not inwater(a,z0+.64):
            tree(a,z0+.64,.83,i%3,.18)
            disc(a,z0+.63,.32,.29,.96,.25,'b9907f','d6b3a0',7)
    hall(x+2.4,z+3.2,1.1,.92,.23,1,'9b6b53',GREEN)
scoped('yuyuantan',yuyuantan)

def olympic_tower(x,z):
    disc(x,z,4.06,3.57,.22,.28,'aeb2a1','d0d0b8',24)
    forms=[(-.99,.36,6.25,.67),(-.5,-.96,7.30,.72),(0,.23,10.94,1.08),(.99,-.62,8.53,.81),(1.42,.64,7.55,.71)]
    for dx,dz,h,r in forms:
        xx,zz=x+dx,z+dz
        n=18
        solid([oval(xx,zz,r*.29,r*.29,.5,n),oval(xx,zz,r*.23,r*.23,h*.77,n),
               oval(xx,zz,r*.51,r*.51,h*.94,n),oval(xx,zz,r,r,h,n),
               oval(xx,zz,r*.91,r*.91,h+.31,n),oval(xx,zz,r*.77,r*.77,h+.52,n)],
               ['87938d','98a9a4','728f92','617782','a8afb0'],'c2c7bc')
        disc(xx,zz,r*.92,r*.92,h+.295,.055,'ced0bf','ced0bf',18)
    for i in range(8):
        tree(x-3.0+i*.82,z+2.28,.59,i%3,.26)
scoped('olympic-tower',olympic_tower)

def rail(x,z):
    flat(x,z,13.3,6.45,.214,'abae9f')
    box(x,z,11.8,3.29,.23,1.06,'b6a693','d0c4aa')
    box(x,z,4.33,3.83,.25,1.46,'b4a690','cdc0a7')
    roof(x,z,1.62,5.11,3.80,.87,GREEN)
    for s in [-1,1]:
        xx=x+s*3.44
        box(xx,z-.61,1.31,1.51,.28,2.05,'bcad99','d4c7ae')
        box(xx,z-.62,1.23,1.42,2.09,.33,'d2c4ab','b4b6a0')
        roof(xx,z-.62,2.47,1.56,1.73,.52,GREEN)
        for k in range(5): box(x+s*(1.13+.8*k),z-1.69,.25,.052,.54,.53,'857f72','a9a08c')
        p=oval(xx,0,.18,.181,0,14)
        face([(u,2.20+v,z-1.355) for u,_,v in p],'ebe2c8',normal=(0,0,-1))
        tube((xx,2.2,z-1.369),(xx+.09,2.246,z-1.369),.017,'675e54',4)
scoped('beijing-station',rail)

def south(x,z):
    flat(x,z,14.7,9.94,.211,'aeb3aa')
    for i in range(8):
        zz=z+(i-3.5)*.65
        line([(x-10,zz),(x+9,zz)],.12,.226,'888d85')
    n=36
    solid([oval(x,z,6.12,3.15,.25,n,-.18),oval(x,z,6.21,3.30,1.02,n,-.18),
           oval(x,z,5.76,2.85,1.54,n,-.18),oval(x,z,4.45,1.97,2.42,n,-.18),
           oval(x,z,3.03,1.28,2.80,n,-.18),oval(x,z,1.7,.66,2.97,n,-.18)],
           ['92a29d','c4cbbb','c6cbbf','b8c2b7','a4b8b1'],'91aba8')
    for i in range(15):
        j=(i-7)/7
        xx=x+j*3.89; h=2.94-.45*abs(j)
        line([(xx,z-.6-j*.72),(xx,z+.60-j*.72)],.052,h,'c6d2c7')
    for i in range(7):
        xx=x+(i-3)*.71
        box(xx,z+2.6,.10,.12,.24,.57,'c4bbac','c4bbac')
scoped('beijing-south',south)

def garden_walk(path, shade='d9ccaa'):
    line(path,.33,.185,shade)

def peking_university(x,z):
    garden_walk(smooth([(x-7,z-.8),(x-4.4,z-.9),(x-2.2,z-1.1),(x,z-.9),(x+3.5,z-2.5)],5))
    garden_walk([(x-6.1,z-.6),(x-6.1,z+4.35),(x+2.6,z+4.35)])
    disc(x,z,1.30,1.24,.19,.28,'a6977d','c4b593',12)
    box(x,z,1.16,1.16,.47,.39,'a69577','cfc2a2',chamfer=.12)
    disc(x,z,.47,.47,.85,.32,'aa9475','bba887',8)
    for i in range(13):
        y=1.17+i*.365
        radius=.53-i*.023
        disc(x,z,radius*.74,radius*.74,y,.27,'a58b6a','c2a781',8)
        solid([oval(x,z,radius,radius,y+.21,8),oval(x,z,radius*.63,radius*.63,y+.34,8)],
              '797a59','92906a')
    disc(x,z,.067,.067,5.87,.39,'9f855a','bfa375',8)
    for dx,dz,w,d in [(-6,1.65,2.1,1.3),(-3.1,2.4,2,1.15),(1.8,2.5,1.68,1.26),(-6,-7.7,1.6,.86),(-2.7,-7.9,1.52,.71)]:
        hall(x+dx,z+dz,w,d,.21,1,'a05e44',GRAY)
    for i in range(32):
        a=i*pi*.295
        xx=x-3.2+cos(a)*(5.39+sin(i*.57)*.48)
        zz=z-2.2+sin(a)*4.53
        if not inwater(xx,zz) and math.hypot(xx-x,zz-z)>2.0:
            tree(xx,zz,.61+(i%5)*.12,i%3,.16)
scoped('peking-university',peking_university)

def tsinghua(x,z):
    flat(x,z+1.2,12.4,10.7,.194,'9ca777')
    for dx in (-.58,.58):
        garden_walk([(x+dx,z+1.66),(x+dx,z+6.7)],'c2bc9b')
    garden_walk([(x-5.9,z+3.55),(x+5.9,z+3.55)])
    box(x,z,4.6,3.44,.21,.27,'b1a78b','dacaaa')
    box(x,z-.24,3.52,2.78,.48,2.28,'a57260','b18a6e',chamfer=.17)
    flat(x,z,3.80,2.92,2.77,'a58972')
    disc(x,z-.34,1.41,1.31,2.76,.68,'aa927c','aeb29a',24)
    dome=[oval(x,z-.34,1.45*cos(i*pi/16),1.36*cos(i*pi/16),3.26+1.17*sin(i*pi/16),28)
          for i in range(8)]
    solid(dome,['71877a','788e81','87978a','779083'],'94a295')
    disc(x,z-.34,.23,.23,4.38,.27,'a7aa92','cabd99',12)
    box(x,z+1.38,3.87,.88,.49,.22,'b9b597','e2d0aa')
    for i in range(6):
        xx=x+(i-2.5)*.58
        disc(xx,z+1.47,.112,.112,.69,1.59,'d9c6a1','e2d0af',10)
        disc(xx,z+1.47,.155,.155,2.21,.12,'d2bd93','ebd3a9',10)
    box(x,z+1.43,3.86,.96,2.32,.30,'a1917a','d3b98e')
    solid([rect(x,z+1.43,3.97,1.03,2.60),rect(x,z+1.43,.08,1.0,3.05)],'b48c6e','c9a487')
    stairs(x,z+1.99,3.63,.65,.20,.42)
    for sign in (-1,1):
        for i in range(7):
            tree(x+sign*(3.6+sin(i*1.8)*.67),z-3.8+i*1.39,.89,i%3,.22)
        xx=x+sign*.98
        box(xx,z+5.7,.39,.39,.23,1.01,'d9d1b7','eee1c1')
        box(xx,z+5.7,.50,.48,1.17,.24,'b3aea0','e2d6b9')
    box(x,z+5.7,1.81,.4,1.32,.27,'d8cbb1','eddec0')
    box(x,z+3.83,.45,.45,.22,.33,'b1a690','cec5a8',.33)
scoped('tsinghua-university',tsinghua)

def ice_ribbon(x,z):
    n=56
    disc(x,z,6.1,3.83,.19,.28,'a9ada2','c6c9b7',n,-.18)
    solid([oval(x,z,5.42,3.18,.47,n,-.18),oval(x,z,5.55,3.2,1.61,n,-.18),
           oval(x,z,5.31,3.02,2.55,n,-.18),oval(x,z,4.42,2.36,2.97,n,-.18)],
           ['739c9e','73a4b1','95b5b6'],'a5bbad')
    for layer in range(10):
        frac=layer/9
        ring=oval(x,z,5.48-.18*frac,3.24-.22*frac,.72+frac*1.88,n,-.18)
        waves=[(a,height+.12*sin(i*4*pi/n)+.042*cos(i*8*pi/n),b) for i,(a,height,b) in enumerate(ring)]
        for i,a in enumerate(waves):
            p=waves[(i+1)%n]
            face([a,p,(p[0],p[1]+.043,p[2]),(a[0],a[1]+.043,a[2])],
                 'd6e7e3' if layer%3 else 'acdaea',glow=.78)
    disc(x,z,3.37,1.75,2.965,.075,'b5c8bf','cbd5cb',38,-.18)
    for i in range(9):
        flat(x-3.15+i*.79,z+3.65,.095,.12,.472,'f1d2a1',glow=.8)
scoped('ice-ribbon',ice_ribbon)

def art_zone(x,z):
    flat(x,z,13.9,10.1,.196,'b0a18d')
    for b in (-3.4,.0,3.25):
        line([(x-6.7,z+b),(x+6.6,z+b)],.75,.211,'c5b79d')
    line([(x-1.8,z-4.9),(x-1.8,z+4.8)],.97,.218,'c8b8a0')
    for dx,dz,w,d in [(-4,-1.75,3.1,2.1),(2,-2,5.7,2.1),(1,1.76,4.6,2.03),(-4.2,1.53,2.9,2.05),(4.8,1.9,2.0,2.15)]:
        xx,zz=x+dx,z+dz
        box(xx,zz,w,d,.22,.94,'9c715b','b68f74')
        count=round(w/.88)
        l=w/count
        for i in range(count):
            pos=xx+(i-(count-1)/2)*l
            left,right=pos-l/2,pos+l/2
            low,high=1.16,1.89
            face([(left,low,zz-d/2),(right,high,zz-d/2),
                  (right,high,zz+d/2),(left,low,zz+d/2)],'989a8a')
            face([(left,low,zz+d/2),(right,low,zz+d/2),(right,high,zz+d/2)],'a18067')
            face([(left,low,zz-d/2),(right,low,zz-d/2),(right,high,zz-d/2)],'a18067')
            face([(right,low,zz-d/2),(right,high,zz-d/2),
                  (right,high,zz+d/2),(right,low,zz+d/2)],'789295')
            for k in range(3):
                q=zz+(k-1)*d*.30
                box(right+.009,q,.056,.026,low,.61,'aeb0a0')
            box(pos,zz+d*.5,.41,.026,.46,.46,'8d604d','bd8d6d')
            face([(pos-.14,.56,zz+d*.5+.015),(pos+.14,.56,zz+d*.5+.015),
                  (pos+.14,.85,zz+d*.5+.015),(pos-.14,.85,zz+d*.5+.015)],'cbb48d',glow=.70)
    for dx,dz,h in [(-5.81,-3.3,5.06),(5.33,-3.5,3.85)]:
        xx,zz=x+dx,z+dz
        solid([oval(xx,zz,.34,.34,.24,14),oval(xx,zz,.19,.19,h,14)],'a27a66','a98f7b')
        for y in [h*.51,h*.82,h-.13]:
            disc(xx,zz,.242,.242,y,.071,'80695c','b08f78',12)
    for i in range(7):
        tree(x-4.8+i*1.65,z+4.28,.69,i%4,.21)
scoped('798-art-zone',art_zone)

def liangma(x,z):
    reach=smooth([(x-8,z-2.36),(x-3.8,z-1.73),(x,z-1.35),(x+5.2,z-.05),(x+9,z+1.06)],5)
    garden_walk(reach,'daceb0')
    garden_walk([(x0,z0+1.83) for x0,z0 in reach],'d1c9ab')
    bridge(x+.09,z-.37,1.15,3.05,-.20)
    for i,(a,b) in enumerate(reach[1:-1:2]):
        tree(a,b-.46,.68+(i%3)*.08,1,.19)
        flat(a,b+.06,.105,.105,.211,'eec58c',glow=.78)
    for dx,dz,angle in [(-3.0,-.95,-1.0),(3,.89,-1.2),(6.9,1.82,-1.16)]:
        box(x+dx,z+dz,.27,.78,.16,.13,'a39879','f2ddaa',angle,.08)
scoped('liangma-river',liangma)

def beijing_west(x,z):
    flat(x,z-1.45,18,9.1,.208,'b7b5a2')
    box(x,z,15.2,3.62,.22,1.73,'a99e8b','c7bda5')
    box(x,z-.37,15.34,2.43,1.95,.74,'b7af9d','d7c9ad')
    box(x,z-.16,5.25,3.3,.23,3.44,'adb0a4','d7d2b8')
    box(x,z-1.58,3.82,.12,.36,2.35,'6c858a','7e999b')
    for idx in range(8):
        xx=x+(idx-3.5)*.49
        box(xx,z-1.68,.09,.13,.27,2.43,'c0b49b')
    hall(x,z-.12,4.72,2.38,3.44,2,'935f4b',GREEN)
    for sign in (-1,1):
        for i in range(8):
            xx=x+sign*(3.17+i*.53)
            box(xx,z-1.87,.27,.08,.48,.65,'7f8c88')
        box(x+sign*6.23,z+.25,1.84,1.6,2.56,.64,'9b9c89','c1b498')
        roof(x+sign*6.23,z+.25,3.18,2.28,1.92,.48,GREEN)
    for i in range(8):
        line([(x-8,z+2.4+i*.33),(x+8,z+2.4+i*.33)],.059,.227,'8a8b82')
scoped('beijing-west',beijing_west)

def lane(x0,x1,z,wide=.43):
    line([(x0,z),(x1,z)],wide,.232,'c2b69c')
    if wide>.56:
        for side in (-1,1):
            edge=z+side*wide*.45
            line([(x0,edge),(x1,edge)],.026,.237,'ded0ad')
        for step in range(round((x1-x0)/.46)):
            x=x0+step*.46
            line([(x,z-wide*.47),(x,z+wide*.47)],.015,.233,'b5a78e')

def hutong_district(bounds,primary,seed):
    rng=random.Random(seed)
    west,east,north,south=bounds
    main=LOC['nanluoguxiang']['x'] if primary else (east+west)/2+rng.uniform(-.45,.45)
    flat((west+east)/2,(north+south)/2,east-west,south-north,.071,'b2a58b')
    line([(main,north+.23),(main,south-.2)],.73 if primary else .49,.231,'c9bca2')
    for sign in (-1,1):
        x=main+sign*(.35 if primary else .24)
        line([(x,north+.23),(x,south-.20)],.033,.234,'ded1b0')
    count=round((south-north)/2.73)
    splits=[north]+[north+(south-north)*i/count+rng.uniform(-.26,.26) for i in range(1,count)]+[south]
    for i in range(count):
        a,b=splits[i:i+2]
        if i:
            lane(west+.17,east-.22,a,.64 if i%2 else .49)
        for lo,hi in [(west+.24,main-.51),(main+.54,east-.23)]:
            if hi-lo<1.15:continue
            lots=max(1,round((hi-lo)/(1.76 if primary else 1.89)))
            boundaries=[lo]+[lo+(hi-lo)*n/lots+rng.uniform(-.25,.25) for n in range(1,lots)]+[hi]
            for k,(left,right) in enumerate(zip(boundaries,boundaries[1:])):
                u=(left+right)*.5
                w=right-left-.12
                z=(a+b)*.5+rng.uniform(-.14,.14)
                d=b-a-rng.uniform(.60,.79)
                if any(inwater(u+w*du,z+d*dv) or near_arterial(u+w*du,z+d*dv,.09)
                       for du,dv in ((0,0),(-.5,-.5),(.5,-.5),(-.5,.5),(.5,.5))):
                    continue
                if primary and (i,k) in ((0,2),(2,3),(count-1,1)) and w>1.36:
                    flat(u,z,w,d,.198,'a8aa80')
                    tree(u-.21,z+.11,.90,1,.201)
                    bench(u+.30,z+.25)
                else:
                    courtyard(u,z,w,d,rng,True,gates=rng.random()<.92)
        if i and primary:
            for sign in (-1,1):
                x=main+sign*.50
                z=a+.38+sign*.11
                distance=abs(z-LOC['nanluoguxiang']['z'])
                if distance>5.8:continue
                box(x,z,.03,.03,.22,.36,'786d54')
                box(x,z,.085,.085,.52,.105,'ad7151','db925e')
                flat(x,z,.056,.057,.626,'e4b67e',glow=.92)
    if primary:
        # Rooms and awnings facing the busy main alley.
        for index,z in enumerate([-12.7,-11.9,-10.7,-9.9,-6.0,-5.24,-4.03,-3.3,-1.85,-1.16]):
            sign=(-1,1)[index%2]
            x=main+sign*.45
            w=.63+(index%2)*.079
            col=['b78c62','835a46','a18362','90907a'][index%4]
            if near_arterial(x,z,.07):continue
            box(x,z,.19,w,.21,.46,'a29b87','8b887c')
            xx=x-sign*.102
            face([(xx,.258,z-w*.36),(xx,.258,z+w*.36),(xx,.57,z+w*.36),(xx,.57,z-w*.36)],
                 '816d56',normal=(-sign,0,0),glow=.38)
            box(x-sign*.063,z,.25,w+.095,.591,.059,col,col)
            if index%2==0:
                box(x-sign*.163,z,.029,w*.44,.527,.103,'a48059','c19d72')

def bench(x,z,turn=0):
    for side in (-1,1):
        box(x+side*.105,z,.035,.088,.211,.073,'847a64',rot=turn)
    box(x,z,.28,.103,.28,.036,'9d7856','b6966a',rot=turn)

def housing_district(bounds,primary,seed):
    rng=random.Random(seed)
    west,east,north,south=bounds
    span_x,span_z=east-west,south-north
    X=(west+east)/2; Z=(north+south)/2
    flat(X,Z,span_x,span_z,.19,'b9b49e')
    flat(X,Z,span_x-.46,span_z-.46,.197,'c8bea5')
    cross=Z-.23
    line([(west+.12,cross),(east-.12,cross)],.72,.208,'a7a493')
    line([(X,north+.16),(X,south-.16)],.63,.21,'b4a991')
    yards=[(X-span_x*.235,cross),(X+span_x*.235,cross)]
    for cx,cz in yards:
        flat(cx,cz,span_x*.34,span_z*.165,.217,'a2a87a')
        line([(cx-span_x*.175,cz),(cx+span_x*.175,cz)],.28,.223,'d5c7a8')
        for k in range(max(3,round(span_x*.37))):
            t=k/max(1,round(span_x*.37)-1)
            x=cx+(t-.5)*span_x*.30
            for sign in (-1,1):
                z=cz+sign*span_z*.064
                tree(x,z,rng.uniform(.67,1.12),rng.randrange(3),.219)
                if k%3==1:bench(x+.22,z-sign*.18)
    if primary:
        # Low brick walk-ups, slab blocks, and later towers around shared yards.
        blocks=[
            (-.35,-.33,.21,.13,6,0),(-.10,-.33,.19,.12,5,0),(.16,-.33,.20,.13,7,1),
            (.37,-.27,.13,.15,11,2),(-.32,-.14,.24,.104,4,0),(.22,-.14,.25,.104,6,1),
            (-.38,.17,.18,.125,8,1),(-.12,.19,.19,.125,4,0),(.14,.19,.20,.125,6,1),
            (.37,.25,.13,.15,12,2),(-.32,.39,.23,.083,5,0),(.29,.41,.21,.085,4,1)]
    else:
        blocks=[(-.24,-.24,.32,.18,6,0),(.24,-.28,.30,.16,7,1),
                (-.24,.25,.29,.17,5,0),(.24,.25,.26,.19,9,2)]
    for u,v,w,d,f,style in blocks:
        residential(X+u*span_x,Z+v*span_z,w*span_x,d*span_z,f,style,primary,rng)
    if primary:
        garden_x=X-span_x*.02
        garden_z=Z+span_z*.38
        flat(garden_x,garden_z,3.58,1.46,.217,'a98066')
        for k in range(5):
            flat(garden_x+(k-2)*.30,garden_z,.16,.66,.228,'b89a70')
        box(garden_x,garden_z,.95,.29,.232,.28,'899578','b2a972')
        for k in range(4):
            x=X+.63+k*.67
            z=north+.51
            box(x,z,.62,.51,.216,.48,'b9a288','b5ac90')
            facade_panel(x,z+.26,.41,.28,.29,'817766',.64)
            box(x,z+.29,.62,.18,.48,.065,['b29165','838974','a86e54','81938a'][k])
        for k in range(6):
            x=west+.51+(k*.94)
            tree(x,south-.62,.73+(k%2)*.11,k%3,.218)

for index,bounds in enumerate(HUTONG_ZONES):
    hutong_district(bounds,index==0,4901+index)
for index,bounds in enumerate(HOUSING_ZONES):
    housing_district(bounds,index==0,5163+index)

# Fine-scale rows along the central axis and main boulevard.
for z in [-38,-31,-23,20,21.2,33,35,44.2,46.6,49.4,51.5,55.4,57.5,59.5,63.3]:
    if 18<z<23:continue
    for s in [-1,1]:
        x=-2+s*(1.35 if z<0 else 1.04)
        if not inwater(x,z):tree(x,z,.55,R.randrange(3),.225)
for x in range(-76,70,3):
    if -23<x<17:continue
    for s in [-1,1]:
        near=min(roads[0][0],key=lambda p:abs(p[0]-x))[1]
        if not offroad(x,near+s*1.2): tree(x,near+s*1.2,.60,R.randrange(3),.23)

def export():
    OUT.mkdir(parents=True, exist_ok=True)
    blobs=[POSITION.tobytes(),NORMAL.tobytes(),COLOR.tobytes(),INDICES.tobytes(),GLOW.tobytes()]
    offset=0; views=[]
    for blob,target in zip(blobs,[34962,34962,34962,34963,34962]):
        views.append(dict(buffer=0,byteOffset=offset,byteLength=len(blob),target=target))
        offset+=len(blob)
    n=len(POSITION)//3
    accessors=[dict(bufferView=0,componentType=5126,count=n,type='VEC3',
                    min=[min(POSITION[i::3]) for i in range(3)],max=[max(POSITION[i::3]) for i in range(3)]),
        dict(bufferView=1,componentType=5126,count=n,type='VEC3'),
        dict(bufferView=2,componentType=5121,count=n,type='VEC4',normalized=True),
        dict(bufferView=3,componentType=5125,count=len(INDICES),type='SCALAR'),
        dict(bufferView=4,componentType=5126,count=n,type='SCALAR')]
    nodes=[dict(name='Beijing Diorama',mesh=0)]
    nodes += [dict(name=L['modelNode'],translation=[L['x'],L['y'],L['z']],extras=dict(locationId=L['id'])) for L in ATLAS['places']]
    doc=dict(asset=dict(version='2.0',generator='Unread City Beijing Sandbox'),scene=0,
        scenes=[dict(name='Beijing',nodes=list(range(len(nodes))))],nodes=nodes,
        meshes=[dict(name='City Surface',primitives=[dict(attributes=dict(POSITION=0,NORMAL=1,COLOR_0=2,_GLOW=4),indices=3,material=0)])],
        materials=[dict(name='Matte City Colors',doubleSided=True,pbrMetallicRoughness=dict(metallicFactor=0,roughnessFactor=.92))],
        buffers=[dict(byteLength=offset)],bufferViews=views,accessors=accessors)
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    encoded+=b' '*(-len(encoded)%4)
    data=b''.join(blobs)
    payload=struct.pack('<4sIII4s',b'glTF',2,28+len(encoded)+len(data),len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(data),b'BIN\x00')+data
    (OUT/ATLAS['model']).write_bytes(payload)
    print(f'{n:,} vertices, {len(INDICES)//3:,} triangles, {len(payload):,} bytes')

if __name__=='__main__':export()
