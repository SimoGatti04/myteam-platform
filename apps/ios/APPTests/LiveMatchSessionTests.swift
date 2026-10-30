import Foundation
import XCTest
@testable import APP

@MainActor
final class LiveMatchSessionTests: XCTestCase {
    func testC2VersionOnePayloadMigratesToC3PartialAttendanceTimeline() throws {
        let current = makeActiveSnapshot(advancedSeconds: 10)
        let encoded = try JSONEncoder().encode(current)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object["schemaVersion"] = LiveMatchSessionSnapshot.legacySchemaVersion
        var timing = try XCTUnwrap(object["timing"] as? [String: Any])
        timing["schemaVersion"] = MatchTimingSnapshot.legacySchemaVersion
        timing.removeValue(forKey: "correctionMetadata")
        object["timing"] = timing
        let legacyData = try JSONSerialization.data(withJSONObject: object)

        let legacy = try JSONDecoder().decode(LiveMatchSessionSnapshot.self, from: legacyData)
        XCTAssertEqual(legacy.schemaVersion, LiveMatchSessionSnapshot.legacySchemaVersion)
        XCTAssertNil(legacy.timing.correctionMetadata)
        XCTAssertNoThrow(try legacy.validate())

        let restored = try LiveMatchSessionRestorer.restore(snapshot: legacy, elapsedNanoseconds: 0)
        XCTAssertEqual(restored.snapshot.schemaVersion, LiveMatchSessionSnapshot.currentSchemaVersion)
        XCTAssertEqual(restored.snapshot.timing.schemaVersion, MatchTimingSnapshot.currentSchemaVersion)
        XCTAssertFalse(try XCTUnwrap(restored.timing.correctionMetadata.participationTimeline).isCompleteFromStart)
        XCTAssertEqual(restored.timing.participantSecondsPlayed[current.startingPlayerIDs[0]], 10)
    }

    func testRecoveryAutomaticallyUsesAlignedContinuousClock() throws {
        let snapshot = makeActiveSnapshot(advancedSeconds: 10)
        let now = LiveMatchRecoveryReading(
            wallClockDate: snapshot.capturedAt.addingTimeInterval(12),
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds + 12_000_000_000
        )

        let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: now)

        XCTAssertEqual(decision.kind, .automatic)
        XCTAssertEqual(decision.elapsedNanoseconds, 12_000_000_000)
        XCTAssertFalse(decision.clockAdjustmentDetected)
    }

    func testRecoveryRequiresReviewWhenWallClockAndContinuousClockDisagree() throws {
        let snapshot = makeActiveSnapshot(advancedSeconds: 10)
        let now = LiveMatchRecoveryReading(
            wallClockDate: snapshot.capturedAt.addingTimeInterval(-300),
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds + 12_000_000_000
        )

        let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: now)

        guard case .reviewRequired = decision.kind else {
            return XCTFail("A large wall/monotonic disagreement must not be applied silently")
        }
        XCTAssertEqual(decision.elapsedNanoseconds, 12_000_000_000)
        XCTAssertTrue(decision.clockAdjustmentDetected)
    }

    func testRecoveryAfterPossibleRebootRequiresConfirmationAndClampsSuggestedGap() throws {
        let snapshot = makeActiveSnapshot(advancedSeconds: 10)
        let now = LiveMatchRecoveryReading(
            wallClockDate: snapshot.capturedAt.addingTimeInterval(30),
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds - 1
        )

        let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: now)

        guard case .reviewRequired = decision.kind else {
            return XCTFail("A reset monotonic source must require explicit recovery review")
        }
        XCTAssertEqual(decision.elapsedNanoseconds, 30_000_000_000)
    }

    func testRestorerKeepsPreparedSessionStoppedAndDoesNotAutoStart() throws {
        let snapshot = makeActiveSnapshot()
        let restored = try LiveMatchSessionRestorer.restore(
            snapshot: snapshot,
            elapsedNanoseconds: 20_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: snapshot, elapsedSeconds: 20))
        )

        XCTAssertFalse(restored.timing.hasStarted)
        XCTAssertFalse(restored.timing.isRunning)
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 0)
        XCTAssertEqual(restored.players.filter(\.inField).count, 5)
        XCTAssertTrue(restored.players.allSatisfy { $0.timePlayed == 0 })
    }

    func testRestorerContinuesRunningSessionAndCreditsOnlyCurrentFieldPlayers() throws {
        let base = makeActiveSnapshot(advancedSeconds: 8)
        let timingClock = ControllableLiveSessionClock()
        var timing = try MatchTiming.restoring(from: base.timing, clock: timingClock)
        XCTAssertTrue(timing.substitute(outgoingID: makeID(1), incomingID: makeID(6)))
        timingClock.advance(seconds: 12)
        timing.synchronize()
        let snapshot = replacing(base, timing: timing)

        let restored = try LiveMatchSessionRestorer.restore(
            snapshot: snapshot,
            elapsedNanoseconds: 5_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: snapshot, elapsedSeconds: 5))
        )

        XCTAssertTrue(restored.timing.isRunning)
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 25)
        XCTAssertEqual(restored.timing.participantSecondsPlayed[makeID(1)], 8)
        XCTAssertEqual(restored.timing.participantSecondsPlayed[makeID(6)], 17)
        XCTAssertFalse(restored.players.first(where: { $0.id == makeID(1) })!.inField)
        XCTAssertTrue(restored.players.first(where: { $0.id == makeID(6) })!.inField)
        XCTAssertEqual(restored.snapshot.continuousTimeNanoseconds, reading(for: snapshot, elapsedSeconds: 5).continuousTimeNanoseconds)
    }

    func testRestorerDoesNotAdvancePausedSessionDuringRecoveryGap() throws {
        let base = makeActiveSnapshot(advancedSeconds: 12)
        let clock = ControllableLiveSessionClock()
        var timing = try MatchTiming.restoring(from: base.timing, clock: clock)
        XCTAssertEqual(timing.toggleMainClock(), .paused)
        let snapshot = replacing(base, timing: timing)

        let restored = try LiveMatchSessionRestorer.restore(
            snapshot: snapshot,
            elapsedNanoseconds: 120_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: snapshot, elapsedSeconds: 120))
        )

        XCTAssertFalse(restored.timing.isRunning)
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 12)
        for playerNumber in 1...5 {
            XCTAssertEqual(restored.timing.participantSecondsPlayed[makeID(playerNumber)], 12)
        }
        XCTAssertEqual(restored.timing.participantSecondsPlayed[makeID(6)], 0)
    }

    func testRestorerHandlesTimeoutExpiryAndKeepsPausedTimeoutPaused() throws {
        let base = makeActiveSnapshot(advancedSeconds: 10)
        let timeoutClock = ControllableLiveSessionClock()
        var runningTimeout = try MatchTiming.restoring(from: base.timing, clock: timeoutClock)
        XCTAssertTrue(runningTimeout.startTimeout(for: .ours))
        timeoutClock.advance(seconds: 30)
        runningTimeout.synchronize()
        let runningSnapshot = replacing(base, timing: runningTimeout)

        let resumed = try LiveMatchSessionRestorer.restore(
            snapshot: runningSnapshot,
            elapsedNanoseconds: 45_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: runningSnapshot, elapsedSeconds: 45))
        )
        XCTAssertTrue(resumed.timing.isRunning)
        XCTAssertEqual(resumed.timing.totalMatchElapsedSeconds, 25)
        XCTAssertEqual(resumed.timing.participantSecondsPlayed[makeID(1)], 25)

        let pausedTimeoutClock = ControllableLiveSessionClock()
        var pausedTimeout = try MatchTiming.restoring(from: base.timing, clock: pausedTimeoutClock)
        XCTAssertEqual(pausedTimeout.toggleMainClock(), .paused)
        XCTAssertTrue(pausedTimeout.startTimeout(for: .ours))
        pausedTimeoutClock.advance(seconds: 30)
        pausedTimeout.synchronize()
        let pausedSnapshot = replacing(base, timing: pausedTimeout)
        let remainsPaused = try LiveMatchSessionRestorer.restore(
            snapshot: pausedSnapshot,
            elapsedNanoseconds: 60_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: pausedSnapshot, elapsedSeconds: 60))
        )
        XCTAssertFalse(remainsPaused.timing.isRunning)
        XCTAssertEqual(remainsPaused.timing.totalMatchElapsedSeconds, 10)
    }

    func testRestorerEndsHalftimeWithoutAutomaticallyStartingSecondHalf() throws {
        let firstHalfSnapshot = makeActiveSnapshot(advancedSeconds: 20 * 60)
        let intervalClock = ControllableLiveSessionClock()
        var interval = try MatchTiming.restoring(from: firstHalfSnapshot.timing, clock: intervalClock)
        XCTAssertEqual(interval.phase, .halftime)
        XCTAssertEqual(interval.toggleMainClock(), .halftimeStarted)
        intervalClock.advance(seconds: 60)
        interval.synchronize()
        let snapshot = replacing(firstHalfSnapshot, timing: interval)

        let restored = try LiveMatchSessionRestorer.restore(
            snapshot: snapshot,
            elapsedNanoseconds: 300_000_000_000,
            timingClock: ControllableLiveSessionClock(),
            recoveryClock: FixedLiveMatchRecoveryClock(reading: reading(for: snapshot, elapsedSeconds: 300))
        )

        XCTAssertEqual(restored.timing.phase, .secondHalf)
        XCTAssertFalse(restored.timing.isRunning)
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 20 * 60)
        XCTAssertEqual(restored.timing.secondHalfElapsedSeconds, 0)
    }

    func testSnapshotValidationRejectsUnsupportedSchemaDuplicateParticipantsAndDanglingAssist() throws {
        let base = makeActiveSnapshot(advancedSeconds: 10)
        XCTAssertThrowsError(try replacing(base, schemaVersion: LiveMatchSessionSnapshot.currentSchemaVersion + 1).validate())

        let timing = base.timing
        let duplicatedParticipantTiming = MatchTimingSnapshot(
            schemaVersion: timing.schemaVersion,
            configuration: timing.configuration,
            phase: timing.phase,
            activity: timing.activity,
            hasStarted: timing.hasStarted,
            attendanceConfirmed: timing.attendanceConfirmed,
            lineupConfirmed: timing.lineupConfirmed,
            firstHalfElapsedNanoseconds: timing.firstHalfElapsedNanoseconds,
            secondHalfElapsedNanoseconds: timing.secondHalfElapsedNanoseconds,
            halftimeElapsedNanoseconds: timing.halftimeElapsedNanoseconds,
            timeoutRemainingNanoseconds: timing.timeoutRemainingNanoseconds,
            timeoutOwner: timing.timeoutOwner,
            resumeAfterTimeout: timing.resumeAfterTimeout,
            ourTimeoutsUsed: timing.ourTimeoutsUsed,
            opponentTimeoutsUsed: timing.opponentTimeoutsUsed,
            participants: timing.participants + [timing.participants[0]],
            capturedAt: timing.capturedAt
        )
        XCTAssertThrowsError(try replacing(base, timingSnapshot: duplicatedParticipantTiming).validate())

        let event = GoalEvent(team: .ours, matchSecond: 10, scorerID: makeID(1), scorerName: "Player 1")
        let danglingAssist = LiveMatchPendingAssistSnapshot(
            goalEventID: makeID(999),
            scorerID: makeID(1),
            scorerName: "Player 1"
        )
        XCTAssertThrowsError(try replacing(base, events: [event], pendingAssist: danglingAssist).validate())
    }

    func testRecoveryNeverAppliesNegativeOrBeyondPeriodElapsedTime() throws {
        let snapshot = makeActiveSnapshot(advancedSeconds: 19 * 60 + 50)
        let backwardWallClock = LiveMatchRecoveryReading(
            wallClockDate: snapshot.capturedAt.addingTimeInterval(-5),
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds + 60_000_000_000
        )
        let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: backwardWallClock)
        XCTAssertEqual(decision.elapsedNanoseconds, 10_000_000_000)
        XCTAssertGreaterThanOrEqual(decision.elapsedNanoseconds, 0)
        XCTAssertTrue(decision.clockAdjustmentDetected)

        let manual = LiveMatchRecoveryPolicy.clampManualElapsed(10_000, for: snapshot)
        XCTAssertEqual(manual, 10_000_000_000)
    }

    private func makeActiveSnapshot(
        sessionID: UUID = UUID(),
        advancedSeconds: Int = 0
    ) -> LiveMatchSessionSnapshot {
        let clock = ControllableLiveSessionClock()
        let players = (1...6).map { index in
            LiveMatchPlayerSnapshot(
                rosterPlayerID: makeID(index),
                name: "Player \(index)",
                isGoalkeeper: index == 1,
                playWeight: 1.0,
                superpower: false
            )
        }
        var timing = MatchTiming(clock: clock)
        let ids = players.map(\.rosterPlayerID)
        XCTAssertTrue(timing.confirmAttendance(presentPlayerIDs: ids))
        XCTAssertTrue(timing.confirmStartingLineup(fieldPlayerIDs: Set(ids.prefix(5))))
        if advancedSeconds > 0 {
            XCTAssertEqual(timing.toggleMainClock(), .started)
            clock.advance(seconds: Int64(advancedSeconds))
            timing.synchronize()
        }
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000 + Double(advancedSeconds))
        let timingSnapshot = timing.snapshot(capturedAt: capturedAt)
        var snapshot = LiveMatchSessionSnapshot(
            schemaVersion: LiveMatchSessionSnapshot.currentSchemaVersion,
            sessionID: sessionID,
            status: .active,
            timing: timingSnapshot,
            startingPlayerIDs: Array(ids.prefix(5)),
            players: players,
            events: [],
            pendingAssist: nil,
            scheduledMatchID: nil,
            scheduledMatchDate: nil,
            opponentName: nil,
            isHome: nil,
            continuousTimeNanoseconds: 500_000_000_000,
            finalRecord: nil
        )
        // A test-only timestamp offset makes elapsed-time policy cases deterministic.
        snapshot.status = .active
        XCTAssertNoThrow(try snapshot.validate())
        return snapshot
    }

    private func replacing(
        _ snapshot: LiveMatchSessionSnapshot,
        timing: MatchTiming? = nil,
        timingSnapshot: MatchTimingSnapshot? = nil,
        events: [GoalEvent]? = nil,
        pendingAssist: LiveMatchPendingAssistSnapshot? = nil,
        schemaVersion: Int? = nil
    ) -> LiveMatchSessionSnapshot {
        let selectedTiming: MatchTimingSnapshot
        if let timingSnapshot {
            selectedTiming = timingSnapshot
        } else if var timing {
            selectedTiming = timing.snapshot(capturedAt: snapshot.capturedAt)
        } else {
            selectedTiming = snapshot.timing
        }
        return LiveMatchSessionSnapshot(
            schemaVersion: schemaVersion ?? snapshot.schemaVersion,
            sessionID: snapshot.sessionID,
            status: snapshot.status,
            timing: selectedTiming,
            startingPlayerIDs: snapshot.startingPlayerIDs,
            players: snapshot.players,
            events: events ?? snapshot.events,
            pendingAssist: pendingAssist ?? snapshot.pendingAssist,
            scheduledMatchID: snapshot.scheduledMatchID,
            scheduledMatchDate: snapshot.scheduledMatchDate,
            opponentName: snapshot.opponentName,
            isHome: snapshot.isHome,
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds,
            finalRecord: snapshot.finalRecord
        )
    }

    private func reading(for snapshot: LiveMatchSessionSnapshot, elapsedSeconds: Int) -> LiveMatchRecoveryReading {
        let elapsedNanoseconds = UInt64(max(0, elapsedSeconds)) * 1_000_000_000
        return LiveMatchRecoveryReading(
            wallClockDate: snapshot.capturedAt.addingTimeInterval(TimeInterval(max(0, elapsedSeconds))),
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds &+ elapsedNanoseconds
        )
    }

    private func makeID(_ number: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", number))!
    }
}

@MainActor
private final class ControllableLiveSessionClock: MatchTimingClock {
    private(set) var instantNanoseconds: Int64 = 0

    func nowNanoseconds() -> Int64 { instantNanoseconds }

    func advance(seconds: Int64) {
        instantNanoseconds += seconds * 1_000_000_000
    }
}

private struct FixedLiveMatchRecoveryClock: LiveMatchRecoveryClock {
    let readingValue: LiveMatchRecoveryReading

    init(reading: LiveMatchRecoveryReading) {
        self.readingValue = reading
    }

    func reading() -> LiveMatchRecoveryReading { readingValue }
}
