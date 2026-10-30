import XCTest
@testable import APP

@MainActor
final class DomainCharacterizationTests: XCTestCase {

    func testRosterPlayerDecodesDocumentedLegacyShapeAndUsesCurrentDefaults() throws {
        let player = try JSONDecoder().decode(
            RosterPlayer.self,
            from: DomainCharacterizationFixtures.legacyRosterPlayer
        )

        XCTAssertEqual(player.id, UUID(uuidString: "00000000-0000-0000-0000-000000000001"))
        XCTAssertEqual(player.name, "Player One")
        XCTAssertTrue(player.active)
        XCTAssertFalse(player.isGoalkeeper)

        let encoded = try JSONEncoder().encode(player)
        let encodedObject = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(encodedObject["active"] as? Bool, true)
        XCTAssertEqual(encodedObject["isGoalkeeper"] as? Bool, false)

        let decodedAgain = try JSONDecoder().decode(RosterPlayer.self, from: encoded)
        XCTAssertEqual(decodedAgain, player)
    }

    func testRosterPlayerRoundTripsExplicitIdentityAndGoalkeeperState() throws {
        let player = try JSONDecoder().decode(
            RosterPlayer.self,
            from: DomainCharacterizationFixtures.rosterPlayer
        )

        XCTAssertEqual(player.id, UUID(uuidString: "00000000-0000-0000-0000-000000000009"))
        XCTAssertEqual(player.name, "Player Three")
        XCTAssertFalse(player.active)
        XCTAssertTrue(player.isGoalkeeper)
        XCTAssertEqual(try JSONDecoder().decode(RosterPlayer.self, from: JSONEncoder().encode(player)), player)
    }

    func testScheduledMatchDecodesCurrentShapeAndRoundTripsAllFields() throws {
        let match = try JSONDecoder().decode(
            ScheduledMatch.self,
            from: DomainCharacterizationFixtures.scheduledMatch
        )

        XCTAssertEqual(match.id, UUID(uuidString: "00000000-0000-0000-0000-000000000005"))
        XCTAssertEqual(match.round, "R-01")
        XCTAssertEqual(match.opponentName, "North FC")
        XCTAssertEqual(match.date, Date(timeIntervalSinceReferenceDate: 12345.5))
        XCTAssertTrue(match.isHome)
        XCTAssertEqual(match.location, "Synthetic Arena")
        XCTAssertEqual(match.notes, "Fixture only")

        let roundTripped = try JSONDecoder().decode(ScheduledMatch.self, from: JSONEncoder().encode(match))
        XCTAssertEqual(roundTripped, match)
    }

    func testScheduledMatchDecodesOmittedOptionalFieldsAndRoundTrips() throws {
        let match = try JSONDecoder().decode(
            ScheduledMatch.self,
            from: DomainCharacterizationFixtures.scheduledMatchWithoutOptionalFields
        )

        XCTAssertEqual(match.opponentName, "South FC")
        XCTAssertFalse(match.isHome)
        XCTAssertNil(match.round)
        XCTAssertNil(match.location)
        XCTAssertNil(match.notes)

        let roundTripped = try JSONDecoder().decode(ScheduledMatch.self, from: JSONEncoder().encode(match))
        XCTAssertEqual(roundTripped, match)
    }

    func testMatchPlayerDecodesDocumentedLegacyShapeAndUsesCurrentDefaults() throws {
        let player = try JSONDecoder().decode(
            MatchPlayer.self,
            from: DomainCharacterizationFixtures.legacyMatchPlayer
        )

        XCTAssertEqual(player.rosterPlayerID, UUID(uuidString: "00000000-0000-0000-0000-000000000002"))
        XCTAssertEqual(player.id, player.rosterPlayerID)
        XCTAssertEqual(player.name, "Player Two")
        XCTAssertEqual(player.timePlayed, 0)
        XCTAssertFalse(player.inField)
        XCTAssertEqual(player.playWeight, 1.0)
        XCTAssertFalse(player.superpower)
        XCTAssertFalse(player.isGoalkeeper)

        let roundTripped = try JSONDecoder().decode(MatchPlayer.self, from: JSONEncoder().encode(player))
        XCTAssertEqual(roundTripped.rosterPlayerID, player.rosterPlayerID)
        XCTAssertEqual(roundTripped.name, player.name)
        XCTAssertEqual(roundTripped.timePlayed, player.timePlayed)
        XCTAssertEqual(roundTripped.inField, player.inField)
        XCTAssertEqual(roundTripped.playWeight, player.playWeight)
        XCTAssertEqual(roundTripped.superpower, player.superpower)
        XCTAssertEqual(roundTripped.isGoalkeeper, player.isGoalkeeper)
    }

    func testMatchPlayerRoundTripsWeightParticipationAndRole() throws {
        let player = try JSONDecoder().decode(
            MatchPlayer.self,
            from: DomainCharacterizationFixtures.matchPlayer
        )

        XCTAssertEqual(player.timePlayed, 735)
        XCTAssertTrue(player.inField)
        XCTAssertEqual(player.playWeight, 0.75, accuracy: 0.000_001)
        XCTAssertTrue(player.superpower)
        XCTAssertTrue(player.isGoalkeeper)

        let roundTripped = try JSONDecoder().decode(MatchPlayer.self, from: JSONEncoder().encode(player))
        XCTAssertEqual(roundTripped.rosterPlayerID, player.rosterPlayerID)
        XCTAssertEqual(roundTripped.timePlayed, player.timePlayed)
        XCTAssertEqual(roundTripped.inField, player.inField)
        XCTAssertEqual(roundTripped.playWeight, player.playWeight, accuracy: 0.000_001)
        XCTAssertEqual(roundTripped.superpower, player.superpower)
        XCTAssertEqual(roundTripped.isGoalkeeper, player.isGoalkeeper)
    }

    func testMatchRecordDecodesDocumentedLegacyShapeAndRoundTrips() throws {
        let record = try JSONDecoder().decode(
            MatchRecord.self,
            from: DomainCharacterizationFixtures.legacyMatchRecord
        )

        XCTAssertEqual(record.id, UUID(uuidString: "00000000-0000-0000-0000-000000000003"))
        XCTAssertEqual(record.duration, 2400)
        XCTAssertEqual(record.players.count, 1)
        XCTAssertEqual(record.players.first?.id, UUID(uuidString: "00000000-0000-0000-0000-000000000004"))
        XCTAssertNil(record.players.first?.rosterPlayerID)
        XCTAssertEqual(record.players.first?.playerName, "Player One")
        XCTAssertEqual(record.players.first?.secondsPlayed, 900)
        XCTAssertEqual(record.players.first?.goals, 1)
        XCTAssertEqual(record.players.first?.assists, 0)
        XCTAssertNil(record.ourScore)
        XCTAssertNil(record.opponentScore)
        XCTAssertNil(record.events)
        XCTAssertNil(record.scheduledMatchID)
        XCTAssertNil(record.opponentName)
        XCTAssertNil(record.isHome)

        let roundTripped = try JSONDecoder().decode(MatchRecord.self, from: JSONEncoder().encode(record))
        XCTAssertEqual(roundTripped.id, record.id)
        XCTAssertEqual(roundTripped.date, record.date)
        XCTAssertEqual(roundTripped.duration, record.duration)
        XCTAssertEqual(roundTripped.players.count, 1)
        XCTAssertEqual(roundTripped.players.first?.playerName, "Player One")
        XCTAssertNil(roundTripped.ourScore)
        XCTAssertNil(roundTripped.events)
    }

    func testMatchRecordRoundTripsParticipantsGoalsAssistAndScheduleSnapshot() throws {
        let record = try JSONDecoder().decode(
            MatchRecord.self,
            from: DomainCharacterizationFixtures.currentMatchRecord
        )

        XCTAssertEqual(record.duration, 2700)
        XCTAssertEqual(record.ourScore, 1)
        XCTAssertEqual(record.opponentScore, 0)
        XCTAssertEqual(record.scheduledMatchID, UUID(uuidString: "00000000-0000-0000-0000-000000000005"))
        XCTAssertEqual(record.opponentName, "North FC")
        XCTAssertEqual(record.isHome, true)
        XCTAssertEqual(record.players.first?.rosterPlayerID, UUID(uuidString: "00000000-0000-0000-0000-000000000002"))
        XCTAssertEqual(record.players.first?.secondsPlayed, 1320)
        XCTAssertEqual(record.players.first?.goals, 1)
        XCTAssertEqual(record.players.first?.assists, 1)
        XCTAssertEqual(record.events?.count, 1)
        XCTAssertEqual(record.events?.first?.team, .ours)
        XCTAssertEqual(record.events?.first?.matchSecond, 420)
        XCTAssertEqual(record.events?.first?.scorerName, "Player One")
        XCTAssertEqual(record.events?.first?.assistName, "Player Two")

        let roundTripped = try JSONDecoder().decode(MatchRecord.self, from: JSONEncoder().encode(record))
        XCTAssertEqual(roundTripped.id, record.id)
        XCTAssertEqual(roundTripped.date, record.date)
        XCTAssertEqual(roundTripped.ourScore, record.ourScore)
        XCTAssertEqual(roundTripped.opponentScore, record.opponentScore)
        XCTAssertEqual(roundTripped.players.first?.id, record.players.first?.id)
        XCTAssertEqual(roundTripped.players.first?.rosterPlayerID, record.players.first?.rosterPlayerID)
        XCTAssertEqual(roundTripped.events?.first?.id, record.events?.first?.id)
        XCTAssertEqual(roundTripped.events?.first?.assistID, record.events?.first?.assistID)
        XCTAssertEqual(roundTripped.scheduledMatchID, record.scheduledMatchID)
        XCTAssertEqual(roundTripped.opponentName, record.opponentName)
        XCTAssertEqual(roundTripped.isHome, record.isHome)
    }

    func testGoalEventDecodesOmittedScorerAndAssistAndRoundTrips() throws {
        let event = try JSONDecoder().decode(
            GoalEvent.self,
            from: DomainCharacterizationFixtures.goalEventWithoutPlayerMetadata
        )

        XCTAssertEqual(event.id, UUID(uuidString: "00000000-0000-0000-0000-000000000007"))
        XCTAssertEqual(event.team, .opponent)
        XCTAssertEqual(event.matchSecond, 1800)
        XCTAssertNil(event.scorerID)
        XCTAssertNil(event.scorerName)
        XCTAssertNil(event.assistID)
        XCTAssertNil(event.assistName)

        let roundTripped = try JSONDecoder().decode(GoalEvent.self, from: JSONEncoder().encode(event))
        XCTAssertEqual(roundTripped.id, event.id)
        XCTAssertEqual(roundTripped.team, event.team)
        XCTAssertEqual(roundTripped.matchSecond, event.matchSecond)
        XCTAssertNil(roundTripped.scorerID)
        XCTAssertNil(roundTripped.assistName)
    }

    func testCSVParserHandlesBOMSemicolonQuotedDelimiterRestAndInvalidDate() throws {
        let csv = """
        \u{feff}giornata;data;ora;avversario;casa;luogo;note
        A-G1;28/09/2026;21:00;"MARMI; VEZZOLI";CASA;;"gara; serale"
        A-G2;29/09/2026;22:00;RIPOSA;CASA;;
        A-G3;31/09/2026;21:00;CORNOA;TRASFERTA;;
        """

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertEqual(preview.matches.count, 1)
        XCTAssertEqual(preview.matches.first?.round, "A-G1")
        XCTAssertEqual(preview.matches.first?.opponentName, "MARMI; VEZZOLI")
        XCTAssertTrue(preview.matches.first?.isHome == true)
        XCTAssertEqual(preview.matches.first?.notes, "gara; serale")
        XCTAssertEqual(preview.issues.count, 1)
        XCTAssertTrue(preview.issues.first?.contains("Riga 4") == true)
    }

    func testCSVParserHandlesCommaAliasesEscapedQuotesAndSortsByDate() throws {
        let csv = """
        round,date,time,opponent,home_away,location,notes
        R-02,30/09/2026,20:45,"North, ""Blue"" FC",A,Main,"Cup, away"
        R-01,28/09/2026,21:00,South FC,H,Annex,
        """

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertEqual(preview.issues, [])
        XCTAssertEqual(preview.matches.map(\.round), ["R-01", "R-02"])
        XCTAssertEqual(preview.matches.map(\.opponentName), ["South FC", "North, \"Blue\" FC"])
        XCTAssertEqual(preview.matches.first?.location, "Annex")
        XCTAssertNil(preview.matches.first?.notes)
        XCTAssertEqual(preview.matches.last?.location, "Main")
        XCTAssertEqual(preview.matches.last?.notes, "Cup, away")
        XCTAssertFalse(try XCTUnwrap(preview.matches.last).isHome)

        let dateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: try XCTUnwrap(preview.matches.first?.date)
        )
        XCTAssertEqual(dateComponents.year, 2026)
        XCTAssertEqual(dateComponents.month, 9)
        XCTAssertEqual(dateComponents.day, 28)
        XCTAssertEqual(dateComponents.hour, 21)
        XCTAssertEqual(dateComponents.minute, 0)
    }

    func testCSVParserSkipsEmptyOpponentAndRestAndReportsBadDateAndHomeAway() throws {
        let csv = """
        giornata,data,ora,avversario,casa
        G-EMPTY,28/09/2026,21:00,,CASA
        G-REST,29/09/2026,21:00,riposa,CASA
        G-DATE,31/09/2026,21:00,North FC,CASA
        G-HOME,30/09/2026,21:00,South FC,NEUTRAL
        """

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertTrue(preview.matches.isEmpty)
        XCTAssertEqual(preview.issues.count, 2)
        XCTAssertTrue(preview.issues[0].contains("Riga 4: data/ora non valida"))
        XCTAssertTrue(preview.issues[1].contains("Riga 5: casa/trasferta non riconosciuto"))
    }

    func testCSVParserNormalizesCRLFAndCarriageReturnLineEndings() throws {
        let csv = "round,date,time,opponent,home\r\nR-01,28/09/2026,21:00,North FC,home\rR-02,29/09/2026,21:00,South FC,away"

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertEqual(preview.matches.count, 2)
        XCTAssertTrue(preview.issues.isEmpty)
        XCTAssertEqual(preview.matches.map(\.round), ["R-01", "R-02"])
        XCTAssertEqual(preview.matches.map(\.isHome), [true, false])
    }

    func testCSVParserDistinguishesEmptyInputFromWhitespaceOnlyAndMissingHeaders() {
        XCTAssertThrowsError(try ScheduleCSVImporter.parse("")) { error in
            XCTAssertEqual((error as? CalendarImportError)?.errorDescription, "Il file CSV è vuoto.")
        }

        // Current parser treats a non-empty whitespace line as a header with missing columns.
        XCTAssertThrowsError(try ScheduleCSVImporter.parse("\n \r\n")) { error in
            XCTAssertEqual(
                (error as? CalendarImportError)?.errorDescription,
                "Il CSV deve contenere almeno data, ora, avversario e casa."
            )
        }

        XCTAssertThrowsError(
            try ScheduleCSVImporter.parse("data,avversario\n28/09/2026,North FC")
        ) { error in
            XCTAssertEqual(
                (error as? CalendarImportError)?.errorDescription,
                "Il CSV deve contenere almeno data, ora, avversario e casa."
            )
        }
    }

    func testCSVParserReportsUnterminatedQuotedRowAsInvalidHomeAwayRatherThanCSVError() throws {
        // Characterization of current parser behavior: it does not validate quote balance.
        let csv = """
        round,date,time,opponent,home
        R-01,28/09/2026,21:00,"North FC,home
        """

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertTrue(preview.matches.isEmpty)
        XCTAssertEqual(preview.issues.count, 1)
        XCTAssertTrue(preview.issues[0].contains("casa/trasferta non riconosciuto"))
        XCTAssertFalse(preview.issues[0].contains("CSV"))
    }

    func testCSVParserDoesNotTreatQuotedNewlineAsPartOfOneRecord() throws {
        // Known current limitation: input is split into physical lines before CSV quoting is parsed.
        let csv = """
        round,date,time,opponent,home
        R-01,28/09/2026,21:00,"North
        FC",CASA
        """

        let preview = try ScheduleCSVImporter.parse(csv)

        XCTAssertTrue(preview.matches.isEmpty)
        XCTAssertEqual(preview.issues.count, 1)
        XCTAssertTrue(preview.issues[0].contains("casa/trasferta non riconosciuto"))
    }
}
