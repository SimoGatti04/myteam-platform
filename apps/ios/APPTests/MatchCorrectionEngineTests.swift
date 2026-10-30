import XCTest
@testable import APP

final class MatchCorrectionEngineTests: XCTestCase {
    private let ns: Int64 = 1_000_000_000

    func testClockAndSubstitutionCorrectionsRecalculateOnlyCoveredPlayers() throws {
        let fixture = try makeHistoricalRecord()

        var shorterMatch = fixture.record
        shorterMatch.duration = 1_000
        let preview = try MatchRecordCorrectionEngine.preview(from: fixture.record, proposing: shorterMatch)
        XCTAssertEqual(preview.proposed.players.first(where: { $0.rosterPlayerID == fixture.starters[0] })?.secondsPlayed, 600)
        XCTAssertEqual(preview.proposed.players.first(where: { $0.rosterPlayerID == fixture.bench[0] })?.secondsPlayed, 400)
        XCTAssertEqual(preview.proposed.players.first(where: { $0.rosterPlayerID == fixture.starters[1] })?.secondsPlayed, 1_000)
        XCTAssertEqual(Set(preview.automaticallyRecalculatedPlayerIDs), Set(fixture.starters.dropFirst() + fixture.bench))

        var changedSubstitution = fixture.record
        var metadata = try XCTUnwrap(changedSubstitution.correctionMetadata)
        var timeline = try XCTUnwrap(metadata.participationTimeline)
        let substitution = try XCTUnwrap(timeline.substitutions.first)
        try timeline.correctSubstitution(
            id: substitution.id,
            outgoingID: fixture.starters[0],
            incomingID: fixture.bench[0],
            elapsedNanoseconds: 800 * ns
        )
        metadata.participationTimeline = timeline
        changedSubstitution.correctionMetadata = metadata
        let substitutionPreview = try MatchRecordCorrectionEngine.preview(
            from: fixture.record,
            proposing: changedSubstitution
        )
        XCTAssertEqual(substitutionPreview.proposed.players.first(where: { $0.rosterPlayerID == fixture.starters[0] })?.secondsPlayed, 800)
        XCTAssertEqual(substitutionPreview.proposed.players.first(where: { $0.rosterPlayerID == fixture.bench[0] })?.secondsPlayed, 400)
    }

    func testClockCorrectionThatCutsThroughRecordedPresenceIsRejected() throws {
        let fixture = try makeHistoricalRecord()
        var proposed = fixture.record
        proposed.duration = 500
        XCTAssertThrowsError(try MatchRecordCorrectionEngine.preview(from: fixture.record, proposing: proposed))
    }

    func testManualMinuteCorrectionPersistsAcrossLaterClockRecalculationAndUndo() throws {
        let fixture = try makeHistoricalRecord()
        var manuallyAdjusted = fixture.record
        guard let playerIndex = manuallyAdjusted.players.firstIndex(where: { $0.rosterPlayerID == fixture.bench[0] }) else {
            return XCTFail("Expected synthetic substitute")
        }
        manuallyAdjusted.players[playerIndex].secondsPlayed = 700
        let minutePreview = try MatchRecordCorrectionEngine.preview(from: fixture.record, proposing: manuallyAdjusted)
        XCTAssertEqual(minutePreview.proposed.players[playerIndex].secondsPlayed, 700)
        XCTAssertEqual(minutePreview.proposed.correctionMetadata?.minuteAdjustments.first(where: { $0.playerID == fixture.bench[0] })?.adjustmentNanoseconds, 100 * ns)

        let confirmed = try MatchRecordCorrectionEngine.confirmedRecord(from: minutePreview)
        var durationEdit = confirmed
        durationEdit.duration = 1_000
        let durationPreview = try MatchRecordCorrectionEngine.preview(from: confirmed, proposing: durationEdit)
        XCTAssertEqual(durationPreview.proposed.players.first(where: { $0.rosterPlayerID == fixture.bench[0] })?.secondsPlayed, 500)
        XCTAssertTrue(durationPreview.preservedMinutePlayerIDs.isEmpty)

        let restored = try MatchRecordCorrectionEngine.undo(confirmed)
        XCTAssertEqual(restored, fixture.record)
    }

    func testEventInsertEditAndDeleteRecalculateScoreAndPlayerStatistics() throws {
        let fixture = try makeHistoricalRecord()
        let scorer = fixture.starters[1]
        let assist = fixture.starters[2]
        let firstEvent = GoalEvent(team: .ours, matchSecond: 90, scorerID: scorer, scorerName: "Synthetic Player 2")
        var proposed = fixture.record
        proposed.events = [firstEvent]
        let inserted = try MatchRecordCorrectionEngine.preview(from: fixture.record, proposing: proposed)
        XCTAssertEqual(inserted.proposed.ourScore, 1)
        XCTAssertEqual(inserted.proposed.players.first(where: { $0.rosterPlayerID == scorer })?.goals, 1)

        var edit = inserted.proposed
        let changed = GoalEvent(id: firstEvent.id, team: .ours, matchSecond: 100, scorerID: scorer, scorerName: "Synthetic Player 2", assistID: assist, assistName: "Synthetic Player 3")
        edit.events = [changed, GoalEvent(team: .opponent, matchSecond: 120)]
        let edited = try MatchRecordCorrectionEngine.preview(from: inserted.proposed, proposing: edit)
        XCTAssertEqual(edited.proposed.ourScore, 1)
        XCTAssertEqual(edited.proposed.opponentScore, 1)
        XCTAssertEqual(edited.proposed.events?.first?.id, firstEvent.id)
        XCTAssertEqual(edited.proposed.players.first(where: { $0.rosterPlayerID == assist })?.assists, 1)

        var delete = edited.proposed
        delete.events = []
        let deleted = try MatchRecordCorrectionEngine.preview(from: edited.proposed, proposing: delete)
        XCTAssertEqual(deleted.proposed.ourScore, 0)
        XCTAssertEqual(deleted.proposed.opponentScore, 0)
        XCTAssertTrue(deleted.proposed.players.allSatisfy { $0.goals == 0 && $0.assists == 0 })
    }

    func testEventAfterCorrectedMatchDurationIsRejectedAndConfirmedUndoIsDurable() throws {
        let fixture = try makeHistoricalRecord()
        let lateEvent = GoalEvent(team: .opponent, matchSecond: 900)
        var withEvent = fixture.record
        withEvent.events = [lateEvent]
        let eventPreview = try MatchRecordCorrectionEngine.preview(from: fixture.record, proposing: withEvent)
        var shorter = eventPreview.proposed
        shorter.duration = 800
        XCTAssertThrowsError(try MatchRecordCorrectionEngine.preview(from: eventPreview.proposed, proposing: shorter))

        var edited = eventPreview.proposed
        edited.opponentName = "Synthetic Opponent Corrected"
        let preview = try MatchRecordCorrectionEngine.preview(from: eventPreview.proposed, proposing: edited)
        let confirmed = try MatchRecordCorrectionEngine.confirmedRecord(from: preview, confirmedAt: Date(timeIntervalSince1970: 1_800_000_123))
        let decoded = try JSONDecoder().decode(MatchRecord.self, from: JSONEncoder().encode(confirmed))
        XCTAssertEqual(try MatchRecordCorrectionEngine.undo(decoded).opponentName, "Synthetic Opponent")
    }

    private func makeHistoricalRecord() throws -> (record: MatchRecord, starters: [UUID], bench: [UUID]) {
        let ids = (1...6).map { index in
            UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index))!
        }
        let starters = Array(ids.prefix(5))
        let bench = Array(ids.dropFirst(5))
        let initialParticipants = ids.map { id in
            MatchTimingParticipantSnapshot(id: id, accumulatedNanoseconds: 0, inField: starters.contains(id))
        }
        var timeline = try MatchParticipationTimelineSnapshot.complete(
            participants: initialParticipants,
            starters: Set(starters)
        )
        let substitutionID = UUID(uuidString: "20000000-0000-0000-0000-000000000001")!
        _ = try timeline.record(
            playerID: starters[0], period: .firstHalf, elapsedNanoseconds: 600 * ns,
            transition: .leftField, origin: .substitution, substitutionID: substitutionID
        )
        _ = try timeline.record(
            playerID: bench[0], period: .firstHalf, elapsedNanoseconds: 600 * ns,
            transition: .enteredField, origin: .substitution, substitutionID: substitutionID
        )
        let ends = MatchHistoricalAttendance(
            periodDurationNanoseconds: 1_200 * ns,
            firstHalfEndNanoseconds: 1_200 * ns,
            secondHalfEndNanoseconds: 0
        )
        let totals = try timeline.nanosecondsPlayed(
            participantIDs: Set(ids),
            firstHalfEndNanoseconds: ends.firstHalfEndNanoseconds,
            secondHalfEndNanoseconds: ends.secondHalfEndNanoseconds
        )
        let summaries = ids.enumerated().map { index, id in
            PlayerMatchSummary(
                rosterPlayerID: id,
                playerName: "Synthetic Player \(index + 1)",
                secondsPlayed: Int((totals[id] ?? 0) / ns),
                goals: 0,
                assists: 0
            )
        }
        let metadata = MatchCorrectionMetadata(
            participationTimeline: timeline,
            historicalAttendance: ends
        )
        let record = MatchRecord(
            id: UUID(uuidString: "30000000-0000-0000-0000-000000000001")!,
            date: Date(timeIntervalSince1970: 1_800_000_000),
            duration: 1_200,
            players: summaries,
            ourScore: 0,
            opponentScore: 0,
            events: [],
            opponentName: "Synthetic Opponent",
            correctionMetadata: metadata
        )
        return (record, starters, bench)
    }
}
