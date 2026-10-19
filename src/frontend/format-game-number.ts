/** Display at most two decimal places without exposing binary float tails. */
export function formatGameNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
