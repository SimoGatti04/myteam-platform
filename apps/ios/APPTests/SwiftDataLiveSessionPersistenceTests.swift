import Foundation
import SwiftData
import XCTest
@testable import APP

@MainActor
final class SwiftDataLiveSessionPersistenceTests: XCTestCase {
    func testEmptySwiftDataStoreLoadsNoSession() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }

        guard case .none = try XCTUnwrap(environment.store).load() else {
            return XCTFail("An empty SwiftData store should contain no live session")
        }
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 0)
    }

    func testLiveSnapshotRoundTripsWithEventsAndPendingAssist() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let base = LiveSessionTestData.activeSnapshot(advancedSeconds: 10)
        let goal = GoalEvent(
            id: LiveSessionTestData.id(700),
            team: .ours,
            matchSecond: 10,
            scorerID: LiveSessionTestData.id(1),
            scorerName: "Player 1"
        )
        let pendingAssist = LiveMatchPendingAssistSnapshot(
            goalEventID: goal.id,
            scorerID: LiveSessionTestData.id(1),
            scorerName: "Player 1"
        )
        let snapshot = LiveSessionTestData.replacing(base, events: [goal], pendingAssist: pendingAssist)

        try store.save(snapshot)

        guard case let .primary(loaded) = store.load() else {
            return XCTFail("Expected the SwiftData session to load")
        }
        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(loaded.timing, snapshot.timing)
        XCTAssertEqual(loaded.startingPlayerIDs, snapshot.startingPlayerIDs)
        XCTAssertEqual(loaded.players, snapshot.players)
        XCTAssertEqual(loaded.events.map(\.id), [goal.id])
        XCTAssertNil(loaded.events.first?.assistID)
        XCTAssertEqual(loaded.pendingAssist, pendingAssist)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testPersistentSwiftDataStoreCanBeClosedAndReopened() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let snapshot = LiveSessionTestData.activeSnapshot(advancedSeconds: 30)
        try XCTUnwrap(environment.store).save(snapshot)

        environment.close()
        try environment.reopen()

        guard case let .primary(loaded) = try XCTUnwrap(environment.store).load() else {
            return XCTFail("A persisted session should survive closing and reopening the ModelContainer")
        }
        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(loaded.timing, snapshot.timing)
        XCTAssertEqual(loaded.players, snapshot.players)
    }

    func testV1StoreMigratesToV2AndCanBeReopenedWithoutLosingC31Data() throws {
        let environment = try makeEnvironment(persistent: true, openImmediately: false)
        defer { environment.cleanup() }
        let player = RosterPlayer(id: LiveSessionTestData.id(801), name: "Synthetic Keeper", active: true, isGoalkeeper: true)
        let scheduled = ScheduledMatch(
            id: LiveSessionTestData.id(802),
            round: "R-01",
            opponentName: "Synthetic FC",
            date: Date(timeIntervalSince1970: 1_800_000_000),
            isHome: true,
            location: "Synthetic Arena",
            notes: "Fixture only"
        )
        let goal = GoalEvent(
            id: LiveSessionTestData.id(805),
            team: .ours,
            matchSecond: 420,
            scorerID: player.id,
            scorerName: player.name,
            assistID: LiveSessionTestData.id(803),
            assistName: "Synthetic Player 2"
        )
        let record = MatchRecord(
            id: LiveSessionTestData.id(804),
            date: Date(timeIntervalSince1970: 1_800_000_100),
            duration: 2_700,
            players: [PlayerMatchSummary(
                id: LiveSessionTestData.id(806),
                rosterPlayerID: player.id,
                playerName: player.name,
                secondsPlayed: 1_320,
                goals: 1,
                assists: 0
            )],
            ourScore: 1,
            opponentScore: 0,
            events: [goal],
            scheduledMatchID: scheduled.id,
            opponentName: scheduled.opponentName,
            isHome: scheduled.isHome
        )

        let schemaV1 = Schema(versionedSchema: MatchManagerSchemaV1.self)
        let configurationV1 = ModelConfiguration(
            "AURINFORMATC-Test",
            schema: schemaV1,
            url: environment.storeURL,
            cloudKitDatabase: .none
        )
        var v1Container: ModelContainer? = try ModelContainer(for: schemaV1, configurations: [configurationV1])
        do {
            let context = ModelContext(try XCTUnwrap(v1Container))
            context.insert(StoredRosterPlayer(player, position: 0))
            context.insert(StoredScheduledMatch(scheduled, position: 0))
            context.insert(StoredMatchRecord(record, position: 0))
            try context.save()
        }
        v1Container = nil

        try environment.reopen()
        let migrated = try XCTUnwrap(environment.store).loadSnapshot()
        XCTAssertEqual(migrated.roster, [player])
        XCTAssertEqual(migrated.schedule, [scheduled])
        let migratedRecord = try XCTUnwrap(migrated.history.first)
        XCTAssertEqual(migratedRecord.id, record.id)
        XCTAssertEqual(migratedRecord.scheduledMatchID, scheduled.id)
        XCTAssertEqual(migratedRecord.players.first?.rosterPlayerID, player.id)
        XCTAssertEqual(migratedRecord.players.first?.secondsPlayed, 1_320)
        XCTAssertEqual(migratedRecord.events?.first?.id, goal.id)
        XCTAssertEqual(migratedRecord.events?.first?.assistID, goal.assistID)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 0)

        environment.close()
        try environment.reopen()
        let reopened = try XCTUnwrap(environment.store).loadSnapshot()
        XCTAssertEqual(reopened.roster, [player])
        XCTAssertEqual(reopened.schedule, [scheduled])
        XCTAssertEqual(reopened.history.first?.id, record.id)
        XCTAssertEqual(reopened.history.first?.events?.first?.id, goal.id)
    }

    func testSavingAnotherGenerationKeepsPreviousVerifiedSnapshot() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let first = LiveSessionTestData.activeSnapshot(advancedSeconds: 10)
        let second = LiveSessionTestData.activeSnapshot(sessionID: first.sessionID, advancedSeconds: 20)

        try store.save(first)
        try store.save(second)

        guard case let .primary(current) = store.load() else {
            return XCTFail("The current snapshot should be available")
        }
        XCTAssertEqual(current.timing.totalMatchElapsedSeconds, 20)
        let row = try XCTUnwrap(try ModelContext(try XCTUnwrap(environment.container))
            .fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
        XCTAssertEqual(row.currentGeneration, 2)
        XCTAssertEqual(row.previousGeneration, 1)
        XCTAssertNotNil(row.previousDocument)
    }

    func testCorruptCurrentGenerationCanBeQuarantinedAndPreviousGenerationRestored() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let first = LiveSessionTestData.activeSnapshot(advancedSeconds: 10)
        let second = LiveSessionTestData.activeSnapshot(sessionID: first.sessionID, advancedSeconds: 20)
        try store.save(first)
        try store.save(second)
        let corruptBytes = Data("synthetic-corruption".utf8)
        do {
            let context = ModelContext(try XCTUnwrap(environment.container))
            let row = try XCTUnwrap(context.fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
            row.currentDocument = corruptBytes
            try context.save()
        }

        guard case let .backupAvailable(backup, _) = store.load() else {
            return XCTFail("A corrupt current generation should expose the previous verified generation")
        }
        XCTAssertEqual(backup.timing.totalMatchElapsedSeconds, 10)
        let restored = try store.restoreBackup()
        XCTAssertEqual(restored.sessionID, first.sessionID)
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 10)
        let row = try XCTUnwrap(try ModelContext(try XCTUnwrap(environment.container))
            .fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
        XCTAssertEqual(row.quarantinedDocument, corruptBytes)
        XCTAssertNotNil(row.quarantineReason)
        XCTAssertEqual(try LiveMatchSessionDocumentCodec.decode(row.currentDocument).timing.totalMatchElapsedSeconds, 10)
    }

    func testSavingAfterRestoringBackupRetainsQuarantineAndCreatesNewGeneration() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let first = LiveSessionTestData.activeSnapshot(advancedSeconds: 10)
        let second = LiveSessionTestData.activeSnapshot(sessionID: first.sessionID, advancedSeconds: 20)
        try store.save(first)
        try store.save(second)

        let corruptBytes = Data("synthetic-corruption-after-restore".utf8)
        do {
            let context = ModelContext(try XCTUnwrap(environment.container))
            let row = try XCTUnwrap(context.fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
            row.currentDocument = corruptBytes
            try context.save()
        }
        guard case .backupAvailable = store.load() else {
            return XCTFail("The corrupt current generation should require explicit backup restoration")
        }
        let restored = try store.restoreBackup()
        XCTAssertEqual(restored.timing.totalMatchElapsedSeconds, 10)

        let updated = LiveSessionTestData.activeSnapshot(sessionID: first.sessionID, advancedSeconds: 15)
        try store.save(updated)

        guard case let .primary(readback) = store.load() else {
            return XCTFail("A new save after recovery should become the readable current generation")
        }
        XCTAssertEqual(readback.timing.totalMatchElapsedSeconds, 15)
        let row = try XCTUnwrap(try ModelContext(try XCTUnwrap(environment.container))
            .fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
        XCTAssertEqual(row.currentGeneration, 2)
        XCTAssertEqual(row.previousGeneration, 1)
        let previousDocument = try XCTUnwrap(row.previousDocument)
        XCTAssertEqual(
            try LiveMatchSessionDocumentCodec.decode(previousDocument).timing.totalMatchElapsedSeconds,
            10
        )
        XCTAssertEqual(row.quarantinedDocument, corruptBytes)
        XCTAssertNotNil(row.quarantineReason)
    }

    func testMetadataMismatchFailsClosedWithoutMutatingStoredDocument() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let snapshot = LiveSessionTestData.activeSnapshot(advancedSeconds: 12)
        try store.save(snapshot)
        let original: Data
        do {
            let context = ModelContext(try XCTUnwrap(environment.container))
            let row = try XCTUnwrap(context.fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
            original = row.currentDocument
            row.statusRawValue = LiveMatchSessionStatus.finalized.rawValue
            try context.save()
        }

        guard case .unavailable = store.load() else {
            return XCTFail("Inconsistent row metadata must not be presented as a valid or empty session")
        }
        let row = try XCTUnwrap(try ModelContext(try XCTUnwrap(environment.container))
            .fetch(FetchDescriptor<StoredLiveMatchSession>()).first)
        XCTAssertEqual(row.currentDocument, original)
    }

    func testFailedWriteDoesNotReplacePreviouslyPersistedSession() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let first = LiveSessionTestData.activeSnapshot(advancedSeconds: 5)
        let second = LiveSessionTestData.activeSnapshot(sessionID: first.sessionID, advancedSeconds: 15)
        try XCTUnwrap(environment.store).save(first)

        environment.close()
        try environment.reopen(allowsSave: false)
        XCTAssertThrowsError(try XCTUnwrap(environment.store).save(second))
        guard case let .primary(loaded) = try XCTUnwrap(environment.store).load() else {
            return XCTFail("A failed write must leave the last good session available")
        }
        XCTAssertEqual(loaded.timing.totalMatchElapsedSeconds, 5)
    }

    func testLegacyPrimaryImportsToSwiftDataAndRepeatedImportDoesNotDuplicate() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let snapshot = LiveSessionTestData.activeSnapshot(advancedSeconds: 25)
        let source = try makeLegacySource(snapshot: snapshot, directory: environment.root.appendingPathComponent("legacy", isDirectory: true))
        let originalPrimary = try Data(contentsOf: source.primaryURL)

        try store.importLegacyLiveSessionIfNeeded(from: source)
        try store.importLegacyLiveSessionIfNeeded(from: source)

        guard case let .primary(loaded) = store.load() else {
            return XCTFail("The validated legacy primary should be imported")
        }
        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(loaded.timing, snapshot.timing)
        XCTAssertEqual(try Data(contentsOf: source.primaryURL), originalPrimary)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
        XCTAssertEqual(try liveImportReceiptCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testLegacyBackupImportsWithReviewAndKeepsBothSourceFiles() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let snapshot = LiveSessionTestData.activeSnapshot(advancedSeconds: 35)
        let source = try makeLegacySource(
            snapshot: snapshot,
            directory: environment.root.appendingPathComponent("legacy", isDirectory: true),
            primary: Data("corrupt-primary".utf8)
        )
        let originalPrimary = try Data(contentsOf: source.primaryURL)
        let originalBackup = try Data(contentsOf: source.backupURL)

        try store.importLegacyLiveSessionIfNeeded(from: source)
        guard case let .backupAvailable(candidate, _) = store.load() else {
            return XCTFail("A legacy backup must require explicit recovery review")
        }
        XCTAssertEqual(candidate.sessionID, snapshot.sessionID)
        let accepted = try store.restoreBackup()
        XCTAssertEqual(accepted.timing, snapshot.timing)
        guard case let .primary(loaded) = store.load() else {
            return XCTFail("An explicitly accepted legacy backup should become the active SwiftData snapshot")
        }
        XCTAssertEqual(loaded.sessionID, snapshot.sessionID)
        XCTAssertEqual(try Data(contentsOf: source.primaryURL), originalPrimary)
        XCTAssertEqual(try Data(contentsOf: source.backupURL), originalBackup)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testFinalizationRefusesLegacyBackupThatStillRequiresReview() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let active = LiveSessionTestData.activeSnapshot(advancedSeconds: 35)
        let source = try makeLegacySource(
            snapshot: active,
            directory: environment.root.appendingPathComponent("legacy-review", isDirectory: true),
            primary: Data("corrupt-primary".utf8)
        )
        let finalizing = LiveSessionTestData.finalizingSnapshot(sessionID: active.sessionID)

        try store.importLegacyLiveSessionIfNeeded(from: source)
        XCTAssertThrowsError(
            try LiveMatchFinalizationCoordinator(sessionRepository: store).finalize(finalizing)
        )

        XCTAssertTrue(try store.loadSnapshot().history.isEmpty)
        guard case let .backupAvailable(preserved, _) = store.load() else {
            return XCTFail("A backup awaiting review must remain unchanged after finalization is refused")
        }
        XCTAssertEqual(preserved.sessionID, active.sessionID)
        XCTAssertEqual(try Data(contentsOf: source.primaryURL), Data("corrupt-primary".utf8))
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testCorruptLegacyFilesFailClosedAndDoNotWriteImportReceipt() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let directory = makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let source = LegacyLiveMatchSessionJSONSource(directoryURL: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let badPrimary = Data("bad-primary".utf8)
        let badBackup = Data("bad-backup".utf8)
        try badPrimary.write(to: source.primaryURL)
        try badBackup.write(to: source.backupURL)

        XCTAssertThrowsError(try store.importLegacyLiveSessionIfNeeded(from: source))
        guard case .none = store.load() else {
            return XCTFail("Unreadable legacy data must not be represented as an initialized empty session")
        }
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 0)
        XCTAssertEqual(try liveImportReceiptCount(in: try XCTUnwrap(environment.container)), 0)
        XCTAssertEqual(try Data(contentsOf: source.primaryURL), badPrimary)
        XCTAssertEqual(try Data(contentsOf: source.backupURL), badBackup)
    }

    func testImportCanResumeAfterAggregateWriteBeforeReceipt() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let snapshot = LiveSessionTestData.activeSnapshot(advancedSeconds: 18)
        let source = try makeLegacySource(snapshot: snapshot, directory: environment.root.appendingPathComponent("legacy", isDirectory: true))

        // Models the idempotent retry path after the aggregate transaction persisted
        // but before the import receipt was committed.
        try store.save(snapshot)
        try store.importLegacyLiveSessionIfNeeded(from: source)

        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
        XCTAssertEqual(try liveImportReceiptCount(in: try XCTUnwrap(environment.container)), 1)
        guard case let .primary(loaded) = store.load() else {
            return XCTFail("The retried import should preserve the already persisted aggregate")
        }
        XCTAssertEqual(loaded.timing, snapshot.timing)
    }

    func testFinalizationCommitsHistoryAndRemovesSessionInOneStoreAndIsIdempotent() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let active = LiveSessionTestData.activeSnapshot(advancedSeconds: 42)
        let snapshot = LiveSessionTestData.finalizingSnapshot(sessionID: active.sessionID)
        do {
            let store = try XCTUnwrap(environment.store)
            try store.save(active)
            try LiveMatchFinalizationCoordinator(sessionRepository: store).finalize(snapshot)
        }

        // All repository/container references from the first process scope are
        // released before reopening the persistent store.
        environment.close()
        try environment.reopen()
        do {
            let reopenedStore = try XCTUnwrap(environment.store)
            try LiveMatchFinalizationCoordinator(sessionRepository: reopenedStore).finalize(snapshot)

            let result = try reopenedStore.loadSnapshot()
            XCTAssertEqual(result.history.count, 1)
            XCTAssertEqual(result.history.first?.id, snapshot.sessionID)
            XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 0)
        }
        environment.close()
    }

    func testFinalizationAcceptsDatePrecisionAfterSessionSnapshotRoundTrip() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let active = LiveSessionTestData.activeSnapshot(advancedSeconds: 42)
        var snapshot = LiveSessionTestData.finalizingSnapshot(sessionID: active.sessionID)
        var record = try XCTUnwrap(snapshot.finalRecord)
        record.date = Date(timeIntervalSince1970: 1_800_000_000.000005)
        snapshot.finalRecord = record

        let store = try XCTUnwrap(environment.store)
        try store.save(active)
        try LiveMatchFinalizationCoordinator(sessionRepository: store).finalize(snapshot)

        let stored = try store.loadSnapshot()
        XCTAssertEqual(stored.history.count, 1)
        XCTAssertEqual(stored.history.first?.id, active.sessionID)
        guard case .none = store.load() else {
            return XCTFail("A finalized match must not leave a live session")
        }
    }

    func testFinalizationTransactionFailureKeepsCheckpointAndRetryDoesNotDuplicateHistory() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let active = LiveSessionTestData.activeSnapshot(advancedSeconds: 42)
        let finalizing = LiveSessionTestData.finalizingSnapshot(sessionID: active.sessionID)
        let conflict = MatchRecord(
            id: active.sessionID,
            date: Date(timeIntervalSince1970: 1_900_000_000),
            duration: 1,
            players: [],
            ourScore: 9,
            opponentScore: 9,
            events: []
        )
        do {
            let store = try XCTUnwrap(environment.store)
            try store.replaceHistory([conflict])
            try store.save(active)
            let finalizer = LiveMatchFinalizationCoordinator(sessionRepository: store)
            XCTAssertThrowsError(try finalizer.finalize(finalizing))
        }

        // Release every repository/container reference before reopening to
        // model interruption before the terminal transaction commits.
        environment.close()
        try environment.reopen()
        do {
            let reopenedStore = try XCTUnwrap(environment.store)
            XCTAssertEqual(try reopenedStore.loadSnapshot().history.map(\.id), [conflict.id])
            guard case let .primary(checkpoint) = reopenedStore.load() else {
                return XCTFail("A failed terminal transaction must leave its finalizing checkpoint recoverable")
            }
            XCTAssertEqual(checkpoint.status.rawValue, LiveMatchSessionStatus.finalizing.rawValue)
            XCTAssertEqual(checkpoint.finalRecord?.id, finalizing.finalRecord?.id)
            XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)

            let startup = LiveMatchSessionStartupFactory.make(
                from: reopenedStore.load(),
                now: LiveMatchRecoveryReading(
                    wallClockDate: Date(timeIntervalSince1970: 1_900_000_000),
                    continuousTimeNanoseconds: 0
                )
            )
            guard case let .finalizationPending(startupSnapshot, restoreBackupFirst, reason) = startup else {
                return XCTFail("A reopened finalizing checkpoint must be surfaced as a pending finalization retry")
            }
            XCTAssertEqual(startupSnapshot.sessionID, checkpoint.sessionID)
            XCTAssertEqual(startupSnapshot.status, checkpoint.status)
            XCTAssertEqual(startupSnapshot.timing, checkpoint.timing)
            XCTAssertEqual(startupSnapshot.finalRecord?.id, checkpoint.finalRecord?.id)
            XCTAssertFalse(restoreBackupFirst)
            XCTAssertNil(reason)

            // Resolve only the synthetic conflict, then retry the exact saved intent.
            try reopenedStore.replaceHistory([])
            let retryFinalizer = LiveMatchFinalizationCoordinator(sessionRepository: reopenedStore)
            try retryFinalizer.finalize(finalizing)
            try retryFinalizer.finalize(finalizing)

            let completed = try reopenedStore.loadSnapshot()
            XCTAssertEqual(completed.history.count, 1)
            XCTAssertEqual(completed.history.first?.id, finalizing.sessionID)
            XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 0)
        }
        environment.close()
    }

    func testFinalizationCheckpointWriteFailureLeavesActiveSessionAndNoHistory() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let active = LiveSessionTestData.activeSnapshot(advancedSeconds: 42)
        let finalizing = LiveSessionTestData.finalizingSnapshot(sessionID: active.sessionID)
        try XCTUnwrap(environment.store).save(active)

        environment.close()
        try environment.reopen(allowsSave: false)
        let store = try XCTUnwrap(environment.store)
        XCTAssertThrowsError(
            try LiveMatchFinalizationCoordinator(sessionRepository: store).finalize(finalizing)
        )

        XCTAssertTrue(try store.loadSnapshot().history.isEmpty)
        guard case let .primary(persisted) = store.load() else {
            return XCTFail("A failed checkpoint write must preserve the last active session")
        }
        XCTAssertEqual(persisted.status.rawValue, LiveMatchSessionStatus.active.rawValue)
        XCTAssertNil(persisted.finalRecord)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testFinalizationConflictLeavesExistingHistoryAndSessionUnchanged() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let snapshot = LiveSessionTestData.finalizingSnapshot()
        let conflicting = MatchRecord(
            id: snapshot.sessionID,
            date: Date(timeIntervalSince1970: 1_900_000_000),
            duration: 1,
            players: [],
            ourScore: 9,
            opponentScore: 9,
            events: []
        )
        try store.replaceHistory([conflicting])
        try store.save(snapshot)

        XCTAssertThrowsError(try store.finalize(snapshot))
        XCTAssertEqual(try store.loadSnapshot().history.first?.ourScore, 9)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
        guard case let .primary(stored) = store.load() else {
            return XCTFail("A failed finalization must leave its session recoverable")
        }
        XCTAssertEqual(stored.sessionID, snapshot.sessionID)
    }

    func testFinalizationSaveFailureLeavesSessionAndNoHistory() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let snapshot = LiveSessionTestData.finalizingSnapshot()
        try XCTUnwrap(environment.store).save(snapshot)

        environment.close()
        try environment.reopen(allowsSave: false)
        XCTAssertThrowsError(try XCTUnwrap(environment.store).finalize(snapshot))
        let data = try XCTUnwrap(environment.store).loadSnapshot()
        XCTAssertTrue(data.history.isEmpty)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
        guard case let .primary(persisted) = try XCTUnwrap(environment.store).load() else {
            return XCTFail("The finalizing session must remain available after a failed commit")
        }
        XCTAssertEqual(persisted.sessionID, snapshot.sessionID)
    }

    func testOnlyOneLiveSessionCanBeSavedAtATime() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let first = LiveSessionTestData.activeSnapshot(advancedSeconds: 4)
        let second = LiveSessionTestData.activeSnapshot(advancedSeconds: 7)
        try store.save(first)

        XCTAssertThrowsError(try store.save(second))
        guard case let .primary(loaded) = store.load() else {
            return XCTFail("The original live session must remain the sole session")
        }
        XCTAssertEqual(loaded.sessionID, first.sessionID)
        XCTAssertEqual(try sessionCount(in: try XCTUnwrap(environment.container)), 1)
    }

    func testUnsupportedSnapshotCannotOverwriteCurrentSession() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let store = try XCTUnwrap(environment.store)
        let current = LiveSessionTestData.activeSnapshot(advancedSeconds: 6)
        try store.save(current)
        let unsupported = LiveSessionTestData.replacing(current, schemaVersion: 999)

        XCTAssertThrowsError(try store.save(unsupported))
        guard case let .primary(loaded) = store.load() else {
            return XCTFail("A future payload must not replace the supported current session")
        }
        XCTAssertEqual(loaded.schemaVersion, LiveMatchSessionSnapshot.currentSchemaVersion)
        XCTAssertEqual(loaded.timing, current.timing)
    }

    private func makeEnvironment(
        persistent: Bool = false,
        allowsSave: Bool = true,
        openImmediately: Bool = true
    ) throws -> TestStoreEnvironment {
        let suiteName = "AURINFORMATC.C3R1.Tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("AURINFORMATC-C3R1-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let environment = TestStoreEnvironment(root: root, suiteName: suiteName, defaults: defaults, persistent: persistent)
        if openImmediately {
            try environment.open(allowsSave: allowsSave)
        }
        return environment
    }

    private func makeLegacySource(
        snapshot: LiveMatchSessionSnapshot,
        directory: URL,
        primary: Data? = nil
    ) throws -> LegacyLiveMatchSessionJSONSource {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let source = LegacyLiveMatchSessionJSONSource(directoryURL: directory)
        try (primary ?? LiveMatchSessionDocumentCodec.encode(snapshot)).write(to: source.primaryURL)
        if primary != nil {
            try LiveMatchSessionDocumentCodec.encode(snapshot).write(to: source.backupURL)
        }
        return source
    }

    private func makeTemporaryDirectory() -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("AURINFORMATC-C3R1-Legacy-\(UUID().uuidString)", isDirectory: true)
        try! FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func sessionCount(in container: ModelContainer) throws -> Int {
        try ModelContext(container).fetch(FetchDescriptor<StoredLiveMatchSession>()).count
    }

    private func liveImportReceiptCount(in container: ModelContainer) throws -> Int {
        try ModelContext(container).fetch(FetchDescriptor<StoredLiveSessionImportReceipt>()).count
    }
}

@MainActor
private final class TestStoreEnvironment {
    let root: URL
    let storeURL: URL
    let suiteName: String
    let defaults: UserDefaults
    let persistent: Bool
    var container: ModelContainer?
    var store: MatchDataStore?

    init(root: URL, suiteName: String, defaults: UserDefaults, persistent: Bool) {
        self.root = root
        self.storeURL = root.appendingPathComponent("MatchData.store")
        self.suiteName = suiteName
        self.defaults = defaults
        self.persistent = persistent
    }

    func open(allowsSave: Bool = true) throws {
        let opened = persistent
            ? try MatchDataStore.makeContainer(at: storeURL, allowsSave: allowsSave)
            : try MatchDataStore.makeInMemoryContainer()
        container = opened
        store = MatchDataStore(container: opened, userDefaults: defaults)
    }

    func reopen(allowsSave: Bool = true) throws {
        close()
        try open(allowsSave: allowsSave)
    }

    func close() {
        store = nil
        container = nil
    }

    func cleanup() {
        close()
        defaults.removePersistentDomain(forName: suiteName)
        try? FileManager.default.removeItem(at: root)
    }
}

@MainActor
private enum LiveSessionTestData {
    static func activeSnapshot(sessionID: UUID = UUID(), advancedSeconds: Int = 0) -> LiveMatchSessionSnapshot {
        let clock = SyntheticMatchClock()
        let players = (1...6).map { index in
            LiveMatchPlayerSnapshot(
                rosterPlayerID: id(index),
                name: "Player \(index)",
                isGoalkeeper: index == 1,
                playWeight: 1.0,
                superpower: false
            )
        }
        var timing = MatchTiming(clock: clock)
        let ids = players.map(\.rosterPlayerID)
        precondition(timing.confirmAttendance(presentPlayerIDs: ids))
        precondition(timing.confirmStartingLineup(fieldPlayerIDs: Set(ids.prefix(5))))
        if advancedSeconds > 0 {
            _ = timing.toggleMainClock()
            clock.advance(seconds: Int64(advancedSeconds))
            timing.synchronize()
        }
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000 + Double(advancedSeconds))
        let snapshot = LiveMatchSessionSnapshot(
            schemaVersion: LiveMatchSessionSnapshot.currentSchemaVersion,
            sessionID: sessionID,
            status: .active,
            timing: timing.snapshot(capturedAt: capturedAt),
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
        precondition((try? snapshot.validate()) != nil)
        return snapshot
    }

    static func finalizingSnapshot(sessionID: UUID = UUID()) -> LiveMatchSessionSnapshot {
        let active = activeSnapshot(sessionID: sessionID, advancedSeconds: 42)
        let clock = SyntheticMatchClock()
        var timing = try! MatchTiming.restoring(from: active.timing, clock: clock)
        timing.finish()
        let timingSnapshot = timing.snapshot(capturedAt: active.capturedAt)
        let summaries = active.players.enumerated().map { index, player in
            PlayerMatchSummary(
                id: id(850 + index),
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
        let snapshot = LiveMatchSessionSnapshot(
            schemaVersion: active.schemaVersion,
            sessionID: active.sessionID,
            status: .finalizing,
            timing: timingSnapshot,
            startingPlayerIDs: active.startingPlayerIDs,
            players: active.players,
            events: [],
            pendingAssist: nil,
            scheduledMatchID: nil,
            scheduledMatchDate: nil,
            opponentName: nil,
            isHome: nil,
            continuousTimeNanoseconds: active.continuousTimeNanoseconds,
            finalRecord: record
        )
        precondition((try? snapshot.validate()) != nil)
        return snapshot
    }

    static func replacing(
        _ snapshot: LiveMatchSessionSnapshot,
        events: [GoalEvent],
        pendingAssist: LiveMatchPendingAssistSnapshot
    ) -> LiveMatchSessionSnapshot {
        LiveMatchSessionSnapshot(
            schemaVersion: snapshot.schemaVersion,
            sessionID: snapshot.sessionID,
            status: snapshot.status,
            timing: snapshot.timing,
            startingPlayerIDs: snapshot.startingPlayerIDs,
            players: snapshot.players,
            events: events,
            pendingAssist: pendingAssist,
            scheduledMatchID: snapshot.scheduledMatchID,
            scheduledMatchDate: snapshot.scheduledMatchDate,
            opponentName: snapshot.opponentName,
            isHome: snapshot.isHome,
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds,
            finalRecord: snapshot.finalRecord
        )
    }

    static func replacing(_ snapshot: LiveMatchSessionSnapshot, schemaVersion: Int) -> LiveMatchSessionSnapshot {
        LiveMatchSessionSnapshot(
            schemaVersion: schemaVersion,
            sessionID: snapshot.sessionID,
            status: snapshot.status,
            timing: snapshot.timing,
            startingPlayerIDs: snapshot.startingPlayerIDs,
            players: snapshot.players,
            events: snapshot.events,
            pendingAssist: snapshot.pendingAssist,
            scheduledMatchID: snapshot.scheduledMatchID,
            scheduledMatchDate: snapshot.scheduledMatchDate,
            opponentName: snapshot.opponentName,
            isHome: snapshot.isHome,
            continuousTimeNanoseconds: snapshot.continuousTimeNanoseconds,
            finalRecord: snapshot.finalRecord
        )
    }

    static func id(_ number: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", number))!
    }
}

@MainActor
private final class SyntheticMatchClock: MatchTimingClock {
    private(set) var instantNanoseconds: Int64 = 0
    func nowNanoseconds() -> Int64 { instantNanoseconds }
    func advance(seconds: Int64) { instantNanoseconds += seconds * 1_000_000_000 }
}
