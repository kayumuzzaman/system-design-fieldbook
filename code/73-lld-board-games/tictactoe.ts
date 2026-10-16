import { IllegalMove, type Game, type Outcome } from "./game.ts";

type Mark = "X" | "O";

// Tic-tac-toe on an n-by-n board, won by a full row, column or diagonal. A move is a square number, 0 to n² - 1.
// Each line keeps a running count, +1 for X and -1 for O, so checking for a win after a move takes constant time.
export class TicTacToe implements Game<number, TicTacToe> {
  readonly n: number;
  readonly toMove: Mark;
  private readonly cells: readonly (Mark | null)[];
  private readonly rows: readonly number[];
  private readonly cols: readonly number[];
  private readonly diagonals: readonly [number, number]; // top-left to bottom-right, and top-right to bottom-left
  private readonly winner: Mark | null;
  private readonly filled: number;

  private constructor(n: number, toMove: Mark, cells: (Mark | null)[], rows: number[], cols: number[], diagonals: [number, number], winner: Mark | null, filled: number) {
    this.n = n; this.toMove = toMove; this.cells = cells; this.rows = rows; this.cols = cols;
    this.diagonals = diagonals; this.winner = winner; this.filled = filled;
  }

  static start(n = 3): TicTacToe {
    if (!Number.isInteger(n) || n < 3) throw new Error("the board is at least 3 by 3");
    return new TicTacToe(n, "X", Array(n * n).fill(null), Array(n).fill(0), Array(n).fill(0), [0, 0], null, 0);
  }

  legalMoves(): number[] {
    if (this.winner) return [];
    return this.cells.flatMap((c, i) => (c === null ? [i] : []));
  }

  play(square: number): TicTacToe {
    if (this.winner || this.filled === this.n * this.n) throw new IllegalMove("the game is over");
    if (!Number.isInteger(square) || square < 0 || square >= this.n * this.n) throw new IllegalMove(`no square ${square}`);
    if (this.cells[square] !== null) throw new IllegalMove(`square ${square} is taken`);
    const { n } = this;
    const r = Math.floor(square / n), c = square % n, d = this.toMove === "X" ? 1 : -1;
    const cells = [...this.cells]; cells[square] = this.toMove;
    const rows = [...this.rows]; rows[r] = (rows[r] as number) + d;
    const cols = [...this.cols]; cols[c] = (cols[c] as number) + d;
    const diagonals: [number, number] = [this.diagonals[0] + (r === c ? d : 0), this.diagonals[1] + (r + c === n - 1 ? d : 0)];
    const won = [rows[r], cols[c], ...diagonals].some((count) => Math.abs(count as number) === n); // only lines through this square can have changed
    return new TicTacToe(n, this.toMove === "X" ? "O" : "X", cells, rows, cols, diagonals, won ? this.toMove : null, this.filled + 1);
  }

  outcome(): Outcome {
    if (this.winner) return { kind: "win", winner: this.winner, reason: "a full line" };
    if (this.filled === this.n * this.n) return { kind: "draw", reason: "the board is full" };
    return { kind: "ongoing" };
  }

  describe(square: number): string {
    return `${this.toMove} at ${square}`;
  }

  // A key for the position, used to count distinct positions.
  key(): string {
    return this.cells.map((c) => c ?? ".").join("");
  }
}
