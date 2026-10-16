export interface Request {
  path: string;
  user?: string;
}
export interface Response {
  status: number;
  body: string;
}

export type Handler = (request: Request) => Promise<Response>;
// A link in the chain: answer the request itself, or pass it to the rest of the chain.
export type Middleware = (request: Request, next: Handler) => Promise<Response>;

// Builds one handler from a list of links and the final handler, innermost first.
export const chain = (links: Middleware[], last: Handler): Handler =>
  links.reduceRight<Handler>((next, link) => (request) => link(request, next), last);

export const logged = (log: (line: string) => void): Middleware => async (request, next) => {
  const response = await next(request);
  log(`${request.path} ${response.status}`);
  return response;
};

export const signedIn: Middleware = async (request, next) =>
  request.user ? next(request) : { status: 401, body: "sign in first" };

export const limited = (perUser: number): Middleware => {
  const seen = new Map<string, number>();
  return async (request, next) => {
    const user = request.user ?? "anonymous";
    const count = (seen.get(user) ?? 0) + 1;
    seen.set(user, count);
    return count > perUser ? { status: 429, body: "slow down" } : next(request);
  };
};
