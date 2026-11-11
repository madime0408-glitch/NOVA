import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.mjs";

const origin = "https://madime0408-glitch.github.io";

test("health reports configuration without exposing the API key", async () => {
  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/health", { headers: { Origin: origin } }),
    { TAVILY_API_KEY: "private-test-key" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.deepEqual(await response.json(), { configured: true });
});

test("search rejects invalid queries before calling the provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Provider must not be called for invalid input");
  };
  try {
    const response = await worker.fetch(
      new Request("https://nova-search.example.workers.dev/search", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ query: " ".repeat(2) }),
      }),
      { TAVILY_API_KEY: "private-test-key" },
    );
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search uses the free basic tier and returns only source results", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({
      answer: "This generated answer must not be returned.",
      results: [{ title: "Source", url: "https://example.com/article", content: "A useful excerpt." }],
    }), { status: 200 });
  };

  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/search", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "web search" }),
    }),
    { TAVILY_API_KEY: "private-test-key" },
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamRequest.url, "https://api.tavily.com/search");
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer private-test-key");
  assert.equal(JSON.parse(upstreamRequest.options.body).search_depth, "basic");
  assert.deepEqual(await response.json(), {
    query: "web search",
    results: [{ title: "Source", url: "https://example.com/article", content: "A useful excerpt." }],
  });
});

test("search reports an exhausted provider quota without hiding the error", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("{}", { status: 429 });

  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/search", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "web search" }),
    }),
    { TAVILY_API_KEY: "private-test-key" },
  );

  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /quota gratuit/i);
});

test("search rejects malformed provider responses", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ results: null }), { status: 200 });

  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/search", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "web search" }),
    }),
    { TAVILY_API_KEY: "private-test-key" },
  );

  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "Le fournisseur a renvoyé une réponse invalide.");
});
