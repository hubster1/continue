import { expect, test, vi } from "vitest";
import { FetchFunction } from "../..";
import { fetchSearchResults } from "./WebContextProvider";

test("uses the Continue proxy when no web search provider is configured", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
  const fetch = fetchMock as unknown as FetchFunction;

  await fetchSearchResults("test query", 5, fetch);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url.toString()).toBe(
    "https://proxy-server-blue-l6vsfbzhba-uw.a.run.app/web",
  );
  expect(JSON.parse(init.body)).toEqual({ query: "test query", n: 5 });
});

test("uses Microsoft Web.IQ and converts results to context items", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        {
          evidence: {
            type: "text",
            content: "Search evidence",
          },
          citations: [
            {
              contentSource: "web",
              source: "Microsoft",
              title: "Example result",
              url: "https://example.com/result",
              crawledAt: "2026-11-01T00:00:00.000Z",
            },
          ],
        },
      ],
    }),
  });
  const fetch = fetchMock as unknown as FetchFunction;

  const results = await fetchSearchResults("test query", 5, fetch, {
    provider: "microsoft-web-iq",
    endpoint: "https://api.microsoft.ai/v3/auto",
    apiKey: "test-key",
    language: "fi",
    region: "EU",
    mode: "lite",
    safeSearch: "strict",
    maxResponseLength: 12000,
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.microsoft.ai/v3/auto");
  expect(init.headers).toEqual({
    "Content-Type": "application/json",
    "x-apikey": "test-key",
  });
  expect(JSON.parse(init.body)).toEqual({
    query: "test query",
    language: "fi",
    region: "EU",
    mode: "lite",
    safeSearch: "strict",
    maxResponseLength: 12000,
  });
  expect(results).toEqual([
    {
      name: "Example result",
      description: "https://example.com/result",
      content:
        "Search evidence\n\nSources:\n- Example result: https://example.com/result",
      uri: {
        type: "url",
        value: "https://example.com/result",
      },
    },
  ]);
});

test("uses Web.IQ defaults for optional request parameters", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [] }),
  });
  const fetch = fetchMock as unknown as FetchFunction;

  await fetchSearchResults("test query", 5, fetch, {
    provider: "microsoft-web-iq",
    endpoint: "https://api.microsoft.ai/v3/auto",
    apiKey: "test-key",
  });

  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    query: "test query",
    language: "en",
    region: "US",
    mode: "lite",
    safeSearch: "strict",
    maxResponseLength: 30000,
  });
});

test("rejects invalid Web.IQ responses", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: "not-an-array" }),
  });
  const fetch = fetchMock as unknown as FetchFunction;

  await expect(
    fetchSearchResults("test query", 5, fetch, {
      provider: "microsoft-web-iq",
      endpoint: "https://api.microsoft.ai/v3/auto",
      apiKey: "test-key",
    }),
  ).rejects.toThrow("invalid response shape");
});

test("normalizes optional and null Web.IQ citation fields", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        {
          evidence: { content: "Search evidence" },
          citations: [
            {
              contentSource: "web",
              source: null,
              title: "Example result",
              url: "https://example.com/result",
              crawledAt: null,
            },
          ],
        },
        {
          evidence: { type: "text", content: "Evidence without citations" },
          citations: null,
        },
      ],
    }),
  });
  const fetch = fetchMock as unknown as FetchFunction;

  const results = await fetchSearchResults("test query", 5, fetch, {
    provider: "microsoft-web-iq",
    endpoint: "https://api.microsoft.ai/v3/auto",
    apiKey: "test-key",
  });

  expect(results).toHaveLength(2);
  expect(results[0].name).toBe("Example result");
  expect(results[0].uri).toEqual({
    type: "url",
    value: "https://example.com/result",
  });
  expect(results[1].name).toBe("Web.IQ result 2");
  expect(results[1].content).toBe("Evidence without citations");
});

test("skips Web.IQ results with null evidence content", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        {
          evidence: { type: "text", content: "Usable result" },
          citations: [],
        },
        {
          evidence: { type: "text", content: null },
          citations: [],
        },
        {
          evidence: null,
          citations: [],
        },
      ],
    }),
  });
  const fetch = fetchMock as unknown as FetchFunction;

  const results = await fetchSearchResults("test query", 5, fetch, {
    provider: "microsoft-web-iq",
    endpoint: "https://api.microsoft.ai/v3/auto",
    apiKey: "test-key",
  });

  expect(results).toEqual([
    {
      name: "Web.IQ result 1",
      description: "Microsoft Web.IQ search result",
      content: "Usable result",
    },
  ]);
});
