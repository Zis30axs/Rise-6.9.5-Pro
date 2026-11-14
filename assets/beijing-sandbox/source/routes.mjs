export function planRoute(atlas, from, to) {
  const byId = new Map(atlas.places.map(place => [place.id, place]));
  if (!byId.has(from) || !byId.has(to)) return null;
  const remaining = new Set(byId.keys());
  const adjacency = new Map([...remaining].map(id => [id, []]));
  for (const edge of atlas.routes) {
    adjacency.get(edge.from).push(edge);
    adjacency.get(edge.to).push({ ...edge, from: edge.to, to: edge.from, points: [...edge.points].reverse() });
  }
  const distance = new Map([[from, 0]]);
  const previous = new Map();
  while (remaining.size) {
    let next;
    let best = Infinity;
    for (const id of remaining) {
      if ((distance.get(id) ?? Infinity) < best) {
        next = id;
        best = distance.get(id);
      }
    }
    if (next === undefined) return null;
    if (next === to) break;
    remaining.delete(next);
    for (const edge of adjacency.get(next)) {
      const total = best + edge.minutes;
      if (total >= (distance.get(edge.to) ?? Infinity)) continue;
      distance.set(edge.to, total);
      previous.set(edge.to, edge);
    }
  }
  const legs = [];
  for (let id = to; id !== from;) {
    const edge = previous.get(id);
    if (!edge) return null;
    legs.unshift(edge);
    id = edge.from;
  }
  return {
    from, to, minutes: distance.get(to), legs,
    methods: [...new Set(legs.map(leg => leg.method))],
    points: legs.flatMap((leg, index) => index ? leg.points.slice(1) : leg.points),
  };
}

export function planTour(atlas, tour) {
  const sections = tour.stops.slice(1).map((to, index) => planRoute(atlas, tour.stops[index], to));
  if (sections.some(section => !section)) return null;
  const legs = sections.flatMap(section => section.legs);
  return {
    from: tour.stops[0], to: tour.stops.at(-1), legs,
    minutes: sections.reduce((sum, section) => sum + section.minutes, 0),
    methods: [...new Set(legs.map(leg => leg.method))],
    points: legs.flatMap((leg, index) => index ? leg.points.slice(1) : leg.points),
  };
}
