import { Mutex } from "async-mutex";

interface CacheEntry {
  value: string;
  timestamp: number;
}

/** Upstream truncated keys to fit SQLite's LIKE pattern limit. The cache is now
 * purely in-memory, but keeping a bound on key length still keeps memory
 * predictable for very long prefixes. */
const MAX_KEY_BYTES = 50_000 - 100;

function truncateToLastNBytes(input: string, maxBytes: number): string {
  let bytes = 0;
  let startIndex = 0;

  for (let i = input.length - 1; i >= 0; i--) {
    bytes += new TextEncoder().encode(input[i]).length;
    if (bytes > maxBytes) {
      startIndex = i + 1;
      break;
    }
  }

  return input.substring(startIndex, input.length);
}

/**
 * In-memory LRU cache for autocomplete results.
 *
 * Stores prefix-to-completion mappings and evicts the oldest entry when
 * capacity is exceeded. Upstream Continue also persisted this to SQLite; that
 * was dropped here so the extension carries no native dependency — the cache is
 * a latency optimization within a session, not durable state.
 */
export class AutocompleteLruCache {
  private static capacity = 1000;
  private static instancePromise?: Promise<AutocompleteLruCache>;
  private mutex = new Mutex();
  private cache: Map<string, CacheEntry> = new Map();

  static async get(): Promise<AutocompleteLruCache> {
    if (!AutocompleteLruCache.instancePromise) {
      AutocompleteLruCache.instancePromise = Promise.resolve(
        new AutocompleteLruCache(),
      );
    }
    return AutocompleteLruCache.instancePromise;
  }

  /**
   * Retrieves cached completion for a prefix using longest-match strategy.
   *
   * 1. Finds the longest cached prefix that the query starts with
   * 2. Validates that cached completion starts with the remaining query text
   * 3. Returns the completion with the matched portion stripped
   * 4. Updates the entry's timestamp (LRU tracking)
   */
  async get(prefix: string): Promise<string | undefined> {
    const truncatedPrefix = truncateToLastNBytes(prefix, MAX_KEY_BYTES);
    let bestMatch: { key: string; entry: CacheEntry } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (truncatedPrefix.startsWith(key)) {
        if (!bestMatch || key.length > bestMatch.key.length) {
          bestMatch = { key, entry };
        }
      }
    }

    if (
      bestMatch &&
      bestMatch.entry.value.startsWith(
        truncatedPrefix.slice(bestMatch.key.length),
      )
    ) {
      bestMatch.entry.timestamp = Date.now();

      return bestMatch.entry.value.slice(
        truncatedPrefix.length - bestMatch.key.length,
      );
    }

    return undefined;
  }

  /** Stores a prefix-to-completion mapping, evicting the oldest if over capacity. */
  async put(prefix: string, completion: string) {
    const release = await this.mutex.acquire();
    const truncatedPrefix = truncateToLastNBytes(prefix, MAX_KEY_BYTES);

    try {
      this.cache.set(truncatedPrefix, {
        value: completion,
        timestamp: Date.now(),
      });

      if (this.cache.size > AutocompleteLruCache.capacity) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldestKey = key;
          }
        }

        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
    } finally {
      release();
    }
  }

  async close() {
    this.cache.clear();
    AutocompleteLruCache.instancePromise = undefined;
  }
}
export default AutocompleteLruCache;
