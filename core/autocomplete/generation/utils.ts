export async function* stopAfterMaxProcessingTime(
  stream: AsyncGenerator<string>,
  maxTimeMs: number,
  fullStop: () => void,
): AsyncGenerator<string> {
  /**
   * Started on the first chunk, not on subscription: this caps how long the
   * model may *generate*, and folding time-to-first-token into that budget
   * means any endpoint slower than `maxTimeMs` to respond gets cut off after a
   * single line, however fast it then streams.
   */
  let startTime: number | undefined;
  /**
   * Check every 10 chunks to avoid performance overhead.
   */
  const checkInterval = 10;
  let chunkCount = 0;

  for await (const chunk of stream) {
    startTime ??= Date.now();
    yield chunk;

    chunkCount++;

    if (chunkCount % checkInterval === 0) {
      if (Date.now() - startTime > maxTimeMs) {
        fullStop();
        return;
      }
    }
  }
}
