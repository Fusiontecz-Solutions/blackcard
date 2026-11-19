function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient Neon / pool errors that are safe to retry. */
export function isRetryableDbError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof anyErr.code === 'string' ? anyErr.code : '';
  const name = typeof anyErr.name === 'string' ? anyErr.name : '';
  const message =
    typeof anyErr.message === 'string' ? anyErr.message.toLowerCase() : '';

  if (
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1008' ||
    code === 'P1017' ||
    code === 'P2024' ||
    code === 'P2034'
  ) {
    return true;
  }

  if (code === '40001' || code === '40P01' || code === '57P01' || code === '57P03') {
    return true;
  }

  if (name === 'PrismaClientRustPanicError' || name === 'PrismaClientInitializationError') {
    return true;
  }

  if (!message) return false;
  return (
    message.includes('connection') ||
    message.includes("can't reach database server") ||
    message.includes('terminated unexpectedly') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('connection pool') ||
    message.includes('connection terminated') ||
    message.includes('write conflict') ||
    message.includes('deadlock detected')
  );
}

export async function withDbRetry<T>(
  op: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryableDbError(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      if (opts.label) {
        console.warn(
          `[db-retry] transient error during ${opts.label} (attempt ${attempt}/${maxAttempts}); retrying in ${
            delay + jitter
          }ms`,
          err instanceof Error ? err.message : err,
        );
      }
      await sleepMs(delay + jitter);
    }
  }
  throw lastErr;
}
