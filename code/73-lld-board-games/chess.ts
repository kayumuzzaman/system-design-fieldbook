import { IllegalMove, type Game, type Outcome } from "./game.ts";

export type Color = "w" | "b";
export type Kind = "p" | "n" | "b" | "r" | "q" | "k";
export interface Piece { readonly color: Color; readonly kind: Kind }
export interface Move {
  readonly from: number;      // squares are 0 to 63: a1 is 0, h1 is 7, a8 is 56
  readonly to: number;
  readonly promotion?: Kind;
  readonly flag?: "double" | "enPassant" | "castle";
}

const sq = (file: number, rank: number) => rank * 8 + file;
const fileOf = (s: number) => s & 7;
const rankOf = (s: number) => s >> 3;
export const squareName = (s: number) => "abcdefgh"[fileOf(s)] + String(rankOf(s) + 1);
export const square = (name: string) => sq(name.charCodeAt(0) - 97, Number(name[1]) - 1);
const step = (s: number, df: number, dr: number) => {
  const f = fileOf(s) + df, r = rankOf(s) + dr;
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? sq(f, r) : -1;
};
const other = (c: Color): Color => (c === "w" ? "b" : "w");

// How each piece moves, as data: a set of directions, and whether it may keep going in a direction.
// The pawn is the exception, and has its own code below.
type Dir = readonly [number, number];
const ORTHOGONAL: Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL: Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT: Dir[] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
export const MOVEMENT: Record<Exclude<Kind, "p">, { dirs: Dir[]; slides: boolean }> = {
  n: { dirs: KNIGHT, slides: false },
  b: { dirs: DIAGONAL, slides: true },
  r: { dirs: ORTHOGONAL, slides: true },
  q: { dirs: [...ORTHOGONAL, ...DIAGONAL], slides: true },
  k: { dirs: [...ORTHOGONAL, ...DIAGONAL], slides: false },
};
const ROOK_HOME: Record<string, number> = { K: 7, Q: 0, k: 63, q: 56 };

// A position: everything needed to decide what is legal next, including what the board alone cannot show.
export class Position implements Game<Move, Position> {
  readonly board: readonly (Piece | null)[];
  readonly turn: Color;
  readonly castling: string;          // the castling rights left, a subset of "KQkq"
  readonly enPassant: number | null;  // the square a pawn skipped on the last move, if any
  readonly halfmoves: number;         // moves since the last capture or pawn move, for the fifty-move rule
  readonly seen: ReadonlyMap<string, number>; // how often each position has occurred since the last capture or pawn move

  private constructor(board: (Piece | null)[], turn: Color, castling: string, enPassant: number | null, halfmoves: number, seen: Map<string, number>) {
    this.board = board; this.turn = turn; this.castling = castling; this.enPassant = enPassant; this.halfmoves = halfmoves;
    const key = this.key();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    this.seen = seen;
  }

  get toMove(): string {
    return this.turn === "w" ? "white" : "black";
  }

  static start(): Position {
    return Position.fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  }

  // Forsyth-Edwards Notation: the standard one-line description of a position.
  static fromFen(fen: string): Position {
    const [placement, turn, castling, ep, half] = fen.trim().split(/\s+/);
    const board: (Piece | null)[] = Array(64).fill(null);
    const ranks = (placement ?? "").split("/");
    if (ranks.length !== 8) throw new Error(`bad FEN: ${fen}`);
    ranks.forEach((row, i) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { file += Number(ch); continue; }
        const kind = ch.toLowerCase() as Kind;
        if (!"pnbrqk".includes(kind)) throw new Error(`bad piece ${ch}`);
        board[sq(file, 7 - i)] = { color: ch === kind ? "b" : "w", kind };
        file += 1;
      }
      if (file !== 8) throw new Error(`bad FEN rank: ${row}`);
    });
    return new Position(board, turn === "b" ? "b" : "w", castling === "-" || !castling ? "" : castling, ep && ep !== "-" ? square(ep) : null, Number(half ?? 0), new Map());
  }

  // Two positions are the same for the repetition rule when the same moves are possible in both. So the en passant
  // square counts only when a pawn stands ready to capture there (whether that capture would expose its king is not checked).
  key(): string {
    const ep = this.enPassant;
    const back = this.turn === "w" ? -1 : 1;
    const canTake = ep !== null && [-1, 1].some((df) => {
      const p = this.board[step(ep, df, back)];
      return p !== undefined && p !== null && p.color === this.turn && p.kind === "p";
    });
    return this.board.map((p) => (p ? (p.color === "w" ? p.kind.toUpperCase() : p.kind) : ".")).join("") + this.turn + this.castling + (canTake ? ep : "-");
  }

  // Is this square attacked by a piece of the given color? Looks outward from the square.
  isAttacked(target: number, by: Color): boolean {
    const at = (s: number) => (s >= 0 ? this.board[s] : null);
    const pawnRank = by === "w" ? -1 : 1; // a white pawn attacks upward, so it stands one rank below
    for (const df of [-1, 1]) {
      const p = at(step(target, df, pawnRank));
      if (p && p.color === by && p.kind === "p") return true;
    }
    for (const kind of ["n", "k"] as const) {
      for (const [df, dr] of MOVEMENT[kind].dirs) {
        const p = at(step(target, df, dr));
        if (p && p.color === by && p.kind === kind) return true;
      }
    }
    for (const [dirs, kinds] of [[ORTHOGONAL, "rq"], [DIAGONAL, "bq"]] as const) {
      for (const [df, dr] of dirs) {
        for (let s = step(target, df, dr); s >= 0; s = step(s, df, dr)) {
          const p = this.board[s];
          if (!p) continue;
          if (p.color === by && kinds.includes(p.kind)) return true;
          break;
        }
      }
    }
    return false;
  }

  kingSquare(color: Color): number {
    return this.board.findIndex((p) => p?.color === color && p.kind === "k");
  }
  inCheck(): boolean {
    return this.isAttacked(this.kingSquare(this.turn), other(this.turn));
  }

  // Moves that follow how the pieces move, without asking whether they leave the king in check.
  pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    const us = this.turn;
    for (let from = 0; from < 64; from += 1) {
      const piece = this.board[from];
      if (!piece || piece.color !== us) continue;
      if (piece.kind === "p") { this.pawnMoves(from, moves); continue; }
      const { dirs, slides } = MOVEMENT[piece.kind];
      for (const [df, dr] of dirs) {
        for (let to = step(from, df, dr); to >= 0; to = slides ? step(to, df, dr) : -1) {
          const there = this.board[to];
          if (there && there.color === us) break;
          moves.push({ from, to });
          if (there) break;
        }
      }
    }
    this.castlingMoves(moves);
    return moves;
  }

  private pawnMoves(from: number, moves: Move[]): void {
    const dir = this.turn === "w" ? 1 : -1;
    const lastRank = this.turn === "w" ? 7 : 0;
    const add = (to: number, flag?: Move["flag"]) => {
      if (rankOf(to) === lastRank) for (const promotion of ["q", "r", "b", "n"] as const) moves.push({ from, to, promotion });
      else moves.push(flag ? { from, to, flag } : { from, to });
    };
    const one = step(from, 0, dir);
    if (one >= 0 && !this.board[one]) {
      add(one);
      const two = step(from, 0, 2 * dir);
      if (rankOf(from) === (this.turn === "w" ? 1 : 6) && !this.board[two]) add(two, "double");
    }
    for (const df of [-1, 1]) {
      const to = step(from, df, dir);
      if (to < 0) continue;
      const there = this.board[to];
      if (there && there.color !== this.turn) add(to);
      else if (to === this.enPassant) add(to, "enPassant");
    }
  }

  private castlingMoves(moves: Move[]): void {
    const them = other(this.turn);
    const options = this.turn === "w"
      ? [{ right: "K", king: 4, to: 6, empty: [5, 6], safe: [4, 5, 6] }, { right: "Q", king: 4, to: 2, empty: [1, 2, 3], safe: [4, 3, 2] }]
      : [{ right: "k", king: 60, to: 62, empty: [61, 62], safe: [60, 61, 62] }, { right: "q", king: 60, to: 58, empty: [57, 58, 59], safe: [60, 59, 58] }];
    for (const o of options) {
      if (!this.castling.includes(o.right)) continue;
      if (o.empty.some((s) => this.board[s])) continue;
      if (o.safe.some((s) => this.isAttacked(s, them))) continue; // not out of, through, or into check
      moves.push({ from: o.king, to: o.to, flag: "castle" });
    }
  }

  // The position after a move, assumed to be at least pseudo-legal.
  apply(move: Move): Position {
    const board = [...this.board];
    const piece = board[move.from] as Piece;
    const captured = board[move.to] ?? (move.flag === "enPassant" ? board[sq(fileOf(move.to), rankOf(move.from))] : null);
    board[move.to] = move.promotion ? { color: piece.color, kind: move.promotion } : piece;
    board[move.from] = null;
    if (move.flag === "enPassant") board[sq(fileOf(move.to), rankOf(move.from))] = null;
    if (move.flag === "castle") {
      const [rookFrom, rookTo] = move.to === 6 ? [7, 5] : move.to === 2 ? [0, 3] : move.to === 62 ? [63, 61] : [56, 59];
      board[rookTo] = board[rookFrom] as Piece;
      board[rookFrom] = null;
    }
    let castling = this.castling;
    if (piece.kind === "k") castling = castling.replace(piece.color === "w" ? /[KQ]/g : /[kq]/g, "");
    for (const [right, home] of Object.entries(ROOK_HOME)) if (move.from === home || move.to === home) castling = castling.replace(right, "");
    const enPassant = move.flag === "double" ? (move.from + move.to) / 2 : null;
    const halfmoves = piece.kind === "p" || captured ? 0 : this.halfmoves + 1;
    // After a capture or a pawn move no earlier position can occur again, so the record of them starts afresh.
    return new Position(board, other(this.turn), castling, enPassant, halfmoves, halfmoves === 0 ? new Map() : new Map(this.seen));
  }

  // The rule that no piece knows about: a move may not leave your own king attacked.
  legalMoves(): Move[] {
    return this.pseudoLegalMoves().filter((m) => {
      const next = this.apply(m);
      return !next.isAttacked(next.kingSquare(this.turn), next.turn);
    });
  }

  play(move: Move): Position {
    const legal = this.legalMoves().find((m) => m.from === move.from && m.to === move.to && (m.promotion ?? null) === (move.promotion ?? null));
    if (!legal) throw new IllegalMove(`${this.describe(move)} is not legal here`);
    return this.apply(legal);
  }

  outcome(): Outcome {
    if (this.legalMoves().length === 0) {
      return this.inCheck()
        ? { kind: "win", winner: this.turn === "w" ? "black" : "white", reason: "checkmate" }
        : { kind: "draw", reason: "stalemate" };
    }
    if (this.halfmoves >= 100) return { kind: "draw", reason: "fifty moves without a capture or pawn move" };
    if ((this.seen.get(this.key()) ?? 0) >= 3) return { kind: "draw", reason: "the same position three times" };
    if (this.insufficientMaterial()) return { kind: "draw", reason: "neither side can checkmate" };
    return { kind: "ongoing" };
  }

  private insufficientMaterial(): boolean {
    const rest = this.board.filter((p): p is Piece => p !== null && p.kind !== "k");
    return rest.length === 0 || (rest.length === 1 && (rest[0]?.kind === "b" || rest[0]?.kind === "n"));
  }

  describe(move: Move): string {
    return squareName(move.from) + squareName(move.to) + (move.promotion ?? "");
  }
}

// Reads a move in the form used by chess programs: "e2e4", or "e7e8q" for a promotion.
export function uci(text: string): Move {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text);
  if (!m) throw new IllegalMove(`cannot read move ${text}`);
  return m[3] ? { from: square(m[1] as string), to: square(m[2] as string), promotion: m[3] as Kind } : { from: square(m[1] as string), to: square(m[2] as string) };
}
