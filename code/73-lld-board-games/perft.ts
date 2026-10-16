import { Position } from "./chess.ts";

// Counts the positions reached after exactly `depth` moves. Published counts for standard positions make this
// the usual test of a chess move generator: a single wrong rule changes a number somewhere.
export function perft(position: Position, depth: number, legal = true): number {
  const moves = legal ? position.legalMoves() : position.pseudoLegalMoves();
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) total += perft(position.apply(m), depth - 1, legal);
  return total;
}

// Standard test positions with their published counts (chessprogramming.org, "Perft Results").
export const PERFT: { name: string; fen: string; counts: number[] }[] = [
  { name: "start", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", counts: [20, 400, 8_902, 197_281] },
  { name: "Kiwipete", fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", counts: [48, 2_039, 97_862] },
  { name: "position 3", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2_812, 43_238] },
  { name: "position 4", fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", counts: [6, 264, 9_467] },
  { name: "position 5", fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", counts: [44, 1_486, 62_379] },
];
