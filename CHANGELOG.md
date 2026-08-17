# Changelog

## 0.1.0

First release.

FIM Autocomplete is a fork of [Continue](https://github.com/continuedev/continue)
reduced to its autocomplete engine: inline fill-in-the-middle completions in
VS Code, backed by whichever LLM provider you point it at. No chat, no agent, no
codebase indexing, no telemetry.

### What you get

- Inline ghost-text completions, debounced, with a force-completion keybinding
  (`cmd+alt+\` / `ctrl+alt+\`) and an on/off toggle
  (`cmd+k cmd+a` / `ctrl+k ctrl+a`).
- Cross-file context, which is the part worth keeping from upstream: definitions
  of imported symbols via tree-sitter and LSP, the enclosing class/function
  signature and the types it references, recently edited and recently visited
  ranges, recently opened files, and the current git diff. Every source is raced
  against its own timeout so a slow one cannot stall a keystroke.
- 16 model-specific FIM prompt templates, autodetected from the model name, and
  61 providers.
- A guided model picker (**FIM: Select Model**) built from native QuickPicks,
  which lists the models actually available on the server where the provider
  supports it.
- Configuration through plain VS Code settings under `fim.*`. No config file.

### Changed from Continue

- Configuration moved from `config.yaml` / the Continue hub to VS Code settings.
  There is no migration path; set `fim.model` by hand or run **FIM: Select
  Model**.
- Next Edit was removed. This does fill-in-the-middle only.
- All telemetry and analytics were removed.
- The completion cache is in-memory and resets on window reload; it was backed by
  sqlite upstream. This dropped the last native dependency.
- The per-workspace and global ignore file is `.fimignore`, not
  `.continueignore`. The global data directory is `~/.fim`.

### Fixed relative to the code this was forked from

- Added a FIM template for JetBrains Mellum. It previously fell through to a
  prefix-first template, which made the model ignore the cursor and hallucinate
  unrelated code.
- The first completion in a window no longer blocks for up to 20 seconds.
  `AutocompleteOutcome` populated `gitRepo` and `uniqueId` purely for telemetry,
  and `getRepoName` polls for 20 s when the git extension is not active. Cold
  start went from ~21 s to ~0.7 s.
- `getExtensionUri` looked up the hardcoded extension id `Continue.continue` with
  a non-null assertion, which would have thrown. It was unused; removed.
- Three providers identified this client as Continue to their servers:
  OpenRouter received `HTTP-Referer: https://www.continue.dev/` and
  `X-OpenRouter-Title: Continue`, ClawRouter received `User-Agent: Continue/...`,
  and Kindo received `kindo-token-transaction-type: CONTINUE` (an attribution tag
  Kindo issued to Continue). All three now identify this extension. The Kindo tag
  is `FIM_AUTOCOMPLETE`, which Kindo has not issued — override it via
  `fim.model.requestOptions.headers` if they reject it or issue you one.
- The force-completion default was `cmd+alt+space` on macOS, which is the
  system "Search with Finder" shortcut — the OS swallowed it before VS Code saw
  it, so the documented keybinding did nothing on a stock Mac. Rebound to
  `cmd+alt+\` / `ctrl+alt+\`.
- "Start Ollama" on Linux used to invoke a bundled helper script that ran
  `sudo systemctl start ollama`. The script was never copied into the bundle, so
  the command always failed anyway. It now just runs `ollama serve` in a
  terminal, and tells you where to get Ollama if it isn't installed. Installing
  and supervising Ollama is not an editor extension's job.
