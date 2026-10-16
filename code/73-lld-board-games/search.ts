import type { Game, Player } from "./game.ts";

const WIN = 1_000_000;

// Negamax with alpha-beta pruning, for any game that fits the interface. The score is from the point of view of
// the side to move: positive is good for it. Wins found sooner score higher, so the search prefers the quickest.
export function search<M, G extends Game<M, G>>(game: G, depth: number, evaluate: (g: G) => number, alpha = -Infinity, beta = Infinity, ply = 0): number {
  const outcome = game.outcome();
  if (outcome.kind === "win") return -(WIN - ply); // the side to move has lost
  if (outcome.kind === "draw") return 0;
  if (depth === 0) return evaluate(game);
  let best = -Infinity;
  for (const move of game.legalMoves()) {
    const score = -search(game.play(move), depth - 1, evaluate, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // the opponent will never allow this line, so the rest need not be looked at
  }
  return best;
}

export function bestMove<M, G extends Game<M, G>>(game: G, depth: number, evaluate: (g: G) => number): { move: M; score: number } {
  let best: { move: M; score: number } | null = null;
  let alpha = -Infinity;
  for (const move of game.legalMoves()) {
    const score = -search(game.play(move), depth - 1, evaluate, -Infinity, -alpha, 1);
    if (!best || score > best.score) best = { move, score };
    if (score > alpha) alpha = score;
  }
  if (!best) throw new Error("no legal moves");
  return best;
}

export class SearchPlayer<M, G extends Game<M, G>> implements Player<M, G> {
  private readonly depth: number;
  private readonly evaluate: (g: G) => number;
  constructor(depth: number, evaluate: (g: G) => number) {
    this.depth = depth;
    this.evaluate = evaluate;
  }
  choose(game: G): M {
    return bestMove<M, G>(game, this.depth, this.evaluate).move;
  }
}

export class RandomPlayer<M, G extends Game<M, G>> implements Player<M, G> {
  private readonly random: () => number;
  constructor(random: () => number) {
    this.random = random;
  }
  choose(game: G): M {
    const moves = game.legalMoves();
    return moves[Math.floor(this.random() * moves.length)] as M;
  }
}
