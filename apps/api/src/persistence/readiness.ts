import type { Pool } from "pg";

export interface DatabaseReadinessResult {
  ok: boolean;
  reason?: "no_pool" | "timeout" | "error" | undefined;
}

export interface CheckDatabaseReadinessOptions {
  timeoutMs?: number | undefined;
}

export const DEFAULT_READINESS_TIMEOUT_MS = 2_000;

/**
 * Checks PostgreSQL readiness by attempting a trivial query (`SELECT 1`)
 * with a strict timeout and fail-closed error handling.
 *
 * Never throws and never exposes internal details or error messages.
 */
export async function checkDatabaseReadiness(
  pool?: Pool | undefined,
  options: CheckDatabaseReadinessOptions = {},
): Promise<DatabaseReadinessResult> {
  if (!pool) {
    return { ok: false, reason: "no_pool" };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;

  let timer: NodeJS.Timeout | undefined;
  try {
    const queryPromise = pool.query("SELECT 1");
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("readiness_timeout"));
      }, timeoutMs);
    });

    await Promise.race([queryPromise, timeoutPromise]);
    return { ok: true };
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof Error && err.message === "readiness_timeout") ||
      (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "57014");

    return {
      ok: false,
      reason: isTimeout ? "timeout" : "error",
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
