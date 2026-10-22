import XCTest
@testable import APP

@MainActor
final class DomainCharacterizationTests: XCTestCase {

    func testRosterPlayerDecodesPayloadWithoutGoalkeeperField() throws {
        let data = Data(
            #"{"id":"00000000-0000-0000-0000-000000000001","name":"Ada"}"#.utf8
        )

        let player = try JSONDecoder().decode(RosterPlayer.self, from: data)

        XCTAssertEqual(player.name, "Ada")
        XCTAssertTrue(player.active)
        XCTAssertFalse(player.isGoalkeeper)
    }

    func testMatchPlayerDecodesPayloadWithoutNewOptionalFields() throws {
        let data = Data(
            #"{"rosterPlayerID":"00000000-0000-0000-0000-000000000002","name":"Bea"}"#.utf8
        )

        let player = try JSONDecoder().decode(MatchPlayer.self, from: data)

        XCTAssertEqual(player.name, "Bea")
        XCTAssertEqual(player.timePlayed, 0)
        XCTAssertFalse(player.inField)
        XCTAssertEqual(player.playWeight, 1.0)
        XCTAssertFalse(player.superpower)
        XCTAssertFalse(player.isGoalkeeper)
    }

    func testMatchRecordDecodesLegacyPayloadWithoutOptionalHistoryFields() throws {
        let data = Data(
            #"{"id":"00000000-0000-0000-0000-000000000003","date":0,"duration":2400,"players":[{"id":"00000000-0000-0000-0000-000000000004","rosterPlayerID":null,"playerName":"Ada","secondsPlayed":900,"goals":1,"assists":0}]}"#.utf8
        )

        let record = try JSONDecoder().decode(MatchRecord.self, from: data)

        XCTAssertEqual(record.duration, 2400)
        XCTAssertEqual(record.players.first?.playerName, "Ada")
        XCTAssertNil(record.ourScore)
        XCTAssertNil(record.opponentScore)
        XCTAssertNil(record.events)
        XCTAssertNil(record.scheduledMatchID)
        XCTAssertNil(record.opponentName)
        XCTAssertNil(record.isHome)
    }

    func testCSVParserHandlesBOMQuotedDelimiterSkippedRestAndInvalidDate() throws {
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
        XCTAssertTrue(preview.issues.first?.contains("riga 4") == true)
    }

    func testCSVParserRejectsMissingRequiredHeaders() {
        XCTAssertThrowsError(
            try ScheduleCSVImporter.parse("data,avversario\n28/09/2026,Avversario")
        )
    }
}
