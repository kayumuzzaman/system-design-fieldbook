import type { Action, Observation, StubAgentModel, Task } from "./model.ts";
import { spec, validate, type Call } from "./tools.ts";
import type { ToolResult, World } from "./world.ts";

export interface Limits { maxSteps: number; maxTokens: number }
export type Status = "running" | "waiting for approval" | "done" | "stopped";

// Everything needed to continue a run on another machine after a crash. It is saved after every change,
// as JSON, so nothing in it can be a live object.
export interface Checkpoint {
  runId: string;
  task: Task;
  step: number;
  seen: Observation[];
  pending?: Action;   // the model's decision, saved before it is carried out
  approved?: boolean;
  tokens: number;
  status: Status;
  answer?: string;
  reason?: string;
}

// A stand-in for a durable store such as a database table: it keeps only serialized text.
export class CheckpointStore {
  private readonly rows = new Map<string, string>();
  writes = 0;
  save(c: Checkpoint): void { this.rows.set(c.runId, JSON.stringify(c)); this.writes += 1; }
  load(runId: string): Checkpoint | undefined {
    const row = this.rows.get(runId);
    return row ? (JSON.parse(row) as Checkpoint) : undefined;
  }
}

// The application's rules about what may be done, whatever the model proposes.
export type Verdict = { allow: true } | { allow: false; reason: string } | { approval: true };
export type Policy = (call: Call, c: Checkpoint, world: World) => Verdict;
export const NO_POLICY: Policy = () => ({ allow: true });
export const SUPPORT_POLICY: Policy = (call, c, world) => {
  if (call.name === "send_email" && call.args.to !== `${world.user}@example.com`) return { allow: false, reason: "email only to the signed-in user" };
  if (call.name === "refund") {
    if (c.seen.some((o) => o.call.name === "refund" && o.result.ok)) return { allow: false, reason: "one refund per conversation" };
    if ((call.args.amount_cents as number) > 2000) return { approval: true };
  }
  return { allow: true };
};

export class Crash extends Error {}
export interface Deps {
  model: StubAgentModel;
  world: World;
  store: CheckpointStore;
  policy: Policy;
  limits: Limits;
  idempotencyKeys: boolean;
  crashAt?: (moment: "decided" | "acted", step: number) => void; // a test can make the process die here
}

export function start(store: CheckpointStore, runId: string, task: Task): void {
  store.save({ runId, task, step: 0, seen: [], tokens: 0, status: "running" });
}
export function approve(store: CheckpointStore, runId: string): void {
  const c = store.load(runId) as Checkpoint;
  store.save({ ...c, approved: true, status: "running" });
}

// The loop. Each turn: ask the model for an action (or reuse the one saved before a crash), check it, run it,
// record what happened. It ends with an answer, a stop at a limit, or a wait for a person.
export function run(runId: string, d: Deps): Checkpoint {
  const c = d.store.load(runId) as Checkpoint;
  const stop = (reason: string) => { c.status = "stopped"; c.reason = reason; d.store.save(c); return c; };
  while (c.status === "running") {
    if (c.step >= d.limits.maxSteps) return stop("step limit");
    if (c.tokens >= d.limits.maxTokens) return stop("token budget");
    if (!c.pending) {
      const { action, tokens } = d.model.next(c.task, c.seen);
      c.tokens += tokens;
      c.pending = action;
      d.store.save(c); // the decision is durable before anything is done about it
    }
    d.crashAt?.("decided", c.step);
    const action = c.pending;
    if (action.kind === "answer") {
      c.status = "done"; c.answer = action.text; delete c.pending;
      d.store.save(c);
      return c;
    }
    const call = action.call;
    const repeats = c.seen.filter((o) => JSON.stringify(o.call) === JSON.stringify(call)).length;
    if (repeats >= 2) return stop(`repeating ${call.name}`);
    const result = carryOut(call, c, d);
    if (result === "wait") { c.status = "waiting for approval"; d.store.save(c); return c; }
    d.crashAt?.("acted", c.step);
    c.seen.push({ call, result });
    delete c.pending; delete c.approved;
    c.step += 1;
    d.store.save(c);
  }
  return c;
}

function carryOut(call: Call, c: Checkpoint, d: Deps): ToolResult | "wait" {
  const s = spec(call.name);
  if (!s) return { ok: false, error: `there is no tool called ${call.name}` };
  const errors = validate(s, call.args);
  if (errors.length > 0) return { ok: false, error: errors.join("; ") }; // the model sees why, and can try again
  const verdict = d.policy(call, c, d.world);
  if ("approval" in verdict && !c.approved) return "wait";
  if ("allow" in verdict && !verdict.allow) return { ok: false, error: `refused: ${verdict.reason}` };
  // The key names this step of this run, so a repeat after a crash is recognized as the same request.
  const key = d.idempotencyKeys && s.effect === "write" ? `${c.runId}/${c.step}` : undefined;
  let result = d.world.run(call, key);
  for (let retry = 0; retry < 2 && !result.ok && result.transient; retry += 1) result = d.world.run(call, key);
  return result;
}
