import Foundation
import SwiftData
import XCTest
@testable import APP

@MainActor
final class LiveMatchSessionTests: XCTestCase {
    func testSessionSnapshotRoundTripsThroughAtomicPrimaryStore() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LiveMatchSessionStore(directoryURL: directory)
        let base = makeActiveSnapshot(advancedSeconds: 10)
        let event = GoalEvent(
            team: .ours,
            matchSecond: 10,
            scorerID: makeID(1),
            scorerName: "Player 1"
        )
        let pendingAssist = LiveMatchPendingAssistSnapshot(
            goalEventID: event.id,
            scorerID: makeID(1),
            scorerName: "Player 1"
        )
        let snapshot = replacing(base, events: [event], pendingAssist: pendingAssist)

        try store.save(snapshot)

        guard case let .primary(loaded) = store.load() else {
            return XCTFail("Expected a valid primary session snapshot")
        }
        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(loaded.timing, snapshot.timing)
        XCTAssertEqual(loaded.startingPlayerIDs, snapshot.startingPlayerIDs)
        XCTAssertEqual(loaded.players, snapshot.players)
        XCTAssertEqual(loaded.events.count, 1)
        XCTAssertEqual(loaded.events.first?.id, event.id)
        XCTAssertEqual(loaded.events.first?.assistID, nil)
        XCTAssertEqual(loaded.pendingAssist, snapshot.pendingAssist)
    }

    func testPersistentFileCanBeReopenedByANewRepositoryInstance() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let snapshot = makeActiveSnapshot(advancedSeconds: 30)

        try LiveMatchSessionStore(directoryURL: directory).save(snapshot)
        guard case let .primary(loaded) = LiveMatchSessionStore(directoryURL: directory).load() else {
            return XCTFail("A fresh repository instance must reopen the persisted session")
        }

        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(loaded.timing, snapshot.timing)
        XCTAssertEqual(loaded.continuousTimeNanoseconds, snapshot.continuousTimeNanoseconds)
    }

    func testMissingPrimaryAndBackupIsAValidEmptyStore() {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        guard case .none = LiveMatchSessionStore(directoryURL: directory).load() else {
            return XCTFail("A genuinely missing session file should be reported as no session")
        }
    }

    func testSecondSaveKeepsPreviousGoodGenerationAndExplicitBackupRestorePreservesCorruptPrimary() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileSystem = MemoryLiveSessionFileSystem()
        let store = LiveMatchSessionStore(directoryURL: directory, fileSystem: fileSystem)
        let first = makeActiveSnapshot()
        try store.save(first)
        var second = makeActiveSnapshot(sessionID: first.sessionID, advancedSeconds: 15)
        try store.save(second)
        fileSystem.contents[store.primaryURL] = Data("torn-primary".utf8)

        guard case let .backupAvailable(backup, _) = store.load() else {
            return XCTFail("The previous good generation should be offered for recovery")
        }
        XCTAssertEqual(backup.timing.totalMatchElapsedSeconds, first.timing.totalMatchElapsedSeconds)
        let corruptBytes = fileSystem.contents[store.primaryURL]

        _ = try store.restoreBackup()

        guard case let .primary(restored) = store.load() else {
            return XCTFail("The backup should have been promoted after explicit recovery")
        }
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, first.timing.totalMatchElapsedSeconds)
        XCTAssertEqual(fileSystem.contents[store.primaryURL], fileSystem.contents[store.backupURL])
        XCTAssertTrue(fileSystem.contents.keys.contains(where: { $0.lastPathComponent.contains("corrupt-") }))
        XCTAssertNotNil(corruptBytes)
        XCTAssertTrue(fileSystem.contents.values.contains(corruptBytes!))
        second = restored
        XCTAssertEqual(second.sessionID, first.sessionID)
    }

    func testBackupRestoreCanRecoverFromChecksumMismatchAndPreservesPrimaryBytes() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileSystem = MemoryLiveSessionFileSystem()
        let store = LiveMatchSessionStore(directoryURL: directory, fileSystem: fileSystem)
        let previous = makeActiveSnapshot()
        try store.save(previous)
        try store.save(makeActiveSnapshot(sessionID: previous.sessionID, advancedSeconds: 15))

        let primaryBytes = try XCTUnwrap(fileSystem.contents[store.primaryURL])
        var envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: primaryBytes) as? [String: Any])
        envelope["sha256"] = String(repeating: "0", count: 64)
        let corruptPrimaryBytes = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
        fileSystem.contents[store.primaryURL] = corruptPrimaryBytes

        guard case .backupAvailable = store.load() else {
            return XCTFail("A checksum mismatch should offer the verified previous generation")
        }
        let recovered = try store.restoreBackup()

        XCTAssertEqual(recovered.timing.totalMatchElapsedSeconds, previous.timing.totalMatchElapsedSeconds)
        XCTAssertEqual(fileSystem.contents[store.primaryURL], fileSystem.contents[store.backupURL])
        XCTAssertTrue(fileSystem.contents.keys.contains(where: { $0.lastPathComponent.contains("corrupt-") }))
        XCTAssertTrue(fileSystem.contents.values.contains(corruptPrimaryBytes))
    }

    func testFailedPrimaryWriteDoesNotReplacePreviousSnapshot() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileSystem = MemoryLiveSessionFileSystem()
        let store = LiveMatchSessionStore(directoryURL: directory, fileSystem: fileSystem)
        let first = makeActiveSnapshot()
        try store.save(first)
        let originalPrimary = fileSystem.contents[store.primaryURL]
        fileSystem.failNextWriteTo = store.primaryURL

        XCTAssertThrowsError(try store.save(makeActiveSnapshot(sessionID: first.sessionID, advancedSeconds: 20)))
        XCTAssertEqual(fileSystem.contents[store.primaryURL], originalPrimary)
        guard case let .primary(loaded) = store.load() else {
            return XCTFail("The original durable snapshot must remain loadable")
        }
        XCTAssertEqual(loaded.timing.totalMatchElapsedSeconds, first.timing.totalMatchElapsedSeconds)
    }

    func testCorruptAndFutureEnvelopeAreReportedWithoutReplacingTheFile() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileSystem = MemoryLiveSessionFileSystem()
        let store = LiveMatchSessionStore(directoryURL: directory, fileSystem: fileSystem)
        try store.save(makeActiveSnapshot())
        var envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: fileSystem.contents[store.primaryURL]!) as? [String: Any])
        envelope["formatVersion"] = 99
        fileSystem.contents[store.primaryURL] = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
        let unsupportedBytes = fileSystem.contents[store.primaryURL]

        guard case .unavailable = store.load() else {
            return XCTFail("An unsupported future envelope must not be treated as an empty store")
        }
        XCTAssertThrowsError(try store.save(makeActiveSnapshot()))
        XCTAssertEqual(fileSystem.contents[store.primaryURL], unsupportedBytes)
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

    func testFinalizationRetryAfterInterruptionDoesNotDuplicateHistory() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let sessionStore = LiveMatchSessionStore(directoryURL: directory)
        let environment = try makeDataStore()
        defer { environment.cleanup() }
        var snapshot = makeFinalizingSnapshot()
        try sessionStore.save(snapshot)

        try environment.store.insertHistoryRecordIfAbsent(try XCTUnwrap(snapshot.finalRecord))
        // Simulate a process interruption after the history transaction, before the
        // final session marker and file cleanup.
        guard case let .primary(interrupted) = LiveMatchSessionStore(directoryURL: directory).load() else {
            return XCTFail("The finalizing session should survive the simulated interruption")
        }
        snapshot = interrupted

        let finalizer = LiveMatchFinalizationCoordinator(sessionRepository: sessionStore, dataStore: environment.store)
        try finalizer.finalize(snapshot)
        try environment.store.insertHistoryRecordIfAbsent(try XCTUnwrap(snapshot.finalRecord))

        XCTAssertEqual(try environment.store.loadSnapshot().history.count, 1)
        guard case .none = sessionStore.load() else {
            return XCTFail("A durably finalized session should be removed after history verification")
        }
    }

    func testFinalizationCanRecoverFromBackupIfPrimaryIsCorruptedAfterHistoryCommit() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let sessionStore = LiveMatchSessionStore(directoryURL: directory)
        let environment = try makeDataStore()
        defer { environment.cleanup() }
        let snapshot = makeFinalizingSnapshot()

        // These are the two durable generations written before the history side effect.
        try sessionStore.save(snapshot)
        try sessionStore.save(snapshot)
        try environment.store.insertHistoryRecordIfAbsent(try XCTUnwrap(snapshot.finalRecord))
        try Data("corrupt finalizing primary".utf8).write(to: sessionStore.primaryURL)

        guard case let .backupAvailable(backup, _) = sessionStore.load() else {
            return XCTFail("The previous finalizing generation should remain available")
        }
        XCTAssertEqual(backup.status, .finalizing)
        XCTAssertEqual(backup.finalRecord?.id, snapshot.finalRecord?.id)

        let restored = try sessionStore.restoreBackup()
        let finalizer = LiveMatchFinalizationCoordinator(sessionRepository: sessionStore, dataStore: environment.store)
        try finalizer.finalize(restored)

        XCTAssertEqual(try environment.store.loadSnapshot().history.count, 1)
        guard case .none = sessionStore.load() else {
            return XCTFail("Successful retry should clean up both finalized generations")
        }
    }

    func testHistoryConflictDoesNotOverwriteExistingRecord() throws {
        let environment = try makeDataStore()
        defer { environment.cleanup() }
        let original = try XCTUnwrap(makeFinalizingSnapshot().finalRecord)
        try environment.store.insertHistoryRecordIfAbsent(original)

        var conflict = original
        conflict.opponentName = "Different Opponent"
        XCTAssertThrowsError(try environment.store.insertHistoryRecordIfAbsent(conflict))
        XCTAssertEqual(try environment.store.loadSnapshot().history.first?.opponentName, original.opponentName)
    }

    func testHistoryWriteFailureLeavesFinalizingSessionRecoverable() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let sessionStore = LiveMatchSessionStore(directoryURL: directory)
        let snapshot = makeFinalizingSnapshot()
        try sessionStore.save(snapshot)
        let blockedEnvironment = try makeDataStore(allowsSave: false)
        defer { blockedEnvironment.cleanup() }

        let finalizer = LiveMatchFinalizationCoordinator(sessionRepository: sessionStore, dataStore: blockedEnvironment.store)
        XCTAssertThrowsError(try finalizer.finalize(snapshot))
        guard case let .primary(persisted) = sessionStore.load() else {
            return XCTFail("The finalizing snapshot must remain available after a history write failure")
        }
        XCTAssertEqual(persisted.status, .finalizing)
        XCTAssertNotNil(persisted.finalRecord)
    }

    func testFinalizationMarkerAndCleanupFailuresCanBeRetriedWithoutDuplicateHistory() throws {
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let fileSystem = MemoryLiveSessionFileSystem()
        let sessionStore = LiveMatchSessionStore(directoryURL: directory, fileSystem: fileSystem)
        let environment = try makeDataStore()
        defer { environment.cleanup() }
        let initial = makeFinalizingSnapshot()
        try sessionStore.save(initial)

        let markerFailureRepository = FailFinalizedMarkerRepository(base: sessionStore)
        let markerFailureFinalizer = LiveMatchFinalizationCoordinator(
            sessionRepository: markerFailureRepository,
            dataStore: environment.store
        )
        XCTAssertThrowsError(try markerFailureFinalizer.finalize(initial))
        XCTAssertEqual(try environment.store.loadSnapshot().history.count, 1)
        guard case let .primary(afterMarkerFailure) = sessionStore.load() else {
            return XCTFail("The finalizing session must remain after its finalized marker fails")
        }
        XCTAssertEqual(afterMarkerFailure.status, .finalizing)

        fileSystem.failNextRemoveAt = sessionStore.primaryURL
        let finalizer = LiveMatchFinalizationCoordinator(
            sessionRepository: sessionStore,
            dataStore: environment.store
        )
        XCTAssertThrowsError(try finalizer.finalize(afterMarkerFailure))
        XCTAssertEqual(try environment.store.loadSnapshot().history.count, 1)
        guard case let .primary(afterCleanupFailure) = sessionStore.load() else {
            return XCTFail("A finalized session must remain if its file cleanup fails")
        }
        XCTAssertEqual(afterCleanupFailure.status, .finalized)

        try finalizer.finalize(afterCleanupFailure)
        XCTAssertEqual(try environment.store.loadSnapshot().history.count, 1)
        guard case .none = sessionStore.load() else {
            return XCTFail("A retry should remove the finalized session after verifying history")
        }
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

    private func makeFinalizingSnapshot() -> LiveMatchSessionSnapshot {
        let active = makeActiveSnapshot(advancedSeconds: 42)
        let clock = ControllableLiveSessionClock()
        var timing = try! MatchTiming.restoring(from: active.timing, clock: clock)
        timing.finish()
        let timingSnapshot = timing.snapshot(capturedAt: active.capturedAt)
        let players = active.players
        let summaries = players.map { player in
            PlayerMatchSummary(
                id: makeID(100 + players.firstIndex(where: { $0.id == player.id })!),
                rosterPlayerID: player.id,
                playerName: player.name,
                secondsPlayed: timing.participantSecondsPlayed[player.id] ?? 0,
                goals: 0,
                assists: 0
            )
        }
        let record = MatchRecord(
            id: active.sessionID,
            date: active.capturedAt,
            duration: timing.totalMatchElapsedSeconds,
            players: summaries,
            ourScore: 0,
            opponentScore: 0,
            events: [],
            scheduledMatchID: nil,
            opponentName: nil,
            isHome: nil
        )
        var finalizing = LiveMatchSessionSnapshot(
            schemaVersion: active.schemaVersion,
            sessionID: active.sessionID,
            status: .finalizing,
            timing: timingSnapshot,
            startingPlayerIDs: active.startingPlayerIDs,
            players: players,
            events: [],
            pendingAssist: nil,
            scheduledMatchID: nil,
            scheduledMatchDate: nil,
            opponentName: nil,
            isHome: nil,
            continuousTimeNanoseconds: active.continuousTimeNanoseconds,
            finalRecord: record
        )
        XCTAssertNoThrow(try finalizing.validate())
        finalizing.status = .finalizing
        return finalizing
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

    private func makeDataStore(allowsSave: Bool = true) throws -> (store: MatchDataStore, cleanup: () -> Void) {
        let container = try MatchDataStore.makeInMemoryContainer()
        let suiteName = "AURINFORMATC.LiveSessionTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        let store = MatchDataStore(container: container, userDefaults: defaults)
        if !allowsSave {
            // Use a persistent no-save configuration for deterministic save failure.
            let directory = makeTemporaryDirectory()
            let file = directory.appendingPathComponent("readonly.sqlite")
            let writableContainer = try MatchDataStore.makeContainer(at: file, allowsSave: true)
            writableContainer.mainContext.insert(StoredLegacyImportReceipt(id: "test-seed", completedAt: Date()))
            try writableContainer.mainContext.save()
            let readOnlyContainer = try MatchDataStore.makeContainer(at: file, allowsSave: false)
            let readOnlyStore = MatchDataStore(container: readOnlyContainer, userDefaults: defaults)
            return (readOnlyStore, {
                defaults.removePersistentDomain(forName: suiteName)
                try? FileManager.default.removeItem(at: directory)
            })
        }
        return (store, { defaults.removePersistentDomain(forName: suiteName) })
    }

    private func makeTemporaryDirectory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("AURINFORMATC-LiveSession-\(UUID().uuidString)", isDirectory: true)
        try! FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
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

@MainActor
private final class MemoryLiveSessionFileSystem: LiveMatchSessionFileSystem {
    var contents: [URL: Data] = [:]
    var failNextWriteTo: URL?
    var failNextRemoveAt: URL?

    func fileExists(at url: URL) -> Bool { contents[url] != nil }
    func readData(at url: URL) throws -> Data { try XCTUnwrap(contents[url]) }

    func writeAtomically(_ data: Data, to url: URL) throws {
        if failNextWriteTo == url {
            failNextWriteTo = nil
            throw CocoaError(.fileWriteNoPermission)
        }
        contents[url] = data
    }

    func createDirectory(at url: URL) throws {}
    func removeItem(at url: URL) throws {
        if failNextRemoveAt == url {
            failNextRemoveAt = nil
            throw CocoaError(.fileWriteNoPermission)
        }
        contents.removeValue(forKey: url)
    }
}

@MainActor
private final class FailFinalizedMarkerRepository: LiveMatchSessionRepository {
    private let base: LiveMatchSessionStore
    private var shouldFailFinalizedSave = true

    init(base: LiveMatchSessionStore) {
        self.base = base
    }

    func load() -> LiveMatchSessionLoadResult { base.load() }
    func restoreBackup() throws -> LiveMatchSessionSnapshot { try base.restoreBackup() }
    func removeFinalized(sessionID: UUID) throws { try base.removeFinalized(sessionID: sessionID) }

    func save(_ snapshot: LiveMatchSessionSnapshot) throws {
        if shouldFailFinalizedSave && snapshot.status == .finalized {
            shouldFailFinalizedSave = false
            throw CocoaError(.fileWriteNoPermission)
        }
        try base.save(snapshot)
    }
}
