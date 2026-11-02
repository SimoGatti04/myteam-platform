import type { Pool, PoolClient } from "pg";

export interface DatabaseReadinessResult {
  ok: boolean;
  reason?: "no_pool" | "timeout" | "error" | undefined;
}

export interface CheckDatabaseReadinessOptions {
  /** Overall budget for pool acquisition and SELECT 1. Defaults to 2,000ms. */
  timeoutMs?: number | undefined;
  /** Fail fast when the pool already has more than this many waiters. Defaults to 2. */
  maxWaitingCount?: number | undefined;
}

export const DEFAULT_READINESS_TIMEOUT_MS = 2_000;
export const DEFAULT_MAX_WAITING_COUNT = 2;

interface PoolReadinessState {
  inFlight?: Promise<DatabaseReadinessResult>;
  /**
   * `pool.connect()` cannot be cancelled by Promise.race. Keep this set until
   * its promise settles so timeouts cannot enqueue repeated orphan acquisitions.
   */
  acquisitionPending: boolean;
}

const poolStates = new WeakMap<Pool, PoolReadinessState>();

export function checkDatabaseReadiness(
  pool?: Pool | undefined,
  options: CheckDatabaseReadinessOptions = {},
): Promise<DatabaseReadinessResult> {
  if (!pool) {
    return Promise.resolve({ ok: false, reason: "no_pool" });
  }

  let state = poolStates.get(pool);
  if (!state) {
    state = { acquisitionPending: false };
    poolStates.set(pool, state);
  }

  // Concurrent callers share one bounded probe. After an acquisition times out,
  // reject new probes until its uncancellable pg Pool acquisition settles.
  if (state.inFlight) {
    return state.inFlight;
  }
  if (state.acquisitionPending) {
    return Promise.resolve({ ok: false, reason: "timeout" });
  }

  const maxWaitingCount = options.maxWaitingCount ?? DEFAULT_MAX_WAITING_COUNT;
  if (typeof pool.waitingCount === "number" && pool.waitingCount > maxWaitingCount) {
    return Promise.resolve({ ok: false, reason: "timeout" });
  }

  const probe = executeReadinessCheck(pool, state, options).finally(() => {
    if (state.inFlight === probe) {
      delete state.inFlight;
    }
  });
  state.inFlight = probe;
  return probe;
}

async function executeReadinessCheck(
  pool: Pool,
  state: PoolReadinessState,
  options: CheckDatabaseReadinessOptions,
): Promise<DatabaseReadinessResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let client: PoolClient | undefined;
  let completed = false;
  let clientReleased = false;
  let timedOut = false;
  let succeeded = false;
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("readiness_timeout"));
    }, timeoutMs);
  });

  const releaseClient = (acquiredClient: PoolClient, discard: boolean): boolean => {
    if (clientReleased) {
      return true;
    }
    clientReleased = true;
    try {
      acquiredClient.release(discard ? new Error("readiness_client_discard") : undefined);
      return true;
    } catch {
      // Do not let a driver cleanup failure leak into the HTTP response.
      return false;
    }
  };

  state.acquisitionPending = true;
  let acquisition: Promise<PoolClient>;
  try {
    acquisition = pool.connect();
  } catch {
    state.acquisitionPending = false;
    completed = true;
    if (timer) {
      clearTimeout(timer);
    }
    return { ok: false, reason: "error" };
  }

  // Observe both outcomes immediately. In particular, a late-resolving client
  // must be discarded instead of remaining checked out after the HTTP timeout.
  void acquisition.then(
    (acquiredClient) => {
      state.acquisitionPending = false;
      if (completed) {
        try {
          acquiredClient.release(new Error("readiness_late_client_discard"));
        } catch {
          // A late cleanup failure is intentionally contained; the probe is already closed.
        }
        return;
      }
      client = acquiredClient;
    },
    () => {
      state.acquisitionPending = false;
    },
  );

  let outcome: DatabaseReadinessResult = { ok: false, reason: "error" };
  try {
    await Promise.race([acquisition, timeoutPromise]);
    if (!client) {
      throw new Error("readiness_client_unavailable");
    }

    if (Date.now() >= deadline) {
      timedOut = true;
      throw new Error("readiness_timeout");
    }
    const queryPromise = client.query("SELECT 1");
    await Promise.race([queryPromise, timeoutPromise]);
    succeeded = true;
    outcome = { ok: true };
  } catch {
    outcome = { ok: false, reason: timedOut ? "timeout" : "error" };
  } finally {
    completed = true;
    if (timer) {
      clearTimeout(timer);
    }
    if (client && !releaseClient(client, !succeeded)) {
      outcome = { ok: false, reason: "error" };
    }
  }

  return outcome;
}
