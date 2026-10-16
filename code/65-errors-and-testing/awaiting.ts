const fragile = async (): Promise<string> => {
  throw new Error("the database is down");
};

// The promise is returned before it rejects, so this try block has already been left. The catch never runs.
export async function withoutAwait(): Promise<string> {
  try {
    return fragile();
  } catch {
    return "fallback";
  }
}

// Awaiting inside the try keeps the function here until the promise settles, so the catch can see the failure.
export async function withAwait(): Promise<string> {
  try {
    return await fragile();
  } catch {
    return "fallback";
  }
}
