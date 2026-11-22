# Microsoft Web.IQ Implementation Progress

## Implemented

- Added a top-level `webSearch` YAML configuration schema.
- Added Microsoft Web.IQ endpoint, API key, language, region, mode, safe-search,
  and maximum-response-length settings.
- Added `WebSearchConfig` to the runtime `ContinueConfig`.
- Kept the API key out of `BrowserSerializedContinueConfig`.
- Preserved Continue's existing web-search proxy as the default when
  `webSearch` is omitted.
- Routed both the built-in `search_web` tool and `@Web` context provider through
  the configured provider.
- Implemented Web.IQ's `POST` request with the `x-apikey` header.
- Converted Web.IQ evidence and citations into Continue context items.
- Added explicit errors for unsuccessful, invalid JSON, and malformed Web.IQ
  responses.
- Added focused provider and configuration schema tests.
- Updated the configuration reference and web-search documentation.

## Configuration

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

Only `provider`, `endpoint`, and `apiKey` are required. The remaining fields use
the defaults shown above.

## Validation status

`git diff --check` passes.

The focused provider and schema tests pass:

```powershell
npm run vitest --prefix core -- context/providers/WebContextProvider.vitest.ts tools/implementations/searchWeb.vitest.ts tools/searchWebGating.vitest.ts
npm test --prefix packages/config-yaml -- --runInBand src/schemas/webSearch.test.ts
npm run tsc:check --prefix core
npm run build --prefix packages/config-yaml
```

The Web.IQ provider tests passed all 8 assertions, the schema tests passed all
3 assertions, and core TypeScript checking passed.

## VS Code test build

A test VSIX was built for Windows x64:

```text
extensions/vscode/build/continueiq-win32-x64-1.3.40.vsix
```

The VSIX uses extension ID `Continue.continueiq` and display name
`ContinueIQ - Web.IQ Test`. The existing `Continue.continue` extension remains
installed but disabled to avoid command and view contribution conflicts.

VS Code activated `Continue.continueiq` on `onStartupFinished`. The installed
extension contains:

- The generated `webSearch` configuration schema
- The compiled Web.IQ request implementation
- The `x-apikey` request header
- The Web.IQ citation-to-context conversion

A live Web.IQ call was not made because the API key was available only in
masked form. To test the request, add the configuration above to the local
Continue configuration with the complete key, then invoke the built-in
`search_web` tool from ContinueIQ.

The generated schema was refreshed, core lint passed, and `git diff --check`
passed.

## Response normalization fix

The first live search exposed a stricter response-validator assumption than
the Web.IQ API provides. Citation metadata fields may be omitted or `null`.

The provider now requires only a valid evidence content string and normalizes
optional citation metadata before building `ContextItem` values. A regression
test covers omitted evidence type, null citation fields, and null citations.

The fixed provider passes 9 focused core tests, TypeScript checking, lint, and
`git diff --check`. The ContinueIQ VSIX was rebuilt and reinstalled.

## Mixed-result fix

Web.IQ can return a successful result array containing later entries with
`evidence.content: null`. Rejecting any such entry caused the entire search to
fail even when earlier entries were usable.

The provider now:

- Accepts a valid Web.IQ `results` array
- Maps entries with non-empty evidence content support
- Skips entries whose evidence or evidence content is missing or null
- Returns the remaining usable `ContextItem` values

This behavior is covered by a mixed valid/null result test. The focused suite
now passes 10 tests, TypeScript checking, lint, and `git diff --check`. The
ContinueIQ VSIX was rebuilt and reinstalled with this fix.
