import type { Decision } from "./algorithms.ts";

export interface Request { user: string; route: string; ip: string }
export interface Response { status: number; headers: Record<string, string>; body: string }

// Which limit applies to a request: the first rule that matches.
export interface Rule { name: string; matches: (r: Request) => boolean; perMinute: number; keyOf: (r: Request) => string }
export const ruleFor = (rules: readonly Rule[], request: Request): Rule => {
  const rule = rules.find((r) => r.matches(request));
  if (!rule) throw new Error(`no rate limit rule matches ${request.route}`); // the list should end with a catch-all
  return rule;
};

// The decision, in the form of the IETF draft's header fields, and Retry-After when refused.
export function headersFor(decision: Decision, policy: string, limit: number, windowS: number, resetS: number): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Policy": `"${policy}";q=${limit};w=${windowS}`,
    "RateLimit": `"${policy}";r=${decision.remaining};t=${resetS}`,
  };
  if (!decision.allowed) headers["Retry-After"] = String(Math.ceil(decision.retryAfterMs / 1000));
  return headers;
}

// A decorator around any handler: the handler runs only when the limiter allows it.
export function rateLimited(
  handler: (r: Request) => Response,
  decide: (r: Request) => { decision: Decision; rule: Rule },
): (r: Request) => Response {
  return (request) => {
    const { decision, rule } = decide(request);
    const headers = headersFor(decision, rule.name, rule.perMinute, 60, Math.ceil(decision.resetMs / 1000));
    if (!decision.allowed) return { status: 429, headers, body: "Too many requests" };
    const response = handler(request);
    return { ...response, headers: { ...response.headers, ...headers } };
  };
}
