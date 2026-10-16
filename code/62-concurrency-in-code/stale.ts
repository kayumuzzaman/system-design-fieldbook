// Wraps an asynchronous lookup so that only the most recent call's answer is delivered.
// An earlier call that finishes late resolves to undefined, and its signal is aborted so the work can stop.
export function latestOnly<A, R>(fn: (arg: A, signal: AbortSignal) => Promise<R>): (arg: A) => Promise<R | undefined> {
  let current: AbortController | null = null;
  return async (arg) => {
    current?.abort();
    const mine = new AbortController();
    current = mine;
    const result = await fn(arg, mine.signal);
    return mine.signal.aborted ? undefined : result;
  };
}

// Gives up on a slow operation. The operation is told through the signal, so it can stop its own work.
export async function withTimeout<R>(ms: number, fn: (signal: AbortSignal) => Promise<R>): Promise<R> {
  const signal = AbortSignal.timeout(ms);
  return Promise.race([
    fn(signal),
    new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  ]);
}
