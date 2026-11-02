import Foundation

/// Anonymous JSON samples shaped from the currently documented Codable contract.
/// No fixture is copied from a device or claimed to be a real historical payload.
enum DomainCharacterizationFixtures {

    /// Documented legacy shape: RosterPlayer fields added later are absent.
    static let legacyRosterPlayer = Data(
        #"{"id":"00000000-0000-0000-0000-000000000001","name":"Player One"}"#.utf8
    )

    /// Documented legacy shape: MatchPlayer's later lineup fields are absent.
    static let legacyMatchPlayer = Data(
        #"{"rosterPlayerID":"00000000-0000-0000-0000-000000000002","name":"Player Two"}"#.utf8
    )

    /// Documented legacy shape: optional score, event, schedule and opponent fields are absent.
    static let legacyMatchRecord = Data(
        #"{"id":"00000000-0000-0000-0000-000000000003","date":0,"duration":2400,"players":[{"id":"00000000-0000-0000-0000-000000000004","rosterPlayerID":null,"playerName":"Player One","secondsPlayed":900,"goals":1,"assists":0}]}"#.utf8
    )

    /// Synthetic current schedule sample with all optional fields populated.
    static let scheduledMatch = Data(
        #"{"id":"00000000-0000-0000-0000-000000000005","round":"R-01","opponentName":"North FC","date":12345.5,"isHome":true,"location":"Synthetic Arena","notes":"Fixture only"}"#.utf8
    )

    /// Synthetic current schedule sample with optional fields omitted.
    static let scheduledMatchWithoutOptionalFields = Data(
        #"{"id":"00000000-0000-0000-0000-000000000006","opponentName":"South FC","date":10,"isHome":false}"#.utf8
    )

    /// Synthetic explicit MatchPlayer values, including weights and goalkeeper status.
    static let matchPlayer = Data(
        #"{"rosterPlayerID":"00000000-0000-0000-0000-000000000002","name":"Player Two","timePlayed":735,"inField":true,"playWeight":0.75,"superpower":true,"isGoalkeeper":true}"#.utf8
    )

    /// Synthetic current MatchRecord exercising participants, score, events and schedule metadata.
    static let currentMatchRecord = Data(
        #"{"id":"00000000-0000-0000-0000-000000000003","date":12345.5,"duration":2700,"players":[{"id":"00000000-0000-0000-0000-000000000004","rosterPlayerID":"00000000-0000-0000-0000-000000000002","playerName":"Player One","secondsPlayed":1320,"goals":1,"assists":1}],"ourScore":1,"opponentScore":0,"events":[{"id":"00000000-0000-0000-0000-000000000007","team":"ours","matchSecond":420,"scorerID":"00000000-0000-0000-0000-000000000002","scorerName":"Player One","assistID":"00000000-0000-0000-0000-000000000008","assistName":"Player Two"}],"scheduledMatchID":"00000000-0000-0000-0000-000000000005","opponentName":"North FC","isHome":true}"#.utf8
    )

    /// Documented legacy-compatible shape: optional scorer/assist metadata is omitted.
    static let goalEventWithoutPlayerMetadata = Data(
        #"{"id":"00000000-0000-0000-0000-000000000007","team":"opponent","matchSecond":1800}"#.utf8
    )

    /// Synthetic roster record with explicit inactive/goalkeeper values.
    static let rosterPlayer = Data(
        #"{"id":"00000000-0000-0000-0000-000000000009","name":"Player Three","active":false,"isGoalkeeper":true}"#.utf8
    )
}
