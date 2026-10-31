export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Token bucket used to keep the acquisition cadence conservative. It never
 * queues indefinitely: callers wait, and the sync timeout still applies.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly clock: Clock;

  constructor(capacity: number, refillPerMinute: number, clock: Clock = systemClock) {
    if (capacity <= 0 || refillPerMinute <= 0) {
      throw new Error("TokenBucket requires positive capacity and refill rate");
    }
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = refillPerMinute / 60_000;
    this.clock = clock;
    this.lastRefill = clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = Math.max(0, now - this.lastRefill);
    if (elapsed === 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  async take(tokens = 1): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }
      const missing = tokens - this.tokens;
      const waitMs = Math.ceil(missing / this.refillPerMs);
      await this.clock.sleep(Math.min(Math.max(waitMs, 10), 5_000));
    }
  }
}

export interface SingleFlight {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  activeKeys(): string[];
}

/** Collapses concurrent identical acquisitions into one request. */
export function createSingleFlight(): SingleFlight {
  const inflight = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing !== undefined) return existing as Promise<T>;
      const promise = task().finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, promise);
      return promise;
    },
    activeKeys(): string[] {
      return [...inflight.keys()].sort();
    },
  };
}
