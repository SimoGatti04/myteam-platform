import XCTest
@testable import APP

final class LiveMatchCorrectionEngineTests: XCTestCase {
    private let playerID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private let assistID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!

    func testAddEditDeleteAndUndoEventCorrectionPreservesStableIDs() throws {
        let existing = GoalEvent(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000001")!,
            team: .ours,
            matchSecond: 15,
            scorerID: playerID,
            scorerName: "Synthetic One"
        )
        let metadata = LiveMatchCorrectionMetadata()
        let recordedAt = Date(timeIntervalSince1970: 1_800_000_000)

        let editedEvent = GoalEvent(
            id: existing.id,
            team: .ours,
            matchSecond: 20,
            scorerID: assistID,
            scorerName: "Synthetic Two",
            assistID: playerID,
            assistName: "Synthetic One"
        )
        let edited = try LiveMatchEventCorrectionEngine.apply(
            editedEvent,
            replacing: existing.id,
            to: [existing],
            pendingAssist: nil,
            metadata: metadata,
            maximumSecond: 60,
            recordedAt: recordedAt
        )
        XCTAssertEqual(edited.events, [editedEvent])
        XCTAssertEqual(edited.events.first?.id, existing.id)
        XCTAssertEqual(edited.metadata.lastEventUndo?.previousEvents, [existing])
        XCTAssertEqual(edited.metadata.lastEventUndo?.recordedAt, recordedAt)

        let undone = try LiveMatchEventCorrectionEngine.undo(
            events: edited.events,
            pendingAssist: edited.pendingAssist,
            metadata: edited.metadata,
            maximumSecond: 60
        )
        XCTAssertEqual(undone.events, [existing])
        XCTAssertNil(undone.metadata.lastEventUndo)

        let addedEvent = GoalEvent(team: .opponent, matchSecond: 30)
        let added = try LiveMatchEventCorrectionEngine.apply(
            addedEvent,
            replacing: nil,
            to: [existing],
            pendingAssist: nil,
            metadata: metadata,
            maximumSecond: 60,
            recordedAt: recordedAt
        )
        XCTAssertEqual(added.events, [existing, addedEvent])

        let deleted = try LiveMatchEventCorrectionEngine.apply(
            nil,
            replacing: existing.id,
            to: [existing, addedEvent],
            pendingAssist: nil,
            metadata: metadata,
            maximumSecond: 60,
            recordedAt: recordedAt
        )
        XCTAssertEqual(deleted.events, [addedEvent])
    }

    func testPendingAssistTracksEditedScorerAndClearsWhenGoalNoLongerSupportsAssist() throws {
        let goal = GoalEvent(
            team: .ours,
            matchSecond: 15,
            scorerID: playerID,
            scorerName: "Synthetic One"
        )
        let pending = LiveMatchPendingAssistSnapshot(
            goalEventID: goal.id,
            scorerID: playerID,
            scorerName: "Synthetic One"
        )
        let changedScorer = GoalEvent(
            id: goal.id,
            team: .ours,
            matchSecond: 16,
            scorerID: assistID,
            scorerName: "Synthetic Two"
        )

        let updated = try LiveMatchEventCorrectionEngine.apply(
            changedScorer,
            replacing: goal.id,
            to: [goal],
            pendingAssist: pending,
            metadata: LiveMatchCorrectionMetadata(),
            maximumSecond: 60
        )
        XCTAssertEqual(updated.pendingAssist?.scorerID, assistID)
        XCTAssertEqual(updated.pendingAssist?.scorerName, "Synthetic Two")

        let goalWithAssist = GoalEvent(
            id: goal.id,
            team: .ours,
            matchSecond: 16,
            scorerID: assistID,
            scorerName: "Synthetic Two",
            assistID: playerID,
            assistName: "Synthetic One"
        )
        let completed = try LiveMatchEventCorrectionEngine.apply(
            goalWithAssist,
            replacing: goal.id,
            to: [changedScorer],
            pendingAssist: updated.pendingAssist,
            metadata: updated.metadata,
            maximumSecond: 60
        )
        XCTAssertNil(completed.pendingAssist)
    }

    func testEventCorrectionRejectsFutureTimeIdentityChangeAndDuplicateID() throws {
        let original = GoalEvent(team: .ours, matchSecond: 12, scorerID: playerID, scorerName: "Synthetic One")
        let metadata = LiveMatchCorrectionMetadata()
        XCTAssertThrowsError(try LiveMatchEventCorrectionEngine.apply(
            GoalEvent(id: original.id, team: .ours, matchSecond: 61),
            replacing: original.id,
            to: [original], pendingAssist: nil, metadata: metadata, maximumSecond: 60
        )) { XCTAssertEqual($0 as? LiveMatchEventCorrectionError, .eventOutsideCurrentMatchTime) }
        XCTAssertThrowsError(try LiveMatchEventCorrectionEngine.apply(
            GoalEvent(team: .ours, matchSecond: 15),
            replacing: original.id,
            to: [original], pendingAssist: nil, metadata: metadata, maximumSecond: 60
        )) { XCTAssertEqual($0 as? LiveMatchEventCorrectionError, .eventIdentityChanged) }
        XCTAssertThrowsError(try LiveMatchEventCorrectionEngine.apply(
            original,
            replacing: nil,
            to: [original], pendingAssist: nil, metadata: metadata, maximumSecond: 60
        )) { XCTAssertEqual($0 as? LiveMatchEventCorrectionError, .duplicateEventID) }
    }

    func testUndoRestoresEventsAndPendingAssistAfterSerialization() throws {
        let goal = GoalEvent(team: .ours, matchSecond: 25, scorerID: playerID, scorerName: "Synthetic One")
        let pending = LiveMatchPendingAssistSnapshot(
            goalEventID: goal.id,
            scorerID: playerID,
            scorerName: "Synthetic One"
        )
        let corrected = try LiveMatchEventCorrectionEngine.apply(
            nil,
            replacing: goal.id,
            to: [goal],
            pendingAssist: pending,
            metadata: LiveMatchCorrectionMetadata(),
            maximumSecond: 30
        )
        let encoded = try JSONEncoder().encode(corrected.metadata)
        let decoded = try JSONDecoder().decode(LiveMatchCorrectionMetadata.self, from: encoded)
        let restored = try LiveMatchEventCorrectionEngine.undo(
            events: corrected.events,
            pendingAssist: corrected.pendingAssist,
            metadata: decoded,
            maximumSecond: 30
        )
        XCTAssertEqual(restored.events, [goal])
        XCTAssertEqual(restored.pendingAssist, pending)
    }
}
