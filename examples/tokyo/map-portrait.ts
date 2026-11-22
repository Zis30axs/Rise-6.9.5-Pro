import crops from 'virtual:tokyo-map-crops';
const entries = Object.entries(crops as Record<string, [string, string]>);
type Identity = { name: string; personId?: string; protagonistId?: string };
export function resolveMapCharacterAvatar(person: Identity) {
  const id = (person.personId || person.protagonistId || '')
    .replace(/^bang-/, '')
    .replace(/^watanare-/, 'wata-');
  const entry = entries.find(
    ([key, [name]]) =>
      key === id || name === person.name || key === 'majo-' + id
  );
  return entry ? { kind: 'headshot', src: entry[1][1] } : null;
}
export const mapSpriteObjectPosition = () => 'center';
export const mapAvatarInitials = (name: string) =>
  Array.from(name.trim()).slice(-2).join('');
