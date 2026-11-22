# Foundry IQ Documentation Source

## Purpose

Continue's default documentation crawler sends a start URL to Continue's
hosted crawl service. That service discovers pages and returns their content.

The `foundry-iq` docs crawler replaces that hosted crawl stage with a
Microsoft Foundry IQ/Azure AI Search index. Continue reads documents from the configured index,
then performs its existing local chunking and embedding steps.

This keeps Continue's documentation retrieval configuration inside Azure
services and prevents the selected docs source from reaching Continue's
hard-coded `/crawl` proxy.

## Important distinction

Foundry IQ is not a general website crawler. It searches an Azure AI Search index that must
already be populated.

Populate the index with one of these:

- An Azure AI Search indexer connected to an approved data source
- An application or ingestion job
- A controlled documentation crawler running in your environment
- A CI/CD job that exports approved Markdown or HTML documentation

Continue's Azure AI Search crawler does not create the index, data source,
indexer, skillset, or embeddings. It reads completed documents from the index
and makes them available through Continue's existing `@Docs` flow.

## Configuration

Add the crawler to a `docs` entry:

```yaml
docs:
  - name: Product documentation
    startUrl: https://docs.example.com
    crawler:
      provider: foundry-iq
      endpoint: https://example.search.windows.net
      indexName: product-documentation
      apiKey: ${{ secrets.AZURE_SEARCH_QUERY_KEY }}
      contentField: content
      urlField: url
      titleField: title
      contentFormat: markdown
      maxDocuments: 10000
```

`provider`, `endpoint`, `indexName`, `apiKey`, `contentField`, and `urlField`
are required.

Use a least-privilege query key. Do not use an Azure AI Search admin key for
Continue.

### Fields

| Field           | Required | Description                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `provider`      | Yes      | Must be `foundry-iq`.                                                                          |
| `endpoint`      | Yes      | Azure AI Search service endpoint.                                                              |
| `indexName`     | Yes      | Existing Azure AI Search index to read.                                                        |
| `apiKey`        | Yes      | Query key or secret reference.                                                                 |
| `contentField`  | Yes      | String field containing page text.                                                             |
| `urlField`      | Yes      | String field containing the canonical page URL. Relative URLs are resolved against `startUrl`. |
| `titleField`    | No       | String field used as the article title when Markdown content has no title heading.             |
| `apiVersion`    | No       | REST API version. Defaults to `2024-07-01`.                                                    |
| `maxDocuments`  | No       | Maximum documents imported. Defaults to `10000`.                                               |
| `contentFormat` | No       | `markdown` or `html`. Defaults to `markdown` and selects the correct Continue chunking parser. |

## Required index shape

At minimum, the index must expose:

- A string content field
- A string URL field

Example:

```json
{
  "id": "getting-started",
  "title": "Getting started",
  "url": "https://docs.example.com/getting-started",
  "content": "# Getting started\n\n..."
}
```

Records missing either configured field are skipped. Empty or invalid pages do
not cause the other valid pages to fail.

## Runtime behavior

When Continue indexes a docs entry configured with `foundry-iq`:

1. Continue selects `FoundryIqCrawler`.
2. It sends an Azure AI Search `POST .../docs/search` request to the index behind Foundry IQ with `search: "*"`.
3. It requests only the configured content, URL, and optional title fields.
4. It follows Azure pagination while restricting pagination to the configured
   service origin.
5. It converts each index record into Continue `PageData`.
6. Continue chunks and embeds the documents using its existing local docs
   pipeline.
7. `@Docs` later retrieves the resulting local chunks.

The crawler never calls:

```text
https://proxy-server-blue-l6vsfbzhba-uw.a.run.app/crawl
```

It also does not fall back to Continue's hosted crawler, Cheerio, or Chromium
when `crawler.provider` is `foundry-iq`. Foundry IQ/Azure Search failures are returned
as indexing errors so they cannot silently route data through another service.

## Ingestion examples

### Approved website crawl

Run your approved crawler outside Continue:

1. Fetch approved documentation pages.
2. Extract Markdown or text.
3. Store canonical URL and page content.
4. Upsert records to Azure AI Search.
5. Configure Continue to read that index.

This keeps crawling, allowlists, retention, and authentication under your own
operational controls.

### Foundry IQ/Azure AI Search data source

Use an Azure AI Search indexer for a supported source such as Blob Storage.
Continue reads the resulting index, while Azure AI Search owns scheduled
updates.

Azure AI Search indexers do not replace an arbitrary public website crawler
unless the source is first stored in a supported data source.

## Security and data handling

- Use a query key with read-only scope, not an admin key.
- Use a secret reference for the key.
- Put the Azure AI Search resource in the approved region.
- Review DPA coverage, private endpoint, diagnostic logging, retention, and
  subnet/firewall configuration.
- Ensure indexed content has an approved classification and deletion process.
- Deletions from the source and Azure index require a re-index in Continue or a
  defined synchronization process.
- Continue stores resulting chunks and embeddings locally; Azure Search hosting
  does not remove local retention requirements.

## Web.IQ versus Foundry IQ

Use Web.IQ for:

- Current public web searches
- On-demand evidence and citations
- Questions that do not require a persistent documentation corpus

Use Foundry IQ for:

- Approved documentation collections
- Internal or private content
- Whole-corpus indexing
- Controlled ingestion, updates, deletion, and access
- Persistent `@Docs` retrieval

Web.IQ is not a drop-in replacement for a complete documentation crawler.
Foundry IQ backed by Azure AI Search is the suitable replacement when the documentation corpus is
already or can be ingested into an Azure-owned index.

## Failure behavior

- Non-success Azure Search responses fail the docs indexing operation.
- Invalid top-level responses fail explicitly.
- Records missing content or URL fields are skipped.
- Pagination to another origin is rejected.
- The API key is not included in browser configuration or error messages.
- No fallback to Continue's hosted crawler occurs for this provider.
