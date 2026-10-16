// Overbooking: accept more reservations than rooms, because some guests cancel late or do not come.
// With n accepted and each arriving with probability p, arrivals follow a binomial distribution.
export interface Outcome { accepted: number; emptyRooms: number; walkedGuests: number; walkChance: number }

export function outcome(rooms: number, overbookPct: number, showRate: number): Outcome {
  const accepted = Math.floor(rooms * (1 + overbookPct / 100) + 1e-9);
  // P(k arrive) for k = 0..accepted, computed in log space to stay accurate
  const logC = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  let empty = 0, walked = 0, any = 0;
  for (let k = 0; k <= accepted; k += 1) {
    const pk = Math.exp(logC(accepted, k) + k * Math.log(showRate) + (accepted - k) * Math.log(1 - showRate));
    empty += pk * Math.max(0, rooms - k);
    walked += pk * Math.max(0, k - rooms);
    if (k > rooms) any += pk;
  }
  return { accepted, emptyRooms: empty, walkedGuests: walked, walkChance: any };
}
// The logarithm of the gamma function (Lanczos), enough for factorials of a few thousand.
function lgamma(x: number): number {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  g.forEach((c, i) => { a += c / (x + i + 1); });
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
