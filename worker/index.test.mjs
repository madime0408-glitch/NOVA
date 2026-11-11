import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.mjs";

const origin = "https://madime0408-glitch.github.io";

test("health reports configuration without exposing the API key", async () => {
  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/health", { headers: { Origin: origin } }),
    { TAVILY_API_KEY: "private-test-key", AI: { run() {} } },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.deepEqual(await response.json(), { configured: true, aiConfigured: true });
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

test("search summarizes safe Tavily results with Workers AI and preserves the sources", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstreamRequest;
  let aiRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({
      answer: "This generated answer must not be returned.",
      results: [
        { title: "Source", url: "https://example.com/article", content: "A useful excerpt." },
        { title: "Unsafe source", url: "javascript:alert(1)", content: "This must be discarded." },
      ],
    }), { status: 200 });
  };
  const AI = {
    async run(model, options) {
      aiRequest = { model, options };
      return { response: "Les sources décrivent un exemple utile. [1]" };
    },
  };

  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/search", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "web search" }),
    }),
    { TAVILY_API_KEY: "private-test-key", AI },
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamRequest.url, "https://api.tavily.com/search");
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer private-test-key");
  assert.equal(JSON.parse(upstreamRequest.options.body).search_depth, "basic");
  assert.equal(aiRequest.model, "@cf/openai/gpt-oss-20b");
  assert.match(aiRequest.options.prompt, /web search/);
  assert.match(aiRequest.options.prompt, /A useful excerpt/);
  assert.doesNotMatch(aiRequest.options.prompt, /Unsafe source/);
  assert.deepEqual(await response.json(), {
    query: "web search",
    answer: "Les sources décrivent un exemple utile. [1]",
    summaryError: "",
    results: [{ title: "Source", url: "https://example.com/article", content: "A useful excerpt." }],
  });
});

test("AI failures leave the search sources available and report the synthesis error", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    results: [{ title: "Source", url: "https://example.com/article", content: "A useful excerpt." }],
  }), { status: 200 });
  const AI = {
    async run() {
    throw new Error("AI quota exceeded");
    },
  };

  const response = await worker.fetch(
    new Request("https://nova-search.example.workers.dev/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "web search" }),
    }),
    { TAVILY_API_KEY: "private-test-key", AI },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.answer, "");
  assert.match(payload.summaryError, /synthèse IA/i);
  assert.equal(payload.results.length, 1);
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
