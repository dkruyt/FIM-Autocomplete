import { ConfidenceSignals } from "../postprocessing/confidence";
import { Position, Range, RangeInFile, TabAutocompleteOptions } from "../..";
import { AutocompleteCodeSnippet } from "../snippets/types";

export type RecentlyEditedRange = RangeInFile & {
  timestamp: number;
  lines: string[];
  symbols: Set<string>;
};

export interface AutocompleteInput {
  isUntitledFile: boolean;
  completionId: string;
  filepath: string;
  pos: Position;
  recentlyVisitedRanges: AutocompleteCodeSnippet[];
  recentlyEditedRanges: RecentlyEditedRange[];
  // Used for notebook files
  manuallyPassFileContents?: string;
  // Used for VS Code git commit input box
  manuallyPassPrefix?: string;
  selectedCompletionInfo?: {
    text: string;
    range: Range;
  };
  injectDetails?: string;
}

/**
 * How many snippets each context source produced for one completion. Purely
 * diagnostic -- it is what the transparency view reports, and the cheapest way
 * to notice that a source has silently stopped contributing.
 */
export interface AutocompleteContextStats {
  rootPath: number;
  importDefinitions: number;
  ideLsp: number;
  recentlyEdited: number;
  recentlyVisited: number;
  recentlyOpened: number;
  clipboard: number;
  staticContext: number;
  diagnostics: number;
}

export interface AutocompleteOutcome extends TabAutocompleteOptions {
  accepted?: boolean;
  /**
   * The user took part of the suggestion (next word / next line) without
   * accepting all of it. Directional usefulness -- counting these as
   * rejections understates how often autocomplete helped.
   */
  partiallyAccepted?: boolean;
  time: number;
  prefix: string;
  suffix: string;
  prompt: string;
  completion: string;
  modelProvider: string;
  modelName: string;
  completionOptions: any;
  cacheHit: boolean;
  numLines: number;
  filepath: string;
  completionId: string;
  timestamp: string;
  enabledStaticContextualization?: boolean;
  contextStats?: AutocompleteContextStats;
  confidence?: ConfidenceSignals;
}
