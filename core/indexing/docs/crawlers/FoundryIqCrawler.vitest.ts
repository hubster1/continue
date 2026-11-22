import { afterEach, expect, test, vi } from "vitest";
import { FoundryIqCrawler } from "./FoundryIqCrawler";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("loads pages from an Azure AI Search index", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      value: [
        {
          id: "1",
          body: "# Getting started",
          sourceUrl: "https://docs.example.com/getting-started",
          pageTitle: "Getting started",
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);

  const pages = await new FoundryIqCrawler(
    new URL("https://docs.example.com"),
    {
      provider: "foundry-iq",
      endpoint: "https://example.search.windows.net",
      indexName: "documentation",
      apiKey: "test-key",
      contentField: "body",
      urlField: "sourceUrl",
      titleField: "pageTitle",
    },
  ).crawl();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [requestUrl, init] = fetchMock.mock.calls[0];
  expect(requestUrl.toString()).toBe(
    "https://example.search.windows.net/indexes/documentation/docs/search?api-version=2024-07-01",
  );
  expect(init.headers).toEqual({
    "Content-Type": "application/json",
    "api-key": "test-key",
  });
  expect(init.body).toContain('"search":"*"');
  expect(init.body).toContain('"select":"body,sourceUrl,pageTitle"');
  expect(pages).toEqual([
    {
      url: "https://docs.example.com/getting-started",
      path: "https://docs.example.com/getting-started",
      content: "# Getting started",
      title: "Getting started",
    },
  ]);
});

test("follows Azure pagination and respects maxDocuments", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { body: "Page 1", sourceUrl: "/page-1" },
          { body: "Page 2", sourceUrl: "/page-2" },
        ],
        "@odata.nextLink":
          "https://example.search.windows.net/indexes/documentation/docs/search?api-version=2024-07-01&skip=2",
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [{ body: "Page 3", sourceUrl: "/page-3" }],
      }),
    });
  vi.stubGlobal("fetch", fetchMock);

  const pages = await new FoundryIqCrawler(
    new URL("https://docs.example.com"),
    {
      provider: "foundry-iq",
      endpoint: "https://example.search.windows.net",
      indexName: "documentation",
      apiKey: "test-key",
      contentField: "body",
      urlField: "sourceUrl",
      maxDocuments: 3,
    },
  ).crawl();

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(pages.map((page) => page.url)).toEqual([
    "https://docs.example.com/page-1",
    "https://docs.example.com/page-2",
    "https://docs.example.com/page-3",
  ]);
});

test("rejects pagination to another origin", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [],
        "@odata.nextLink": "https://untrusted.example.com/next",
      }),
    }),
  );

  await expect(
    new FoundryIqCrawler(new URL("https://docs.example.com"), {
      provider: "foundry-iq",
      endpoint: "https://example.search.windows.net",
      indexName: "documentation",
      apiKey: "test-key",
      contentField: "body",
      urlField: "sourceUrl",
    }).crawl(),
  ).rejects.toThrow("unexpected origin");
});

test("skips records without configured content and URL fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          { body: null, sourceUrl: "/invalid-content" },
          { body: "Missing URL" },
          { body: "Valid", sourceUrl: "/valid" },
        ],
      }),
    }),
  );

  const pages = await new FoundryIqCrawler(
    new URL("https://docs.example.com"),
    {
      provider: "foundry-iq",
      endpoint: "https://example.search.windows.net",
      indexName: "documentation",
      apiKey: "test-key",
      contentField: "body",
      urlField: "sourceUrl",
    },
  ).crawl();

  expect(pages).toEqual([
    {
      url: "https://docs.example.com/valid",
      path: "https://docs.example.com/valid",
      content: "Valid",
    },
  ]);
});
