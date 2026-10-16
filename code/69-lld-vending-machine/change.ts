export type Coin = 5 | 10 | 25 | 100 | 200; // values in cents
export const denominations: readonly Coin[] = [200, 100, 25, 10, 5];
export type CoinCounts = Readonly<Partial<Record<Coin, number>>>;

// Largest coin first. Fast, and wrong when a coin it wants has run out.
export function greedyChange(amount: number, available: CoinCounts): Coin[] | null {
  const given: Coin[] = [];
  let left = amount;
  for (const coin of denominations) {
    let have = available[coin] ?? 0;
    while (left >= coin && have > 0) {
      given.push(coin);
      left -= coin;
      have -= 1;
    }
  }
  return left === 0 ? given : null;
}

// Finds a way to pay exactly `amount` from the coins available, using as few coins as possible, or null if there is none.
// fewest[a] is the smallest number of coins that add up to a, using only the coins considered so far.
export function makeChange(amount: number, available: CoinCounts): Coin[] | null {
  if (!Number.isInteger(amount) || amount < 0) return null;
  const fewest = new Array<number>(amount + 1).fill(Infinity);
  const picked = new Array<Coin[]>(amount + 1);
  fewest[0] = 0;
  picked[0] = [];
  for (const coin of denominations) {
    for (let n = 0; n < (available[coin] ?? 0); n += 1) {       // each physical coin can be used once
      for (let a = amount; a >= coin; a -= 1) {                 // downward, so this coin is not counted twice
        if ((fewest[a - coin] as number) + 1 < (fewest[a] as number)) {
          fewest[a] = (fewest[a - coin] as number) + 1;
          picked[a] = [...(picked[a - coin] as Coin[]), coin];
        }
      }
    }
  }
  return picked[amount] ?? null;
}

export const total = (coins: readonly Coin[]): number => coins.reduce((sum, coin) => sum + coin, 0);
