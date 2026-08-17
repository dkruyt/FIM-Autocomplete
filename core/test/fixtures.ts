import { TabAutocompleteOptions } from "..";
import { AutocompleteConfigProvider } from "../autocomplete/types";
import Mock from "../llm/llms/Mock";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters";
import FileSystemIde from "../util/filesystem";

import { TEST_DIR } from "./testDir";

export const testIde = new FileSystemIde(TEST_DIR);

/** Stands in for the IDE-supplied config in tests. */
export function testConfig(
  overrides: Partial<TabAutocompleteOptions> = {},
): AutocompleteConfigProvider {
  return {
    getOptions: () => ({ ...DEFAULT_AUTOCOMPLETE_OPTS, ...overrides }),
  };
}

export const testLLM = new Mock({
  model: "mock-model",
  title: "Mock LLM",
  uniqueId: "not-unique",
});
