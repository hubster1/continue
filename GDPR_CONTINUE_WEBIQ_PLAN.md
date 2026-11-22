# GDPR Plan for Continue and Microsoft Web.IQ

## Goal

Keep the current Microsoft Foundry and Microsoft Web.IQ configuration, and
change only settings or functions that could send data to a non-Microsoft
processor or retain data outside the intended policy.

This is a technical data-protection plan. It is not a legal determination of
GDPR compliance.

## Changes needed now

### 1. Rotate and move credentials

The current file contains plaintext Web.IQ and Foundry credentials.

- Rotate the Web.IQ key.
- Rotate the Foundry model key.
- Replace the plaintext values with Continue secret references.
- Verify that old keys are revoked.
- Keep the credential values out of logs, screenshots, commits, issues, and
  support attachments.

Expected configuration:

```yaml
webSearch:
  provider: microsoft-web-iq
  endpoint: https://api.microsoft.ai/v3/auto
  apiKey: ${{ secrets.WEB_IQ_API_KEY }}
  language: en
  region: US
  mode: lite
  safeSearch: strict
  maxResponseLength: 30000
```

The `region` value selects Web.IQ search localization/market. It is not
Microsoft processing-region configuration.

### 2. Keep only the Microsoft search path

Keep:

```yaml
webSearch:
  provider: microsoft-web-iq
```

Do not select `provider: continue`. The current Continue default provider uses
this fixed endpoint:

```text
https://proxy-server-blue-l6vsfbzhba-uw.a.run.app/web
```

It sends the search query plus Continue metadata, including a unique
identifier. Selecting Microsoft Web.IQ bypasses this Continue proxy.

### 3. Disable Continue telemetry through effective user settings

Ensure Continue's effective user setting disables anonymous telemetry. Verify
the setting after configuration reload rather than relying on its presence in
`config.yaml`.

Also disable the VS Code Continue telemetry setting and verify no PostHog or
other analytics traffic occurs during:

- VS Code startup
- Config reload
- Chat
- Search
- Extension errors

### 4. Review indexing

If indexing is enabled, repository content is processed locally by the bundled
Transformers.js embedding provider and stored in Continue's local index.

Required checks:

- Apply `.continueignore` and `.gitignore` exclusions.
- Exclude secrets, credentials, private directories, generated data, and
  regulated data.
- Define retention and deletion for `~/.continue/index`.
- Encrypt the user profile/device and restrict backups.

If repository indexing is not required, disable it in effective Continue
settings.

### 5. Control local development data and sessions

`data: []` prevents configured remote development-data destinations. Continue
can still write local development events and session history.

Define and verify:

- Retention for `~/.continue/dev_data` and `~/.continue/sessions`
- Access permissions
- Backup scope
- Deletion procedure
- BitLocker or equivalent disk encryption

### 6. Use Foundry IQ for approved documentation

The current configuration has no `docs` entries. If persistent documentation
retrieval is required, use the `foundry-iq` docs crawler backed by an approved
Azure AI Search index instead of Continue's hosted crawler.

```yaml
docs:
  - name: Approved product documentation
    startUrl: https://docs.example.com
    crawler:
      provider: foundry-iq
      endpoint: https://example.search.windows.net
      indexName: product-documentation
      apiKey: ${{ secrets.AZURE_SEARCH_QUERY_KEY }}
      contentField: content
      urlField: url
      contentFormat: markdown
      maxDocuments: 10000
```

Foundry IQ must point to an already populated index. The index should be loaded
by an approved indexer or ingestion pipeline. Continue then imports the
documents into its local docs index and never falls back to:

```text
https://proxy-server-blue-l6vsfbzhba-uw.a.run.app/crawl
```

The hosted default crawler sends the docs URL, crawl depth, request count, and
Continue metadata to that proxy.

If Foundry IQ cannot be used, local crawling is an alternative only after each
target URL is approved. Local crawling still connects directly to the
documentation website.

### 7. Restrict direct URL fetching

The `fetch_url_content` tool fetches an arbitrary URL directly from the
extension host. This can disclose the request source to the target website, and
its content can subsequently be sent to the selected Foundry model.

For the protected profile:

- Do not use arbitrary URL fetching unless approved.
- Prefer Web.IQ citations for external material.
- If URL fetching is required, add an allowlist and verify fetched content
  handling.

### 8. Keep MCP disabled

No active MCP server is present. Keep MCP disabled unless each server:

- Has an approved processor/DPA position
- Has a reviewed endpoint and authentication method
- Uses no unapproved subprocessors
- Has a defined retention policy

## Function-level data flows to review

### Microsoft Foundry models

Chat, editing, and summarization can send selected code, prompts, and context to
the configured `services.ai.azure.com` endpoint.

Verify for each deployed resource:

- Exact Azure resource and region
- Microsoft DPA coverage
- Retention and diagnostic-log settings
- Network exposure and private endpoint policy
- Whether prompts are retained or used for training

### Microsoft Web.IQ

Web.IQ receives the search query and configured search options. Verify:

- Microsoft DPA coverage for the exact service
- Processing and log-storage regions
- Retention and abuse-monitoring policy
- Product-improvement and training policy
- Key rotation or managed-identity support

### Continue web search

The Continue provider is not approved for this profile because it sends the
query and client metadata to Continue's fixed hosted proxy. It is safe only for
configurations where that processor and endpoint are separately approved.

### Continue documentation crawler

The default crawler is not approved for this profile because it sends the
target URL and client metadata to Continue's fixed hosted proxy. It is
currently inactive because no docs source is configured.

### URL context

Direct URL fetching is not routed through Continue's proxy, but it still sends
a request to the target website and may add that website's content to the
Foundry prompt.

### Telemetry

Anonymous Continue telemetry is a separate data flow from model and search
requests. It must be disabled through effective settings and verified with
network traces.

### Local session and development data

These do not require an external processor by default, but they contain
potentially sensitive prompts, code, and results. Apply local access, retention,
encryption, and backup controls.

## Verification

Perform network verification for:

1. VS Code and ContinueIQ startup
2. Configuration reload
3. One Foundry chat request
4. One Web.IQ search
5. One failed Web.IQ request
6. An indexing operation, if enabled
7. A URL fetch, if retained

Approved external destinations:

- Configured Microsoft Foundry endpoint
- Configured Microsoft Web.IQ endpoint

Not approved for this profile:

- Continue's `/web` proxy
- Continue's `/crawl` proxy
- Other third-party search providers
- PostHog or unapproved analytics
- Unapproved MCP servers

Use an approved TLS-capable proxy, firewall logs, or equivalent network
inspection. Verify hostnames, not only visible UI behavior.

## Acceptance criteria

- Exposed credentials are rotated and no longer stored in plaintext.
- Effective anonymous telemetry is disabled.
- Web.IQ is the only enabled web-search provider.
- No request reaches Continue's search or docs-crawl proxy.
- No unapproved MCP or docs crawler is enabled.
- URL fetching has an approved use policy or is blocked.
- Foundry and Web.IQ DPA, region, retention, and subprocessor checks are
  documented.
- Local indexes, sessions, and development data have retention and access
  controls.
- Network traces contain only approved destinations for model and search
  traffic.
