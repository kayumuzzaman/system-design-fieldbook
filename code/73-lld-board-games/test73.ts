import assert from "node:assert/strict";
import { IllegalMove, Match, playOut } from "./game.ts";
import { TicTacToe } from "./tictactoe.ts";
import { Position, square, uci, type Move } from "./chess.ts";
import { perft, PERFT } from "./perft.ts";
import { bestMove, RandomPlayer, search, SearchPlayer } from "./search.ts";
import { countTicTacToe, seeded } from "./explore.ts";

// ---------------------------------------------------------------- tic-tac-toe
{
  const counts = countTicTacToe();
  console.log("tic-tac-toe:", JSON.stringify(counts));
  assert.equal(counts.positions, 5_478);  // distinct positions that can occur, the empty board included
  assert.equal(counts.terminal, 958);     // of which the game is over
  assert.equal(counts.games, 255_168);    // different games, move by move
  assert.equal(counts.nodes, 549_946);    // positions in the full game tree, counting repeats
  assert.equal(counts.checkedLines, 5_478); // the constant-time win check agreed with a full scan every time
}
{
  // a game, an illegal move, and undo
  const m = new Match<number, TicTacToe>(TicTacToe.start());
  for (const sqr of [4, 0, 2, 1]) m.play(sqr);
  assert.throws(() => m.play(4), IllegalMove);
  assert.deepEqual(m.play(6), { kind: "win", winner: "X", reason: "a full line" }); // 2, 4, 6
  assert.throws(() => m.play(8), /over/);
  m.undo();
  assert.equal(m.current.toMove, "X");
  assert.deepEqual(m.history, ["X at 4", "O at 0", "X at 2", "O at 1"]);
  // a 4 by 4 board needs four in a line
  let g = TicTacToe.start(4);
  for (const s of [0, 4, 1, 5, 2, 6]) g = g.play(s);
  assert.equal(g.outcome().kind, "ongoing");
  assert.deepEqual(g.play(3).outcome(), { kind: "win", winner: "X", reason: "a full line" });
}
{
  // perfect play is a draw, and the search never loses to a random player
  assert.ok(search(TicTacToe.start(), 9, () => 0) === 0); // a draw (=== also accepts -0, which negation can produce)
  const random = seeded(1);
  const results = { won: 0, drawn: 0, lost: 0 };
  for (let i = 0; i < 400; i += 1) {
    const perfect = new SearchPlayer<number, TicTacToe>(9, () => 0), chance = new RandomPlayer<number, TicTacToe>(random);
    const asX = i % 2 === 0;
    const { outcome } = playOut(TicTacToe.start(), asX ? { X: perfect, O: chance } : { X: chance, O: perfect });
    if (outcome.kind === "draw") results.drawn += 1;
    else if (outcome.kind === "win" && (outcome.winner === "X") === asX) results.won += 1;
    else results.lost += 1;
  }
  console.log("perfect player against random, 400 games:", JSON.stringify(results));
  assert.equal(results.lost, 0);
}

// ---------------------------------------------------------------- chess: the move generator against published counts
const timings: Record<string, number> = {};
for (const p of PERFT) {
  const position = Position.fromFen(p.fen);
  const start = performance.now();
  p.counts.forEach((expected, i) => assert.equal(perft(position, i + 1), expected, `${p.name} depth ${i + 1}`));
  timings[p.name] = Math.round(performance.now() - start);
}
console.log("perft matched for every position; ms:", JSON.stringify(timings));
{
  // moves that follow the pieces' movement but ignore checks: right at first, wrong by depth 4
  const s = Position.start();
  const pseudo = [1, 2, 3, 4].map((d) => perft(s, d, false));
  console.log("start position, ignoring checks:", pseudo.join(", "));
  assert.deepEqual(pseudo.slice(0, 3), [20, 400, 8_902]);
  assert.ok((pseudo[3] as number) > 197_281);
  // what the extra positions are: the last move, black's second, leaves black's own king attacked
  const kinds = { ignoresCheck: 0, pinnedPiece: 0, kingIntoAttack: 0 };
  const walk = (p: Position, depth: number): void => {
    for (const m of p.pseudoLegalMoves()) {
      const next = p.apply(m);
      const safe = !next.isAttacked(next.kingSquare(p.turn), next.turn);
      if (depth > 1) { if (safe) walk(next, depth - 1); continue; }
      if (safe) continue;
      if (p.inCheck()) kinds.ignoresCheck += 1;
      else if (p.board[m.from]?.kind === "k") kinds.kingIntoAttack += 1;
      else kinds.pinnedPiece += 1;
    }
  };
  walk(s, 4);
  console.log("the extra positions at depth 4:", JSON.stringify(kinds));
  assert.equal(kinds.ignoresCheck + kinds.pinnedPiece + kinds.kingIntoAttack, (pseudo[3] as number) - 197_281);
}

// ---------------------------------------------------------------- chess: rules that need more than the board
const play = (fen: string, ...moves: string[]) => moves.reduce((p, m) => p.play(uci(m)), Position.fromFen(fen));
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
{
  // the fastest checkmate
  const fools = play(START, "f2f3", "e7e5", "g2g4", "d8h4");
  assert.deepEqual(fools.outcome(), { kind: "win", winner: "black", reason: "checkmate" });
  // stalemate: black to move, not in check, and nowhere to go
  assert.deepEqual(Position.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").outcome(), { kind: "draw", reason: "stalemate" });
  // a pinned bishop may not move at all
  const pinned = Position.fromFen("4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1");
  assert.equal(pinned.pseudoLegalMoves().filter((m) => m.from === square("e2")).length, 9);
  assert.equal(pinned.legalMoves().filter((m) => m.from === square("e2")).length, 0);
  // castling: allowed, then refused through an attacked square, and lost once the rook has moved
  const open = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  assert.ok(Position.fromFen(open).legalMoves().some((m) => m.flag === "castle" && m.to === square("g1")));
  const castled = play(open, "e1g1");
  assert.equal(castled.board[square("f1")]?.kind, "r");
  assert.equal(castled.castling, "kq");
  assert.throws(() => play("r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1", "e1g1"), IllegalMove); // f1 is attacked
  assert.equal(play(open, "h1h2").castling, "Qkq");
  assert.equal(play(open, "a1a8").castling, "Kk"); // capturing a rook on its square removes that right too
  // en passant: possible for one move only
  const ep = play("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", "d7d5");
  assert.equal(ep.enPassant, square("d6"));
  const taken = ep.play(uci("e5d6"));
  assert.equal(taken.board[square("d5")], null);
  assert.throws(() => play("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", "d7d5", "e1e2", "e8e7", "e5d6"), IllegalMove);
  // promotion must name a piece
  assert.equal(play("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8n").board[square("a8")]?.kind, "n");
  assert.throws(() => play("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8"), IllegalMove);
  // the record of positions starts afresh after a capture or pawn move, since none of them can occur again
  assert.equal(play(START, "g1f3", "g8f6").seen.size, 3);
  assert.equal(play(START, "g1f3", "g8f6", "e2e4").seen.size, 1);
  // draws by rule
  assert.equal(play("4k3/8/8/8/8/8/8/R3K3 w - - 99 80", "a1a2").outcome().kind, "draw");
  assert.deepEqual(play(START, "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8").outcome(), { kind: "draw", reason: "the same position three times" });
  // after a double step that no pawn can take en passant, the position is the same as the later ones without it
  const shuffle = ["g8f6", "g1f3", "f6g8", "f3g1"];
  assert.equal(play(START, "e2e4", ...shuffle, ...shuffle).outcome().kind, "draw");
  // but where en passant was possible, it is a different position: two more occurrences are not enough
  const kings = ["e1e2", "e8e7", "e2e1", "e7e8"];
  assert.equal(play("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", "d7d5", ...kings, ...kings).outcome().kind, "ongoing");
  assert.equal(play("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", "d7d5", ...kings, ...kings, ...kings).outcome().kind, "draw");
  assert.deepEqual(Position.fromFen("8/8/8/8/8/8/8/k5BK w - - 0 1").outcome(), { kind: "draw", reason: "neither side can checkmate" });
  assert.throws(() => uci("e2e9"), IllegalMove);
  assert.throws(() => Position.start().play(uci("e2e5")), IllegalMove);
}
{
  // the same search, given a material count, finds a mate in one in chess
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const material = (p: Position) => p.board.reduce((sum, piece) => sum + (piece ? (piece.color === p.turn ? 1 : -1) * (values[piece.kind] as number) : 0), 0);
  const scholar = Position.fromFen("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4");
  const { move } = bestMove<Move, Position>(scholar, 2, material);
  assert.equal(scholar.describe(move), "h5f7");
  const backRank = Position.fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  assert.equal(backRank.describe(bestMove<Move, Position>(backRank, 2, material).move), "a1a8");
  // and a Match keeps chess history the same way it keeps tic-tac-toe history
  const m = new Match<Move, Position>(Position.start());
  m.play(uci("e2e4")); m.play(uci("e7e5"));
  assert.deepEqual(m.history, ["e2e4", "e7e5"]);
  m.undo();
  assert.equal(m.current.toMove, "black");
}

console.log("all game tests passed");
