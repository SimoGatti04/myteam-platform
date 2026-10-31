import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentClient } from "../src/acquire/client.js";
import { isIntegrationError } from "../src/errors.js";
import { createSourceGuard, runCsiSync } from "../src/csi/pipeline.js";
import { defaultCsiSourceConfig } from "../src/source-config.js";
import { fixture, testLocator } from "./helpers.js";

function fixtureClient(name: string, calls: string[] = []): DocumentClient {
  return {
    async acquire(url: string) {
      calls.push(url);
      return {
        url,
        status: 200,
        body: fixture(name),
        fetchedAt: "2025-10-01T08:00:00.000Z",
        fromCache: false,
        etag: null,
      };
    },
    clearCache() {},
  };
}

const NOW = new Date("2025-10-01T08:00:00.000Z");

test("runs the full pipeline without network access", async () => {
  const calls: string[] = [];
  const result = await runCsiSync({
    client: fixtureClient("competition-sample.html", calls),
    config: defaultCsiSourceConfig(),
    locator: testLocator(),
    now: NOW,
  });
  assert.equal(calls.length, 1);
  assert.equal(result.snapshot.matches.length, 6);
  assert.equal(result.snapshot.standings.length, 8);
  assert.equal(result.snapshot.locator.groupLabel, "Dilettanti A 5 Gruppo C / B");
  assert.equal(result.plan.requiresConfirmation, true);
  assert.equal(result.acquisition.url, testLocator().url);
});

test("refuses a locator outside the allowlist before calling the source", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runCsiSync({
      client: fixtureClient("competition-sample.html", calls),
      config: defaultCsiSourceConfig(),
      locator: testLocator({ url: "https://evil.example/25/" }),
      now: NOW,
    }),
    (error: unknown) => isIntegrationError(error) && error.code === "blocked_host",
  );
  assert.equal(calls.length, 0);
});

test("re-importing the same content yields no match intents", async () => {
  const first = await runCsiSync({
    client: fixtureClient("competition-sample.html"),
    config: defaultCsiSourceConfig(),
    locator: testLocator(),
    now: NOW,
  });
  const second = await runCsiSync({
    client: fixtureClient("competition-sample.html"),
    config: defaultCsiSourceConfig(),
    locator: testLocator(),
    now: NOW,
    previous: first.snapshot,
  });
  assert.equal(second.snapshot.digest, first.snapshot.digest);
  assert.equal(second.plan.matches.length, 0);
  assert.equal(second.diff.identical, true);
});

test("malformed content reports diagnostics without crashing", async () => {
  const result = await runCsiSync({
    client: fixtureClient("malformed.html"),
    config: defaultCsiSourceConfig(),
    locator: testLocator(),
    now: NOW,
  });
  assert.ok(result.snapshot.warnings.some((entry) => entry.code === "duplicate_match_identifier"));
  assert.equal(result.snapshot.standingsStatus, "absent");
});

test("only one sync per source can run at a time", async () => {
  const guard = createSourceGuard();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = guard.run("csi-live", async () => {
    await gate;
    return "primo";
  });
  await assert.rejects(
    guard.run("csi-live", async () => "secondo"),
    (error: unknown) => isIntegrationError(error) && error.code === "concurrent_sync",
  );
  release?.();
  assert.equal(await first, "primo");
  assert.equal(await guard.run("csi-live", async () => "terzo"), "terzo");
});
