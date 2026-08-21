import { COUNT_COMPLETION_REJECTED_AFTER } from "../../util/parameters";

import { AutocompleteStats } from "./AutocompleteStats";
import { AutocompleteOutcome } from "./types";

export class AutocompleteLoggingService {
  // Key is completionId
  private _abortControllers = new Map<string, AbortController>();
  private _logRejectionTimeouts = new Map<string, NodeJS.Timeout>();
  private _outcomes = new Map<string, AutocompleteOutcome>();
  _lastDisplayedCompletion: { id: string; displayedAt: number } | undefined =
    undefined;
  /** Local-only outcome tally; see AutocompleteStats. */
  public readonly stats = new AutocompleteStats();

  public createAbortController(completionId: string): AbortController {
    const abortController = new AbortController();
    this._abortControllers.set(completionId, abortController);
    return abortController;
  }

  public deleteAbortController(completionId: string) {
    this._abortControllers.delete(completionId);
  }

  public cancel() {
    this._abortControllers.forEach((abortController, id) => {
      abortController.abort();
    });
    this._abortControllers.clear();
  }

  public accept(completionId: string): AutocompleteOutcome | undefined {
    if (this._logRejectionTimeouts.has(completionId)) {
      clearTimeout(this._logRejectionTimeouts.get(completionId));
      this._logRejectionTimeouts.delete(completionId);
    }

    if (this._outcomes.has(completionId)) {
      const outcome = this._outcomes.get(completionId)!;
      outcome.accepted = true;
      this.stats.record(outcome, "accepted");
      this._outcomes.delete(completionId);
      return outcome;
    }
  }

  /**
   * The user accepted part of the suggestion. Stops the rejection timer -- a
   * partial accept is a positive signal -- but keeps the outcome so a
   * subsequent full accept still resolves.
   */
  public partialAccept(completionId: string) {
    const timeout = this._logRejectionTimeouts.get(completionId);
    if (timeout) {
      clearTimeout(timeout);
      this._logRejectionTimeouts.delete(completionId);
    }

    const outcome = this._outcomes.get(completionId);
    if (outcome && !outcome.partiallyAccepted) {
      // Only the first partial accept counts; accepting three words in a row
      // is one useful suggestion, not three.
      outcome.partiallyAccepted = true;
      this.stats.record(outcome, "partial");
    }
  }

  public cancelRejectionTimeout(completionId: string) {
    if (this._logRejectionTimeouts.has(completionId)) {
      clearTimeout(this._logRejectionTimeouts.get(completionId)!);
      this._logRejectionTimeouts.delete(completionId);
    }

    if (this._outcomes.has(completionId)) {
      this._outcomes.delete(completionId);
    }
  }

  public markDisplayed(completionId: string, outcome: AutocompleteOutcome) {
    const logRejectionTimeout = setTimeout(() => {
      // Wait 10 seconds, then assume it wasn't accepted
      outcome.accepted = false;
      this._logRejectionTimeouts.delete(completionId);
      if (!outcome.partiallyAccepted) {
        this.stats.record(outcome, "rejected");
      }
    }, COUNT_COMPLETION_REJECTED_AFTER);
    this._outcomes.set(completionId, outcome);
    this._logRejectionTimeouts.set(completionId, logRejectionTimeout);

    // If the previously displayed completion is still waiting for rejection,
    // and this one is a continuation of that (the outcome.completion is the same modulo prefix)
    // then we should cancel the rejection timeout
    const previous = this._lastDisplayedCompletion;
    const now = Date.now();
    if (previous && this._logRejectionTimeouts.has(previous.id)) {
      const previousOutcome = this._outcomes.get(previous.id);
      const c1 = previousOutcome?.completion.split("\n")[0] ?? "";
      const c2 = outcome.completion.split("\n")[0];
      if (
        previousOutcome &&
        (c1.endsWith(c2) ||
          c2.endsWith(c1) ||
          c1.startsWith(c2) ||
          c2.startsWith(c1))
      ) {
        this.cancelRejectionTimeout(previous.id);
      } else if (now - previous.displayedAt < 500) {
        // If a completion isn't shown for more than
        this.cancelRejectionTimeout(previous.id);
      }
    }

    this._lastDisplayedCompletion = {
      id: completionId,
      displayedAt: now,
    };
  }
}
