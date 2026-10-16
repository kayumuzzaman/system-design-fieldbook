// What every two-player, turn-based game in this chapter offers. A game state never changes:
// play returns the next state, so undo is keeping the old one, and a search can explore freely.
export type Outcome =
  | { kind: "ongoing" }
  | { kind: "win"; winner: string; reason: string }
  | { kind: "draw"; reason: string };

export interface Game<M, G extends Game<M, G>> {
  readonly toMove: string;          // whose turn it is, such as "X" or "white"
  legalMoves(): M[];
  play(move: M): G;                 // the state after the move; throws IllegalMove if it is not allowed
  outcome(): Outcome;
  describe(move: M): string;        // for history and error messages
}

export class IllegalMove extends Error {}

// A match: a game in progress, its history, and undo. It works for any game that fits the interface.
export class Match<M, G extends Game<M, G>> {
  private readonly states: G[];
  private readonly moves: string[] = [];

  constructor(start: G) {
    this.states = [start];
  }

  get current(): G {
    return this.states[this.states.length - 1] as G;
  }
  get history(): readonly string[] {
    return this.moves;
  }

  play(move: M): Outcome {
    const now = this.current.outcome();
    if (now.kind !== "ongoing") throw new IllegalMove("the game is over");
    const next = this.current.play(move); // the game decides what is legal; the match only keeps the record
    this.moves.push(this.current.describe(move));
    this.states.push(next);
    return next.outcome();
  }

  undo(): void {
    if (this.states.length === 1) throw new Error("nothing to undo");
    this.states.pop();
    this.moves.pop();
  }
}

export interface Player<M, G extends Game<M, G>> {
  choose(game: G): M;
}

// Plays a whole game between two players, and returns the result and the moves.
export function playOut<M, G extends Game<M, G>>(start: G, players: Record<string, Player<M, G>>, maxMoves = 1000) {
  const match = new Match<M, G>(start);
  let outcome = match.current.outcome();
  while (outcome.kind === "ongoing" && match.history.length < maxMoves) {
    const player = players[match.current.toMove];
    if (!player) throw new Error(`no player for ${match.current.toMove}`);
    outcome = match.play(player.choose(match.current));
  }
  return { outcome, moves: match.history };
}
