// Accès HTTP à GitHub : REST, GraphQL, fichiers bruts. Détection du rate limit,
// délais par requête, limiteur de concurrence.

export type EngineErrorCode = "unknown_user" | "organization" | "rate_limited" | "internal";

export class EngineError extends Error {
  constructor(
    public code: EngineErrorCode,
    msg?: string,
  ) {
    super(msg ?? code);
    this.name = "EngineError";
  }
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const UA = "testyourskills (azerit.tech)";

export interface Ctx {
  token: string;
  signal?: AbortSignal;
  /** Délai par requête, en ms. */
  timeoutMs: number;
  limit: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Compteurs de requêtes, pour le diagnostic. */
  calls: { rest: number; graphql: number; raw: number };
}

export function makeLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export function makeCtx(token: string, signal?: AbortSignal, timeoutMs = 8000): Ctx {
  return { token, signal, timeoutMs, limit: makeLimiter(16), calls: { rest: 0, graphql: 0, raw: 0 } };
}

function signalFor(ctx: Ctx, timeoutMs?: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs ?? ctx.timeoutMs);
  return ctx.signal ? AbortSignal.any([ctx.signal, t]) : t;
}

function isRateLimited(res: Response, body: string): boolean {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  return res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(body);
}

export interface RestResult<T> {
  status: number;
  data: T | null;
  headers: Headers;
}

/** GET REST. 404/409/422 rendent data=null sans lever ; rate limit lève EngineError. */
export async function rest<T>(
  ctx: Ctx,
  path: string,
  opts: { accept?: string; timeoutMs?: number; raw?: boolean } = {},
): Promise<RestResult<T>> {
  return ctx.limit(async () => {
    ctx.calls.rest++;
    const res = await fetch(path.startsWith("http") ? path : API + path, {
      headers: {
        authorization: `bearer ${ctx.token}`,
        accept: opts.accept ?? "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": UA,
      },
      signal: signalFor(ctx, opts.timeoutMs),
    });
    const body = await res.text();
    if (isRateLimited(res, body)) throw new EngineError("rate_limited", "GitHub rate limit");
    if (!res.ok) return { status: res.status, data: null, headers: res.headers };
    if (opts.raw) return { status: res.status, data: body as T, headers: res.headers };
    return { status: res.status, data: body ? (JSON.parse(body) as T) : null, headers: res.headers };
  });
}

/** Requête GraphQL. Les erreurs partielles sont tolérées (data partielle renvoyée). */
export async function graphql<T>(
  ctx: Ctx,
  query: string,
  variables: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<{ data: T | null; errors: { type?: string; message: string }[] }> {
  return ctx.limit(async () => {
    ctx.calls.graphql++;
    const res = await fetch(API + "/graphql", {
      method: "POST",
      headers: { authorization: `bearer ${ctx.token}`, "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ query, variables }),
      signal: signalFor(ctx, opts.timeoutMs),
    });
    const body = await res.text();
    if (isRateLimited(res, body)) throw new EngineError("rate_limited", "GitHub rate limit");
    if (res.status === 401) throw new EngineError("internal", "GitHub token invalide");
    let json: { data?: T; errors?: { type?: string; message: string }[] };
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`GraphQL ${res.status} non JSON`);
    }
    const errors = json.errors ?? [];
    if (errors.some((e) => e.type === "RATE_LIMITED")) throw new EngineError("rate_limited", "GitHub rate limit");
    return { data: json.data ?? null, errors };
  });
}

/** Fichier brut d'un repo public (raw.githubusercontent.com, hors quota API). */
export async function rawFile(ctx: Ctx, fullName: string, ref: string, path: string, maxBytes = 200_000): Promise<string | null> {
  return ctx.limit(async () => {
    ctx.calls.raw++;
    const url = `${RAW}/${fullName}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: signalFor(ctx) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      await res.body?.cancel();
      return null;
    }
    const text = await res.text();
    return text.length > maxBytes ? null : text;
  });
}

/** Lit le début d'une ressource texte et coupe dès que `stop` est trouvé. */
export async function headOf(ctx: Ctx, url: string, stop: RegExp, maxBytes = 8192): Promise<string | null> {
  return ctx.limit(async () => {
    ctx.calls.raw++;
    const ac = new AbortController();
    const signal = AbortSignal.any([signalFor(ctx, 5000), ac.signal]);
    const res = await fetch(url, { headers: { "user-agent": UA }, signal });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    try {
      while (text.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        if (stop.test(text)) break;
      }
    } finally {
      ac.abort();
    }
    return text;
  });
}

/** Exécute un appel non critique : erreurs et délais dépassés → null. Le rate limit et l'annulation remontent. */
export async function soft<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if (ctx.signal?.aborted) throw e;
    return null;
  }
}

/** Numéro de la dernière page dans un en-tête Link (pagination REST). */
export function lastPageOf(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}
