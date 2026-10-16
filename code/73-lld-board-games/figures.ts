// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import type { Game, Outcome } from "./game.ts";
import { TicTacToe } from "./tictactoe.ts";
import { search } from "./search.ts";
import { Position } from "./chess.ts";
import { perft, PERFT } from "./perft.ts";

// A tic-tac-toe position with three empty squares, X to move, whose three moves lead to a win, a draw and a loss.
function pick(): string {
  const found: string[] = [];
  const walk = (g: TicTacToe) => {
    if (g.outcome().kind !== "ongoing") return;
    const moves = g.legalMoves();
    if (moves.length === 3 && g.toMove === "X") {
      const values = moves.map((m) => -search(g.play(m), 9, () => 0)).map(Math.sign).sort().join(",");
      if (values === "-1,0,1") found.push(g.key());
      return;
    }
    for (const m of moves) walk(g.play(m));
  };
  walk(TicTacToe.start());
  return [...new Set(found)].sort()[0] as string;
}
const fromKey = (key: string) => {
  // replays a position: X and O alternately, X first, taking the marked squares in order
  const xs = [...key].flatMap((c, i) => (c === "X" ? [i] : [])), os = [...key].flatMap((c, i) => (c === "O" ? [i] : []));
  let g = TicTacToe.start();
  for (let i = 0; i < xs.length; i += 1) { g = g.play(xs[i] as number); if (os[i] !== undefined) g = g.play(os[i] as number); }
  return g;
};
// The full tree below it: each node with its board, the move that led to it, and its value for X.
interface Node { key: string; move: number | null; value: number; children: Node[] }
const tree = (g: TicTacToe, move: number | null): Node => {
  const o = g.outcome();
  const forX = (v: number) => (g.toMove === "X" ? v : -v);
  const value = Math.sign(forX(search(g, 9, () => 0)));
  return { key: g.key(), move, value, children: o.kind === "ongoing" ? g.legalMoves().map((m) => tree(g.play(m), m)) : [] };
};
// Wraps a game so that every position the search moves into is recorded. The search itself is unchanged.
// With winsFirst, moves that win at once are offered first: the simplest kind of move ordering.
class Traced implements Game<number, Traced> {
  readonly inner: TicTacToe;
  readonly path: string;
  private readonly log: string[];
  private readonly winsFirst: boolean;
  constructor(inner: TicTacToe, path: string, log: string[], winsFirst: boolean) {
    this.inner = inner; this.path = path; this.log = log; this.winsFirst = winsFirst;
  }
  get toMove(): string { return this.inner.toMove; }
  legalMoves(): number[] {
    const moves = this.inner.legalMoves();
    if (!this.winsFirst) return moves;
    const wins = (m: number) => this.inner.play(m).outcome().kind === "win";
    return [...moves.filter(wins), ...moves.filter((m) => !wins(m))];
  }
  play(move: number): Traced {
    const path = this.path + move;
    this.log.push(path);
    return new Traced(this.inner.play(move), path, this.log, this.winsFirst);
  }
  outcome(): Outcome { return this.inner.outcome(); }
  describe(move: number): string { return this.inner.describe(move); }
}
const visits = (g: TicTacToe, winsFirst: boolean) => {
  const log: string[] = [];
  const value = search(new Traced(g, "", log, winsFirst), 9, () => 0);
  return { value: Math.sign(value), visited: log };
};
const key = pick();
const timings = PERFT.map((p) => {
  const pos = Position.fromFen(p.fen);
  const depth = p.counts.length;
  const start = performance.now();
  const nodes = perft(pos, depth);
  return { name: p.name, depth, nodes, ms: Math.round(performance.now() - start) };
});
const pseudo = [1, 2, 3, 4].map((d) => ({ depth: d, legal: perft(Position.start(), d), pseudo: perft(Position.start(), d, false) }));
const sub = fromKey(key);
const trace = { natural: visits(sub, false), winsFirst: visits(sub, true) };
const empty = { natural: visits(TicTacToe.start(), false).visited.length, winsFirst: visits(TicTacToe.start(), true).visited.length };
console.log(JSON.stringify({ tree: tree(sub, null), trace, empty, timings, pseudo }));
