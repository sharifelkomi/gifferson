import handler from "vinext/server/app-router-entry";

export { ExportCounter } from "./export-counter";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  EXPORT_COUNTER: {
    idFromName(name: string): unknown;
    get(id: unknown): { increment(): Promise<number>; count(): Promise<number> };
  };
  EXPORT_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

const SITE_ORIGIN = "https://gifferson.com";

// POST counts one finished export; GET reports the total. Only the number is
// stored. The client IP is used as a rate-limit key and never saved.
async function handleExports(request: Request, env: Env) {
  const counter = env.EXPORT_COUNTER.get(env.EXPORT_COUNTER.idFromName("all-time"));
  const noStore = { "Cache-Control": "no-store" };

  if (request.method === "GET") {
    return Response.json({ count: await counter.count() }, { headers: noStore });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }

  // Origin can be faked outside a browser, so this only stops other sites'
  // pages from counting; the rate limit covers scripted traffic. Localhost is
  // allowed so local previews can test the counter.
  const origin = request.headers.get("Origin") ?? "";
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin !== SITE_ORIGIN && !isLocal) {
    return new Response(null, { status: 403, headers: noStore });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.EXPORT_LIMITER.limit({ key: ip });
  if (!success) return new Response(null, { status: 429, headers: noStore });

  await counter.increment();
  return new Response(null, { status: 204, headers: noStore });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.hostname === "www.gifferson.com") {
      url.hostname = "gifferson.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/api/exports") return handleExports(request, env);

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
