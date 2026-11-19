/** Outdoor return points recorded by the first outing catalog. Only used when reading saves. */
const oldAccessPoints = new Map<string, string>([
  ['arakawa-tram', 'bus-stop'],
  ['ikebukuro-call-center', 'commercial'],
  ['haneoka-music', 'teaching'],
  ['haneoka-route', 'teaching'],
  ['cucumber-garden', 'home'],
  ['stage-backstage', 'grand-commercial'],
  ['stage-entrance', 'grand-commercial'],
  ['matcha-shop', 'commercial'],
  ['quiet-rooftop', 'teaching'],
  ['park-bench', 'city-park'],
  ['observation-roof', 'commercial'],
  ['rehearsal-hallway', 'grand-commercial'],
  ['photo-cafe', 'commercial'],
  ['herb-garden', 'home'],
  ['old-school-corridor', 'teaching'],
  ['quiet-courtyard', 'pocket-park'],
  ['quiet-teahouse', 'street-cafe'],
  ['ashigaya-rooftop', 'teaching'],
  ['queen-rose-street', 'downtown'],
  ['book-cafe', 'street-cafe'],
  ['cosplay-convention', 'commercial'],
  ['residential-supermarket', 'home'],
  ['cosplay-outdoor', 'commercial'],
]);

export function savedOutingLocation(id: string): string {
  return oldAccessPoints.get(id) ?? id;
}
