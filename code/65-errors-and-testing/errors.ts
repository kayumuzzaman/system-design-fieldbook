// A base class for the application's own errors: a stable code for programs, a message for people, the cause for engineers.
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name; // "ConflictError", not "Error", in logs and stack traces
    this.code = code;
    this.status = status;
  }
}
export class NotFoundError extends AppError {
  constructor(what: string, options?: { cause?: unknown }) { super("not-found", 404, `${what} does not exist`, options); }
}
export class ConflictError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) { super("conflict", 409, message, options); }
}
export class RuleError extends AppError {
  constructor(message: string) { super("rule-violated", 422, message); }
}

// At a boundary: turn a low-level failure into one of ours, and keep the original attached as the cause.
export async function savingOrder<T>(orderId: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      throw new ConflictError(`order ${orderId} already exists`, { cause: error });
    }
    throw error; // not ours to interpret: let it travel
  }
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
}
export interface LogEntry {
  level: "info" | "error";
  code: string;
  message: string;
  causes: string[];
  stack?: string;
}

// The outermost handler: the only place that turns an error into a response and a log line.
export function toResponse(error: unknown, log: (entry: LogEntry) => void): { status: number; body: Problem } {
  const causes: string[] = [];
  for (let e = error instanceof Error ? error.cause : undefined; e instanceof Error; e = e.cause) causes.push(`${e.name}: ${e.message}`);
  if (error instanceof AppError) {
    // An expected outcome. The client is told what happened, and the log records it without alarm.
    log({ level: "info", code: error.code, message: error.message, causes });
    return { status: error.status, body: { type: `https://photos.example/problems/${error.code}`, title: error.name, status: error.status, detail: error.message } };
  }
  // Anything else is a bug or a broken dependency. Log everything, and tell the client nothing about the inside.
  const unknown = error instanceof Error ? error : new Error(String(error));
  log({ level: "error", code: "internal", message: unknown.message, causes, ...(unknown.stack ? { stack: unknown.stack } : {}) });
  return { status: 500, body: { type: "https://photos.example/problems/internal", title: "Internal error", status: 500 } };
}
