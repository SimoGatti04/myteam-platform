import XCTest
@testable import APP

@MainActor
final class MatchTimingTests: XCTestCase {
    private let nanosecondsPerSecond: Int64 = 1_000_000_000

    func testConfirmedFivePlayerLineupWaitsForExplicitPlayAndStartsAtZero() throws {
        var fixture = makeMatch(presentCount: 7)

        XCTAssertTrue(fixture.timing.attendanceConfirmed)
        XCTAssertTrue(fixture.timing.lineupConfirmed)
        XCTAssertFalse(fixture.timing.hasStarted)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.fieldPlayerCount, 5)
        XCTAssertTrue(fixture.timing.participants.allSatisfy { $0.accumulatedNanoseconds == 0 })

        fixture.clock.advance(seconds: 75)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.participantSecondsPlayed.count, 7)
        XCTAssertTrue(fixture.timing.participantSecondsPlayed.values.allSatisfy { $0 == 0 })

        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        XCTAssertTrue(fixture.timing.hasStarted)
        XCTAssertEqual(fixture.timing.activity, .playing)
        XCTAssertTrue(fixture.timing.participantSecondsPlayed.values.allSatisfy { $0 == 0 })

        fixture.clock.advance(seconds: 3)
        fixture.timing.synchronize()
        for id in fixture.starters {
            XCTAssertEqual(fixture.timing.participantSecondsPlayed[id], 3)
        }
        for id in fixture.bench {
            XCTAssertEqual(fixture.timing.participantSecondsPlayed[id], 0)
        }
    }

    func testFirstStartRejectsMissingOrIncompleteConfirmedFormation() throws {
        let clock = ControllableMatchTimingClock()
        let ids = playerIDs(6)
        var timing = MatchTiming(clock: clock)

        XCTAssertTrue(timing.confirmAttendance(presentPlayerIDs: ids))
        XCTAssertFalse(timing.confirmStartingLineup(fieldPlayerIDs: Set(ids.prefix(4))))
        XCTAssertFalse(timing.lineupConfirmed)
        XCTAssertEqual(timing.toggleMainClock(), .requiresConfirmedStartingLineup)

        XCTAssertTrue(timing.confirmStartingLineup(fieldPlayerIDs: Set(ids.prefix(5))))
        XCTAssertTrue(timing.setParticipantInField(ids[0], inField: false))
        XCTAssertEqual(timing.fieldPlayerCount, 4)
        XCTAssertEqual(timing.toggleMainClock(), .requiresConfirmedStartingLineup)

        XCTAssertTrue(timing.setParticipantInField(ids[0], inField: true))
        XCTAssertEqual(timing.toggleMainClock(), .started)
    }

    func testAttendanceAndLineupConfirmationDoNotAccreditEarlierTime() throws {
        let clock = ControllableMatchTimingClock()
        let ids = playerIDs(6)
        var timing = MatchTiming(clock: clock)

        clock.advance(seconds: 600)
        XCTAssertTrue(timing.confirmAttendance(presentPlayerIDs: ids))
        XCTAssertTrue(timing.confirmStartingLineup(fieldPlayerIDs: Set(ids.prefix(5))))
        XCTAssertFalse(timing.hasStarted)
        XCTAssertTrue(timing.participants.allSatisfy { $0.accumulatedNanoseconds == 0 })
        XCTAssertEqual(timing.toggleMainClock(), .started)

        clock.advance(seconds: 4)
        timing.synchronize()
        XCTAssertEqual(timing.participantSecondsPlayed[ids[0]], 4)
        XCTAssertEqual(timing.participantSecondsPlayed[ids[5]], 0)
    }

    func testAttendanceRequiresUniquePresentPlayersAndAtLeastFive() throws {
        let clock = ControllableMatchTimingClock()
        var timing = MatchTiming(clock: clock)
        let ids = playerIDs(5)

        XCTAssertFalse(timing.confirmAttendance(presentPlayerIDs: Array(ids.prefix(4))))
        XCTAssertFalse(timing.attendanceConfirmed)
        XCTAssertFalse(timing.confirmAttendance(presentPlayerIDs: [ids[0], ids[0], ids[1], ids[2], ids[3]]))
        XCTAssertFalse(timing.attendanceConfirmed)
        XCTAssertEqual(timing.toggleMainClock(), .requiresConfirmedStartingLineup)
    }

    func testSubstitutionsAccrueOnlyWhileEachPlayerIsOnFieldAcrossReentries() throws {
        var fixture = makeMatch(presentCount: 8)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)

        fixture.clock.advance(seconds: 30)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 30)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 0)

        fixture.clock.advance(seconds: 45)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.bench[0], incomingID: fixture.starters[0]))
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 45)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 30)

        fixture.clock.advance(seconds: 15)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[1], incomingID: fixture.bench[1]))
        fixture.clock.advance(seconds: 20)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 65)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 45)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[1]], 90)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[1]], 20)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[2]], 0)
    }

    func testPlayerLeavingWithoutReplacementStopsAccrualAndResumeAllowsFourPlayers() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)

        fixture.clock.advance(seconds: 20)
        XCTAssertTrue(fixture.timing.setParticipantInField(fixture.starters[0], inField: false))
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        fixture.clock.advance(seconds: 90)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 20)

        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)
        fixture.clock.advance(seconds: 10)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.fieldPlayerCount, 4)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 20)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[1]], 30)
    }

    func testPauseResumeAndRepeatedSynchronizationDoNotDoubleCount() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 10)
        fixture.timing.synchronize()
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 10)

        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        fixture.clock.advance(seconds: 300)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 10)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)
        fixture.clock.advance(seconds: 5)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 15)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 15)
    }

    func testDelayedCallbackAndSimulatedBackgroundOrScreenLockCountElapsedTime() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)

        // No timer callbacks are delivered while the fake monotonic clock advances.
        fixture.clock.advance(seconds: 600)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 600)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 600)
        for id in fixture.starters {
            XCTAssertEqual(fixture.timing.participantSecondsPlayed[id], 600)
        }
        for id in fixture.bench {
            XCTAssertEqual(fixture.timing.participantSecondsPlayed[id], 0)
        }
    }

    func testLongBackgroundGapCapsAtFirstPeriodAndDoesNotStartHalftime() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)

        fixture.clock.advance(seconds: 2_000)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.phase, .halftime)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, FutsalMatchRules.timing.periodDurationSeconds)
        XCTAssertEqual(fixture.timing.secondHalfElapsedSeconds, 0)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, FutsalMatchRules.timing.periodDurationSeconds)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], FutsalMatchRules.timing.periodDurationSeconds)
        XCTAssertEqual(fixture.timing.halftimeRemainingSeconds, FutsalMatchRules.timing.halftimeDurationSeconds)
    }

    func testDelayedTimeoutExpiryResumesAtDeadlineAndCreditsPostTimeoutPlay() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 10)
        XCTAssertTrue(fixture.timing.startTimeout(for: .ours))

        fixture.clock.advance(seconds: 90)
        fixture.timing.synchronize()

        XCTAssertFalse(fixture.timing.isInTimeout)
        XCTAssertEqual(fixture.timing.activity, .playing)
        XCTAssertEqual(fixture.timing.timeoutRemainingSeconds, 0)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 40)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 40)
        XCTAssertFalse(fixture.timing.resumeAfterTimeout)
        XCTAssertEqual(fixture.timing.ourTimeoutsUsed, 1)
        XCTAssertFalse(fixture.timing.startTimeout(for: .ours))

        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        fixture.clock.advance(seconds: 30)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 40)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)
        fixture.clock.advance(seconds: 10)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 50)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 50)
    }

    func testTimeoutExpiryResumesAutomaticallyForOnTimeCallback() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 10)
        XCTAssertTrue(fixture.timing.startTimeout(for: .ours))

        fixture.clock.advance(seconds: Int64(FutsalMatchRules.timing.timeoutDurationSeconds))
        fixture.timing.synchronize()

        XCTAssertFalse(fixture.timing.isInTimeout)
        XCTAssertEqual(fixture.timing.activity, .playing)
        XCTAssertFalse(fixture.timing.resumeAfterTimeout)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 10)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 10)

        fixture.clock.advance(seconds: 5)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 15)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 15)
    }

    func testTimeoutExpiryWithinOneSecondCreditsExactPostTimeoutTime() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        XCTAssertTrue(fixture.timing.startTimeout(for: .ours))

        fixture.clock.advance(seconds: Int64(FutsalMatchRules.timing.timeoutDurationSeconds) + 1)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.activity, .playing)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 1)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1)
        fixture.clock.advance(seconds: 1)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 2)
    }

    func testTimeoutFromPausedDoesNotResumeOrAccrueMatchTime() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 10)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        XCTAssertTrue(fixture.timing.startTimeout(for: .opponent))

        fixture.clock.advance(seconds: 90)
        fixture.timing.synchronize()

        XCTAssertFalse(fixture.timing.isInTimeout)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 10)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 10)
        XCTAssertEqual(fixture.timing.opponentTimeoutsUsed, 1)
    }

    func testManualTimeoutEndResumesOnlyWhenClockWasPreviouslyRunning() throws {
        var runningFixture = makeMatch()
        XCTAssertEqual(runningFixture.timing.toggleMainClock(), .started)
        runningFixture.clock.advance(seconds: 8)
        XCTAssertTrue(runningFixture.timing.startTimeout(for: .ours))
        runningFixture.clock.advance(seconds: 12)
        runningFixture.timing.endTimeout()
        XCTAssertEqual(runningFixture.timing.activity, .playing)
        XCTAssertFalse(runningFixture.timing.resumeAfterTimeout)
        XCTAssertEqual(runningFixture.timing.totalMatchElapsedSeconds, 8)
        runningFixture.clock.advance(seconds: 5)
        runningFixture.timing.synchronize()
        XCTAssertEqual(runningFixture.timing.totalMatchElapsedSeconds, 13)

        var pausedFixture = makeMatch()
        XCTAssertEqual(pausedFixture.timing.toggleMainClock(), .started)
        XCTAssertEqual(pausedFixture.timing.toggleMainClock(), .paused)
        XCTAssertTrue(pausedFixture.timing.startTimeout(for: .opponent))
        pausedFixture.clock.advance(seconds: 12)
        pausedFixture.timing.endTimeout()
        XCTAssertEqual(pausedFixture.timing.activity, .stopped)
        XCTAssertEqual(pausedFixture.timing.totalMatchElapsedSeconds, 0)
        XCTAssertFalse(pausedFixture.timing.resumeAfterTimeout)
    }

    func testTimeoutExpiryCanCrossPeriodEndWithoutExceedingLimit() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 1_190)
        fixture.timing.synchronize()
        XCTAssertTrue(fixture.timing.startTimeout(for: .ours))

        fixture.clock.advance(seconds: 600)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.phase, .halftime)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertFalse(fixture.timing.resumeAfterTimeout)
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 1_200)
        XCTAssertEqual(fixture.timing.secondHalfElapsedSeconds, 0)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 1_200)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1_200)
    }

    func testHalftimeCountdownRequiresExplicitStartAndSecondHalfStartsPaused() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 1_200)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .halftime)
        XCTAssertEqual(fixture.timing.activity, .stopped)

        XCTAssertEqual(fixture.timing.toggleMainClock(), .halftimeStarted)
        fixture.clock.advance(seconds: 300)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .secondHalf)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.secondHalfElapsedSeconds, 0)
        XCTAssertEqual(fixture.timing.ourTimeoutsUsed, 0)
        XCTAssertEqual(fixture.timing.opponentTimeoutsUsed, 0)
    }

    func testManualSecondHalfStartSkipsRemainingIntervalButDoesNotStartPlay() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 1_200)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .halftime)

        fixture.timing.startSecondHalfManually()
        XCTAssertEqual(fixture.timing.phase, .secondHalf)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)
    }

    func testJumpBeyondHalftimeDoesNotInventSecondHalfPlay() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 1_200)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .halftimeStarted)

        fixture.clock.advance(seconds: 900)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.phase, .secondHalf)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.secondHalfElapsedSeconds, 0)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1_200)
    }

    func testSecondHalfEndsMatchAtExactLimitAndStopsFurtherAccrual() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 1_200)
        fixture.timing.synchronize()
        fixture.timing.startSecondHalfManually()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)

        fixture.clock.advance(seconds: 1_300)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.phase, .finished)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 1_200)
        XCTAssertEqual(fixture.timing.secondHalfElapsedSeconds, 1_200)
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 2_400)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 2_400)
        XCTAssertTrue(fixture.timing.participantSecondsPlayed.values.allSatisfy { $0 >= 0 })
    }

    func testBackwardClockMovementNeverCreatesNegativeTimeOrOvercounts() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 10)
        fixture.timing.synchronize()

        fixture.clock.set(seconds: 5)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 10)
        XCTAssertTrue(fixture.timing.participantSecondsPlayed.values.allSatisfy { $0 >= 0 })

        fixture.clock.set(seconds: 11)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.totalMatchElapsedSeconds, 11)
    }

    func testSnapshotIsCodableAndContainsDurableStateNotProcessMonotonicAnchor() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 12)
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let snapshot = fixture.timing.snapshot(capturedAt: capturedAt)
        let encoded = try JSONEncoder().encode(snapshot)
        let decoded = try JSONDecoder().decode(MatchTimingSnapshot.self, from: encoded)

        XCTAssertEqual(decoded, snapshot)
        XCTAssertEqual(decoded.schemaVersion, MatchTimingSnapshot.currentSchemaVersion)
        XCTAssertEqual(decoded.phase, .firstHalf)
        XCTAssertEqual(decoded.activity, .playing)
        XCTAssertEqual(decoded.firstHalfElapsedNanoseconds, 12 * nanosecondsPerSecond)
        XCTAssertEqual(decoded.participants.first(where: { $0.id == fixture.starters[0] })?.accumulatedNanoseconds, 12 * nanosecondsPerSecond)
        XCTAssertEqual(decoded.capturedAt, capturedAt)
    }

    func testRestoreRunningSnapshotAccruesRecoveryGapAndReanchorsNewProcessClock() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 4)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))

        let restoredClock = ControllableMatchTimingClock()
        var restored = try MatchTiming.restoring(
            from: snapshot,
            clock: restoredClock,
            recoveredElapsedNanoseconds: 12 * nanosecondsPerSecond
        )

        XCTAssertEqual(restored.activity, .playing)
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 16)
        }
        for id in fixture.bench {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 0)
        }

        restoredClock.advance(seconds: 3)
        restored.synchronize()
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 19)
        }
    }

    func testRestorePausedSnapshotDoesNotAccrueRecoveryGap() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 8)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))

        let restoredClock = ControllableMatchTimingClock()
        var restored = try MatchTiming.restoring(
            from: snapshot,
            clock: restoredClock,
            recoveredElapsedNanoseconds: 90 * nanosecondsPerSecond
        )
        restoredClock.advance(seconds: 10)
        restored.synchronize()

        XCTAssertEqual(restored.activity, .stopped)
        XCTAssertEqual(restored.totalMatchElapsedSeconds, 8)
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 8)
        }
    }

    func testRestoreRunningSnapshotStopsAtFirstPeriodBoundaryWithoutStartingHalftime() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 19 * 60 + 50)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))

        let restored = try MatchTiming.restoring(
            from: snapshot,
            clock: ControllableMatchTimingClock(),
            recoveredElapsedNanoseconds: 30 * nanosecondsPerSecond
        )

        XCTAssertEqual(restored.phase, .halftime)
        XCTAssertEqual(restored.activity, .stopped)
        XCTAssertEqual(restored.firstHalfElapsedSeconds, 20 * 60)
        XCTAssertEqual(restored.secondHalfElapsedSeconds, 0)
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 20 * 60)
        }
    }

    func testRestoreHalftimeCountdownCompletesIntoPausedSecondHalfOnly() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 20 * 60)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .halftime)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .halftimeStarted)
        fixture.clock.advance(seconds: 30)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))

        let restored = try MatchTiming.restoring(
            from: snapshot,
            clock: ControllableMatchTimingClock(),
            recoveredElapsedNanoseconds: 10 * 60 * nanosecondsPerSecond
        )

        XCTAssertEqual(restored.phase, .secondHalf)
        XCTAssertEqual(restored.activity, .stopped)
        XCTAssertEqual(restored.firstHalfElapsedSeconds, 20 * 60)
        XCTAssertEqual(restored.secondHalfElapsedSeconds, 0)
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 20 * 60)
        }
    }

    func testC2HalftimeSnapshotCreatesOnlyAZeroDurationRecoveryBaseline() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 20 * 60)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .halftime)

        var payload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000)))) as? [String: Any]
        )
        payload["schemaVersion"] = MatchTimingSnapshot.legacySchemaVersion
        payload.removeValue(forKey: "correctionMetadata")
        let legacyData = try JSONSerialization.data(withJSONObject: payload)
        let legacySnapshot = try JSONDecoder().decode(MatchTimingSnapshot.self, from: legacyData)

        var restored = try MatchTiming.restoring(from: legacySnapshot, clock: ControllableMatchTimingClock())
        let timeline: MatchParticipationTimelineSnapshot = try XCTUnwrap(restored.correctionMetadata.participationTimeline)
        XCTAssertFalse(timeline.isCompleteFromStart, "A legacy session must not invent its earlier substitutions")
        XCTAssertEqual(
            try timeline.fieldPlayerIDs(
                participantIDs: Set(restored.participants.map(\.id)),
                period: .firstHalf,
                through: Int64(20 * 60) * nanosecondsPerSecond
            ),
            Set(fixture.starters)
        )
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 20 * 60)
        }
        XCTAssertNoThrow(try MatchTiming.validate(restored.snapshot(capturedAt: legacySnapshot.capturedAt)))
    }

    func testRestoreTimeoutAppliesExpiryAndOnlyThenAuthorizedResumption() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 2)
        XCTAssertTrue(fixture.timing.startTimeout(for: .ours))
        fixture.clock.advance(seconds: 20)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))

        let restored = try MatchTiming.restoring(
            from: snapshot,
            clock: ControllableMatchTimingClock(),
            recoveredElapsedNanoseconds: 70 * nanosecondsPerSecond
        )

        XCTAssertEqual(restored.activity, .playing)
        XCTAssertEqual(restored.timeoutRemainingSeconds, 0)
        for id in fixture.starters {
            XCTAssertEqual(restored.participantSecondsPlayed[id], 32)
        }
    }

    func testRestoreRejectsDuplicateParticipantsAndUnsupportedSnapshotVersion() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_000))
        let duplicate = MatchTimingSnapshot(
            schemaVersion: snapshot.schemaVersion,
            configuration: snapshot.configuration,
            phase: snapshot.phase,
            activity: snapshot.activity,
            hasStarted: snapshot.hasStarted,
            attendanceConfirmed: snapshot.attendanceConfirmed,
            lineupConfirmed: snapshot.lineupConfirmed,
            firstHalfElapsedNanoseconds: snapshot.firstHalfElapsedNanoseconds,
            secondHalfElapsedNanoseconds: snapshot.secondHalfElapsedNanoseconds,
            halftimeElapsedNanoseconds: snapshot.halftimeElapsedNanoseconds,
            timeoutRemainingNanoseconds: snapshot.timeoutRemainingNanoseconds,
            timeoutOwner: snapshot.timeoutOwner,
            resumeAfterTimeout: snapshot.resumeAfterTimeout,
            ourTimeoutsUsed: snapshot.ourTimeoutsUsed,
            opponentTimeoutsUsed: snapshot.opponentTimeoutsUsed,
            participants: [snapshot.participants[0], snapshot.participants[0]],
            capturedAt: snapshot.capturedAt
        )
        XCTAssertThrowsError(try MatchTiming.restoring(from: duplicate, clock: ControllableMatchTimingClock()))

        let unsupported = MatchTimingSnapshot(
            schemaVersion: MatchTimingSnapshot.currentSchemaVersion + 1,
            configuration: snapshot.configuration,
            phase: snapshot.phase,
            activity: snapshot.activity,
            hasStarted: snapshot.hasStarted,
            attendanceConfirmed: snapshot.attendanceConfirmed,
            lineupConfirmed: snapshot.lineupConfirmed,
            firstHalfElapsedNanoseconds: snapshot.firstHalfElapsedNanoseconds,
            secondHalfElapsedNanoseconds: snapshot.secondHalfElapsedNanoseconds,
            halftimeElapsedNanoseconds: snapshot.halftimeElapsedNanoseconds,
            timeoutRemainingNanoseconds: snapshot.timeoutRemainingNanoseconds,
            timeoutOwner: snapshot.timeoutOwner,
            resumeAfterTimeout: snapshot.resumeAfterTimeout,
            ourTimeoutsUsed: snapshot.ourTimeoutsUsed,
            opponentTimeoutsUsed: snapshot.opponentTimeoutsUsed,
            participants: snapshot.participants,
            capturedAt: snapshot.capturedAt
        )
        XCTAssertThrowsError(try MatchTiming.restoring(from: unsupported, clock: ControllableMatchTimingClock()))
    }

    func testTimelineTracksStartingLineupAndSubstitutionIntervals() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 60)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        fixture.clock.advance(seconds: 30)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        fixture.timing.synchronize()

        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 60)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 30)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[1]], 90)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[1]], 0)
        XCTAssertEqual(fixture.timing.correctionMetadata.participationTimeline?.boundaries.count, 7)
        XCTAssertNoThrow(try MatchTiming.validate(fixture.timing.snapshot(capturedAt: Date())))
    }

    func testMultipleSubstitutionsAtSameSecondRemainOrderedAndReconstructable() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 20)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[1], incomingID: fixture.starters[0]))

        let timeline = try XCTUnwrap(fixture.timing.correctionMetadata.participationTimeline)
        let sameSecond = timeline.orderedBoundaries.filter { $0.elapsedNanoseconds == 20 * nanosecondsPerSecond }
        XCTAssertEqual(sameSecond.count, 4)
        XCTAssertEqual(sameSecond.map(\.sequence), sameSecond.map(\.sequence).sorted())
        XCTAssertEqual(Set(sameSecond.compactMap(\.substitutionID)).count, 2)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 20)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[1]], 20)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 0)
        XCTAssertNoThrow(try MatchTiming.validate(fixture.timing.snapshot(capturedAt: Date())))
    }

    func testSubstitutionProjectionUsesBoundarySequenceForSameSecond() throws {
        let ids = playerIDs(7)
        let starters = Set(ids.prefix(FutsalMatchRules.timing.requiredStartingPlayers))
        let participants = ids.map { id in
            MatchTimingParticipantSnapshot(id: id, accumulatedNanoseconds: 0, inField: starters.contains(id))
        }
        var timeline = try MatchParticipationTimelineSnapshot.complete(
            participants: participants,
            starters: starters
        )
        let firstSubstitutionID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        let secondSubstitutionID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let elapsed = 20 * nanosecondsPerSecond

        _ = try timeline.record(
            playerID: ids[0], period: .firstHalf, elapsedNanoseconds: elapsed,
            transition: .leftField, origin: .substitution, substitutionID: firstSubstitutionID
        )
        _ = try timeline.record(
            playerID: ids[5], period: .firstHalf, elapsedNanoseconds: elapsed,
            transition: .enteredField, origin: .substitution, substitutionID: firstSubstitutionID
        )
        _ = try timeline.record(
            playerID: ids[1], period: .firstHalf, elapsedNanoseconds: elapsed,
            transition: .leftField, origin: .substitution, substitutionID: secondSubstitutionID
        )
        _ = try timeline.record(
            playerID: ids[6], period: .firstHalf, elapsedNanoseconds: elapsed,
            transition: .enteredField, origin: .substitution, substitutionID: secondSubstitutionID
        )

        XCTAssertEqual(timeline.substitutions.map(\.id), [firstSubstitutionID, secondSubstitutionID])
    }

    func testClockCorrectionRecalculatesCompleteTimelineAndKeepsFutureAccrual() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 100)
        fixture.timing.synchronize()
        try fixture.timing.correctCurrentPeriodElapsed(toSeconds: 50)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 50)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 0)

        fixture.clock.advance(seconds: 20)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 70)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 70)
        XCTAssertNoThrow(try MatchTiming.validate(fixture.timing.snapshot(capturedAt: Date())))
    }

    func testClockCorrectionPreviewIsNonMutatingAndConfirmCanBeUndoneAfterRecovery() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 80)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)

        let preview = try fixture.timing.previewCurrentPeriodElapsed(toSeconds: 40)
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 80)
        XCTAssertEqual(preview.after.firstHalfElapsedNanoseconds, 40 * nanosecondsPerSecond)
        XCTAssertEqual(preview.affectedPlayers.count, 5)
        XCTAssertTrue(preview.affectedPlayers.allSatisfy { $0.beforeSeconds == 80 && $0.afterSeconds == 40 })

        try fixture.timing.confirmCorrection(preview)
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 40)
        XCTAssertNotNil(fixture.timing.correctionMetadata.lastUndo)
        let persisted = try JSONDecoder().decode(
            MatchTimingSnapshot.self,
            from: JSONEncoder().encode(fixture.timing.snapshot(capturedAt: Date()))
        )
        var recovered = try MatchTiming.restoring(from: persisted, clock: fixture.clock)
        try recovered.undoLastCorrection()
        XCTAssertEqual(recovered.firstHalfElapsedSeconds, 80)
        XCTAssertEqual(recovered.activity, .stopped)
        XCTAssertNil(recovered.correctionMetadata.lastUndo)
        for id in fixture.starters {
            XCTAssertEqual(recovered.participantSecondsPlayed[id], 80)
        }
    }

    func testMinuteCorrectionPreviewPersistsOffsetAndDoesNotTouchOtherPlayers() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 120)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)

        let target = fixture.starters[0]
        let preview = try fixture.timing.previewParticipantMinutes(playerID: target, toSeconds: 100, reason: "verifica manuale")
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[target], 120)
        XCTAssertEqual(preview.affectedPlayers.map(\.playerID), [target])
        try fixture.timing.confirmCorrection(preview)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[target], 100)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[1]], 120)

        let snapshot = fixture.timing.snapshot(capturedAt: Date())
        let restored = try MatchTiming.restoring(from: snapshot, clock: fixture.clock)
        XCTAssertEqual(restored.participantSecondsPlayed[target], 100)
        XCTAssertEqual(restored.correctionMetadata.minuteCorrections.first?.reason, "verifica manuale")
    }

    func testClockCorrectionPreviewRequiresPausedMatchAndReportsTimelineConflict() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        XCTAssertThrowsError(try fixture.timing.previewCurrentPeriodElapsed(toSeconds: 10)) {
            XCTAssertEqual($0 as? MatchTimingCorrectionError, .correctionRequiresPause)
        }
        fixture.clock.advance(seconds: 60)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        fixture.clock.advance(seconds: 20)
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        XCTAssertThrowsError(try fixture.timing.previewCurrentPeriodElapsed(toSeconds: 30)) {
            XCTAssertEqual($0 as? MatchTimingCorrectionError, .timelineConflict)
        }
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 80)
    }

    func testParticipantMinuteCorrectionUndoSurvivesSnapshotRecovery() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 120)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)

        let playerID = fixture.starters[0]
        let preview = try fixture.timing.previewParticipantMinutes(
            playerID: playerID,
            toSeconds: 100,
            reason: "Correzione sintetica",
            correctedAt: Date(timeIntervalSince1970: 1_800_000_100)
        )
        try fixture.timing.confirmCorrection(preview)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[playerID], 100)
        XCTAssertEqual(fixture.timing.correctionMetadata.lastUndo?.scope, .timing)

        let encodedSnapshot = try JSONEncoder().encode(fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_101)))
        let recoveredSnapshot = try JSONDecoder().decode(MatchTimingSnapshot.self, from: encodedSnapshot)
        var recovered = try MatchTiming.restoring(from: recoveredSnapshot, clock: fixture.clock)
        XCTAssertEqual(recovered.participantSecondsPlayed[playerID], 100)
        XCTAssertNotNil(recovered.correctionMetadata.lastUndo)
        try recovered.undoLastCorrection()
        XCTAssertEqual(recovered.participantSecondsPlayed[playerID], 120)
        XCTAssertNil(recovered.correctionMetadata.lastUndo)
    }

    func testClockCorrectionCannotSilentlyCrossRecordedSubstitution() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 60)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        fixture.clock.advance(seconds: 30)
        fixture.timing.synchronize()

        XCTAssertThrowsError(try fixture.timing.correctCurrentPeriodElapsed(toSeconds: 30)) { error in
            XCTAssertEqual(error as? MatchTimingCorrectionError, .timelineConflict)
        }
        XCTAssertEqual(fixture.timing.firstHalfElapsedSeconds, 90)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 60)
    }

    func testRecordedSubstitutionCanBeCorrectedWithoutChangingEventIdentity() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 60)
        XCTAssertTrue(fixture.timing.substitute(outgoingID: fixture.starters[0], incomingID: fixture.bench[0]))
        fixture.clock.advance(seconds: 30)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .paused)
        let originalTimeline = try XCTUnwrap(fixture.timing.correctionMetadata.participationTimeline)
        let substitutionID = try XCTUnwrap(originalTimeline.boundaries.first(where: { $0.origin == .substitution })?.substitutionID)
        let originalBoundaryIDs = Set(originalTimeline.boundaries.filter { $0.substitutionID == substitutionID }.map(\.id))

        let preview = try fixture.timing.previewRecordedSubstitutionCorrection(
            id: substitutionID,
            outgoingID: fixture.starters[0],
            incomingID: fixture.bench[1],
            toSeconds: 60
        )
        XCTAssertTrue(preview.affectedPlayers.contains { $0.playerID == fixture.bench[0] })
        XCTAssertTrue(preview.affectedPlayers.contains { $0.playerID == fixture.bench[1] })

        try fixture.timing.correctRecordedSubstitution(
            id: substitutionID,
            outgoingID: fixture.starters[0],
            incomingID: fixture.bench[1],
            toSeconds: 60
        )

        let corrected = try XCTUnwrap(fixture.timing.correctionMetadata.participationTimeline)
        XCTAssertEqual(Set(corrected.boundaries.filter { $0.substitutionID == substitutionID }.map(\.id)), originalBoundaryIDs)
        XCTAssertFalse(fixture.timing.participants.first(where: { $0.id == fixture.bench[0] })?.inField ?? true)
        XCTAssertTrue(fixture.timing.participants.first(where: { $0.id == fixture.bench[1] })?.inField ?? false)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[0]], 0)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.bench[1]], 30)
    }

    func testManualMinuteCorrectionSurvivesFutureTicksAndSnapshotRestore() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: 100)
        fixture.timing.synchronize()
        try fixture.timing.correctParticipantMinutes(
            playerID: fixture.starters[0],
            toSeconds: 45,
            reason: "Correzione sintetica",
            correctedAt: Date(timeIntervalSince1970: 1_800_000_000)
        )
        fixture.clock.advance(seconds: 20)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 65)

        let snapshot = fixture.timing.snapshot(capturedAt: Date(timeIntervalSince1970: 1_800_000_120))
        var restored = try MatchTiming.restoring(from: snapshot, clock: ControllableMatchTimingClock())
        XCTAssertEqual(restored.participantSecondsPlayed[fixture.starters[0]], 65)
        XCTAssertEqual(restored.correctionMetadata.minuteCorrections.first?.reason, "Correzione sintetica")
        XCTAssertNoThrow(try MatchTiming.validate(restored.snapshot(capturedAt: snapshot.capturedAt)))
    }

    func testTimelineExcludesHalftimeAndCountsSecondHalfOnlyAfterExplicitPlay() throws {
        var fixture = makeMatch()
        XCTAssertEqual(fixture.timing.toggleMainClock(), .started)
        fixture.clock.advance(seconds: Int64(FutsalMatchRules.timing.periodDurationSeconds))
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .halftime)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1_200)

        XCTAssertEqual(fixture.timing.toggleMainClock(), .halftimeStarted)
        fixture.clock.advance(seconds: Int64(FutsalMatchRules.timing.halftimeDurationSeconds))
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.phase, .secondHalf)
        XCTAssertEqual(fixture.timing.activity, .stopped)
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1_200)

        XCTAssertEqual(fixture.timing.toggleMainClock(), .resumed)
        fixture.clock.advance(seconds: 15)
        fixture.timing.synchronize()
        XCTAssertEqual(fixture.timing.participantSecondsPlayed[fixture.starters[0]], 1_215)
        XCTAssertNoThrow(try MatchTiming.validate(fixture.timing.snapshot(capturedAt: Date())))
    }

    private func makeMatch(presentCount: Int = 7) -> (
        clock: ControllableMatchTimingClock,
        timing: MatchTiming,
        starters: [UUID],
        bench: [UUID]
    ) {
        let clock = ControllableMatchTimingClock()
        let ids = playerIDs(presentCount)
        let starters = Array(ids.prefix(FutsalMatchRules.timing.requiredStartingPlayers))
        let bench = Array(ids.dropFirst(FutsalMatchRules.timing.requiredStartingPlayers))
        var timing = MatchTiming(clock: clock)

        XCTAssertTrue(timing.confirmAttendance(presentPlayerIDs: ids))
        XCTAssertTrue(timing.confirmStartingLineup(fieldPlayerIDs: Set(starters)))
        return (clock, timing, starters, bench)
    }

    private func playerIDs(_ count: Int) -> [UUID] {
        (1...count).map { index in
            let value = String(format: "%012d", index)
            return UUID(uuidString: "00000000-0000-0000-0000-\(value)")!
        }
    }
}

@MainActor
private final class ControllableMatchTimingClock: MatchTimingClock {
    private(set) var instantNanoseconds: Int64 = 0

    func nowNanoseconds() -> Int64 {
        instantNanoseconds
    }

    func advance(seconds: Int64) {
        instantNanoseconds += seconds * 1_000_000_000
    }

    func set(seconds: Int64) {
        instantNanoseconds = seconds * 1_000_000_000
    }
}
