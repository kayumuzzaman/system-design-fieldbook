// Walks the whole tic-tac-toe game tree. Used by the tests and by figures.ts.
import { TicTacToe } from "./tictactoe.ts";

export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// A slow, obvious win check: look at every line of the board.
export function fullScan(cells: string): "X" | "O" | null {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, b, c] of lines) {
    const v = cells[a as number];
    if (v !== "." && v === cells[b as number] && v === cells[c as number]) return v as "X" | "O";
  }
  return null;
}

export function countTicTacToe() {
  const positions = new Set<string>(), terminal = new Set<string>();
  let games = 0, nodes = 0, checkedLines = 0;
  const seen = new Set<string>();
  const walk = (g: TicTacToe) => {
    nodes += 1;
    const key = g.key();
    positions.add(key);
    if (!seen.has(key)) {
      seen.add(key);
      const o = g.outcome();
      const expected = fullScan(key);
      if ((o.kind === "win" ? o.winner : null) === expected) checkedLines += 1;
    }
    if (g.outcome().kind !== "ongoing") { terminal.add(key); games += 1; return; }
    for (const m of g.legalMoves()) walk(g.play(m));
  };
  walk(TicTacToe.start());
  return { positions: positions.size, terminal: terminal.size, games, nodes, checkedLines };
}
