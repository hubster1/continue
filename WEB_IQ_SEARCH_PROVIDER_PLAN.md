# Microsoft Web.IQ Search Provider Plan

## Goal

Add a `config.yaml` option that lets Continue route the built-in `search_web`
tool and the deprecated `@Web` context provider directly through Microsoft
Web.IQ.

When `webSearch` is omitted, Continue must continue to use its existing web
search proxy. Existing configurations and search behavior must remain
compatible.

For the intended GDPR/EU deployment, configure both model and web-search traffic
to use Microsoft services covered by the applicable Microsoft DPA:

- Models use Microsoft AI Foundry deployments in the approved EU region.
- Web search uses Microsoft Web.IQ directly in the approved EU region.
- Continue's hosted web-search proxy is never called for Web.IQ searches.
- Search queries and Continue client identifiers are not sent to Continue or to
  any other processor lacking an approved DPA.

This implementation can provide a technical data-flow control. Legal GDPR
compliance still requires verification of the actual Foundry/Web.IQ regions,
Microsoft service terms, DPA coverage, retention controls, subprocessors, and
organizational configuration.

## Current implementation

- `core/tools/definitions/searchWeb.ts` defines the `search_web` tool. It is
  always included by `core/tools/index.ts`.
- `core/tools/implementations/searchWeb.ts` calls `fetchSearchResults`, requests
  five results, and truncates each result to 8,000 characters.
- `core/context/providers/WebContextProvider.ts` implements both the
  `fetchSearchResults` helper and the `@Web` context provider.
- The helper currently posts `{ query, n }` to Continue's fixed
  `proxy-server-blue-l6vsfbzhba-uw.a.run.app/web` endpoint and expects the
  response to already be a `ContextItem[]`.
- `ToolExtras.config` and `ContextProviderExtras.config` already provide access
  to the loaded runtime configuration. No new execution plumbing is required.
- The YAML schema in `packages/config-yaml/src/schemas/index.ts` has no web
  search setting.
- The runtime `ContinueConfig` interface in `core/index.d.ts` has no web search
  setting.
- The current GDPR configuration intentionally omits external `@web` and marks
  the Continue proxy as blocked because it sends the query and client
  identifier to the hosted proxy.
- The current configuration uses Microsoft AI Foundry model endpoints and
  disables telemetry, remote data destinations, and analytics.
- `search_web` is currently always added by
  `getConfigDependentToolDefinitions`; a top-level `tools: []` entry must not be
  assumed to disable it.
- Existing tests cover tool availability and output truncation only. There are no
  tests for provider selection, request construction, response conversion,
  authentication, or provider failure behavior.

## Proposed configuration

The exact Microsoft Web.IQ field names must be confirmed from its official API
contract. The intended shape is:

```yaml
name: Microsoft Web.IQ example
version: 1.0.0
schema: v1

webSearch:
  provider: microsoft-web-iq
  endpoint: https://example.invalid/web-iq
  apiKey: ${{ secrets.MICROSOFT_WEB_IQ_API_KEY }}
```

Provider-specific request options should be limited to values required by the
confirmed Web.IQ contract. Do not add generic arbitrary header or body maps
unless the API requires them.

Configuration must follow these rules:

- Omitting `webSearch` selects the current Continue proxy.
- `microsoft-web-iq` requires every credential and endpoint field needed by the
  official service.
- Microsoft credentials are accepted from Continue secrets or environment
  substitution; plaintext credentials are not part of the documented setup.
- Secrets support the existing `${{ secrets.NAME }}` syntax.
- Credentials remain runtime-only and are not added to
  `BrowserSerializedContinueConfig`.
- Invalid configuration produces a clear configuration error; it must not
  silently fall back to another provider.
- An explicitly configured Web.IQ request must not call the Continue proxy and
  must not attach Continue-specific headers or client identifiers.
- The Web.IQ adapter must reject endpoints that are not HTTPS, except when a
  dedicated local test setup is explicitly supported.

## Implementation plan

### 1. Confirm the Web.IQ contract

Obtain the official Microsoft Web.IQ contract for:

- Search endpoint and URL construction
- Authentication method and secret header
- Request fields and result-count limit
- Response fields for title, URL, description, and content
- Regional or API-version requirements
- HTTP error shape
- Microsoft DPA and data-residency scope for the specific Web.IQ offering
- Whether EU-only routing, abuse detection, diagnostics, and content retrieval
  cause processing in any other region
- Supported credential mechanisms, preferably managed identity or a secret
  rotated outside the configuration file

No public endpoint or Microsoft Learn document matching "Web.IQ" was identified
during this investigation. Treat this as a required pre-implementation decision
and verify whether "Web.IQ" is an internal product name, a custom deployment, or
another Microsoft web search product.

### 2. Add typed configuration

- Define a discriminated `webSearch` schema in
  `packages/config-yaml/src/schemas/index.ts`.
- Add the value to the unrolled assistant schemas.
- Copy the parsed value into `ContinueConfig` in
  `core/config/yaml/loadYaml.ts`.
- Add matching runtime declarations in `core/index.d.ts` and any legacy
  `config.ts` types that still need parity.
- Keep the resolved secret inside the core configuration and exclude it from
  browser serialization in `core/config/load.ts`.

### 3. Introduce a provider boundary

- Add a small web-search provider interface with a single search operation.
- Keep the existing proxy implementation as the `continue` provider.
- Add a `microsoft-web-iq` adapter that constructs the authenticated request,
  validates the response, and converts results to Continue `ContextItem`
  values.
- Add only Microsoft-required headers. Do not reuse `getHeaders()`, because the
  current helper may attach Continue metadata intended for Continue-hosted
  services.
- Centralize provider selection in one resolver. Both the built-in tool and
  `@Web` must use it.
- Preserve the existing result count and truncation behavior.

### 4. Wire both search entry points

- Update `searchWebImpl` to select the provider from `extras.config.webSearch`.
- Update `WebContextProvider.getContextItems` to select the provider from
  `extras.config.webSearch`.
- Keep `fetchSearchResults` as a compatibility wrapper only if external callers
  within the repository still require it.
- Do not make provider availability depend on the deprecated `@Web` context
  being present in `config.yaml`.
- Ensure `search_web` can be explicitly disabled for strict deployments if the
  Web.IQ configuration is absent or invalid. Today it is always added.
- Add a configuration validation error that explains how to either configure
  Web.IQ or disable search when hosted search is disallowed.

### 5. Add focused tests

Add tests for:

- Default Continue proxy behavior when `webSearch` is omitted
- Valid and invalid Web.IQ YAML configurations
- Authentication header and request body construction
- Web.IQ response conversion to `ContextItem[]`
- Correct result count propagation from the tool and `@Web`
- Non-success responses and malformed responses
- No fallback after an explicitly configured provider fails
- Existing 8,000-character truncation behavior
- No Continue proxy request when Web.IQ is selected
- No `getHeaders()` metadata or machine/client identifier on a Web.IQ request
- Search disabled behavior when strict DPA controls prohibit the Continue proxy

Mock `FetchFunction`; do not call Microsoft or Continue services in unit tests.

### 6. Document the feature

Update the `config.yaml` reference and the web-search documentation with:

- Prerequisites
- A copy-pasteable `webSearch` example using a secret
- Supported fields
- Default behavior
- Credential scope and storage guidance
- Approved-region and DPA verification steps
- The direct Microsoft-only data flow and which fields reach each processor
- Provider-specific error examples

Remove or adjust any claim that `@Web` is the only way to configure web search.

## Validation

Run the smallest relevant commands first:

```powershell
npm test -- --run core/tools/implementations/searchWeb.vitest.ts
npm test -- --run core/tools/searchWebGating.vitest.ts
```

Add and run the provider and configuration-schema test files. Then run the
affected package type checks and lint targets defined by the repository.

## Completion criteria

- `search_web` uses Microsoft Web.IQ when configured.
- `@Web` uses the same configured provider.
- Omitting `webSearch` preserves current behavior.
- Selecting Web.IQ sends the query only to the configured Microsoft endpoint
  and never to Continue's hosted web-search proxy.
- Strict deployments can disable web search rather than fall back to hosted
  search.
- Invalid or failed configured requests return actionable errors.
- Web.IQ credentials are not serialized to the browser.
- Unit tests cover provider selection and request/response behavior.
- The configuration reference includes a verified example and makes no
  unsupported legal-compliance guarantee.

## Security follow-up

The reviewed local configuration includes plaintext credential values despite
its comments stating that secrets should be read from environment variables.
Rotate those credentials and replace them with Continue secret references before
committing or sharing the configuration. This plan file intentionally does not
copy or document the credential values.
