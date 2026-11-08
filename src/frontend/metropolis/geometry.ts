import type { Face, Layer, V3, World } from './types';
export function makeWorld(): World { return { faces: [], lines: [], landmarks: [], routes: [] }; }
export function face(w: World, points: V3[], color: string, layer: Layer, extra: Partial<Face> = {}) { w.faces.push({ points, color, layer, ...extra }); }
export function box(w: World, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, layer: Layer, extra: Partial<Face> = {}) {
 const a:V3=[x-sx/2,y,z-sz/2],b:V3=[x+sx/2,y,z-sz/2],c:V3=[x+sx/2,y,z+sz/2],d:V3=[x-sx/2,y,z+sz/2];
 const A:V3=[a[0],y+sy,a[2]],B:V3=[b[0],y+sy,b[2]],C:V3=[c[0],y+sy,c[2]],D:V3=[d[0],y+sy,d[2]];
 face(w,[A,D,C,B],color,layer); face(w,[a,A,B,b],color,layer,extra); face(w,[b,B,C,c],color,layer,extra); face(w,[c,C,D,d],color,layer,extra); face(w,[d,D,A,a],color,layer,extra);
}
export function cylinder(w:World,x:number,y:number,z:number,r:number,h:number,color:string,layer:Layer,segments=12,topR=r){
 const top:V3[]=[]; for(let n=0;n<segments;n++){const a=n/segments*Math.PI*2,b=(n+1)/segments*Math.PI*2;const p:V3=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q:V3=[x+Math.cos(b)*r,y,z+Math.sin(b)*r],P:V3=[x+Math.cos(a)*topR,y+h,z+Math.sin(a)*topR],Q:V3=[x+Math.cos(b)*topR,y+h,z+Math.sin(b)*topR];face(w,[p,P,Q,q],color,layer);top.push(P);} face(w,top.reverse(),color,layer);
}
export function ribbon(w:World,pts:V3[],width:number,color:string,layer:Layer,depth=0){
 for(let n=0;n<pts.length-1;n++){const a=pts[n],b=pts[n+1],dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,nx=-dz/l*width/2,nz=dx/l*width/2;const A:V3=[a[0]+nx,a[1],a[2]+nz],B:V3=[a[0]-nx,a[1],a[2]-nz],C:V3=[b[0]-nx,b[1],b[2]-nz],D:V3=[b[0]+nx,b[1],b[2]+nz];face(w,[A,D,C,B],color,layer,{doubleSided:true});if(depth){face(w,[A,[A[0],A[1]-depth,A[2]],[D[0],D[1]-depth,D[2]],D],color,layer,{doubleSided:true});face(w,[B,C,[C[0],C[1]-depth,C[2]],[B[0],B[1]-depth,B[2]]],color,layer,{doubleSided:true});}}
}
export function line(w:World,points:V3[],color:string,width:number,layer:Layer,glow=0){w.lines.push({points,color,width,layer,glow});}
export function rng(seed=99331){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function mix(a:V3,b:V3,t:number):V3{return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
export function smoothPath(points:V3[],segments=160,closed=false):V3[]{const out:V3[]=[];const len=points.length;for(let k=0;k<=segments;k++){const f=k/segments*(closed?len:len-1),i=Math.min(Math.floor(f),closed?len-1:len-2),t=f-i;const at=(n:number)=>points[closed?(n+len)%len:Math.max(0,Math.min(len-1,n))];const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);out.push([0,1,2].map(j=>.5*((2*b[j])+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t*t+(-a[j]+3*b[j]-3*c[j]+d[j])*t*t*t)) as V3);}return out;}
