// Minimum-cost assignment of rows to columns (rows <= columns), the Hungarian method in its
// O(n² m) form with potentials. Returns, for each row, the column it gets.
export function assign(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = (cost[0] as number[]).length;
  if (m < n) throw new Error("more rows than columns");
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0), v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0), way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0] as number;
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const cur = (cost[i0 - 1] as number[])[j - 1] as number - (u[i0] as number) - (v[j] as number);
        if (cur < (minv[j] as number)) { minv[j] = cur; way[j] = j0; }
        if ((minv[j] as number) < delta) { delta = minv[j] as number; j1 = j; }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) { u[p[j] as number] = (u[p[j] as number] as number) + delta; v[j] = (v[j] as number) - delta; }
        else minv[j] = (minv[j] as number) - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0] as number; p[j0] = p[j1] as number; j0 = j1; } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j += 1) if ((p[j] as number) > 0) out[(p[j] as number) - 1] = j - 1;
  return out;
}
