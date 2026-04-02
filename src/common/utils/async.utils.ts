import { HttpException, Logger } from '@nestjs/common';

/**
 * Wraps an async function: on failure, rethrows HttpException as-is;
 * other errors are logged (with methodName and stack) then rethrown.
 */
export async function wrapAsync<T>(
  logger: Logger,
  methodName: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    logger.log(`${methodName} took ${elapsed}ms`);
    return result;
  } catch (err) {
    if (err instanceof HttpException) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(`${methodName}: ${msg}`, stack);
    throw err;
  }
}
