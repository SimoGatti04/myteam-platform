#!/usr/bin/env python3
"""Create an anonymous C3.2-V-SUPP live-session JSON fixture.

The app's existing one-time importer reads this envelope and persists the
session in the normal SwiftData V2 store. The synthetic wall-clock checkpoint
is 60 seconds old while the monotonic checkpoint is deliberately beyond the
current reading, so the app must ask for a human recovery decision. No system
clock is changed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import time
from pathlib import Path

PLAYER_IDS = [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002",
    "a0000000-0000-4000-8000-000000000003",
    "a0000000-0000-4000-8000-000000000004",
    "a0000000-0000-4000-8000-000000000005",
    "a0000000-0000-4000-8000-000000000006",
]
SESSION_ID = "c3000000-0000-4000-8000-000000000001"
EVENT_ID = "c3000000-0000-4000-8000-000000000002"
SYNTHETIC_OPPONENT = "Recovery Synthetic FC"
PERIOD_SECONDS = 20 * 60
SAVED_ELAPSED_SECONDS = PERIOD_SECONDS - 30


def make_envelope() -> bytes:
    now_milliseconds = int(time.time() * 1000)
    payload = {
        "schemaVersion": 1,
        "sessionID": SESSION_ID,
        "status": "active",
        "timing": {
            "schemaVersion": 1,
            "configuration": {
                "requiredStartingPlayers": 5,
                "periodDurationSeconds": PERIOD_SECONDS,
                "halftimeDurationSeconds": 300,
                "timeoutDurationSeconds": 60,
                "timeoutsPerTeamPerHalf": 1,
            },
            "phase": "firstHalf",
            "activity": "playing",
            "hasStarted": True,
            "attendanceConfirmed": True,
            "lineupConfirmed": True,
            "firstHalfElapsedNanoseconds": SAVED_ELAPSED_SECONDS * 1_000_000_000,
            "secondHalfElapsedNanoseconds": 0,
            "halftimeElapsedNanoseconds": 0,
            "timeoutRemainingNanoseconds": 0,
            "resumeAfterTimeout": False,
            "ourTimeoutsUsed": 0,
            "opponentTimeoutsUsed": 0,
            "participants": [
                {
                    "id": player_id,
                    "accumulatedNanoseconds": (
                        SAVED_ELAPSED_SECONDS * 1_000_000_000 if index < 5 else 0
                    ),
                    "inField": index < 5,
                }
                for index, player_id in enumerate(PLAYER_IDS)
            ],
            "capturedAt": now_milliseconds - 60_000,
        },
        "startingPlayerIDs": PLAYER_IDS[:5],
        "players": [
            {
                "rosterPlayerID": player_id,
                "name": f"Synthetic Player {index + 1}",
                "isGoalkeeper": index == 0,
                "playWeight": 1.0,
                "superpower": False,
            }
            for index, player_id in enumerate(PLAYER_IDS)
        ],
        "events": [
            {
                "id": EVENT_ID,
                "team": "ours",
                "matchSecond": 120,
                "scorerID": PLAYER_IDS[0],
                "scorerName": "Synthetic Player 1",
                "assistID": PLAYER_IDS[1],
                "assistName": "Synthetic Player 2",
            }
        ],
        "opponentName": SYNTHETIC_OPPONENT,
        "isHome": True,
        # Force the existing reboot/uncertain-clock review branch. The wall
        # checkpoint remains recent, so its suggested interval is capped by
        # the 30 seconds left in the saved period.
        "continuousTimeNanoseconds": (1 << 64) - 1,
    }
    payload_bytes = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    envelope = {
        "formatVersion": 1,
        "payload": base64.b64encode(payload_bytes).decode("ascii"),
        "sha256": hashlib.sha256(payload_bytes).hexdigest(),
    }
    return json.dumps(
        envelope, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="destination JSON path in a temporary directory")
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"refusing to overwrite existing file: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(args.output.name + ".tmp")
    temporary.write_bytes(make_envelope())
    os.replace(temporary, args.output)
    print(f"Wrote synthetic fixture: {args.output}")
    print(f"Session UUID: {SESSION_ID}")
    print(f"Saved elapsed: {SAVED_ELAPSED_SECONDS}s; maximum recovery: 30s")


if __name__ == "__main__":
    main()
