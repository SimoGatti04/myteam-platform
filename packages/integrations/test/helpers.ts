import { readFileSync } from "node:fs";
import type { HttpResponseLike, FetchLike } from "../src/acquire/client.js";
import type { Clock } from "../src/security/rate-limit.js";
import type { CsiLocator, CsiSnapshot } from "../src/types.js";
import { parseCompetitionPage, snapshotFromParsed, type ParseContext } from "../src/csi/parse.js";
import { CSI_PROFILE_V0 } from "../src/csi/profile.js";
import { createSnapshot } from "../src/csi/snapshot.js";

export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

export function testLocator(overrides: Partial<CsiLocator> = {}): CsiLocator {
  return {
    sourceId: "csi-live",
    seasonLabel: "2025/26",
    seasonSegment: "25",
    regionSlug: "Lombardia",
    committeeSlug: "Bergamo",
    disciplineSlug: "Calcio-a-5",
    competitionSegment: "C203",
    groupLabel: "Dilettanti A 5 Gruppo C / B",
    url: "https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lombardia/Bergamo/C203/",
    ...overrides,
  };
}

export interface FakeClock extends Clock {
  advance(ms: number): void;
  slept: number;
}

export function fakeClock(start = Date.UTC(2025, 9, 1, 8, 0, 0)): FakeClock {
  let now = start;
  let slept = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      slept += ms;
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    get slept() {
      return slept;
    },
  };
}

export interface FakeResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  chunks?: string[];
  chunkBytes?: number;
}

export function fakeResponse(init: FakeResponseInit = {}): HttpResponseLike {
  const headers = new Map<string, string>(
    Object.entries({ "content-type": "text/html; charset=utf-8", ...(init.headers ?? {}) }).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  const text = init.body ?? "";
  const chunks = init.chunks;

  let body: ReadableStream<Uint8Array> | null = null;
  if (chunks !== undefined) {
    body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
  }

  return {
    status: init.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
  };
}

export interface RecordedFetch extends FetchLike {
  calls: string[];
  headersSeen: Array<Record<string, string>>;
}

/** Fake HTTP layer: no network activity is possible in tests. */
export function recordingFetch(
  responder: (url: string, callIndex: number) => HttpResponseLike | Promise<HttpResponseLike>,
): RecordedFetch {
  const calls: string[] = [];
  const headersSeen: Array<Record<string, string>> = [];
  const impl: RecordedFetch = Object.assign(
    async (url: string, init: { headers: Record<string, string> }) => {
      const index = calls.length;
      calls.push(url);
      headersSeen.push(init.headers);
      return responder(url, index);
    },
    { calls, headersSeen },
  );
  return impl;
}

export function testParseContext(overrides: Partial<ParseContext> = {}): ParseContext {
  const locator = testLocator();
  return {
    profile: CSI_PROFILE_V0,
    baseUrl: locator.url,
    timeZone: "Europe/Rome",
    referenceDate: "2025-10-01",
    locator,
    ...overrides,
  };
}

export function snapshotFromFixture(name: string, fetchedAt = "2025-10-01T08:00:00.000Z"): CsiSnapshot {
  const ctx = testParseContext();
  const parsed = parseCompetitionPage(fixture(name), ctx);
  return createSnapshot(snapshotFromParsed(parsed, ctx, fetchedAt));
}
