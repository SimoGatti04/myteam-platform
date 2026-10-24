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

        var restored = try MatchTiming.restoring(
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

        var restored = try MatchTiming.restoring(
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
