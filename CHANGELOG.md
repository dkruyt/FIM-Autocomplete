# Changelog

## 0.4.0

0.3.1 was about context that never arrived. This release is about what happens
to it once it does: which snippets survive the token budget, whether the model
is shown code it can already see, and whether a suggestion is good enough to put
on screen. There is also, for the first time, a way to tell whether any of it is
working — a running tally on the status bar.

### Added

**Context is ranked by relevance instead of shuffled.** The token budget
routinely truncates the snippet list, so the ordering decides which context
actually reaches the model — and that ordering was a random shuffle. The same
cursor position could produce a good completion or a poor one depending on which
snippets happened to survive. Snippets are now scored on symbol overlap with the
code around the cursor, normalised so a large file cannot win on volume alone,
and equal scores keep source order rather than an arbitrary one.

**Compiler and linter errors near the cursor are sent to the model.**
`IDE.getProblems()` existed and autocomplete never called it. A model that can
see _"Cannot find name 'formatCurrency'"_ writes the import; one that can see a
type error tends to stop repeating it. Only the five nearest diagnostics within
15 lines count, collapsed to their first line, so it costs a handful of tokens.
`fim.useDiagnostics`, on by default.

**Suggestions are scored before they are shown.** Three signals: bracket balance
(the only unambiguous one — a completion closing a bracket neither it nor the
prefix opened is broken code), novelty against the code below the cursor, and
whether the completion's identifiers are grounded in the surrounding code.
`fim.confidenceThreshold` defaults to 0.35, which only drops completions failing
more than one signal. The per-signal breakdown is printed to the `fim.debug`
channel so the threshold can be set from observed numbers rather than guessed.

**A running tally of the session.** The `FIM` status bar item now reads
`FIM 11/9/82%/9%` — shown, accepted, acceptance rate, share answered from cache
without a model call. Hover for latency and mean length; **FIM: Show Completion
Stats** gives the full breakdown, including a per-model split once you have used
more than one. Turn the status bar figures off with `fim.showStatsInStatusBar`.

These are counters the provider already kept and dropped. The buffer holds a
verdict, a duration, a line count, a cache flag, a model name and a confidence
score — no prompts, no completion text, no file paths — is capped at 500
entries, is cleared when the window reloads, and is never sent anywhere. A test
asserts the absence of prompt, completion and path data so that stays true.

**Five settings that were previously only reachable by editing `settings.json`,
or not at all:** `fim.prefixPercentage`, `fim.maxSuffixPercentage`,
`fim.maxCompletionTokens`, `fim.confidenceThreshold`, `fim.useDiagnostics`.

### Fixed

**The file you were editing was sent back to you as context.** Recently _opened_
files excluded the current file and recently _visited_ ranges did too, but
recently _edited_ ranges did not — so the ranges most likely to overlap the code
already in the prompt were the ones that always got through. Found in a real
debug log: a completion in `config.py` whose prompt carried three snippets from
`config.py`, one repeating two constants that appeared verbatim a few lines
later in the prefix.

**Duplicate context was only stripped from one bucket of four.** The filter that
removes snippets already visible around the cursor ran on static context alone;
recently-edited, recently-visited and recently-opened were never checked. The
recently-opened branch additionally read the raw payload, bypassing filtering
entirely. Raising the prompt budget made this worse rather than better — more
room for duplicates instead of more room for context the model does not have.

**Writing a comment and expecting the implementation never worked.** Any cursor
on a line starting with a comment marker was forced to a single line, so
`# read the file at path and parse it as JSON` returned one line of a two-line
answer. Multi-line is now allowed at the _end_ of a comment, and still
suppressed _inside_ one, where a long suggestion is prose rather than code.

**...and the model would sometimes just write more comment.** The other half of
the same change: asked to complete `# This function `, a model would continue the
sentence, and asked to complete a bulleted list it would invent five more
bullets. A completion containing no code at all is now cut back to its first
line — finishing a sentence or a bullet is reasonable, writing five is not.

**Bracket matching only ran on JSON.** A completion that closes a bracket it
never opened is wrong in any code language; the check was attached to JSON as a
per-language filter. It now runs everywhere except Markdown, YAML and SQL, whose
files are routinely unbalanced fragments.

Enabling it exposed two bugs that had to be fixed first. The multi-line path
seeded its bracket stack from the _previously accepted completion_ rather than
the prefix, so a completion finishing a function body — the most common
multi-line completion there is — was truncated at the closing brace, because the
brace it closed was opened by the code above the cursor. And `.sql` had no entry
in the language table at all, so SQL files were being treated as TypeScript.

**A slow context source degraded gracefully; a failing one did not.** A language
server restarting mid-completion rejected the whole gather and produced no
suggestion, instead of one with less context.

**Tutorial updates never reached anyone who already had it.** The copy in your
home directory was never overwritten, so a tutorial rewritten for new features
only ever reached first-time installs. It is now refreshed while it is still
byte-for-byte what we shipped, tracked by a hash; edit one character and it is
yours and we stop touching it.

### Changed

- `fim.maxPromptTokens` now defaults to 2048, up from 1024. At 1024 the window
  around the cursor was roughly 307 tokens of prefix and 205 of suffix, which is
  small for the models this targets.
- The prompt budget is now resolved against the model in use, capped at what its
  context length can hold once the completion's own tokens are reserved.
  Previously it was a preference with no relationship to the model, so an
  oversized prompt could reach an endpoint that silently truncated it — usually
  from the wrong end, discarding the code nearest the cursor.
- The tutorial covers comment-driven completion, accept-a-line, diagnostics and
  relevance ranking, and no longer quotes a `fim.maxPromptTokens` figure that
  stopped being true.

## 0.3.1

### Fixed

**Four of eight context sources never ran.** LSP definitions sat behind a
disabled flag, the recently-edited listener was commented out, the
recently-visited service was never subscribed to a selection event, and the
recently-opened cache was read on every completion but never written.
Autocomplete was generating from a fraction of the context it reported having.

**The completion cache could never hit.** Reads and writes used different keys,
so every completion was a fresh generation.

**Multi-line completions were truncated to one line against remote endpoints.**
Both streaming budgets started when the request was made rather than when the
first token arrived, so time spent waiting for the model counted against the
time it was allowed to generate. A model returning four lines delivered one. The
character-level cutoff also fired upstream of line assembly, which could emit a
suggestion broken mid-expression.

**An empty prompt could be sent to the model.** Autocomplete reserved 4096
output tokens — a figure sized for chat — so any model with a context length at
or below roughly 4100 was left with no room for a prompt at all, and the request
went out with an empty one. Requests now reserve 512 output tokens, and a
context budget that cannot be met raises a clear error instead of silently
sending nothing.

**Weak models could suggest a copy of your own code.** A completion that
restates the enclosing function and stops at the cursor now gets rejected.

**A single malformed context snippet aborted the whole completion**, leaving no
suggestion and no explanation.

### Changed

- `fim.modelTimeout` now defaults to 1000 ms, up from 150 ms. The old default
  fired routinely against any non-local model and cut completions short.
- `fim.showWhateverWeHaveAtXMs` (300 ms) is now an exposed setting. It controls
  when partial output is shown, and is the knob to reach for if completions feel
  slow to appear.
- Requests reserve 512 output tokens instead of 4096.

### Added

- `fim.debug` and the **FIM: Show Logs** command open a "FIM Autocomplete"
  output channel reporting, per completion, which context sources contributed,
  token counts, cache hits and latency.
- **FIM: Accept Next Word** (`cmd+right` / `ctrl+right`) and **FIM: Accept Next
  Line** (`cmd+down` / `ctrl+down`). Partial acceptances are now recorded as
  such rather than counted as rejections.

## 0.3.0

### Internal cleanup

No user-facing change. The last of the code inherited from Continue that no
longer had a caller is gone: the Jaccard-similarity snippet ranker, the git-diff
snippet source (disabled upstream since continuedev/continue#5882, and reduced to
an empty array here long before this), and a scattering of unreferenced helpers
in `core/diff`, `core/llm/toolSupport`, `core/tools/parseArgs` and the extension's
`util.ts`.

The `experimental_includeDiff` option went with the diff snippets. It was never
reachable from VS Code settings and gated a source that always produced nothing,
so no configuration needs updating.

## 0.2.5

### Model settings are editable in the Settings UI

The completion model used to be one `fim.model` object. VS Code's Settings editor
can't render an object with nested properties, so it offered only _"Edit in
settings.json"_ — the two things everyone has to set (provider, model) and the
two most people have to set (API base, API key) were unreachable from the GUI.

It is now one setting per field:

| Before                        | Now                     |
| ----------------------------- | ----------------------- |
| `fim.model.provider`          | `fim.provider`          |
| `fim.model.model`             | `fim.model`             |
| `fim.model.apiBase`           | `fim.apiBase`           |
| `fim.model.apiKey`            | `fim.apiKey`            |
| `fim.model.template`          | `fim.template`          |
| `fim.model.contextLength`     | `fim.contextLength`     |
| `fim.model.requestOptions`    | `fim.requestOptions`    |
| `fim.model.completionOptions` | `fim.completionOptions` |

`fim.provider` is a dropdown of all 61 providers the engine ships with, each with
a one-line description marking the ones that have a native fill-in-the-middle
endpoint. `fim.apiKey` is machine-scoped, so a checked-in `.vscode/settings.json`
can no longer set it for everyone on a repo.

A 0.1.0 `fim.model` object is migrated to the new keys on first start, in
whichever scopes it was set, and is still read as a fallback if it survives
anywhere. **FIM: Select Model** writes the new keys, and now clears an API key
left over from a previous provider instead of carrying it across.

### A tutorial that opens on install

The first activation after installing opens `tutorial.py` — the status bar, the
keybindings, fill-in-the-middle and the settings worth knowing, each with an
exercise to try it on. It is copied to `~/.fim/tutorial.py` and never
overwritten after that, so it doubles as a scratchpad. **FIM: Open Tutorial**
and the status bar menu reopen it. If no model is configured when it opens, the
model wizard is offered alongside it.

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
