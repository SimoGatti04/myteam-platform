import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/platform/errors.js";
import { validateMatchEventCreateInput } from "../../src/platform/service.js";

const scorer = "11111111-1111-4111-8111-111111111111";
const assist = "22222222-2222-4222-8222-222222222222";

function invalid(input: Parameters<typeof validateMatchEventCreateInput>[0], code: string): void {
  assert.throws(
    () => validateMatchEventCreateInput(input),
    (error: unknown) => error instanceof DomainError && error.statusCode === 400 && error.code === code,
  );
}

test("team events require a player identity", () => {
  invalid({ kind: "goal", side: "team", period: 1, minute: 5 }, "match_event_player_required");
});

test("opponent events cannot carry one of our player identities", () => {
  invalid(
    { kind: "goal", side: "opponent", period: 1, minute: 5, playerId: scorer },
    "match_event_player_not_allowed",
  );
});

test("assists are limited to team goals", () => {
  invalid(
    { kind: "yellow_card", side: "team", period: 1, minute: 5, playerId: scorer, assistPlayerId: assist },
    "match_event_assist_requires_goal",
  );
  invalid(
    { kind: "goal", side: "opponent", period: 1, minute: 5, assistPlayerId: assist },
    "match_event_assist_requires_team_goal",
  );
});

test("an assist cannot be the same player as the scorer", () => {
  invalid(
    { kind: "goal", side: "team", period: 1, minute: 5, playerId: scorer, assistPlayerId: scorer },
    "match_event_assist_must_differ",
  );
});

test("valid team goal and opponent card inputs are normalized", () => {
  assert.deepEqual(
    validateMatchEventCreateInput({
      kind: "goal",
      side: "team",
      period: 2,
      minute: 1,
      playerId: scorer,
      assistPlayerId: assist,
    }),
    { playerId: scorer, assistPlayerId: assist },
  );
  assert.deepEqual(
    validateMatchEventCreateInput({ kind: "red_card", side: "opponent", period: 2, minute: 19 }),
    { playerId: null, assistPlayerId: null },
  );
});
