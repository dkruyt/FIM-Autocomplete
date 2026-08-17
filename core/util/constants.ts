/**
 * Fully-qualified VS Code extension id (`publisher.name` from the extension's
 * package.json). `core` is IDE-agnostic and cannot import the extension's own
 * constants, so the id lives here and the extension re-exports it.
 */
export const EXTENSION_ID = "dkruyt.fim-autocomplete";

/**
 * URI prefix of our own VS Code output channel.
 *
 * Reading it back as autocomplete context is a nasty feedback loop: the prompts
 * we log show up in the next prompt. Both the snippet validator and the
 * recently-visited-ranges service filter on this.
 */
export const OUTPUT_CHANNEL_URI_PREFIX = `output:extension-output-${EXTENSION_ID}`;
