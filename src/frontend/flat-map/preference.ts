import { ref, readonly } from 'vue';
export type MapMode = '2d'|'3d';
const key='unread-city.map.view.v1';
function initial():MapMode {try{return localStorage.getItem(key)==='3d'?'3d':'2d'}catch{return '2d'}}
const mode=ref<MapMode>(initial());
export const mapMode=readonly(mode);
export function setMapMode(value:MapMode){mode.value=value;try{localStorage.setItem(key,value)}catch{/* Session preference still works. */}}
