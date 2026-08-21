"""
FIM Autocomplete — a tutorial you can type in.

This file is a scratchpad. Edit it, break it, delete half of it: it is
never executed and nothing here is checked. It lives at
~/.fim/tutorial.py, and "FIM: Open Tutorial" in the command palette
opens it again with whatever you left in it.

Work down the file. Each section is something to try, not to read.
"""


# ──────────────────────────────────────────────────────────────────
#  1. Setup
#
#  Look at the right-hand end of the status bar:
#
#      ✓ FIM    a model is configured, autocomplete is on
#      ⊘ FIM    autocomplete is off
#      ↻ FIM    waiting on the model right now
#      ⏸ FIM    paused, because you are on battery
#
#  Click it for a menu. If nothing completes further down this file,
#  open the command palette (cmd+shift+P / ctrl+shift+P) and run
#  "FIM: Select Model". It walks you through provider → connection →
#  model, and where the provider supports it, lists the models your
#  server actually has.
#
#  The same settings live under
#  Settings → Extensions → FIM Autocomplete.
# ──────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────
#  2. Ghost text
#
#  Put the cursor at the end of the docstring line below, press
#  Enter, and then stop typing. After about 350ms a grey suggestion
#  appears after the cursor.
#
#      Tab     accept all of it
#      Esc     dismiss it
#
#  Nothing is sent while you are still typing — the delay is
#  fim.debounceDelay.
# ──────────────────────────────────────────────────────────────────


def fizzbuzz(n: int) -> None:
    """Print 1 to n, but "Fizz" for multiples of 3, "Buzz" for 5."""


# ──────────────────────────────────────────────────────────────────
#  3. Fill in the middle
#
#  This is the part that makes a FIM model different from a plain
#  chat model: it sees the code *after* the cursor too, not only what
#  comes before it.
#
#  Put the cursor on the blank line below the docstring. The
#  suggestion should define exactly the variable that the `return`
#  line underneath is already asking for.
# ──────────────────────────────────────────────────────────────────


def celsius_to_fahrenheit(celsius: float) -> float:
    """Convert a temperature from Celsius to Fahrenheit."""

    return round(fahrenheit, 1)


# ──────────────────────────────────────────────────────────────────
#  4. Write the comment, get the code
#
#  Describe what you want in a comment, then stop at the end of the
#  line — no need to press Enter first. What comes back is the code
#  the comment describes, however many lines that takes, rather than
#  being cut off after one.
#
#  Try it on the comment below.
#
#  Put the cursor back in the middle of that comment and it will
#  stay on one line instead, so finishing a sentence you are still
#  writing never turns into a paragraph.
#
#  How much you get depends on the model as much as on the comment.
#  A small one will often answer a fiddly instruction with a stub;
#  that is the model, not the extension.
# ──────────────────────────────────────────────────────────────────


def total_price(items: list[dict]) -> float:
    """Add up the price of every item."""

    # sum the "price" of each item and return the total


# ──────────────────────────────────────────────────────────────────
#  5. The keys worth remembering
#
#      Tab                          accept the whole suggestion
#      cmd+→      / ctrl+→          accept one more word
#      cmd+↓      / ctrl+↓          accept one more line
#      Esc                          dismiss
#      cmd+alt+\  / ctrl+alt+\      ask for a suggestion right now
#      cmd+k cmd+a / ctrl+k ctrl+a  turn autocomplete off and on
#
#  cmd+alt+\ is the one to remember: it skips the debounce and asks
#  the model straight away. Use it when nothing appeared on its own.
#
#  Try it on the function below — put the cursor after the docstring
#  and press it instead of waiting.
#
#  Accept-a-word and accept-a-line are the fix for a suggestion that
#  starts right and ends wrong: take the good part and keep typing.
#  Taking part of a suggestion counts as using it, not rejecting it —
#  which matters for the numbers in section 7.
# ──────────────────────────────────────────────────────────────────


def slugify(title: str) -> str:
    """Lowercase a title and join its words with hyphens."""


# ──────────────────────────────────────────────────────────────────
#  6. Context from the rest of your code
#
#  The prompt is not just this file. Alongside the code around your
#  cursor, the extension gathers:
#
#    · definitions of the symbols you import, via tree-sitter and
#      your language server
#    · the signature of the function or class you are inside
#    · ranges you edited, files you opened, and places you looked
#      recently
#    · compiler and linter errors near your cursor, so a suggestion
#      can fix what is already broken — a missing import especially
#
#  Every source races its own timeout, so a slow one can never stall
#  a keystroke, and one that fails is simply left out. Whatever fits
#  the budget is ranked by how much it overlaps the code you are
#  writing, so the most relevant context survives if some has to be
#  dropped.
#
#  It also means completions get noticeably better in a real
#  repository than they look in an empty file like this one.
#
#  The function below has imports to work from — see whether the
#  suggestion uses them.
# ──────────────────────────────────────────────────────────────────


import json
from pathlib import Path


def load_settings(path: Path) -> dict:
    """Read a JSON file from disk and return it as a dict."""


# ──────────────────────────────────────────────────────────────────
#  7. Seeing what it is doing
#
#  Two commands, from the command palette:
#
#    FIM: Show Completion Stats
#        How this session has gone — how many suggestions appeared,
#        how many you took in full or in part, how long they took,
#        broken down by model once you have used more than one. This
#        is the honest answer to "is this model worth it". Give it
#        half an hour of real work first; a suggestion takes ten
#        seconds to count as ignored.
#
#    FIM: Show Logs
#        Needs "fim.debug": true. Then every completion is recorded
#        with the exact prompt, which context sources contributed,
#        and the confidence score. This is where to look when a
#        suggestion is not what you expected.
#
#  Both stay on your machine. The stats are counters held in memory
#  until the window reloads — no prompts, no code, no filenames, and
#  nothing leaves the editor.
# ──────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────
#  8. Tuning it
#
#  All under Settings → Extensions → FIM Autocomplete:
#
#    fim.debounceDelay         how long you have to pause (350ms)
#    fim.multilineCompletions  always / never / auto
#    fim.maxPromptTokens       how much context is sent (2048)
#    fim.modelTimeout          raise it if suggestions arrive cut
#                              short, especially on a slow local
#                              model
#    fim.confidenceThreshold   how sure a suggestion has to look
#                              before it is shown (0.35). Set it to
#                              0 to see everything; turn on
#                              fim.debug first so you can see the
#                              scores you are choosing between.
#
#  If completions feel wrong rather than slow, the model is usually
#  the problem: autocomplete wants a fill-in-the-middle *code* model
#  — qwen2.5-coder, codestral, deepseek-coder, starcoder2, codegemma
#  — not a general chat model.
# ──────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────
#  9. Turning it off, in one file or everywhere
#
#    cmd+k cmd+a / ctrl+k ctrl+a   toggle it for now
#    fim.disableInFiles            glob patterns, e.g. ["*.env"]
#    .fimignore                    gitignore syntax, in your
#                                  workspace root or ~/.fim/
#    fim.pauseOnBattery            pause while unplugged
#
#  Worth knowing: every completion sends the code around your cursor
#  to the provider you configured, and nowhere else. Nothing is
#  reported to anyone — the only figures kept are the counters behind
#  "Show Completion Stats", which live in memory until you reload the
#  window. If sending code to your provider still isn't acceptable
#  for some repository, put it in .fimignore, or point fim.provider
#  at a local Ollama or vLLM.
# ──────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────
#  That's all of it. Anything else you need:
#
#    README    https://github.com/dkruyt/FIM-Autocomplete
#    Issues    https://github.com/dkruyt/FIM-Autocomplete/issues
#
#  Now delete all of this and write something real in it.
# ──────────────────────────────────────────────────────────────────
