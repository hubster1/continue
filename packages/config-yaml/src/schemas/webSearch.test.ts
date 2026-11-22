import { configYamlSchema } from "./index.js";

const baseConfig = {
  name: "Web search test",
  version: "1.0.0",
  schema: "v1",
};

test("accepts Microsoft Web.IQ configuration", () => {
  const result = configYamlSchema.safeParse({
    ...baseConfig,
    webSearch: {
      provider: "microsoft-web-iq",
      endpoint: "https://api.microsoft.ai/v3/auto",
      apiKey: "${{ secrets.WEB_IQ_API_KEY }}",
      language: "en",
      region: "EU",
      mode: "lite",
      safeSearch: "strict",
      maxResponseLength: 30000,
    },
  });

  expect(result.success).toBe(true);
});

test("requires endpoint and API key for Microsoft Web.IQ", () => {
  const result = configYamlSchema.safeParse({
    ...baseConfig,
    webSearch: {
      provider: "microsoft-web-iq",
    },
  });

  expect(result.success).toBe(false);
});

test("rejects an unknown web search provider", () => {
  const result = configYamlSchema.safeParse({
    ...baseConfig,
    webSearch: {
      provider: "unknown",
    },
  });

  expect(result.success).toBe(false);
});

test("accepts a Foundry IQ documentation crawler", () => {
  const result = configYamlSchema.safeParse({
    ...baseConfig,
    docs: [
      {
        name: "Product documentation",
        startUrl: "https://docs.example.com",
        crawler: {
          provider: "foundry-iq",
          endpoint: "https://example.search.windows.net",
          indexName: "documentation",
          apiKey: "${{ secrets.AZURE_SEARCH_QUERY_KEY }}",
          contentField: "content",
          urlField: "url",
          titleField: "title",
          contentFormat: "markdown",
          maxDocuments: 5000,
        },
      },
    ],
  });

  expect(result.success).toBe(true);
});
