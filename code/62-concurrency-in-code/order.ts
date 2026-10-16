// In what order do these lines run? The log answers.
export function order(): Promise<string[]> {
  const log: string[] = [];
  return new Promise((done) => {
    log.push("A  synchronous code, first line");
    setTimeout(() => {
      log.push("F  timer callback: a new task");
      done(log);
    }, 0);
    Promise.resolve().then(() => log.push("D  promise callback: a microtask"));
    (async () => {
      log.push("B  async function, up to its first await");
      await null;
      log.push("E  async function, after the await: a microtask");
    })();
    log.push("C  synchronous code, last line");
  });
}
