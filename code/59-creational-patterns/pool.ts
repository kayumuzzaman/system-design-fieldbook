// A database connection pool: slow to create, and the program should have exactly one.
export class Pool {
  static created = 0;
  readonly number: number;
  constructor() {
    Pool.created += 1;
    this.number = Pool.created;
  }
}

async function connect(): Promise<Pool> {
  await new Promise((resolve) => setTimeout(resolve, 20)); // opening connections takes time
  return new Pool();
}

// Wrong: check, wait, then remember. A second caller arrives during the wait and also sees nothing.
let pool: Pool | undefined;
export async function getPoolRacy(): Promise<Pool> {
  if (!pool) pool = await connect();
  return pool;
}

// Right: remember the promise at once. Every caller, however early, gets the same one.
let pending: Promise<Pool> | undefined;
export function getPool(): Promise<Pool> {
  pending ??= connect();
  return pending;
}
