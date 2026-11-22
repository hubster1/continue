import { BaseContextProvider } from "..";
import type { WebSearchConfig } from "@continuedev/config-yaml";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  FetchFunction,
} from "../..";
import { getHeaders } from "../../continueServer/stubs/headers";
const TRIAL_PROXY_URL = "https://proxy-server-blue-l6vsfbzhba-uw.a.run.app";

interface WebIqCitation {
  contentSource?: string;
  source?: string;
  title?: string;
  url?: string;
  crawledAt?: string;
}

interface WebIqResult {
  evidence?: {
    type?: unknown;
    content?: unknown;
  } | null;
  citations?: WebIqCitation[] | null;
}

interface WebIqResponse {
  results: WebIqResult[];
}

function isWebIqResponse(value: unknown): value is WebIqResponse {
  if (!value || typeof value !== "object" || !("results" in value)) {
    return false;
  }

  const results = (value as { results: unknown }).results;
  return (
    Array.isArray(results) &&
    results.every((result) => !!result && typeof result === "object")
  );
}

function webIqResultToContextItem(
  result: WebIqResult,
  index: number,
): ContextItem | undefined {
  if (
    !result.evidence ||
    typeof result.evidence !== "object" ||
    typeof result.evidence.content !== "string"
  ) {
    return undefined;
  }

  const citations = (result.citations ?? [])
    .filter(
      (citation): citation is WebIqCitation =>
        !!citation && typeof citation === "object",
    )
    .map((citation) => ({
      contentSource:
        typeof citation.contentSource === "string"
          ? citation.contentSource
          : undefined,
      source: typeof citation.source === "string" ? citation.source : undefined,
      title: typeof citation.title === "string" ? citation.title : undefined,
      url: typeof citation.url === "string" ? citation.url : undefined,
      crawledAt:
        typeof citation.crawledAt === "string" ? citation.crawledAt : undefined,
    }));
  const firstCitation = citations.find((citation) => !!citation.url);
  const sourceLines = citations
    .filter((citation) => citation.title || citation.url)
    .map((citation) => {
      const title = citation.title || citation.source || "Source";
      return citation.url ? `- ${title}: ${citation.url}` : `- ${title}`;
    });
  const name = firstCitation?.title || `Web.IQ result ${index + 1}`;
  const description =
    firstCitation?.url ||
    firstCitation?.source ||
    firstCitation?.contentSource ||
    "Microsoft Web.IQ search result";

  return {
    name,
    description,
    content:
      sourceLines.length > 0
        ? `${result.evidence.content}\n\nSources:\n${sourceLines.join("\n")}`
        : result.evidence.content,
    ...(firstCitation?.url
      ? { uri: { type: "url" as const, value: firstCitation.url } }
      : {}),
  };
}

async function fetchMicrosoftWebIqSearchResults(
  query: string,
  config: Extract<WebSearchConfig, { provider: "microsoft-web-iq" }>,
  fetchFn: FetchFunction,
): Promise<ContextItem[]> {
  const resp = await fetchFn(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-apikey": config.apiKey,
    },
    body: JSON.stringify({
      query,
      language: config.language ?? "en",
      region: config.region ?? "US",
      mode: config.mode ?? "lite",
      safeSearch: config.safeSearch ?? "strict",
      maxResponseLength: config.maxResponseLength ?? 30000,
    }),
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch Microsoft Web.IQ search results: HTTP ${resp.status} ${resp.statusText}`.trim(),
    );
  }

  let response: unknown;
  try {
    response = await resp.json();
  } catch {
    throw new Error(
      "Failed to parse Microsoft Web.IQ search results: invalid JSON response",
    );
  }
  if (!isWebIqResponse(response)) {
    throw new Error(
      "Failed to parse Microsoft Web.IQ search results: invalid response shape",
    );
  }

  return response.results
    .map(webIqResultToContextItem)
    .filter((item): item is ContextItem => item !== undefined);
}

export const fetchSearchResults = async (
  query: string,
  n: number,
  fetchFn: FetchFunction,
  config?: WebSearchConfig,
): Promise<ContextItem[]> => {
  if (config?.provider === "microsoft-web-iq") {
    return fetchMicrosoftWebIqSearchResults(query, config, fetchFn);
  }

  const resp = await fetchFn(WebContextProvider.ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getHeaders()),
    },
    body: JSON.stringify({
      query,
      n,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to fetch web context: ${text}`);
  }
  return await resp.json();
};

export default class WebContextProvider extends BaseContextProvider {
  public static ENDPOINT = new URL("web", TRIAL_PROXY_URL);
  private static DEFAULT_N = 6;

  static description: ContextProviderDescription = {
    title: "web",
    displayTitle: "Web",
    description: "Search the web",
    type: "normal",
    renderInlineAs: "",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    return await fetchSearchResults(
      extras.fullInput,
      this.options.n ?? WebContextProvider.DEFAULT_N,
      extras.fetch,
      extras.config.webSearch,
    );
  }
}
