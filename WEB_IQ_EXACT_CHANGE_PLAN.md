# Microsoft Web.IQ Exact Change Plan

## Scope

Add Microsoft Web.IQ as a configurable web-search provider while preserving the
current Continue provider as the default.

The intended implementation is:

- Preserve existing model-provider behavior
- Add Microsoft Web.IQ as an alternative web-search provider
- Allow configuration of the Web.IQ URL, key, and required search parameters
- Preserve the existing Continue web-search behavior when Web.IQ is not
  configured

This document plans changes only. It does not alter the local Continue
configuration or unrelated security and telemetry settings. No production code
should be changed during this phase.

## Decisions required before implementation

The Microsoft Web.IQ contract is not available in this repository or in the
public Microsoft Learn results found during investigation. Obtain and approve
the following from the Web.IQ owner before implementation:

1. HTTPS endpoint format
2. API version and query parameters
3. Authentication mechanism and header name
4. Request body shape and supported result-count field
5. Response shape for title, URL, snippet, and page content
6. Error response format
7. Whether the service supports managed identity; otherwise, the secret and
   rotation format

Use those answers to replace the `WEB_IQ_*` placeholders below. Do not guess or
infer these values.

## 1. Configuration schema

### `packages/config-yaml/src/schemas/index.ts`

Add exported schemas for the existing Continue provider and the new Microsoft
Web.IQ provider:

```ts
const continueWebSearchConfigSchema = z.object({
  provider: z.literal("continue"),
  enabled: z.literal(true).optional(),
});

const microsoftWebIqSearchConfigSchema = z.object({
  provider: z.literal("microsoft-web-iq"),
  endpoint: z.string().url(),
  apiKey: z.string().min(1),
  apiVersion: z.string().min(1).optional(),
});

export const webSearchConfigSchema = z.discriminatedUnion("provider", [
  continueWebSearchConfigSchema,
  microsoftWebIqSearchConfigSchema,
]);
```

Add `webSearch: webSearchConfigSchema.optional()` to `baseConfigYamlSchema`.
`configYamlSchema`, `assistantUnrolledSchema`, and
`assistantUnrolledSchemaNonNullable` all extend that base schema, so do not
duplicate the field in each derived schema.

Verify that the inferred types include `webSearch` in all three exported
configuration shapes. No additional `isAssistantUnrolledNonNullable` condition
is needed because the field itself is not an array of nullable values.

After implementation, refine the Microsoft schema to the confirmed contract. In
particular:

- Require the actual API-version field only if Web.IQ requires it.
- Add provider-specific region or deployment fields only if documented.
- Do not add arbitrary headers or arbitrary extra-body properties.
- Enforce the URL format required by the verified endpoint.

Behavior of omitted `webSearch` remains provider `continue` to preserve
backward compatibility.

### `packages/config-yaml/schema/config-yaml-schema.json`

Regenerate this file with:

```powershell
npm run generate-schema --prefix packages/config-yaml
```

Do not hand-edit the generated schema.

## 2. Runtime configuration types

### `core/index.d.ts`

Add shared types:

```ts
export type WebSearchConfig =
  | { provider: "continue"; enabled?: true }
  | {
      provider: "microsoft-web-iq";
      endpoint: string;
      apiKey: string;
      apiVersion?: string;
    };
```

Add `webSearch?: WebSearchConfig` to `ContinueConfig`.

Do not add the value, especially `apiKey`, to
`BrowserSerializedContinueConfig`.

### `core/config/types.ts`

Add matching `WebSearchConfig` and `ContinueConfig.webSearch` declarations in
the generated/source-compatibility declarations if they are still consumed by
config type generation.

Do not add `webSearch` to `ConfigDependentToolParams`. Tool registration does
not depend on the provider; the implementation reads it from
`ToolExtras.config` at execution time.

## 3. Runtime config loading

### `core/config/yaml/loadYaml.ts`

Set the runtime field during `configYamlToContinueConfig`:

```ts
webSearch: unrolledAssistant.webSearch,
```

Use the normalized `config` value if the non-null conversion is preferred.

Validate and resolve the secret before this point through the existing Continue
secret-rendering path. If a required secret remains unresolved, report a
configuration error rather than attempting a request.

### `core/config/load.ts`

Do not serialize `webSearch` in `finalToBrowserConfig`. This keeps the Web.IQ
secret and endpoint configuration core-only.

No GUI state is needed to execute the built-in tool, because tool calls execute
in core and already receive `ToolExtras.config`.

## 4. Tool configuration

### `core/tools/index.ts`

No change is required to tool availability. Keep `search_web` in the existing
tool set:

```ts
tools.push(toolDefinitions.searchWebTool);
```

The `webSearch` value only selects the implementation used when the tool runs.

### `core/tools/searchWebGating.vitest.ts`

No gating change is expected. Add or retain a regression assertion that
`search_web` remains present for omitted, Continue, and Microsoft Web.IQ
configurations.

No `ConfigDependentToolParams` test update is expected.

## 5. Provider abstraction

### New file: `core/context/providers/webSearch/WebSearchProvider.ts`

Define a shared provider contract:

```ts
interface WebSearchProvider {
  search(query: string, n: number, fetch: FetchFunction): Promise<ContextItem[]>;
}
```

Also add:

- A resolver accepting `WebSearchConfig | undefined`
- A runtime error for unknown providers
- A normalized result validator producing only `name`, `description`, and
  `content`
- No authentication or endpoint fallback in the shared resolver

Provider resolution:

- `undefined` -> Continue provider
- `continue` -> Continue provider
- `microsoft-web-iq` -> Microsoft provider

### New file: `core/context/providers/webSearch/ContinueWebSearchProvider.ts`

Move the current request logic from `WebContextProvider.ts` without changing its
wire behavior:

- POST `{ query, n }` to the current Continue proxy `/web` endpoint
- Include the existing `getHeaders()` values
- Parse the current `ContextItem[]` response
- Preserve the current error text

This provider exists only for backwards compatibility and must not be selected
when Microsoft Web.IQ is configured.

### New file: `core/context/providers/webSearch/MicrosoftWebIqProvider.ts`

Implement the confirmed Microsoft contract. Exact request code cannot be written
until the contract decisions above are complete.

Required behavior:

- Validate the endpoint according to the confirmed Web.IQ URL contract
- Send only the confirmed Microsoft authentication header
- Do not call or import `getHeaders()`
- Do not include Continue machine, extension, or client identifiers
- POST or GET exactly as specified by Web.IQ
- Map the confirmed response fields to `ContextItem[]`
- Reject malformed response data with a provider-specific error
- Preserve the original HTTP status and safe response message on failure
- Never log headers, query credentials, or secret values

The provider must have no code path that falls back to Continue search.

## 6. Existing search entry points

### `core/context/providers/WebContextProvider.ts`

Keep the class and `@Web` provider title for compatibility.

Replace the direct Continue-proxy request with:

```ts
const provider = resolveWebSearchProvider(extras.config.webSearch);
return provider.search(extras.fullInput, n, extras.fetch);
```

Keep:

- `DEFAULT_N = 6`
- Configured `params.n` behavior
- The deprecation and context-provider registration behavior

Keep or re-export `fetchSearchResults` only if it is still required by another
in-repository caller. Its signature should accept no Microsoft configuration
only if it is explicitly documented as the legacy Continue-provider helper.

### `core/tools/implementations/searchWeb.ts`

Replace the direct import and call to the Continue-specific helper with:

```ts
const provider = resolveWebSearchProvider(extras.config.webSearch);
const webResults = await provider.search(query, 5, extras.fetch);
```

Preserve the existing 8,000-character per-result truncation and warning item.

## 7. Configuration validation behavior

During config load:

- Missing `webSearch` remains valid and selects Continue.
- `microsoft-web-iq` missing an endpoint or secret is a fatal validation error.
- An unresolved secret reference is a fatal configuration error for Web.IQ.
- A configured provider may fail at request time, but must not select another
  provider automatically.

## 8. Tests

### New `core/context/providers/webSearch/MicrosoftWebIqProvider.vitest.ts`

Mock `FetchFunction` and cover:

- Request URL, HTTP method, query, result count, API version, and body
- Exact Microsoft authentication header
- HTTPS validation
- `getHeaders()` metadata is not present
- No Continue host is called
- Successful response mapping
- Empty result list
- Invalid JSON
- Invalid result shape
- HTTP 401/403/429/5xx errors
- No secret or authorization header appears in thrown/logged errors

### New `core/context/providers/webSearch/ContinueWebSearchProvider.vitest.ts`

Cover the moved legacy behavior:

- Existing endpoint
- `{ query, n }` body
- Existing Continue headers
- Legacy response mapping and errors

### New provider resolver tests

Cover:

- Undefined -> Continue
- `continue` -> Continue
- `microsoft-web-iq` -> Microsoft
- Unknown runtime values rejected

### Update `core/tools/implementations/searchWeb.vitest.ts`

Add a mocked provider resolver/config and verify:

- `query` and `n = 5` are passed to the selected provider
- Web.IQ config selects the Microsoft provider
- Continue config selects the existing provider
- Existing truncation tests still pass

### New or update `WebContextProvider` tests

Cover:

- The full input is used as the query
- Configured `n` is passed through
- Default `n = 6` is preserved
- Web.IQ config selects the Microsoft provider

### `packages/config-yaml` tests

Add schema tests covering:

- Valid Microsoft configuration
- Invalid endpoint rejected according to the verified Web.IQ URL contract
- Missing endpoint or API key rejected
- Valid legacy/default mode
- Unknown provider rejected

### `core/config` tests

Add a test that proves:

- `webSearch` reaches runtime `ContinueConfig`
- The Web.IQ API key does not reach `BrowserSerializedContinueConfig`

## 9. Documentation

### `docs/reference.mdx`

Add `webSearch` to the top-level property list and add a section explaining:

- Provider modes
- Required Microsoft fields after the API contract is confirmed
- Default Continue behavior
- `${{ secrets.NAME }}` usage
- That `@Web` and `search_web` share the selected provider
- The setting is core-only and not serialized to the browser

### `docs/ide-extensions/agent/how-it-works.mdx`

Clarify that `search_web` uses the configured web-search provider.

### `docs/customize/custom-providers.mdx`

Clarify that `@Web` uses the top-level `webSearch` provider rather than being a
provider-configuration mechanism itself.

### `docs/reference/deprecated-context-providers.mdx`

Keep the deprecated `@Web` example, but show the corresponding top-level
`webSearch` configuration and clarify that `params.n` controls result count only.

## 10. Validation commands

Run from the repository root:

```powershell
npm run vitest --prefix core -- core/tools/searchWebGating.vitest.ts
npm run vitest --prefix core -- core/tools/implementations/searchWeb.vitest.ts
npm run vitest --prefix core -- core/context/providers/webSearch
npm test --prefix packages/config-yaml -- --runInBand
npm run build --prefix packages/config-yaml
npm run generate-schema --prefix packages/config-yaml
npm run tsc:check --prefix core
npm run lint --prefix core
git diff --check
```

If repository scripts require a different argument format, use the package's
configured runner and retain the exact command and result in the pull request.

## Acceptance criteria

- Existing users with no `webSearch` setting retain Continue proxy behavior.
- Microsoft Web.IQ mode sends all search requests directly to the configured
  Microsoft endpoint.
- Microsoft mode never calls the Continue proxy and never uses Continue headers.
- Foundry model behavior is unchanged.
- API keys do not appear in browser configuration, errors, or logs.
- `search_web` and `@Web` use one provider-selection path.
- Invalid configuration produces actionable load-time errors.
- Unit tests prove provider routing and response conversion.
- Generated YAML schema and documentation match runtime behavior.
