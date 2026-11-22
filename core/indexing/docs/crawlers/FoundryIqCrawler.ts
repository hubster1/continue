import type { SiteIndexingConfig } from "../../..";
import type { PageData } from "./DocsCrawler";

type FoundryIqCrawlerConfig = NonNullable<SiteIndexingConfig["crawler"]>;

interface FoundryIqResponse {
  value: unknown[];
  "@odata.nextLink"?: string;
}

const DEFAULT_API_VERSION = "2024-07-01";
const DEFAULT_MAX_DOCUMENTS = 10000;
const PAGE_SIZE = 1000;

export class FoundryIqCrawler {
  constructor(
    private readonly startUrl: URL,
    private readonly config: FoundryIqCrawlerConfig,
  ) {}

  async crawl(): Promise<PageData[]> {
    const endpoint = new URL(this.config.endpoint);
    const apiVersion = encodeURIComponent(
      this.config.apiVersion ?? DEFAULT_API_VERSION,
    );
    const indexName = encodeURIComponent(this.config.indexName);
    const maxDocuments = this.config.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
    const select = [
      this.config.contentField,
      this.config.urlField,
      this.config.titleField,
    ]
      .filter((field): field is string => !!field)
      .join(",");

    let nextUrl = new URL(
      `${endpoint.pathname.replace(/\/$/, "")}/indexes/${indexName}/docs/search?api-version=${apiVersion}`,
      endpoint,
    );
    const pages: PageData[] = [];

    while (nextUrl && pages.length < maxDocuments) {
      const top = Math.min(PAGE_SIZE, maxDocuments - pages.length);
      const isFirstRequest = pages.length === 0;
      const resp = await fetch(nextUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          search: "*",
          top,
          select,
          ...(isFirstRequest ? { count: false } : {}),
        }),
      });

      if (!resp.ok) {
        throw new Error(
          `Failed to read Foundry IQ index: HTTP ${resp.status} ${resp.statusText}`.trim(),
        );
      }

      const response: unknown = await resp.json();
      if (
        !response ||
        typeof response !== "object" ||
        !("value" in response) ||
        !Array.isArray(response.value)
      ) {
        throw new Error(
          "Failed to parse Foundry IQ response: invalid response shape",
        );
      }

      for (const record of response.value) {
        if (pages.length >= maxDocuments) {
          break;
        }
        const page = this.toPageData(record);
        if (page) {
          pages.push(page);
        }
      }

      const nextLink = (response as FoundryIqResponse)["@odata.nextLink"];
      if (!nextLink || pages.length >= maxDocuments) {
        break;
      }

      nextUrl = new URL(nextLink, endpoint);
      if (nextUrl.origin !== endpoint.origin) {
        throw new Error(
          "Failed to follow Foundry IQ pagination: unexpected origin",
        );
      }
    }

    return pages;
  }

  private toPageData(record: unknown): PageData | undefined {
    if (!record || typeof record !== "object") {
      return undefined;
    }

    const value = record as Record<string, unknown>;
    const content = value[this.config.contentField];
    const configuredUrl = value[this.config.urlField];
    const configuredTitle = this.config.titleField
      ? value[this.config.titleField]
      : undefined;
    if (typeof content !== "string" || typeof configuredUrl !== "string") {
      return undefined;
    }

    let url: URL;
    try {
      url = new URL(configuredUrl, this.startUrl);
    } catch {
      return undefined;
    }

    return {
      url: url.toString(),
      path: url.toString(),
      content,
      ...(typeof configuredTitle === "string"
        ? { title: configuredTitle }
        : {}),
    };
  }
}
