import {phoneArt} from 'UNREAD_CITY_PHONE_ART';

const profiles = {
  soyo: {name:'长崎素世', title:'花叶与日常', ink:'#344f43', accent:'#52735f', base:'#f2eedf', fallback:'linear-gradient(145deg,#f2eedf,#adc1a4)', theme:'light', skin:'sky',
    daily:['worldmessages','worldcalendar','gallery','notes','worldshop','worlddelivery','appie','worldstyle'],
    focus:['worldcalendar','notes','music','appie','worldmessages','gallery','worldshop','worldstyle'], dock:['chat','music','peek','settings']},
  sakiko: {name:'丰川祥子', title:'夜曲与秩序', ink:'#edf2fa', accent:'#abc2e5', base:'#17283f', fallback:'linear-gradient(145deg,#0c172d,#30486e)', theme:'dark', skin:'sky',
    daily:['worldcalendar','notes','music','appie','worldmessages','worlddelivery','worldshop','worldstyle'],
    focus:['music','notes','worldcalendar','listen','appie','worldmessages','gallery','worldstyle'], dock:['chat','listen','peek','settings']},
};
export function worldPhoneState(screen) {
  try {
    const s=screen.ownerDocument.defaultView.parent.__unreadCityWorldPhone?.read();
    return s && profiles[s.active] && s.deviceId === `unread-city-phone-${s.active}` ? s : null;
  } catch { return null; }
}
export function worldAppearance(s) {
  const p=profiles[s.owner] || profiles.soyo, a=s.appearance || {};
  return {wallpaper:a.wallpaper==='plain'?'plain':'signature', theme:['light','dark','system'].includes(a.theme)?a.theme:p.theme, layout:a.layout==='focus'?'focus':'daily'};
}
export function worldPhoneHome(screen, original) {
  const s=worldPhoneState(screen); if(!s)return original;
  const p=profiles[s.active], a=worldAppearance(s), first=p[a.layout];
  const rest=[...new Set([...original.pages.flat(),...original.dock].filter(Boolean))].filter(id=>!first.includes(id)&&!p.dock.includes(id));
  const pages=[first];for(let i=0;i<rest.length;i+=8)pages.push(rest.slice(i,i+8));
  return {pages,dock:p.dock};
}
export function worldPhoneIcon(screen,id,art=phoneArt) {
  const s=worldPhoneState(screen), key=id==='worldpeek'?'peek':id;
  return s ? art[`${s.active}/icons/${key}.svg`] || null : null;
}
export function worldCardArt(owner,key,art=phoneArt) {
  const svg=art[`${owner}/cards/${key}.svg`];
  return svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : 'none';
}
export function applyWorldPhoneTheme(screen,art=phoneArt) {
  const s=worldPhoneState(screen);if(!s)return false;
  const doc=screen.ownerDocument, win=doc.defaultView, p=profiles[s.active], a=worldAppearance(s);
  const dark=a.theme==='dark'||a.theme==='system'&&win.matchMedia('(prefers-color-scheme: dark)').matches;
  doc.documentElement.dataset.theme=dark?'dark':'light';
  doc.documentElement.dataset.skin=p.skin;
  screen.dataset.worldOwner=s.active;screen.dataset.worldDevice=s.deviceId;
  screen.dataset.worldLayout=a.layout;screen.dataset.worldWallpaper=a.wallpaper;
  const svg=art[`${s.active}/wallpaper.svg`];
  const wall=a.wallpaper==='plain'?p.base:svg?`url("data:image/svg+xml,${encodeURIComponent(svg)}"),${p.fallback}`:p.fallback;
  for(const [key,value] of Object.entries({'--wall':wall,'--wall-size':'cover','--wall-pos':'center','--wall-ink':p.ink,'--label-halo':'transparent','--world-accent':p.accent,'--clock-stroke':'transparent','--clock-shadow':'transparent'}))screen.style.setProperty(key,value);
  screen.dataset.clockStyle='shade';screen.dataset.iconStyle='color';
  screen.querySelector('.wallpaper')?.replaceChildren();
  return true;
}
export function worldDeviceHeading(s) {
  const p=profiles[s.owner] || profiles.soyo;
  return {title:p.title, device:`${p.name}的手机`};
}

export function worldPhoneTheme(screen) {
  const s=worldPhoneState(screen);return s?worldAppearance(s).theme:null;
}
export async function saveWorldPhoneTheme(screen,theme) {
  const s=worldPhoneState(screen);if(!s)return false;
  await screen.ownerDocument.defaultView.parent.__unreadCityWorldPhone.act({binding:s.binding,revision:s.revision,requestId:screen.ownerDocument.defaultView.crypto.randomUUID(),owner:s.active,command:{type:'appearance',appearance:{...worldAppearance(s),theme}}});
  applyWorldPhoneTheme(screen);return true;
}
