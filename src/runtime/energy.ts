/** Saved energy uses hundredths; arithmetic is performed on integer units. */
export function energyUnits(value: number): number {
  return Math.round(value * 100);
}

export function adjustEnergy(value: number, change: number): number {
  return Math.min(10000, Math.max(0, energyUnits(value) + energyUnits(change))) / 100;
}

export function energyDifference(after: number, before: number): number {
  return (energyUnits(after) - energyUnits(before)) / 100;
}
