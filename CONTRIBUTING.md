# Contributing

## Setting up

There are no npm workspaces here. `packages/*` are consumed as `file:`
dependencies via their compiled `dist/`, so **install order is load-bearing**:
`packages/fetch` → `packages/llm-info` → `packages/openai-adapters` (the last one
depends on the first), then `core`, then the extension.

```bash
for d in fetch llm-info openai-adapters; do
  (cd "packages/$d" && npm install && npm run build)
done
(cd core && npm install)
(cd extensions/vscode && npm install)
```

Node version is pinned in `.nvmrc` (20.20.1).

## Running it

Press <kbd>F5</kbd>. That runs the `extension:build` task (builds `packages/`,
starts the esbuild and tsc watchers) and opens an Extension Development Host with
the extension loaded. Its global directory is redirected to `.fim-debug/` in the
repo so you don't pollute your real `~/.fim`.

You'll need a model configured in the dev host's settings — run **FIM: Select
Model**, or set `fim.provider` and `fim.model` by hand. See the
[README](./README.md#configuring-a-model).

## Checks

```bash
cd extensions/vscode
npm run tsc:check   # typecheck — also covers core/, its tsconfig includes it
npm test            # vitest
npm run esbuild     # catches bundling regressions typecheck won't

cd ../../core
npm test
```

CI runs all of the above plus the `packages/` tests and a VSIX build.

## Building a VSIX

```bash
cd extensions/vscode
SKIP_INSTALLS=true node scripts/prepackage.js   # tree-sitter wasms + tokenizers into out/
npm run esbuild                                 # prepackage wipes out/, so bundle after it
npm run package                                 # -> build/fim-autocomplete-<version>.vsix
```

`prepackage.js` has a `validateFilesPresent` step that asserts the runtime assets
actually landed in `out/`. If you add something loaded from disk at runtime
rather than bundled, add it there too — that check is the only thing standing
between you and a VSIX that installs and then fails at runtime.

## Things worth knowing

**Completion quality has no automated coverage.** The unit tests cover the
pipeline against a mock LLM: prefiltering, snippet assembly, templating, stream
filtering, postprocessing. Whether the suggestions are any _good_ is only ever
established by trying it. If you touch templating or the context sources, say in
the PR what you exercised against a real model.

**`core/autocomplete/**` is kept deliberately close to upstream Continue** so
autocomplete fixes there stay cherry-pickable. Two seams already diverge and will
conflict on any upstream change to the completion provider — keep them small:

- `CompletionProvider` takes an `AutocompleteConfigProvider`
  (`core/autocomplete/types.ts`) instead of Continue's `ConfigHandler`.
- Next Edit is gone from
  `extensions/vscode/src/autocomplete/completionProvider.ts`.

**The settings namespace lives in one place.** `EXTENSION_NAME` in
`extensions/vscode/src/util/constants.ts` is the source of truth for the `fim.`
prefix; the matching keys in `extensions/vscode/package.json` are the other half.
Nothing else hardcodes it.

**Formatting** is prettier, enforced by a `lint-staged` pre-commit hook. Run
`npm run format` at the root if you bypass it.
