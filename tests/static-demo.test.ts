import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, request } from "../web/api.ts";

test("static demo loads only its bundled snapshot and rejects API writes before fetch", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { dataset: { staticDemo: "true" } },
      baseURI: "https://example.test/Agent-ProE-Anker-MX/app.html",
    },
  });
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await assert.rejects(request("/api/records", "POST", "{}"), (error: unknown) => error instanceof ApiError && error.code === "STATIC_DEMO_READ_ONLY");
    assert.deepEqual(calls, [], "write requests must not reach fetch");
    assert.deepEqual(await request("/api/state", "GET", null), { ok: true });
    assert.deepEqual(calls, ["https://example.test/Agent-ProE-Anker-MX/demo-state.json"]);
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "document");
  }
});
