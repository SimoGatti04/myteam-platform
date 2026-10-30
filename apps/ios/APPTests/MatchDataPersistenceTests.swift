import Foundation
import SwiftData
import XCTest
@testable import APP

@MainActor
final class MatchDataPersistenceTests: XCTestCase {

    func testEmptyStoreBootstrapsAsEmptyAndWritesDurableReceipt() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }

        let first = try environment.store.bootstrap()
        XCTAssertTrue(first.roster.isEmpty)
        XCTAssertTrue(first.schedule.isEmpty)
        XCTAssertTrue(first.history.isEmpty)
        XCTAssertEqual(try receiptCount(in: environment.container), 1)

        let second = try environment.store.bootstrap()
        XCTAssertTrue(second.roster.isEmpty)
        XCTAssertTrue(second.schedule.isEmpty)
        XCTAssertTrue(second.history.isEmpty)
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: environment.container), 0)
        XCTAssertEqual(try fetchCount(StoredScheduledMatch.self, in: environment.container), 0)
        XCTAssertEqual(try fetchCount(StoredMatchRecord.self, in: environment.container), 0)
    }

    func testMigratesAllThreeLegacyCollectionsPreservingIdentityOrderAndFields() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }

        let legacyRoster = try JSONDecoder().decode(RosterPlayer.self, from: DomainCharacterizationFixtures.legacyRosterPlayer)
        let secondRoster = try JSONDecoder().decode(RosterPlayer.self, from: DomainCharacterizationFixtures.rosterPlayer)
        let scheduleOne = try JSONDecoder().decode(ScheduledMatch.self, from: DomainCharacterizationFixtures.scheduledMatch)
        let scheduleTwo = try JSONDecoder().decode(ScheduledMatch.self, from: DomainCharacterizationFixtures.scheduledMatchWithoutOptionalFields)
        let legacyRecord = try JSONDecoder().decode(MatchRecord.self, from: DomainCharacterizationFixtures.legacyMatchRecord)
        let fullRecord = makeFullMatchRecord()

        let rosterBytes = try JSONEncoder().encode([legacyRoster, secondRoster])
        let scheduleBytes = try JSONEncoder().encode([scheduleOne, scheduleTwo])
        let historyBytes = try JSONEncoder().encode([legacyRecord, fullRecord])
        environment.defaults.set(rosterBytes, forKey: LegacyMatchDataKeys.roster)
        environment.defaults.set(scheduleBytes, forKey: LegacyMatchDataKeys.schedule)
        environment.defaults.set(historyBytes, forKey: LegacyMatchDataKeys.history)

        let migrated = try environment.store.bootstrap()

        XCTAssertEqual(migrated.roster.map(\.id), [legacyRoster.id, secondRoster.id])
        XCTAssertEqual(migrated.roster, [legacyRoster, secondRoster])
        XCTAssertEqual(migrated.schedule.map(\.id), [scheduleTwo.id, scheduleOne.id]) // Existing app sorts by date.
        XCTAssertEqual(migrated.schedule.first(where: { $0.id == scheduleOne.id }), scheduleOne)
        XCTAssertEqual(migrated.schedule.first(where: { $0.id == scheduleTwo.id }), scheduleTwo)

        let migratedLegacy = try XCTUnwrap(migrated.history.first(where: { $0.id == legacyRecord.id }))
        XCTAssertNil(migratedLegacy.ourScore)
        XCTAssertNil(migratedLegacy.opponentScore)
        XCTAssertNil(migratedLegacy.events)
        XCTAssertNil(migratedLegacy.scheduledMatchID)
        XCTAssertEqual(migratedLegacy.players.first?.id, legacyRecord.players.first?.id)

        let migratedFull = try XCTUnwrap(migrated.history.first(where: { $0.id == fullRecord.id }))
        XCTAssertEqual(migratedFull.scheduledMatchID, fullRecord.scheduledMatchID)
        XCTAssertEqual(migratedFull.players.first?.rosterPlayerID, fullRecord.players.first?.rosterPlayerID)
        XCTAssertEqual(migratedFull.events?.first?.id, fullRecord.events?.first?.id)
        XCTAssertEqual(migratedFull.events?.first?.assistName, "Player Two")

        // Legacy keys remain byte-for-byte available as recovery material.
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.roster), rosterBytes)
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.schedule), scheduleBytes)
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.history), historyBytes)
        XCTAssertEqual(try receiptCount(in: environment.container), 1)
    }

    func testLegacyDefaultsAbsentAndMalformedAreNotTreatedAsSameState() throws {
        let absentEnvironment = try makeEnvironment()
        defer { absentEnvironment.cleanup() }
        XCTAssertNoThrow(try absentEnvironment.store.bootstrap())

        let malformedEnvironment = try makeEnvironment()
        defer { malformedEnvironment.cleanup() }
        let corrupt = Data("{not-json".utf8)
        malformedEnvironment.defaults.set(corrupt, forKey: LegacyMatchDataKeys.roster)

        XCTAssertThrowsError(try malformedEnvironment.store.bootstrap())
        XCTAssertEqual(malformedEnvironment.defaults.data(forKey: LegacyMatchDataKeys.roster), corrupt)
        XCTAssertEqual(try receiptCount(in: malformedEnvironment.container), 0)
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: malformedEnvironment.container), 0)
    }

    func testPresentLegacyValueOfWrongTypeFailsWithoutOverwritingIt() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        environment.defaults.set("not encoded Data", forKey: LegacyMatchDataKeys.history)

        XCTAssertThrowsError(try environment.store.bootstrap())
        XCTAssertEqual(environment.defaults.string(forKey: LegacyMatchDataKeys.history), "not encoded Data")
        XCTAssertEqual(try receiptCount(in: environment.container), 0)
    }

    func testDuplicateLegacyIDsFailBeforeAnyImportWrite() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let duplicate = RosterPlayer(id: fixedID(1), name: "Synthetic")
        environment.defaults.set(try JSONEncoder().encode([duplicate, duplicate]), forKey: LegacyMatchDataKeys.roster)
        environment.defaults.set(try JSONEncoder().encode([makeFullMatchRecord()]), forKey: LegacyMatchDataKeys.history)

        XCTAssertThrowsError(try environment.store.bootstrap())
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: environment.container), 0)
        XCTAssertEqual(try fetchCount(StoredMatchRecord.self, in: environment.container), 0)
        XCTAssertEqual(try receiptCount(in: environment.container), 0)
    }


    func testResumesWhenLegacyRowsWereSavedButCompletionReceiptWasNot() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let player = RosterPlayer(id: fixedID(93), name: "Already Imported")
        environment.defaults.set(try JSONEncoder().encode([player]), forKey: LegacyMatchDataKeys.roster)

        // This represents a process interruption after the import transaction
        // committed but before the durable completion receipt was written.
        let interruptedContext = environment.container.mainContext
        interruptedContext.insert(StoredRosterPlayer(player, position: 0))
        try interruptedContext.save()
        XCTAssertEqual(try receiptCount(in: environment.container), 0)

        let recovered = try environment.store.bootstrap()
        XCTAssertEqual(recovered.roster, [player])
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: environment.container), 1)
        XCTAssertEqual(try receiptCount(in: environment.container), 1)
    }

    func testRepeatedMigrationIsIdempotentAndKeepsOriginalSourceKeys() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let player = RosterPlayer(id: fixedID(20), name: "Synthetic Player", active: false, isGoalkeeper: true)
        let original = try JSONEncoder().encode([player])
        environment.defaults.set(original, forKey: LegacyMatchDataKeys.roster)

        _ = try environment.store.bootstrap()
        _ = try environment.store.bootstrap()

        let result = try environment.store.loadSnapshot()
        XCTAssertEqual(result.roster, [player])
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: environment.container), 1)
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.roster), original)
        XCTAssertEqual(try receiptCount(in: environment.container), 1)
    }

    func testInterruptedReadOnlyMigrationCanResumeWithoutDuplicates() throws {
        let environment = try makeEnvironment(persistent: true, allowsSave: true)
        defer { environment.cleanup() }
        let player = RosterPlayer(id: fixedID(30), name: "Retry Player")
        let sourceData = try JSONEncoder().encode([player])
        environment.defaults.set(sourceData, forKey: LegacyMatchDataKeys.roster)

        // Reopen an initialized empty persistent store as read-only so the
        // migration's transaction fails without making a receipt.
        environment.releaseContainer()
        let readOnly = try MatchDataStore.makeContainer(at: environment.storeURL, allowsSave: false)
        environment.retain(container: readOnly)
        XCTAssertThrowsError(try environment.store.bootstrap())
        XCTAssertEqual(try receiptCount(in: environment.container), 0)
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.roster), sourceData)

        environment.releaseContainer()
        let writable = try MatchDataStore.makeContainer(at: environment.storeURL, allowsSave: true)
        environment.retain(container: writable)
        let retryStore = MatchDataStore(container: writable, userDefaults: environment.defaults)
        let result = try retryStore.bootstrap()
        XCTAssertEqual(result.roster, [player])
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: writable), 1)
        XCTAssertEqual(try receiptCount(in: writable), 1)
    }

    func testPersistentContainerReopensWithNoLossOrDuplicates() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        let roster = [
            RosterPlayer(id: fixedID(40), name: "First", active: true, isGoalkeeper: true),
            RosterPlayer(id: fixedID(41), name: "Second", active: false)
        ]
        let schedule = [makeSchedule(id: fixedID(42), date: 400), makeSchedule(id: fixedID(43), date: 300)]
        let history = [makeFullMatchRecord()]

        _ = try environment.store.bootstrap()
        try environment.store.replaceRoster(roster)
        try environment.store.replaceSchedule(schedule)
        try environment.store.replaceHistory(history)
        environment.releaseContainer()

        let reopened = try MatchDataStore.makeContainer(at: environment.storeURL)
        environment.retain(container: reopened)
        let reopenedStore = MatchDataStore(container: reopened, userDefaults: environment.defaults)
        let result = try reopenedStore.bootstrap()

        XCTAssertEqual(result.roster, roster)
        XCTAssertEqual(result.schedule.map(\.id), [fixedID(43), fixedID(42)])
        XCTAssertEqual(result.history.map(\.id), [history[0].id])
        XCTAssertEqual(result.history[0].events?.count, 1)
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: reopened), 2)
        XCTAssertEqual(try fetchCount(StoredScheduledMatch.self, in: reopened), 2)
        XCTAssertEqual(try fetchCount(StoredMatchRecord.self, in: reopened), 1)
    }

    func testHistoryRoundTripsOptionalFieldsParticipantsAndGoalAssistEvents() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        _ = try environment.store.bootstrap()
        let legacy = try JSONDecoder().decode(MatchRecord.self, from: DomainCharacterizationFixtures.legacyMatchRecord)
        let full = makeFullMatchRecord()
        let emptyEvents = makeFullMatchRecord(id: fixedID(50), events: [])
        var eventWithoutPlayerMetadata = makeFullMatchRecord(id: fixedID(51))
        eventWithoutPlayerMetadata.events = [try JSONDecoder().decode(
            GoalEvent.self,
            from: DomainCharacterizationFixtures.goalEventWithoutPlayerMetadata
        )]
        try environment.store.replaceHistory([legacy, full, emptyEvents, eventWithoutPlayerMetadata])

        let records = try environment.store.loadSnapshot().history
        XCTAssertEqual(records.map(\.id), [legacy.id, full.id, emptyEvents.id, eventWithoutPlayerMetadata.id])
        XCTAssertNil(records[0].ourScore)
        XCTAssertNil(records[0].opponentScore)
        XCTAssertNil(records[0].events)
        XCTAssertEqual(records[1].ourScore, 2)
        XCTAssertEqual(records[1].opponentScore, 1)
        XCTAssertEqual(records[1].players[0].id, full.players[0].id)
        XCTAssertEqual(records[1].players[0].rosterPlayerID, full.players[0].rosterPlayerID)
        XCTAssertEqual(records[1].events?.first?.scorerID, full.events?.first?.scorerID)
        XCTAssertEqual(records[1].events?.first?.assistID, full.events?.first?.assistID)
        XCTAssertNotNil(records[2].events)
        XCTAssertTrue(records[2].events?.isEmpty == true)
        XCTAssertNil(records[3].events?.first?.scorerID)
        XCTAssertNil(records[3].events?.first?.assistID)
        XCTAssertEqual(records[3].events?.first?.id, UUID(uuidString: "00000000-0000-0000-0000-000000000007"))
    }

    func testRosterAndCalendarDeletionDoNotDeleteHistoricalSnapshotsOrReferences() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        _ = try environment.store.bootstrap()
        let playerID = fixedID(60)
        let scheduledID = fixedID(61)
        let record = makeFullMatchRecord(rosterPlayerID: playerID, scheduledMatchID: scheduledID)
        try environment.store.replaceRoster([RosterPlayer(id: playerID, name: "Retired Snapshot Player")])
        try environment.store.replaceSchedule([makeSchedule(id: scheduledID, date: 600)])
        try environment.store.replaceHistory([record])

        try environment.store.replaceRoster([])
        try environment.store.replaceSchedule([])

        let remaining = try XCTUnwrap(environment.store.loadSnapshot().history.first)
        XCTAssertEqual(remaining.players.first?.playerName, record.players.first?.playerName)
        XCTAssertEqual(remaining.players.first?.rosterPlayerID, playerID)
        XCTAssertEqual(remaining.scheduledMatchID, scheduledID)
        XCTAssertTrue(try environment.store.loadSnapshot().roster.isEmpty)
        XCTAssertTrue(try environment.store.loadSnapshot().schedule.isEmpty)
    }

    func testCRUDAfterMigrationUpdatesAndDeletesWithoutDuplicateRows() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let original = RosterPlayer(id: fixedID(70), name: "Original")
        environment.defaults.set(try JSONEncoder().encode([original]), forKey: LegacyMatchDataKeys.roster)
        _ = try environment.store.bootstrap()

        let updated = RosterPlayer(id: original.id, name: "Updated", active: false, isGoalkeeper: true)
        try environment.store.replaceRoster([updated])
        try environment.store.replaceSchedule([makeSchedule(id: fixedID(71), date: 700)])
        try environment.store.replaceHistory([makeFullMatchRecord(id: fixedID(72))])

        var result = try environment.store.loadSnapshot()
        XCTAssertEqual(result.roster, [updated])
        XCTAssertEqual(result.schedule.count, 1)
        XCTAssertEqual(result.history.count, 1)
        XCTAssertEqual(try fetchCount(StoredRosterPlayer.self, in: environment.container), 1)

        try environment.store.replaceRoster([])
        try environment.store.replaceSchedule([])
        try environment.store.replaceHistory([])
        result = try environment.store.loadSnapshot()
        XCTAssertTrue(result.roster.isEmpty)
        XCTAssertTrue(result.schedule.isEmpty)
        XCTAssertTrue(result.history.isEmpty)
    }


    func testVersionTwoStoreMigratesToVersionThreeWithoutLosingMatchData() throws {
        let environment = try makeEnvironment(persistent: true, openImmediately: false)
        defer { environment.cleanup() }

        let roster = [RosterPlayer(id: fixedID(301), name: "Fixture Keeper", isGoalkeeper: true)]
        let schedule = [makeSchedule(id: fixedID(302), date: 1_800_000_000)]
        let history = [makeFullMatchRecord(id: fixedID(303), rosterPlayerID: fixedID(301), scheduledMatchID: fixedID(302))]
        try seedVersionTwoStore(at: environment.storeURL, roster: roster, schedule: schedule, history: history)

        let migratedContainer = try MatchDataStore.makeContainer(at: environment.storeURL)
        environment.retain(container: migratedContainer)
        let migrated = try environment.store.loadSnapshot()

        XCTAssertEqual(migrated.roster, roster)
        XCTAssertEqual(migrated.schedule, schedule)
        XCTAssertEqual(migrated.history, history)

        var correctedRecord = try XCTUnwrap(migrated.history.first)
        correctedRecord.correctionMetadata = MatchCorrectionMetadata(
            historicalAttendance: MatchHistoricalAttendance(
                periodDurationNanoseconds: 20 * 60 * 1_000_000_000,
                firstHalfEndNanoseconds: 20 * 60 * 1_000_000_000,
                secondHalfEndNanoseconds: 7 * 60 * 1_000_000_000
            )
        )
        try environment.store.updateHistoryRecord(correctedRecord)
        XCTAssertEqual(try environment.store.loadSnapshot().history, [correctedRecord])
    }

    func testHistoryCorrectionPreviewPersistsMetadataAndSupportsUndo() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        _ = try environment.store.bootstrap()
        let original = makeFullMatchRecord()
        try environment.store.replaceHistory([original])

        var proposed = original
        proposed.players[0].secondsPlayed = 1_100
        var event = try XCTUnwrap(proposed.events?.first)
        event.matchSecond = 500
        proposed.events = [event]
        let preview = try MatchRecordCorrectionEngine.preview(from: original, proposing: proposed)
        XCTAssertEqual(preview.affectedPlayerIDs, [original.players[0].id])
        XCTAssertEqual(preview.affectedEventIDs, [event.id])
        XCTAssertEqual(preview.previousScore.ours, 2)
        let confirmed = try MatchRecordCorrectionEngine.confirmedRecord(from: preview)
        XCTAssertEqual(confirmed.events?.first?.id, original.events?.first?.id)
        XCTAssertEqual(confirmed.correctionMetadata?.lastUndo?.scope, .historyRecord)

        try environment.store.updateHistoryRecord(confirmed)
        let persisted = try XCTUnwrap(environment.store.loadSnapshot().history.first)
        XCTAssertTrue(environment.store.recordsAreEquivalent(persisted, confirmed))
        XCTAssertEqual(persisted.correctionMetadata?.lastUndo?.previousStatePayload, confirmed.correctionMetadata?.lastUndo?.previousStatePayload)

        let restored = try MatchRecordCorrectionEngine.undo(persisted)
        try environment.store.updateHistoryRecord(restored)
        let afterUndo = try XCTUnwrap(environment.store.loadSnapshot().history.first)
        XCTAssertTrue(environment.store.recordsAreEquivalent(afterUndo, original))
    }

    func testHistoryDurationCorrectionRecalculatesTrustedAttendanceAndPreservesManualOffset() throws {
        let playerID = fixedID(91)
        var record = makeFullMatchRecord(rosterPlayerID: playerID)
        record.duration = 100
        record.players[0].secondsPlayed = 100
        record.events = []
        record.ourScore = 0
        record.opponentScore = 0
        record.players[0].goals = 0
        record.players[0].assists = 0

        var timeline = try MatchParticipationTimelineSnapshot.complete(
            participants: [MatchTimingParticipantSnapshot(id: playerID, accumulatedNanoseconds: 0, inField: true)],
            starters: [playerID]
        )
        _ = try timeline.record(
            playerID: playerID,
            period: .firstHalf,
            elapsedNanoseconds: 0,
            transition: .leftField,
            origin: .manualCorrection
        )
        _ = try timeline.record(
            playerID: playerID,
            period: .firstHalf,
            elapsedNanoseconds: 10_000_000_000,
            transition: .enteredField,
            origin: .manualCorrection
        )
        record.correctionMetadata = MatchCorrectionMetadata(
            participationTimeline: timeline,
            minuteAdjustments: [MatchTimingMinuteAdjustment(playerID: playerID, adjustmentNanoseconds: 10_000_000_000)],
            historicalAttendance: MatchHistoricalAttendance(
                periodDurationNanoseconds: 1_200_000_000_000,
                firstHalfEndNanoseconds: 100_000_000_000,
                secondHalfEndNanoseconds: 0
            )
        )

        var proposed = record
        proposed.duration = 80
        let preview = try MatchRecordCorrectionEngine.preview(from: record, proposing: proposed)
        XCTAssertEqual(preview.proposed.players[0].secondsPlayed, 80)
        XCTAssertEqual(preview.automaticallyRecalculatedPlayerIDs, [playerID])
        XCTAssertEqual(preview.proposed.correctionMetadata?.minuteAdjustments.first?.adjustmentNanoseconds, 10_000_000_000)
        XCTAssertEqual(preview.proposed.correctionMetadata?.historicalAttendance?.firstHalfEndNanoseconds, 80_000_000_000)
    }

    func testHistoryEventCorrectionRecomputesScoreAndNameBasedLegacyStatisticsPreservingEventID() throws {
        let playerID = fixedID(92)
        var record = makeFullMatchRecord(rosterPlayerID: playerID)
        let eventID = fixedID(93)
        record.events = [GoalEvent(
            id: eventID,
            team: .ours,
            matchSecond: 420,
            scorerName: "Player One"
        )]
        record.duration = 2_400
        record.ourScore = 1
        record.opponentScore = 0
        record.players[0].goals = 1
        record.players[0].assists = 0

        var proposed = record
        var event = try XCTUnwrap(proposed.events?.first)
        event.matchSecond = 300
        proposed.events = [event]
        let preview = try MatchRecordCorrectionEngine.preview(from: record, proposing: proposed)
        XCTAssertEqual(preview.proposed.events?.first?.id, eventID)
        XCTAssertEqual(preview.proposed.ourScore, 1)
        XCTAssertEqual(preview.proposed.opponentScore, 0)
        XCTAssertEqual(preview.proposed.players[0].goals, 1)

        event.team = .opponent
        event.scorerName = nil
        proposed.events = [event]
        let movedToOpponent = try MatchRecordCorrectionEngine.preview(from: record, proposing: proposed)
        XCTAssertEqual(movedToOpponent.proposed.events?.first?.id, eventID)
        XCTAssertEqual(movedToOpponent.proposed.ourScore, 0)
        XCTAssertEqual(movedToOpponent.proposed.opponentScore, 1)
        XCTAssertEqual(movedToOpponent.proposed.players[0].goals, 0)
    }

    func testHistoryCorrectionRejectsInvalidEventAndPlayerTimes() throws {
        let original = makeFullMatchRecord()
        var invalidPlayer = original
        invalidPlayer.players[0].secondsPlayed = original.duration + 1
        XCTAssertThrowsError(try MatchRecordCorrectionEngine.preview(from: original, proposing: invalidPlayer))

        var invalidEvent = original
        var event = try XCTUnwrap(invalidEvent.events?.first)
        event.matchSecond = original.duration + 1
        invalidEvent.events = [event]
        XCTAssertThrowsError(try MatchRecordCorrectionEngine.preview(from: original, proposing: invalidEvent))
    }

    func testMigrationConflictDoesNotOverwriteExistingData() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        let existing = RosterPlayer(id: fixedID(90), name: "Stored Version")
        environment.container.mainContext.insert(StoredRosterPlayer(existing, position: 0))
        try environment.container.mainContext.save()
        let legacy = RosterPlayer(id: existing.id, name: "Different Legacy Version")
        let original = try JSONEncoder().encode([legacy])
        environment.defaults.set(original, forKey: LegacyMatchDataKeys.roster)

        XCTAssertThrowsError(try environment.store.bootstrap())
        XCTAssertEqual(try environment.store.loadSnapshot().roster, [existing])
        XCTAssertEqual(environment.defaults.data(forKey: LegacyMatchDataKeys.roster), original)
        XCTAssertEqual(try receiptCount(in: environment.container), 0)
    }

    func testHistoryUpdateAndCascadeDeletionKeepChildRowsConsistent() throws {
        let environment = try makeEnvironment()
        defer { environment.cleanup() }
        _ = try environment.store.bootstrap()
        let initial = makeFullMatchRecord()
        try environment.store.replaceHistory([initial])
        XCTAssertEqual(try fetchCount(StoredMatchParticipant.self, in: environment.container), 1)
        XCTAssertEqual(try fetchCount(StoredGoalEvent.self, in: environment.container), 1)

        let originalParticipant = try XCTUnwrap(initial.players.first)
        let updatedParticipant = PlayerMatchSummary(
            id: originalParticipant.id,
            rosterPlayerID: originalParticipant.rosterPlayerID,
            playerName: "Corrected Snapshot Name",
            secondsPlayed: 1_500,
            goals: 2,
            assists: 0
        )
        let updatedEvent = GoalEvent(
            id: try XCTUnwrap(initial.events?.first?.id),
            team: .opponent,
            matchSecond: 600,
            scorerID: fixedID(91),
            scorerName: "Opponent Player"
        )
        let corrected = MatchRecord(
            id: initial.id,
            date: initial.date,
            duration: initial.duration,
            players: [updatedParticipant],
            ourScore: 2,
            opponentScore: 2,
            events: [updatedEvent],
            scheduledMatchID: initial.scheduledMatchID,
            opponentName: initial.opponentName,
            isHome: initial.isHome
        )
        try environment.store.replaceHistory([corrected])

        let loaded = try XCTUnwrap(environment.store.loadSnapshot().history.first)
        XCTAssertEqual(loaded.players.first?.playerName, "Corrected Snapshot Name")
        XCTAssertEqual(loaded.players.first?.secondsPlayed, 1_500)
        XCTAssertEqual(loaded.events?.first?.team.rawValue, GoalTeam.opponent.rawValue)
        XCTAssertEqual(loaded.events?.first?.matchSecond, 600)
        XCTAssertEqual(try fetchCount(StoredMatchParticipant.self, in: environment.container), 1)
        XCTAssertEqual(try fetchCount(StoredGoalEvent.self, in: environment.container), 1)

        try environment.store.replaceHistory([])
        XCTAssertEqual(try fetchCount(StoredMatchRecord.self, in: environment.container), 0)
        XCTAssertEqual(try fetchCount(StoredMatchParticipant.self, in: environment.container), 0)
        XCTAssertEqual(try fetchCount(StoredGoalEvent.self, in: environment.container), 0)
    }

    func testFailedPersistentCRUDWriteDoesNotReplacePreviousSnapshot() throws {
        let environment = try makeEnvironment(persistent: true)
        defer { environment.cleanup() }
        _ = try environment.store.bootstrap()
        let original = RosterPlayer(id: fixedID(92), name: "Still Stored")
        try environment.store.replaceRoster([original])
        environment.releaseContainer()

        let readOnly = try MatchDataStore.makeContainer(at: environment.storeURL, allowsSave: false)
        environment.retain(container: readOnly)
        XCTAssertThrowsError(try environment.store.replaceRoster([
            RosterPlayer(id: original.id, name: "Must Not Replace")
        ]))

        environment.releaseContainer()
        let reopened = try MatchDataStore.makeContainer(at: environment.storeURL)
        environment.retain(container: reopened)
        XCTAssertEqual(try environment.store.loadSnapshot().roster, [original])
    }

    func testInvalidPersistentStoreFailsToOpenInsteadOfCreatingReplacement() throws {
        let environment = try makeEnvironment(persistent: true, openImmediately: false)
        defer { environment.cleanup() }
        try FileManager.default.createDirectory(at: environment.storeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not a SwiftData store".utf8).write(to: environment.storeURL)

        XCTAssertThrowsError(try MatchDataStore.makeContainer(at: environment.storeURL))
        XCTAssertEqual(try Data(contentsOf: environment.storeURL), Data("not a SwiftData store".utf8))
    }

    private func makeEnvironment(
        persistent: Bool = false,
        allowsSave: Bool = true,
        openImmediately: Bool = true
    ) throws -> TestEnvironment {
        let suite = "AURINFORMATC-C3-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let storeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("AURINFORMATC-C3-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("MatchData.store")
        var container: ModelContainer?
        if openImmediately {
            if persistent {
                try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                container = try MatchDataStore.makeContainer(at: storeURL, allowsSave: allowsSave)
            } else {
                container = try MatchDataStore.makeInMemoryContainer()
            }
        }
        return TestEnvironment(suite: suite, defaults: defaults, storeURL: storeURL, container: container)
    }

    private func seedVersionTwoStore(
        at storeURL: URL,
        roster: [RosterPlayer],
        schedule: [ScheduledMatch],
        history: [MatchRecord]
    ) throws {
        try FileManager.default.createDirectory(
            at: storeURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let schema = Schema(versionedSchema: MatchManagerSchemaV2.self)
        let configuration = ModelConfiguration(
            "AURINFORMATC-V2-Migration-Fixture",
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .none
        )
        let container = try ModelContainer(for: schema, configurations: [configuration])
        let context = ModelContext(container)
        for (position, player) in roster.enumerated() {
            context.insert(StoredRosterPlayer(player, position: position))
        }
        for (position, match) in schedule.enumerated() {
            context.insert(StoredScheduledMatch(match, position: position))
        }
        for (position, record) in history.enumerated() {
            context.insert(StoredMatchRecord(record, position: position))
        }
        try context.save()
    }

    private func receiptCount(in container: ModelContainer) throws -> Int {
        try ModelContext(container).fetch(FetchDescriptor<StoredLegacyImportReceipt>()).count
    }

    private func fetchCount<T: PersistentModel>(_ type: T.Type, in container: ModelContainer) throws -> Int {
        try ModelContext(container).fetch(FetchDescriptor<T>()).count
    }

    private func makeFullMatchRecord(
        id: UUID = UUID(uuidString: "00000000-0000-0000-0000-000000000080")!,
        rosterPlayerID: UUID = UUID(uuidString: "00000000-0000-0000-0000-000000000081")!,
        scheduledMatchID: UUID? = UUID(uuidString: "00000000-0000-0000-0000-000000000082")!,
        events: [GoalEvent]? = nil
    ) -> MatchRecord {
        let summary = PlayerMatchSummary(
            id: fixedID(id == fixedID(80) ? 83 : 84),
            rosterPlayerID: rosterPlayerID,
            playerName: "Player One",
            secondsPlayed: 1_320,
            goals: 1,
            assists: 1
        )
        let goalEvents = events ?? [
            GoalEvent(
                id: fixedID(id == fixedID(80) ? 85 : 86),
                team: .ours,
                matchSecond: 420,
                scorerID: rosterPlayerID,
                scorerName: "Player One",
                assistID: fixedID(87),
                assistName: "Player Two"
            )
        ]
        return MatchRecord(
            id: id,
            date: Date(timeIntervalSince1970: 1_234_567),
            duration: 2_700,
            players: [summary],
            ourScore: 2,
            opponentScore: 1,
            events: goalEvents,
            scheduledMatchID: scheduledMatchID,
            opponentName: "North FC",
            isHome: true
        )
    }

    private func makeSchedule(id: UUID, date: TimeInterval) -> ScheduledMatch {
        ScheduledMatch(
            id: id,
            round: "R-01",
            opponentName: "Synthetic FC",
            date: Date(timeIntervalSince1970: date),
            isHome: true,
            location: "Synthetic Arena",
            notes: "Fixture only"
        )
    }

    private func fixedID(_ suffix: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", suffix))!
    }

    @MainActor
    private final class TestEnvironment {
        let suite: String
        let defaults: UserDefaults
        let storeURL: URL
        private var storedContainer: ModelContainer?
        private var storedStore: MatchDataStore?

        var container: ModelContainer {
            guard let storedContainer else { fatalError("Test environment has no open container") }
            return storedContainer
        }

        var store: MatchDataStore {
            guard let storedStore else { fatalError("Test environment has no open store") }
            return storedStore
        }

        init(suite: String, defaults: UserDefaults, storeURL: URL, container: ModelContainer?) {
            self.suite = suite
            self.defaults = defaults
            self.storeURL = storeURL
            storedContainer = container
            storedStore = container.map { MatchDataStore(container: $0, userDefaults: defaults) }
        }

        func retain(container: ModelContainer) {
            storedContainer = container
            storedStore = MatchDataStore(container: container, userDefaults: defaults)
        }

        func releaseContainer() {
            storedStore = nil
            storedContainer = nil
        }

        func cleanup() {
            defaults.removePersistentDomain(forName: suite)
            if FileManager.default.fileExists(atPath: storeURL.deletingLastPathComponent().path) {
                try? FileManager.default.removeItem(at: storeURL.deletingLastPathComponent())
            }
        }
    }
}
