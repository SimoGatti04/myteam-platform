import SwiftUI
import Foundation
import Combine
import UniformTypeIdentifiers

// MARK: - MAPI THEME

enum MapiTheme {

    static let background = Color(
        red: 0.975,
        green: 0.945,
        blue: 0.950
    )

    static let surface = Color(
        red: 1.0,
        green: 0.985,
        blue: 0.985
    )

    static let blush = Color(
        red: 0.89,
        green: 0.76,
        blue: 0.79
    )

    static let lightBlush = Color(
        red: 0.95,
        green: 0.88,
        blue: 0.90
    )

    static let mauve = Color(
        red: 0.53,
        green: 0.40,
        blue: 0.42
    )

    static let darkMauve = Color(
        red: 0.30,
        green: 0.22,
        blue: 0.23
    )

    static let olive = Color(
        red: 0.38,
        green: 0.37,
        blue: 0.24
    )

    static let lightOlive = Color(
        red: 0.84,
        green: 0.83,
        blue: 0.72
    )

    static let textSecondary = Color(
        red: 0.43,
        green: 0.38,
        blue: 0.38
    )
}


// MARK: - MAPI CARD

struct MapiCardModifier: ViewModifier {

    let accent: Color

    func body(content: Content) -> some View {

        content
            .padding(18)
            .frame(maxWidth: .infinity)
            .background(MapiTheme.surface)
            .overlay(alignment: .leading) {

                Rectangle()
                    .fill(accent)
                    .frame(width: 5)
            }
            .clipShape(
                RoundedRectangle(
                    cornerRadius: 22,
                    style: .continuous
                )
            )
            .overlay {

                RoundedRectangle(
                    cornerRadius: 22,
                    style: .continuous
                )
                .stroke(
                    accent.opacity(0.10),
                    lineWidth: 1
                )
            }
            .shadow(
                color: MapiTheme.darkMauve.opacity(0.08),
                radius: 12,
                y: 5
            )
    }
}


extension View {

    func mapiCard(
        accent: Color = MapiTheme.mauve
    ) -> some View {

        modifier(
            MapiCardModifier(
                accent: accent
            )
        )
    }


    @ViewBuilder
    func mapiNavigationChrome() -> some View {

#if os(iOS)

        self
            .toolbarBackground(
                MapiTheme.background,
                for: .navigationBar
            )
            .toolbarBackground(
                .visible,
                for: .navigationBar
            )
            .tint(MapiTheme.olive)

#else

        self.tint(MapiTheme.olive)

#endif
    }
}


// MARK: - BUTTON STYLES

struct MapiPrimaryButtonStyle: ButtonStyle {

    @Environment(\.isEnabled)
    private var isEnabled

    func makeBody(
        configuration: Configuration
    ) -> some View {

        configuration.label
            .font(
                .system(
                    size: 16,
                    weight: .bold,
                    design: .rounded
                )
            )
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .frame(minHeight: 50)
            .frame(maxWidth: .infinity)
            .background(MapiTheme.olive)
            .clipShape(Capsule())
            .scaleEffect(
                configuration.isPressed
                ? 0.97
                : 1
            )
            .opacity(
                isEnabled
                ? 1
                : 0.38
            )
    }
}


struct MapiSecondaryButtonStyle: ButtonStyle {

    @Environment(\.isEnabled)
    private var isEnabled

    func makeBody(
        configuration: Configuration
    ) -> some View {

        configuration.label
            .font(
                .system(
                    size: 15,
                    weight: .semibold,
                    design: .rounded
                )
            )
            .foregroundStyle(MapiTheme.mauve)
            .padding(.horizontal, 18)
            .frame(minHeight: 46)
            .frame(maxWidth: .infinity)
            .background(MapiTheme.lightBlush)
            .overlay {

                Capsule()
                    .stroke(
                        MapiTheme.mauve.opacity(0.18),
                        lineWidth: 1
                    )
            }
            .clipShape(Capsule())
            .scaleEffect(
                configuration.isPressed
                ? 0.97
                : 1
            )
            .opacity(
                isEnabled
                ? 1
                : 0.38
            )
    }
}


struct MapiCompactButtonStyle: ButtonStyle {

    let filled: Bool

    @Environment(\.isEnabled)
    private var isEnabled

    func makeBody(
        configuration: Configuration
    ) -> some View {

        configuration.label
            .font(
                .system(
                    size: 13,
                    weight: .bold,
                    design: .rounded
                )
            )
            .foregroundStyle(
                filled
                ? Color.white
                : MapiTheme.mauve
            )
            .padding(.horizontal, 15)
            .frame(minHeight: 38)
            .background(
                filled
                ? MapiTheme.olive
                : MapiTheme.lightBlush
            )
            .clipShape(Capsule())
            .scaleEffect(
                configuration.isPressed
                ? 0.96
                : 1
            )
            .opacity(
                isEnabled
                ? 1
                : 0.35
            )
    }
}


// MARK: - BRAND

struct MapiBrandHeader: View {

    var body: some View {

        VStack(spacing: 2) {

            Text("MAPI GROUP")
                .font(
                    .system(
                        size: 29,
                        weight: .black,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

            Text("MATCH MANAGER")
                .font(
                    .system(
                        size: 11,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .tracking(4)
                .foregroundStyle(
                    MapiTheme.mauve
                )
        }
        .padding(.top, 4)
        .padding(.bottom, 2)
    }
}


struct MapiStatusPill: View {

    let text: String
    let color: Color

    var body: some View {

        Text(text)
            .font(
                .system(
                    size: 11,
                    weight: .bold,
                    design: .rounded
                )
            )
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                color.opacity(0.12)
            )
            .clipShape(Capsule())
    }
}


// MARK: - HELPERS

private func formatTime(
    _ seconds: Int
) -> String {

    let value =
        max(0, seconds)

    return String(
        format: "%02d:%02d",
        value / 60,
        value % 60
    )
}


private func clean(
    _ value: String
) -> String {

    value.trimmingCharacters(
        in: .whitespacesAndNewlines
    )
}


private func describeEvent(
    _ event: GoalEvent,
    index: Int,
    events: [GoalEvent]
) -> String {

    let untilNow =
        events.prefix(index + 1)

    let ours =
        untilNow.filter {
            $0.team == .ours
        }.count

    let opponents =
        untilNow.filter {
            $0.team == .opponent
        }.count

    let score =
        "\(ours)-\(opponents)"

    let time =
        formatTime(
            event.matchSecond
        )

    if event.team == .opponent {

        return "\(score) · \(time) · Gol avversari"
    }

    let scorer =
        event.scorerName ?? "Gol"

    if let assist =
        event.assistName,
       !assist.isEmpty {

        return "\(score) · \(time) · \(scorer) — assist \(assist)"
    }

    return "\(score) · \(time) · \(scorer) — nessun assist"
}


// MARK: - MODELS

struct RosterPlayer:
    Identifiable,
    Codable,
    Equatable {

    let id: UUID

    var name: String

    var active: Bool

    var isGoalkeeper: Bool

    init(
        id: UUID = UUID(),
        name: String,
        active: Bool = true,
        isGoalkeeper: Bool = false
    ) {

        self.id = id
        self.name = name
        self.active = active
        self.isGoalkeeper = isGoalkeeper
    }

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case active
        case isGoalkeeper
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        active = try container.decodeIfPresent(Bool.self, forKey: .active) ?? true
        isGoalkeeper = try container.decodeIfPresent(Bool.self, forKey: .isGoalkeeper) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(active, forKey: .active)
        try container.encode(isGoalkeeper, forKey: .isGoalkeeper)
    }
}


struct ScheduledMatch:
    Identifiable,
    Codable,
    Equatable {

    let id: UUID

    var round: String?

    var opponentName: String

    var date: Date

    var isHome: Bool

    var location: String?

    var notes: String?

    init(
        id: UUID = UUID(),
        round: String? = nil,
        opponentName: String,
        date: Date,
        isHome: Bool,
        location: String? = nil,
        notes: String? = nil
    ) {

        self.id = id
        self.round = round
        self.opponentName = opponentName
        self.date = date
        self.isHome = isHome
        self.location = location
        self.notes = notes
    }
}


struct MatchPlayer:
    Identifiable,
    Codable {

    let rosterPlayerID: UUID

    var name: String

    var timePlayed: Int = 0

    var inField: Bool = false

    var playWeight: Double = 1.0

    var superpower: Bool = false

    var isGoalkeeper: Bool = false

    var id: UUID {
        rosterPlayerID
    }

    init(
        rosterPlayer: RosterPlayer,
        inField: Bool = false
    ) {

        rosterPlayerID =
            rosterPlayer.id

        name =
            rosterPlayer.name

        self.inField =
            inField

        isGoalkeeper =
            rosterPlayer.isGoalkeeper
    }

    init(
        rosterPlayerID: UUID,
        name: String,
        timePlayed: Int = 0,
        inField: Bool = false,
        playWeight: Double = 1.0,
        superpower: Bool = false,
        isGoalkeeper: Bool = false
    ) {

        self.rosterPlayerID =
            rosterPlayerID

        self.name =
            name

        self.timePlayed =
            timePlayed

        self.inField =
            inField

        self.playWeight =
            playWeight

        self.superpower =
            superpower

        self.isGoalkeeper =
            isGoalkeeper
    }

    enum CodingKeys: String, CodingKey {
        case rosterPlayerID
        case name
        case timePlayed
        case inField
        case playWeight
        case superpower
        case isGoalkeeper
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rosterPlayerID = try container.decode(UUID.self, forKey: .rosterPlayerID)
        name = try container.decode(String.self, forKey: .name)
        timePlayed = try container.decodeIfPresent(Int.self, forKey: .timePlayed) ?? 0
        inField = try container.decodeIfPresent(Bool.self, forKey: .inField) ?? false
        playWeight = try container.decodeIfPresent(Double.self, forKey: .playWeight) ?? 1.0
        superpower = try container.decodeIfPresent(Bool.self, forKey: .superpower) ?? false
        isGoalkeeper = try container.decodeIfPresent(Bool.self, forKey: .isGoalkeeper) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(rosterPlayerID, forKey: .rosterPlayerID)
        try container.encode(name, forKey: .name)
        try container.encode(timePlayed, forKey: .timePlayed)
        try container.encode(inField, forKey: .inField)
        try container.encode(playWeight, forKey: .playWeight)
        try container.encode(superpower, forKey: .superpower)
        try container.encode(isGoalkeeper, forKey: .isGoalkeeper)
    }
}


enum GoalTeam:
    String,
    Codable,
    CaseIterable {

    case ours
    case opponent
}


struct GoalEvent:
    Identifiable,
    Codable {

    let id: UUID

    var team: GoalTeam

    var matchSecond: Int

    var scorerID: UUID?

    var scorerName: String?

    var assistID: UUID?

    var assistName: String?

    init(
        id: UUID = UUID(),
        team: GoalTeam,
        matchSecond: Int,
        scorerID: UUID? = nil,
        scorerName: String? = nil,
        assistID: UUID? = nil,
        assistName: String? = nil
    ) {

        self.id = id
        self.team = team
        self.matchSecond = matchSecond
        self.scorerID = scorerID
        self.scorerName = scorerName
        self.assistID = assistID
        self.assistName = assistName
    }
}


struct PendingAssist:
    Identifiable {

    let id =
        UUID()

    let goalEventID: UUID

    let scorerID: UUID

    let scorerName: String
}


struct PlayerMatchSummary:
    Identifiable,
    Codable {

    let id: UUID

    var rosterPlayerID: UUID?

    var playerName: String

    var secondsPlayed: Int

    var goals: Int

    var assists: Int

    init(
        id: UUID = UUID(),
        rosterPlayerID: UUID?,
        playerName: String,
        secondsPlayed: Int,
        goals: Int,
        assists: Int
    ) {

        self.id = id
        self.rosterPlayerID = rosterPlayerID
        self.playerName = playerName
        self.secondsPlayed = secondsPlayed
        self.goals = goals
        self.assists = assists
    }

    init(
        player: MatchPlayer,
        goals: Int,
        assists: Int
    ) {

        id = UUID()

        rosterPlayerID =
            player.rosterPlayerID

        playerName =
            player.name

        secondsPlayed =
            player.timePlayed

        self.goals =
            goals

        self.assists =
            assists
    }
}


struct MatchRecord:
    Identifiable,
    Codable {

    let id: UUID

    var date: Date

    var duration: Int

    var players:
        [PlayerMatchSummary]

    var ourScore: Int?

    var opponentScore: Int?

    var events:
        [GoalEvent]?

    var scheduledMatchID:
        UUID?

    var opponentName:
        String?

    var isHome:
        Bool?

    init(
        id: UUID = UUID(),
        date: Date = Date(),
        duration: Int,
        players: [PlayerMatchSummary],
        ourScore: Int,
        opponentScore: Int,
        events: [GoalEvent],
        scheduledMatchID: UUID? = nil,
        opponentName: String? = nil,
        isHome: Bool? = nil
    ) {

        self.id = id
        self.date = date
        self.duration = duration
        self.players = players
        self.ourScore = ourScore
        self.opponentScore = opponentScore
        self.events = events
        self.scheduledMatchID = scheduledMatchID
        self.opponentName = opponentName
        self.isHome = isHome
    }
}


struct SwapSuggestion {

    let outPlayerID:
        UUID

    let inPlayerID:
        UUID

    let outName:
        String

    let inName:
        String
}


struct OutgoingSubstitutionRequest:
    Identifiable {

    let id =
        UUID()

    let outPlayerID:
        UUID
}


struct IncomingSubstitutionRequest:
    Identifiable {

    let id =
        UUID()

    let inPlayerID:
        UUID
}


enum AppScreen:
    Equatable {

    case welcome

    case home

    case roster

    case calendar

    case presence

    case lineup

    case live

    case history

    case historyDetail(UUID)
}


// MARK: - CSV

struct CalendarImportPreview:
    Identifiable {

    let id =
        UUID()

    let matches:
        [ScheduledMatch]

    let issues:
        [String]
}


enum CalendarImportError:
    LocalizedError {

    case emptyFile

    case missingColumns

    var errorDescription:
        String? {

        switch self {

        case .emptyFile:

            return
                "Il file CSV è vuoto."

        case .missingColumns:

            return
                "Il CSV deve contenere almeno data, ora, avversario e casa."
        }
    }
}


enum ScheduleCSVImporter {

    static func parse(
        _ text: String
    ) throws
        -> CalendarImportPreview {

        let normalized =
            text
                .replacingOccurrences(
                    of: "\r\n",
                    with: "\n"
                )
                .replacingOccurrences(
                    of: "\r",
                    with: "\n"
                )

        let lines =
            normalized
                .split(
                    separator: "\n",
                    omittingEmptySubsequences:
                        true
                )
                .map(
                    String.init
                )

        guard let firstLine =
            lines.first
        else {

            throw
                CalendarImportError
                    .emptyFile
        }

        let delimiter =
            detectDelimiter(
                firstLine
            )

        let headers =
            parseLine(
                firstLine,
                delimiter:
                    delimiter
            )
            .map {

                clean(
                    $0.replacingOccurrences(
                        of:
                            "\u{feff}",
                        with:
                            ""
                    )
                )
                .lowercased()
            }

        func column(
            _ aliases: [String]
        ) -> Int? {

            for alias in aliases {

                if let index =
                    headers.firstIndex(
                        of:
                            alias.lowercased()
                    ) {

                    return index
                }
            }

            return nil
        }

        let roundIndex =
            column(
                [
                    "giornata",
                    "round",
                    "g"
                ]
            )

        let dateIndex =
            column(
                [
                    "data",
                    "date"
                ]
            )

        let timeIndex =
            column(
                [
                    "ora",
                    "time"
                ]
            )

        let opponentIndex =
            column(
                [
                    "avversario",
                    "opponent",
                    "squadra"
                ]
            )

        let homeIndex =
            column(
                [
                    "casa",
                    "campo",
                    "home",
                    "home_away",
                    "homeaway"
                ]
            )

        let locationIndex =
            column(
                [
                    "luogo",
                    "location",
                    "campo_nome"
                ]
            )

        let notesIndex =
            column(
                [
                    "note",
                    "notes"
                ]
            )

        guard
            let dateIndex,
            let timeIndex,
            let opponentIndex,
            let homeIndex
        else {

            throw
                CalendarImportError
                    .missingColumns
        }

        var matches:
            [ScheduledMatch] = []

        var issues:
            [String] = []

        for (
            offset,
            line
        ) in
            lines
                .dropFirst()
                .enumerated() {

            let rowNumber =
                offset + 2

            let fields =
                parseLine(
                    line,
                    delimiter:
                        delimiter
                )

            func field(
                _ index: Int?
            ) -> String {

                guard
                    let index,
                    index <
                        fields.count
                else {

                    return ""
                }

                return clean(
                    fields[index]
                )
            }

            let opponent =
                field(
                    opponentIndex
                )

            if opponent.isEmpty {

                continue
            }

            let normalizedOpponent =
                opponent
                    .folding(
                        options:
                            [
                                .caseInsensitive,
                                .diacriticInsensitive
                            ],
                        locale:
                            .current
                    )
                    .uppercased()

            if normalizedOpponent ==
                "RIPOSA" {

                continue
            }

            let dateText =
                field(
                    dateIndex
                )

            let timeText =
                field(
                    timeIndex
                )

            guard let date =
                parseDate(
                    dateText,
                    timeText
                )
            else {

                issues.append(
                    "Riga \(rowNumber): data/ora non valida (\(dateText) \(timeText))."
                )

                continue
            }

            let homeText =
                field(
                    homeIndex
                )

            guard let isHome =
                parseHomeAway(
                    homeText
                )
            else {

                issues.append(
                    "Riga \(rowNumber): casa/trasferta non riconosciuto (\(homeText))."
                )

                continue
            }

            let round =
                field(
                    roundIndex
                )

            let location =
                field(
                    locationIndex
                )

            let notes =
                field(
                    notesIndex
                )

            matches.append(
                ScheduledMatch(
                    round:
                        round.isEmpty
                        ? nil
                        : round,

                    opponentName:
                        opponent,

                    date:
                        date,

                    isHome:
                        isHome,

                    location:
                        location.isEmpty
                        ? nil
                        : location,

                    notes:
                        notes.isEmpty
                        ? nil
                        : notes
                )
            )
        }

        return
            CalendarImportPreview(
                matches:
                    matches.sorted {
                        $0.date <
                            $1.date
                    },

                issues:
                    issues
            )
    }


    private static func parseDate(
        _ dateText: String,
        _ timeText: String
    ) -> Date? {

        let formats =
            [
                "dd/MM/yyyy HH:mm",
                "d/M/yyyy HH:mm",
                "dd/MM/yy HH:mm",
                "d/M/yy HH:mm"
            ]

        for format in formats {

            let formatter =
                DateFormatter()

            formatter.locale =
                Locale(
                    identifier:
                        "en_US_POSIX"
                )

            formatter.calendar =
                Calendar(
                    identifier:
                        .gregorian
                )

            formatter.timeZone =
                .current

            formatter.dateFormat =
                format

            formatter.isLenient =
                false

            if let result =
                formatter.date(
                    from:
                        "\(dateText) \(timeText)"
                ) {

                return result
            }
        }

        return nil
    }


    private static func parseHomeAway(
        _ value: String
    ) -> Bool? {

        let normalized =
            clean(
                value
            )
            .folding(
                options:
                    [
                        .caseInsensitive,
                        .diacriticInsensitive
                    ],
                locale:
                    .current
            )
            .lowercased()

        switch normalized {

        case
            "true",
            "1",
            "casa",
            "c",
            "home",
            "h",
            "🏠":

            return true

        case
            "false",
            "0",
            "trasferta",
            "t",
            "away",
            "a",
            "✈",
            "✈️":

            return false

        default:

            return nil
        }
    }


    private static func detectDelimiter(
        _ line: String
    ) -> Character {

        let commas =
            line.filter {
                $0 == ","
            }.count

        let semicolons =
            line.filter {
                $0 == ";"
            }.count

        return
            semicolons > commas
            ? ";"
            : ","
    }


    private static func parseLine(
        _ line: String,
        delimiter: Character
    ) -> [String] {

        let characters =
            Array(
                line
            )

        var fields:
            [String] = []

        var current =
            ""

        var insideQuotes =
            false

        var index =
            0

        while index <
            characters.count {

            let character =
                characters[index]

            if character ==
                "\"" {

                if
                    insideQuotes,
                    index + 1 <
                        characters.count,
                    characters[
                        index + 1
                    ] ==
                        "\"" {

                    current.append(
                        "\""
                    )

                    index += 2

                    continue
                }

                insideQuotes.toggle()

                index += 1

                continue
            }

            if
                character ==
                    delimiter,
                !insideQuotes {

                fields.append(
                    current
                )

                current =
                    ""

            } else {

                current.append(
                    character
                )
            }

            index += 1
        }

        fields.append(
            current
        )

        return fields
    }
}


// MARK: - CONTENT VIEW

struct ContentView:
    View {

    @Environment(\.scenePhase)
    private var scenePhase

    private var halfDuration: Int {
        FutsalMatchRules.timing.periodDurationSeconds
    }

    private var timeoutsPerTeamPerHalf: Int {
        FutsalMatchRules.timing.timeoutsPerTeamPerHalf
    }

    private var maxPlayersOnField: Int {
        FutsalMatchRules.timing.requiredStartingPlayers
    }

    private let swapThreshold =
        2 * 60

    private let automaticMatchWindow:
        TimeInterval =
            6 * 60 * 60


    @State private var screen:
        AppScreen =
            .welcome

    @State private var historyReturnScreen:
        AppScreen =
            .home

    @State private var calendarReturnScreen:
        AppScreen =
            .home


    @State private var roster:
        [RosterPlayer] = []

    private let rosterKey =
        "FutsalRosterV1"


    @State private var scheduledMatches:
        [ScheduledMatch] = []

    private let scheduleKey =
        "FutsalScheduleV1"

    @State private var activeScheduledMatchID:
        UUID?

    @State private var activeOpponentName:
        String?

    @State private var activeIsHome:
        Bool?


    @State private var selectedPresentIDs:
        Set<UUID> = []

    @State private var selectedStarterIDs:
        Set<UUID> = []

    @State private var timing =
        MatchTiming()

    @State private var hasActiveMatch =
        false

    @State private var hasSavedCurrentMatch =
        false

    private var lineupConfirmed: Bool {
        timing.lineupConfirmed
    }

    private var matchClockHasStarted: Bool {
        timing.hasStarted
    }

    private var phase: MatchPhase {
        timing.phase
    }

    private var firstHalfElapsed: Int {
        timing.firstHalfElapsedSeconds
    }

    private var secondHalfElapsed: Int {
        timing.secondHalfElapsedSeconds
    }

    private var halftimeRemaining: Int {
        timing.halftimeRemainingSeconds
    }

    private var isRunning: Bool {
        timing.isRunning
    }

    private var inTimeout: Bool {
        timing.isInTimeout
    }

    private var timeoutRemaining: Int {
        timing.timeoutRemainingSeconds
    }

    private var timeoutOwner: String {
        timing.timeoutOwner?.rawValue ?? ""
    }

    private var ourTimeoutsUsed: Int {
        timing.ourTimeoutsUsed
    }

    private var opponentTimeoutsUsed: Int {
        timing.opponentTimeoutsUsed
    }


    @State private var matchEvents:
        [GoalEvent] = []

    @State private var pendingAssist:
        PendingAssist?


    @State private var players:
        [MatchPlayer] = []


    @State private var outgoingSubstitution:
        OutgoingSubstitutionRequest?

    @State private var incomingSubstitution:
        IncomingSubstitutionRequest?


    @State private var history:
        [MatchRecord] = []

    private let historyKey =
        "FutsalMatchHistoryV1"

    @State private var latestRecord:
        MatchRecord?

    @State private var showFinishConfirmation =
        false


    private let timer =
        Timer.publish(
            every: 1,
            on: .main,
            in: .common
        )
        .autoconnect()


    var body:
        some View {

        NavigationStack {

            screenContent
        }
        .tint(
            MapiTheme.olive
        )
        .sheet(
            item:
                $pendingAssist
        ) { request in

            AssistSelectionView(
                scorerName:
                    request.scorerName,

                players:
                    players.filter {

                        $0.inField &&
                        $0.id !=
                            request.scorerID
                    },

                onAssist: {
                    player in

                    addAssist(
                        player,
                        toGoalEventID:
                            request.goalEventID
                    )

                    pendingAssist =
                        nil
                },

                onNoAssist: {

                    pendingAssist =
                        nil
                }
            )
        }
        .sheet(
            item:
                $outgoingSubstitution
        ) { request in

            if let playerOut =
                player(
                    withID:
                        request.outPlayerID
                ) {

                OutgoingSubstitutionView(
                    playerOut:
                        playerOut,

                    benchPlayers:
                        players.filter {

                            !$0.inField &&
                            $0.id !=
                                playerOut.id
                        },

                    onSubstitute: {
                        playerIn in

                        performManualSubstitution(
                            outID:
                                playerOut.id,

                            inID:
                                playerIn.id
                        )

                        outgoingSubstitution =
                            nil
                    },

                    onSkip: {

                        removePlayerWithoutReplacement(
                            playerOut.id
                        )

                        outgoingSubstitution =
                            nil
                    }
                )
            }
        }
        .sheet(
            item:
                $incomingSubstitution
        ) { request in

            if let playerIn =
                player(
                    withID:
                        request.inPlayerID
                ) {

                IncomingSubstitutionView(
                    playerIn:
                        playerIn,

                    fieldPlayers:
                        players.filter {
                            $0.inField
                        },

                    onReplace: {
                        playerOut in

                        performManualSubstitution(
                            outID:
                                playerOut.id,

                            inID:
                                playerIn.id
                        )

                        incomingSubstitution =
                            nil
                    }
                )
            }
        }
        .sheet(
            item:
                $latestRecord
        ) { record in

            MatchSummaryView(
                record:
                    record,

                onOpenHistory: {

                    latestRecord =
                        nil

                    historyReturnScreen =
                        .home

                    screen =
                        .history
                }
            )
        }
        .alert(
            "Terminare la partita?",
            isPresented:
                $showFinishConfirmation
        ) {

            Button(
                "Annulla",
                role:
                    .cancel
            ) {}

            Button(
                "Salva e termina",
                role:
                    .destructive
            ) {

                finishMatch()
            }

        } message: {

            Text(
                "La partita verrà salvata nello storico."
            )
        }
        .onAppear {

            loadRoster()

            loadHistory()

            loadSchedule()
        }
        .onReceive(
            timer
        ) { _ in

            handleTimerTick()
        }
        .onChange(
            of: scenePhase
        ) { _, newPhase in

            if newPhase == .active {
                handleTimerTick()
            }
        }
    }


    // MARK: - NAVIGATION

    @ViewBuilder
    private var screenContent:
        some View {

        switch screen {

        case .welcome:

            WelcomeView {

                withAnimation(
                    .easeInOut(
                        duration: 0.35
                    )
                ) {

                    screen =
                        .home
                }
            }


        case .home:

            homeView


        case .roster:

            RosterManagementView(
                initialRoster:
                    roster,

                onSave: {
                    updated in

                    roster =
                        updated

                    saveRoster(
                        updated
                    )
                },

                onBack: {

                    screen =
                        .home
                }
            )


        case .calendar:

            CalendarManagementView(
                initialMatches:
                    scheduledMatches,

                history:
                    history,

                selectedMatchID:
                    activeScheduledMatchID,

                onSave: {
                    updated in

                    updateSchedule(
                        updated
                    )
                },

                onSelectForCurrentMatch: {
                    match in

                    associateScheduledMatch(
                        match
                    )

                    screen =
                        calendarReturnScreen
                },

                onClearSelection: {

                    clearScheduledMatchAssociation()

                    screen =
                        calendarReturnScreen
                },

                onBack: {

                    screen =
                        calendarReturnScreen
                }
            )


        case .presence:

            PresenceSelectionView(
                roster:
                    activeRosterPlayers,

                selectedIDs:
                    $selectedPresentIDs,

                maxPlayersOnField:
                    maxPlayersOnField,

                timerTitle:
                    phaseTitle,

                timerText:
                    mainTimerText,

                timerRunning:
                    isRunning,

                clockStarted:
                    matchClockHasStarted,

                onTimer:
                    toggleMainTimer,

                onBack: {

                    screen =
                        .home
                },

                onNext: {

                    prepareStarterSelection()

                    screen =
                        .lineup
                }
            )


        case .lineup:

            LineupSelectionView(
                players:
                    selectedPresentPlayers,

                starterIDs:
                    $selectedStarterIDs,

                maxPlayersOnField:
                    maxPlayersOnField,

                timerTitle:
                    phaseTitle,

                timerText:
                    mainTimerText,

                timerRunning:
                    isRunning,

                clockStarted:
                    matchClockHasStarted,

                onTimer:
                    toggleMainTimer,

                onBack: {

                    screen =
                        .presence
                },

                onNext:
                    confirmInitialLineup
            )


        case .live:

            liveMatchView


        case .history:

            HistoryListView(
                history:
                    history,

                onBack: {

                    screen =
                        historyReturnScreen
                },

                onSelect: {
                    record in

                    screen =
                        .historyDetail(
                            record.id
                        )
                }
            )


        case .historyDetail(
            let id
        ):

            if let record =
                history.first(
                    where: {
                        $0.id ==
                            id
                    }
                ) {

                HistoryDetailView(
                    record:
                        record,

                    roster:
                        roster,

                    schedule:
                        scheduledMatches,

                    onBack: {

                        screen =
                            .history
                    },

                    onSave:
                        updateHistoryRecord,

                    onDelete: {

                        deleteHistoryRecord(
                            id
                        )
                    }
                )

            } else {

                ContentUnavailableView(
                    "Partita non trovata",
                    systemImage:
                        "exclamationmark.triangle"
                )
                .toolbar {

                    ToolbarItem(
                        placement:
                            .cancellationAction
                    ) {

                        Button(
                            "Indietro"
                        ) {

                            screen =
                                .history
                        }
                    }
                }
            }
        }
    }


    // MARK: - HOME

    private var homeView:
        some View {

        ZStack {

            MapiTheme.background
                .ignoresSafeArea()

            ScrollView {

                VStack(
                    spacing: 18
                ) {

                    MapiBrandHeader()

                    timerHomeSection

                    calendarHomeSection

                    formationHomeSection

                    homeUtilityButtons
                }
                .padding(
                    .horizontal,
                    16
                )
                .padding(
                    .bottom,
                    20
                )
            }
        }
        .navigationTitle("")
        .mapiNavigationChrome()
    }


    private var timerHomeSection:
        some View {

        VStack(
            spacing: 12
        ) {

            HStack {

                MapiStatusPill(
                    text:
                        phaseTitle,

                    color:
                        phase ==
                            .finished
                        ? MapiTheme.mauve
                        : MapiTheme.olive
                )

                Spacer()

                if matchClockHasStarted {

                    Text(
                        "Giocato \(formatTime(totalMatchTime))"
                    )
                    .font(
                        .system(
                            size: 12,
                            weight: .semibold,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )
                }
            }

            Text(
                mainTimerText
            )
            .font(
                .system(
                    size: 68,
                    weight: .black,
                    design: .rounded
                )
            )
            .monospacedDigit()
            .foregroundStyle(
                MapiTheme.darkMauve
            )

            timerControlButtons
        }
        .mapiCard(
            accent:
                MapiTheme.olive
        )
    }


    @ViewBuilder
    private var timerControlButtons:
        some View {

        if inTimeout {

            Button(
                "TERMINA TIME-OUT"
            ) {

                endTimeout()
            }
            .buttonStyle(
                MapiPrimaryButtonStyle()
            )

        } else if phase ==
            .finished {

            Button(
                "NUOVA PARTITA"
            ) {

                startNewMatch()
            }
            .buttonStyle(
                MapiPrimaryButtonStyle()
            )

        } else if phase ==
            .halftime {

            VStack(
                spacing: 8
            ) {

                Button(
                    timerButtonTitle
                ) {

                    toggleMainTimer()
                }
                .buttonStyle(
                    MapiPrimaryButtonStyle()
                )

                Button(
                    "VAI AL 2° TEMPO"
                ) {

                    startSecondHalf()
                }
                .buttonStyle(
                    MapiSecondaryButtonStyle()
                )
            }

        } else {

            Button(
                timerButtonTitle
            ) {

                toggleMainTimer()
            }
            .buttonStyle(
                MapiPrimaryButtonStyle()
            )
        }
    }


    @ViewBuilder
    private var calendarHomeSection:
        some View {

        VStack(
            spacing: 12
        ) {

            HStack {

                Label(
                    calendarHomeTitle,
                    systemImage:
                        "calendar"
                )
                .font(
                    .system(
                        size: 15,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.mauve
                )

                Spacer()
            }

            if let associated =
                activeScheduledMatch {

                scheduledMatchContent(
                    associated
                )

                Button(
                    "CAMBIA PARTITA"
                ) {

                    openCalendar(
                        returnTo:
                            .home
                    )
                }
                .buttonStyle(
                    MapiSecondaryButtonStyle()
                )

            } else if let detected =
                automaticallyDetectedMatch {

                scheduledMatchContent(
                    detected
                )

                Text(
                    "Verrà associata automaticamente quando avvii il timer."
                )
                .font(
                    .footnote
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
                .multilineTextAlignment(
                    .center
                )

                Button(
                    "CAMBIA PARTITA"
                ) {

                    openCalendar(
                        returnTo:
                            .home
                    )
                }
                .buttonStyle(
                    MapiSecondaryButtonStyle()
                )

            } else if let next =
                nextScheduledMatch {

                scheduledMatchContent(
                    next
                )

            } else {

                Text(
                    "Nessuna partita programmata."
                )
                .font(
                    .system(
                        size: 14,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
            }
        }
        .mapiCard(
            accent:
                MapiTheme.mauve
        )
    }


    private var calendarHomeTitle:
        String {

        if activeScheduledMatch !=
            nil {

            return "PARTITA ASSOCIATA"
        }

        if automaticallyDetectedMatch !=
            nil {

            return "PARTITA RILEVATA"
        }

        if nextScheduledMatch !=
            nil {

            return "PROSSIMA PARTITA"
        }

        return "CALENDARIO"
    }


    private func scheduledMatchContent(
        _ match:
            ScheduledMatch
    ) -> some View {

        VStack(
            spacing: 7
        ) {

            if let round =
                match.round,
               !round.isEmpty {

                Text(
                    round
                )
                .font(
                    .system(
                        size: 11,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.mauve
                )
            }

            Text(
                "vs \(match.opponentName)"
            )
            .font(
                .system(
                    size: 23,
                    weight: .black,
                    design: .rounded
                )
            )
            .multilineTextAlignment(
                .center
            )
            .foregroundStyle(
                MapiTheme.darkMauve
            )

            Text(
                match.date.formatted(
                    date:
                        .abbreviated,
                    time:
                        .shortened
                )
            )
            .font(
                .system(
                    size: 14,
                    weight: .semibold,
                    design: .rounded
                )
            )
            .foregroundStyle(
                MapiTheme.textSecondary
            )

            MapiStatusPill(
                text:
                    match.isHome
                    ? "CASA"
                    : "TRASFERTA",

                color:
                    match.isHome
                    ? MapiTheme.olive
                    : MapiTheme.mauve
            )

            if let location =
                match.location,
               !location.isEmpty {

                Text(
                    location
                )
                .font(
                    .footnote
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
            }
        }
        .frame(
            maxWidth:
                .infinity
        )
    }


    private var formationHomeSection:
        some View {

        VStack(
            spacing: 12
        ) {

            HStack {

                Label(
                    "FORMAZIONE",
                    systemImage:
                        "person.3.fill"
                )
                .font(
                    .system(
                        size: 15,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.olive
                )

                Spacer()
            }

            if lineupConfirmed {

                HStack {

                    VStack(
                        alignment: .leading,
                        spacing: 4
                    ) {

                        Text(
                            "\(fieldPlayersCount)/\(maxPlayersOnField)"
                        )
                        .font(
                            .system(
                                size: 27,
                                weight: .black,
                                design: .rounded
                            )
                        )
                        .foregroundStyle(
                            MapiTheme.darkMauve
                        )

                        Text(
                            "giocatori in campo"
                        )
                        .font(
                            .footnote
                        )
                        .foregroundStyle(
                            MapiTheme.textSecondary
                        )
                    }

                    Spacer()

                    Text(
                        "\(players.count) presenti"
                    )
                    .font(
                        .system(
                            size: 13,
                            weight: .semibold,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.mauve
                    )
                }

                Button(
                    "VAI ALLA PARTITA"
                ) {

                    screen =
                        .live
                }
                .buttonStyle(
                    MapiPrimaryButtonStyle()
                )

            } else {

                Text(
                    matchClockHasStarted
                    ? "Completa la formazione iniziale per avviare il cronometro."
                    : "Seleziona i presenti e poi scegli i 5 titolari."
                )
                .font(
                    .system(
                        size: 14,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
                .multilineTextAlignment(
                    .center
                )

                Button(
                    "IMPOSTA FORMAZIONE"
                ) {

                    openFormationSetup()
                }
                .buttonStyle(
                    MapiPrimaryButtonStyle()
                )
                .disabled(
                    activeRosterPlayers.count <
                        maxPlayersOnField
                )

                if activeRosterPlayers.count <
                    maxPlayersOnField {

                    Text(
                        "Servono almeno \(maxPlayersOnField) tesserati attivi."
                    )
                    .font(
                        .footnote
                    )
                    .foregroundStyle(
                        MapiTheme.mauve
                    )
                }
            }
        }
        .mapiCard(
            accent:
                MapiTheme.olive
        )
    }


    // MARK: - BOTTOM HOME BUTTONS + FOOTER GEESE

    private var homeUtilityButtons:
        some View {

        VStack(
            spacing: 10
        ) {

            HStack(
                spacing: 10
            ) {

                Button {

                    openCalendar(
                        returnTo:
                            .home
                    )

                } label: {

                    Label(
                        "Calendario",
                        systemImage:
                            "calendar"
                    )
                }
                .buttonStyle(
                    MapiSecondaryButtonStyle()
                )


                Button {

                    screen =
                        .roster

                } label: {

                    Label(
                        "Rosa",
                        systemImage:
                            "person.3"
                    )
                }
                .buttonStyle(
                    MapiSecondaryButtonStyle()
                )
            }


            Button {

                historyReturnScreen =
                    .home

                screen =
                    .history

            } label: {

                Label(
                    "STORICO PARTITE",
                    systemImage:
                        "clock.arrow.circlepath"
                )
            }
            .buttonStyle(
                MapiSecondaryButtonStyle()
            )


            Image(
                "FooterGeese"
            )
            .resizable()
            .scaledToFit()
            .frame(
                maxWidth: 300
            )
            .padding(
                .top,
                5
            )
            .padding(
                .bottom,
                2
            )
            .accessibilityHidden(
                true
            )
        }
    }


    // MARK: - LIVE MATCH

    private var liveMatchView:
        some View {

        ZStack {

            MapiTheme.background
                .ignoresSafeArea()

            ScrollView {

                VStack(
                    spacing: 16
                ) {

                    liveOpponentSection

                    scoreSection

                    liveTimerSection

                    timeoutSection

                    suggestionSection

                    playersSection

                    bottomButtons
                }
                .padding(
                    16
                )
                .padding(
                    .bottom,
                    30
                )
            }
        }
        .navigationTitle(
            "Partita"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    screen =
                        .home
                }
            }
        }
    }


    private var liveOpponentSection:
        some View {

        VStack(
            spacing: 8
        ) {

            if let opponent =
                activeOpponentName {

                Text(
                    "MAPI GROUP"
                )
                .font(
                    .system(
                        size: 12,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .tracking(
                    2
                )
                .foregroundStyle(
                    MapiTheme.mauve
                )

                Text(
                    "vs"
                )
                .font(
                    .caption
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )

                Text(
                    opponent
                )
                .font(
                    .system(
                        size: 23,
                        weight: .black,
                        design: .rounded
                    )
                )
                .multilineTextAlignment(
                    .center
                )
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

                if let activeIsHome {

                    MapiStatusPill(
                        text:
                            activeIsHome
                            ? "CASA"
                            : "TRASFERTA",

                        color:
                            activeIsHome
                            ? MapiTheme.olive
                            : MapiTheme.mauve
                    )
                }

            } else {

                Text(
                    "PARTITA LIBERA"
                )
                .font(
                    .system(
                        size: 18,
                        weight: .black,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

                Text(
                    "Nessun avversario associato"
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
            }

            Button(
                activeOpponentName ==
                    nil
                ? "ASSOCIA PARTITA"
                : "CAMBIA PARTITA"
            ) {

                openCalendar(
                    returnTo:
                        .live
                )
            }
            .buttonStyle(
                MapiSecondaryButtonStyle()
            )
        }
        .mapiCard(
            accent:
                MapiTheme.mauve
        )
    }


    private var scoreSection:
        some View {

        VStack(
            spacing: 14
        ) {

            Text(
                "PUNTEGGIO"
            )
            .font(
                .system(
                    size: 13,
                    weight: .bold,
                    design: .rounded
                )
            )
            .tracking(
                2
            )
            .foregroundStyle(
                MapiTheme.mauve
            )

            HStack(
                spacing: 18
            ) {

                VStack(
                    spacing: 4
                ) {

                    Text(
                        "MAPI"
                    )
                    .font(
                        .system(
                            size: 13,
                            weight: .bold,
                            design: .rounded
                        )
                    )

                    Text(
                        "\(ourScore)"
                    )
                    .font(
                        .system(
                            size: 49,
                            weight: .black,
                            design: .rounded
                        )
                    )
                }
                .frame(
                    maxWidth:
                        .infinity
                )

                Text(
                    "—"
                )
                .font(
                    .title
                )
                .foregroundStyle(
                    MapiTheme.mauve
                )

                VStack(
                    spacing: 4
                ) {

                    Text(
                        activeOpponentName ??
                            "AVVERSARI"
                    )
                    .font(
                        .system(
                            size: 12,
                            weight: .bold,
                            design: .rounded
                        )
                    )
                    .lineLimit(
                        1
                    )
                    .minimumScaleFactor(
                        0.65
                    )

                    Text(
                        "\(opponentScore)"
                    )
                    .font(
                        .system(
                            size: 49,
                            weight: .black,
                            design: .rounded
                        )
                    )
                }
                .frame(
                    maxWidth:
                        .infinity
                )
            }
            .foregroundStyle(
                MapiTheme.darkMauve
            )

            Button(
                "⚽  GOL AVVERSARI"
            ) {

                addOpponentGoal()
            }
            .buttonStyle(
                MapiSecondaryButtonStyle()
            )
            .disabled(
                !canRecordMatchEvent
            )

            if !matchEvents.isEmpty {

                Button(
                    "↶  ANNULLA ULTIMO EVENTO"
                ) {

                    undoLastEvent()
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            false
                    )
                )

                VStack(
                    alignment:
                        .leading,
                    spacing: 7
                ) {

                    ForEach(
                        Array(
                            matchEvents
                                .enumerated()
                        ),
                        id:
                            \.element.id
                    ) {
                        index,
                        event in

                        Text(
                            describeEvent(
                                event,
                                index:
                                    index,
                                events:
                                    matchEvents
                            )
                        )
                        .font(
                            .system(
                                size: 12,
                                design: .rounded
                            )
                        )
                        .foregroundStyle(
                            MapiTheme.textSecondary
                        )
                    }
                }
                .frame(
                    maxWidth:
                        .infinity,
                    alignment:
                        .leading
                )
            }
        }
        .mapiCard(
            accent:
                MapiTheme.mauve
        )
    }


    private var liveTimerSection:
        some View {

        VStack(
            spacing: 10
        ) {

            MapiStatusPill(
                text:
                    phaseTitle,
                color:
                    MapiTheme.olive
            )

            Text(
                mainTimerText
            )
            .font(
                .system(
                    size: 60,
                    weight: .black,
                    design: .rounded
                )
            )
            .monospacedDigit()
            .foregroundStyle(
                MapiTheme.darkMauve
            )

            Text(
                "Tempo giocato \(formatTime(totalMatchTime))"
            )
            .font(
                .system(
                    size: 13,
                    weight: .semibold,
                    design: .rounded
                )
            )
            .foregroundStyle(
                MapiTheme.textSecondary
            )

            timerControlButtons
        }
        .mapiCard(
            accent:
                MapiTheme.olive
        )
    }


    private var timeoutSection:
        some View {

        VStack(
            spacing: 10
        ) {

            HStack {

                Label(
                    "TIME-OUT",
                    systemImage:
                        "pause.circle.fill"
                )
                .font(
                    .system(
                        size: 14,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.mauve
                )

                Spacer()
            }

            HStack(
                spacing: 8
            ) {

                Button(
                    "NOI \(ourTimeoutsUsed)/\(timeoutsPerTeamPerHalf)"
                ) {

                    startTimeout(
                        owner:
                            .ours
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            false
                    )
                )
                .disabled(
                    !canUseTimeout ||
                    ourTimeoutsUsed >=
                        timeoutsPerTeamPerHalf
                )

                Button(
                    "AVV. \(opponentTimeoutsUsed)/\(timeoutsPerTeamPerHalf)"
                ) {

                    startTimeout(
                        owner:
                            .opponent
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            false
                    )
                )
                .disabled(
                    !canUseTimeout ||
                    opponentTimeoutsUsed >=
                        timeoutsPerTeamPerHalf
                )
            }
        }
        .mapiCard(
            accent:
                MapiTheme.blush
        )
    }


    private var suggestionSection:
        some View {

        VStack(
            spacing: 10
        ) {

            HStack {

                Label(
                    "CAMBIO CONSIGLIATO",
                    systemImage:
                        "arrow.left.arrow.right"
                )
                .font(
                    .system(
                        size: 14,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.olive
                )

                Spacer()
            }

            if fieldPlayersCount <
                maxPlayersOnField {

                Text(
                    "\(fieldPlayersCount)/\(maxPlayersOnField)"
                )
                .font(
                    .system(
                        size: 30,
                        weight: .black,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

                Text(
                    "Siete momentaneamente con un giocatore in meno."
                )
                .font(
                    .footnote
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )

            } else if let suggestion =
                swapSuggestion {

                HStack(
                    spacing: 12
                ) {

                    Text(
                        suggestion.outName
                    )
                    .font(
                        .system(
                            size: 20,
                            weight: .bold,
                            design: .rounded
                        )
                    )

                    Image(
                        systemName:
                            "arrow.right"
                    )
                    .foregroundStyle(
                        MapiTheme.olive
                    )

                    Text(
                        suggestion.inName
                    )
                    .font(
                        .system(
                            size: 20,
                            weight: .black,
                            design: .rounded
                        )
                    )
                }
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

                Button(
                    "ESEGUI CAMBIO"
                ) {

                    performSwap(
                        suggestion
                    )
                }
                .buttonStyle(
                    MapiPrimaryButtonStyle()
                )

            } else {

                Text(
                    players.count >
                        maxPlayersOnField
                    ? "Rotazione equilibrata"
                    : "Nessun giocatore in panchina"
                )
                .font(
                    .system(
                        size: 14,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
            }
        }
        .mapiCard(
            accent:
                MapiTheme.olive
        )
    }


    private var playersSection:
        some View {

        VStack(
            spacing: 12
        ) {

            HStack {

                Text(
                    "GIOCATORI"
                )
                .font(
                    .system(
                        size: 15,
                        weight: .black,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    MapiTheme.darkMauve
                )

                Spacer()

                MapiStatusPill(
                    text:
                        "\(fieldPlayersCount)/\(maxPlayersOnField) IN CAMPO",

                    color:
                        MapiTheme.olive
                )
            }

            ForEach(
                players
            ) { player in

                playerCard(
                    player
                )
            }
        }
    }


    private func playerCard(
        _ player:
            MatchPlayer
    ) -> some View {

        VStack(
            spacing: 12
        ) {

            HStack {

                VStack(
                    alignment: .leading,
                    spacing: 5
                ) {

                    Text(
                        player.name
                    )
                    .font(
                        .system(
                            size: 19,
                            weight: .black,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.darkMauve
                    )

                    MapiStatusPill(
                        text:
                            player.inField
                            ? "IN CAMPO"
                            : "PANCHINA",

                        color:
                            player.inField
                            ? MapiTheme.olive
                            : MapiTheme.mauve
                    )
                }

                Spacer()

                VStack(
                    alignment: .trailing,
                    spacing: 4
                ) {

                    Text(
                        formatTime(
                            player.timePlayed
                        )
                    )
                    .font(
                        .system(
                            size: 22,
                            weight: .bold,
                            design: .monospaced
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.darkMauve
                    )

                    Text(
                        "⚽ \(goals(for: player.id))   A \(assists(for: player.id))"
                    )
                    .font(
                        .system(
                            size: 12,
                            weight: .semibold,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )
                }
            }

            HStack(
                spacing: 8
            ) {

                Button(
                    "⚽ GOL"
                ) {

                    addOurGoal(
                        for:
                            player.id
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            true
                    )
                )
                .disabled(
                    !player.inField ||
                    !canRecordMatchEvent
                )

                Spacer()

                if player.inField {

                    Button(
                        "ESCE"
                    ) {

                        outgoingSubstitution =
                            OutgoingSubstitutionRequest(
                                outPlayerID:
                                    player.id
                            )
                    }
                    .buttonStyle(
                        MapiCompactButtonStyle(
                            filled:
                                false
                        )
                    )

                } else {

                    Button(
                        fieldPlayersCount <
                            maxPlayersOnField
                        ? "ENTRA"
                        : "CAMBIO"
                    ) {

                        handleBenchPlayerEntry(
                            player.id
                        )
                    }
                    .buttonStyle(
                        MapiCompactButtonStyle(
                            filled:
                                false
                        )
                    )
                }
            }

            HStack(
                spacing: 8
            ) {

                Button(
                    "HANDICAP \(handicapLabel(player.playWeight))"
                ) {

                    cycleHandicap(
                        player.id
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            false
                    )
                )

                Button(
                    player.superpower
                    ? "⚡ SUPER ON"
                    : "⚡ SUPER"
                ) {

                    toggleSuperpower(
                        player.id
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            player.superpower
                    )
                )
            }
        }
        .mapiCard(
            accent:
                player.inField
                ? MapiTheme.olive
                : MapiTheme.mauve
        )
    }


    private var bottomButtons:
        some View {

        VStack(
            spacing: 9
        ) {

            Button(
                "STORICO"
            ) {

                historyReturnScreen =
                    .live

                screen =
                    .history
            }
            .buttonStyle(
                MapiSecondaryButtonStyle()
            )

            if phase !=
                .finished {

                Button(
                    "FINE PARTITA",
                    role:
                        .destructive
                ) {

                    showFinishConfirmation =
                        true
                }
                .font(
                    .system(
                        size: 14,
                        weight: .bold,
                        design: .rounded
                    )
                )
                .foregroundStyle(
                    .red
                )
                .frame(
                    maxWidth:
                        .infinity
                )
                .frame(
                    minHeight:
                        46
                )
                .background(
                    Color.red.opacity(
                        0.08
                    )
                )
                .clipShape(
                    Capsule()
                )
            }
        }
    }


    // MARK: - CALENDAR MATCHING

    private var playedScheduledMatchIDs:
        Set<UUID> {

        Set(
            history.compactMap {
                $0.scheduledMatchID
            }
        )
    }


    private var activeScheduledMatch:
        ScheduledMatch? {

        guard let id =
            activeScheduledMatchID
        else {

            return nil
        }

        return
            scheduledMatches.first {

                $0.id == id
            }
    }


    private var automaticallyDetectedMatch:
        ScheduledMatch? {

        nearestUnplayedScheduledMatch(
            to:
                Date(),

            within:
                automaticMatchWindow
        )
    }


    private var nextScheduledMatch:
        ScheduledMatch? {

        let now =
            Date()

        return
            scheduledMatches
                .filter {

                    $0.date >= now &&
                    !playedScheduledMatchIDs
                        .contains(
                            $0.id
                        )
                }
                .sorted {

                    $0.date <
                        $1.date
                }
                .first
    }


    private func nearestUnplayedScheduledMatch(
        to date: Date,
        within window:
            TimeInterval
    ) -> ScheduledMatch? {

        let candidates =
            scheduledMatches.filter {

                !playedScheduledMatchIDs
                    .contains(
                        $0.id
                    )
            }

        guard let nearest =
            candidates.min(
                by: {

                    abs(
                        $0.date
                            .timeIntervalSince(
                                date
                            )
                    )
                    <
                    abs(
                        $1.date
                            .timeIntervalSince(
                                date
                            )
                    )
                }
            )
        else {

            return nil
        }

        guard
            abs(
                nearest.date
                    .timeIntervalSince(
                        date
                    )
            )
            <=
            window
        else {

            return nil
        }

        return nearest
    }


    private func associateNearestScheduledMatchIfNeeded() {

        guard
            activeScheduledMatchID ==
                nil
        else {

            return
        }

        guard let match =
            nearestUnplayedScheduledMatch(
                to:
                    Date(),

                within:
                    automaticMatchWindow
            )
        else {

            return
        }

        associateScheduledMatch(
            match
        )
    }


    private func associateScheduledMatch(
        _ match:
            ScheduledMatch
    ) {

        activeScheduledMatchID =
            match.id

        activeOpponentName =
            match.opponentName

        activeIsHome =
            match.isHome
    }


    private func clearScheduledMatchAssociation() {

        activeScheduledMatchID =
            nil

        activeOpponentName =
            nil

        activeIsHome =
            nil
    }


    private func openCalendar(
        returnTo:
            AppScreen
    ) {

        calendarReturnScreen =
            returnTo

        screen =
            .calendar
    }


    private func updateSchedule(
        _ matches:
            [ScheduledMatch]
    ) {

        scheduledMatches =
            matches.sorted {
                $0.date <
                    $1.date
            }

        saveSchedule(
            scheduledMatches
        )

        if let selectedID =
            activeScheduledMatchID {

            if let updated =
                scheduledMatches.first(
                    where: {

                        $0.id ==
                            selectedID
                    }
                ) {

                activeOpponentName =
                    updated
                        .opponentName

                activeIsHome =
                    updated
                        .isHome

            } else {

                clearScheduledMatchAssociation()
            }
        }
    }


    // MARK: - TIMER

    private var timerButtonTitle:
        String {

        if phase ==
            .halftime {

            return
                isRunning
                ? "PAUSA INTERVALLO"
                : "AVVIA INTERVALLO"
        }

        if isRunning {

            return "PAUSA"
        }

        if timing.resumeAfterTimeout || matchClockHasStarted {

            return "RIPRENDI"
        }

        return "AVVIA"
    }


    private func toggleMainTimer() {

        let result = timing.toggleMainClock()
        syncPlayerTimesFromTiming()

        if timing.phase == .finished {
            finishMatch()
            return
        }

        switch result {
        case .requiresConfirmedStartingLineup:
            // Reuse the existing preparation flow; entering it never starts the clock.
            screen = .presence

        case .started:
            hasActiveMatch = true
            associateNearestScheduledMatchIfNeeded()

        case .paused, .resumed, .halftimeStarted, .halftimePaused, .unavailable:
            break
        }
    }


    private func handleTimerTick() {

        guard
            hasActiveMatch
        else {

            return
        }

        timing.synchronize()
        syncPlayerTimesFromTiming()

        if timing.phase == .finished {
            finishMatch()
        }
    }


    private func synchronizeMatchTiming() {

        timing.synchronize()
        syncPlayerTimesFromTiming()
        if timing.phase == .finished {
            finishMatch()
        }
    }


    private func syncPlayerTimesFromTiming() {

        let participantTimes = timing.participantSecondsPlayed
        for index in players.indices {
            if let seconds = participantTimes[players[index].id] {
                players[index].timePlayed = seconds
            }
        }
    }


    // MARK: - FORMATION

    private func openFormationSetup() {

        if selectedPresentIDs
            .isEmpty {

            selectedStarterIDs
                .removeAll()
        }

        screen =
            .presence
    }


    private func prepareStarterSelection() {

        selectedStarterIDs =
            selectedStarterIDs
                .intersection(
                    selectedPresentIDs
                )

        if selectedPresentIDs.count ==
            maxPlayersOnField {

            selectedStarterIDs =
                selectedPresentIDs
        }

        let presentIDs = selectedPresentPlayers.map(\.id)
        _ = timing.confirmAttendance(presentPlayerIDs: presentIDs)
    }


    private func confirmInitialLineup() {

        guard
            selectedPresentIDs.count >=
                maxPlayersOnField
        else {

            return
        }

        guard
            selectedStarterIDs.count ==
                maxPlayersOnField
        else {

            return
        }

        guard
            selectedStarterIDs
                .isSubset(
                    of:
                        selectedPresentIDs
                )
        else {

            return
        }

        let selectedPlayers = roster.filter {
            $0.active && selectedPresentIDs.contains($0.id)
        }
        let selectedPlayerIDs = selectedPlayers.map(\.id)
        guard
            selectedPlayers.count == selectedPresentIDs.count,
            Set(selectedPlayerIDs).count == selectedPlayerIDs.count,
            timing.confirmAttendance(presentPlayerIDs: selectedPlayerIDs),
            timing.confirmStartingLineup(fieldPlayerIDs: selectedStarterIDs)
        else {
            return
        }

        hasActiveMatch = true
        hasSavedCurrentMatch = false
        associateNearestScheduledMatchIfNeeded()

        players =
            selectedPlayers.map {
                rosterPlayer in

                let isStarter =
                    selectedStarterIDs
                        .contains(
                            rosterPlayer.id
                        )

                return MatchPlayer(
                    rosterPlayer:
                        rosterPlayer,

                    inField:
                        isStarter
                )
            }

        screen =
            .live
    }


    // MARK: - SUBSTITUTIONS

    private func handleBenchPlayerEntry(
        _ id: UUID
    ) {

        synchronizeMatchTiming()
        guard phase != .finished else {
            return
        }

        guard let index =
            players.firstIndex(
                where: {
                    $0.id ==
                        id
                }
            )
        else {

            return
        }

        guard
            !players[index]
                .inField
        else {

            return
        }

        if fieldPlayersCount <
            maxPlayersOnField {

            _ = timing.setParticipantInField(id, inField: true)
            syncPlayerTimesFromTiming()
            players[index]
                .inField =
                true

            return
        }

        incomingSubstitution =
            IncomingSubstitutionRequest(
                inPlayerID:
                    id
            )
    }


    private func performManualSubstitution(
        outID: UUID,
        inID: UUID
    ) {

        synchronizeMatchTiming()
        guard phase != .finished else {
            return
        }

        guard
            outID !=
                inID
        else {

            return
        }

        guard let outIndex =
            players.firstIndex(
                where: {
                    $0.id ==
                        outID
                }
            )
        else {

            return
        }

        guard let inIndex =
            players.firstIndex(
                where: {
                    $0.id ==
                        inID
                }
            )
        else {

            return
        }

        guard
            players[outIndex]
                .inField
        else {

            return
        }

        guard
            !players[inIndex]
                .inField
        else {

            return
        }

        guard timing.substitute(outgoingID: outID, incomingID: inID) else {
            return
        }
        syncPlayerTimesFromTiming()

        players[outIndex]
            .inField =
            false

        players[inIndex]
            .inField =
            true
    }


    private func removePlayerWithoutReplacement(
        _ id: UUID
    ) {

        synchronizeMatchTiming()
        guard phase != .finished else {
            return
        }

        guard let index =
            players.firstIndex(
                where: {
                    $0.id ==
                        id
                }
            )
        else {

            return
        }

        _ = timing.setParticipantInField(id, inField: false)
        syncPlayerTimesFromTiming()
        players[index]
            .inField =
            false
    }


    private func player(
        withID id:
            UUID
    ) -> MatchPlayer? {

        players.first {
            $0.id ==
                id
        }
    }


    // MARK: - GOALS

    private var canRecordMatchEvent:
        Bool {

        matchClockHasStarted &&
        (
            phase ==
                .firstHalf ||
            phase ==
                .secondHalf
        )
    }


    private func addOurGoal(
        for playerID:
            UUID
    ) {

        synchronizeMatchTiming()
        guard phase != .finished else {
            return
        }

        guard
            canRecordMatchEvent
        else {

            return
        }

        guard
            let player =
                player(
                    withID:
                        playerID
                ),
            player.inField
        else {

            return
        }

        let event =
            GoalEvent(
                team:
                    .ours,

                matchSecond:
                    totalMatchTime,

                scorerID:
                    player.id,

                scorerName:
                    player.name
            )

        matchEvents.append(
            event
        )

        pendingAssist =
            PendingAssist(
                goalEventID:
                    event.id,

                scorerID:
                    player.id,

                scorerName:
                    player.name
            )
    }


    private func addAssist(
        _ player:
            MatchPlayer,
        toGoalEventID eventID:
            UUID
    ) {

        guard let index =
            matchEvents.firstIndex(
                where: {
                    $0.id ==
                        eventID
                }
            )
        else {

            return
        }

        guard
            matchEvents[index]
                .team ==
                .ours
        else {

            return
        }

        matchEvents[index]
            .assistID =
            player.id

        matchEvents[index]
            .assistName =
            player.name
    }


    private func addOpponentGoal() {

        synchronizeMatchTiming()
        guard phase != .finished else {
            return
        }

        guard
            canRecordMatchEvent
        else {

            return
        }

        matchEvents.append(
            GoalEvent(
                team:
                    .opponent,

                matchSecond:
                    totalMatchTime
            )
        )
    }


    private func undoLastEvent() {

        guard
            !matchEvents
                .isEmpty
        else {

            return
        }

        let removed =
            matchEvents
                .removeLast()

        if pendingAssist?
            .goalEventID ==
            removed.id {

            pendingAssist =
                nil
        }
    }


    private func goals(
        for id:
            UUID
    ) -> Int {

        matchEvents.filter {

            $0.team ==
                .ours &&
            $0.scorerID ==
                id

        }.count
    }


    private func assists(
        for id:
            UUID
    ) -> Int {

        matchEvents.filter {

            $0.team ==
                .ours &&
            $0.assistID ==
                id

        }.count
    }


    private var ourScore:
        Int {

        matchEvents.filter {
            $0.team ==
                .ours
        }.count
    }


    private var opponentScore:
        Int {

        matchEvents.filter {
            $0.team ==
                .opponent
        }.count
    }


    // MARK: - ROTATION

    private var swapSuggestion:
        SwapSuggestion? {

        guard
            fieldPlayersCount ==
                maxPlayersOnField
        else {

            return nil
        }

        let field =
            players.filter {

                $0.inField &&
                !$0.superpower
            }

        let bench =
            players.filter {

                !$0.inField
            }

        guard let playerOut =
            field.max(
                by: {

                    fairnessScore(
                        $0
                    )
                    <
                    fairnessScore(
                        $1
                    )
                }
            )
        else {

            return nil
        }

        guard let playerIn =
            bench.min(
                by: {

                    fairnessScore(
                        $0
                    )
                    <
                    fairnessScore(
                        $1
                    )
                }
            )
        else {

            return nil
        }

        let difference =
            fairnessScore(
                playerOut
            )
            -
            fairnessScore(
                playerIn
            )

        guard
            difference >=
                Double(
                    swapThreshold
                )
        else {

            return nil
        }

        return
            SwapSuggestion(
                outPlayerID:
                    playerOut.id,

                inPlayerID:
                    playerIn.id,

                outName:
                    playerOut.name,

                inName:
                    playerIn.name
            )
    }


    private func fairnessScore(
        _ player:
            MatchPlayer
    ) -> Double {

        Double(
            player.timePlayed
        )
        /
        max(
            player.playWeight,
            0.25
        )
    }


    private func performSwap(
        _ suggestion:
            SwapSuggestion
    ) {

        performManualSubstitution(
            outID:
                suggestion
                    .outPlayerID,

            inID:
                suggestion
                    .inPlayerID
        )
    }


    // MARK: - HANDICAP

    private func cycleHandicap(
        _ id: UUID
    ) {

        guard let index =
            players.firstIndex(
                where: {
                    $0.id ==
                        id
                }
            )
        else {

            return
        }

        switch
            players[index]
                .playWeight {

        case 1.0:

            players[index]
                .playWeight =
                0.75

        case 0.75:

            players[index]
                .playWeight =
                0.50

        case 0.50:

            players[index]
                .playWeight =
                0.25

        default:

            players[index]
                .playWeight =
                1.0
        }
    }


    private func handicapLabel(
        _ weight:
            Double
    ) -> String {

        "\(Int(weight * 100))%"
    }


    private func toggleSuperpower(
        _ id: UUID
    ) {

        guard let index =
            players.firstIndex(
                where: {
                    $0.id ==
                        id
                }
            )
        else {

            return
        }

        players[index]
            .superpower
            .toggle()
    }


    // MARK: - TIMEOUT

    private var canUseTimeout:
        Bool {

        matchClockHasStarted &&
        (
            phase ==
                .firstHalf ||
            phase ==
                .secondHalf
        )
        &&
        !inTimeout
    }


    private func startTimeout(
        owner: MatchTimeoutOwner
    ) {

        synchronizeMatchTiming()
        guard canUseTimeout else {
            return
        }

        _ = timing.startTimeout(for: owner)
        synchronizeMatchTiming()
    }


    private func endTimeout() {

        timing.endTimeout()
        synchronizeMatchTiming()
    }


    private func startSecondHalf() {

        synchronizeMatchTiming()
        guard phase == .halftime else {
            return
        }
        timing.startSecondHalfManually()
        synchronizeMatchTiming()
    }


    // MARK: - FINISH

    private func finishMatch() {

        guard hasActiveMatch, !hasSavedCurrentMatch else {
            return
        }

        timing.synchronize()
        syncPlayerTimesFromTiming()
        timing.finish()
        hasSavedCurrentMatch = true
        associateNearestScheduledMatchIfNeeded()

        pendingAssist =
            nil

        outgoingSubstitution =
            nil

        incomingSubstitution =
            nil

        let summaries =
            players.map {
                player in

                PlayerMatchSummary(
                    player:
                        player,

                    goals:
                        goals(
                            for:
                                player.id
                        ),

                    assists:
                        assists(
                            for:
                                player.id
                        )
                )
            }

        let recordDate =
            activeScheduledMatch?
                .date
            ??
            Date()

        let record =
            MatchRecord(
                date:
                    recordDate,

                duration:
                    totalMatchTime,

                players:
                    summaries,

                ourScore:
                    ourScore,

                opponentScore:
                    opponentScore,

                events:
                    matchEvents,

                scheduledMatchID:
                    activeScheduledMatchID,

                opponentName:
                    activeOpponentName,

                isHome:
                    activeIsHome
            )

        history.insert(
            record,
            at:
                0
        )

        saveHistory(
            history
        )

        latestRecord =
            record
    }


    private func startNewMatch() {

        resetMatchProgress()

        hasActiveMatch =
            false

        hasSavedCurrentMatch = false
        players.removeAll()

        selectedPresentIDs
            .removeAll()

        selectedStarterIDs
            .removeAll()

        clearScheduledMatchAssociation()

        screen =
            .home
    }


    private func resetMatchProgress() {

        timing.reset()
        hasSavedCurrentMatch = false

        // Reset eventi
        matchEvents
            .removeAll()

        pendingAssist =
            nil

        // Reset cambi
        outgoingSubstitution =
            nil

        incomingSubstitution =
            nil
    }


    // MARK: - HELPERS

    private var activeRosterPlayers:
        [RosterPlayer] {

        roster.filter {

            $0.active &&
            !clean(
                $0.name
            )
            .isEmpty
        }
    }


    private var selectedPresentPlayers:
        [RosterPlayer] {

        activeRosterPlayers
            .filter {

                selectedPresentIDs
                    .contains(
                        $0.id
                    )
            }
    }


    private func updateHistoryRecord(
        _ updatedRecord:
            MatchRecord
    ) {

        guard let index =
            history.firstIndex(
                where: {
                    $0.id ==
                        updatedRecord.id
                }
            )
        else {

            return
        }

        history[index] =
            updatedRecord

        saveHistory(
            history
        )
    }


    private func deleteHistoryRecord(
        _ id:
            UUID
    ) {

        history.removeAll {
            $0.id ==
                id
        }

        saveHistory(
            history
        )

        screen =
            .history
    }


    // MARK: - PERSISTENCE

    private func saveRoster(
        _ roster:
            [RosterPlayer]
    ) {

        guard let data =
            try?
                JSONEncoder()
                    .encode(
                        roster
                    )
        else {

            return
        }

        UserDefaults
            .standard
            .set(
                data,
                forKey:
                    rosterKey
            )
    }


    private func loadRoster() {

        guard
            let data =
                UserDefaults
                    .standard
                    .data(
                        forKey:
                            rosterKey
                    ),

            let decoded =
                try?
                    JSONDecoder()
                        .decode(
                            [RosterPlayer]
                                .self,
                            from:
                                data
                        )
        else {

            return
        }

        roster =
            decoded
    }


    private func saveSchedule(
        _ matches:
            [ScheduledMatch]
    ) {

        guard let data =
            try?
                JSONEncoder()
                    .encode(
                        matches
                    )
        else {

            return
        }

        UserDefaults
            .standard
            .set(
                data,
                forKey:
                    scheduleKey
            )
    }


    private func loadSchedule() {

        guard
            let data =
                UserDefaults
                    .standard
                    .data(
                        forKey:
                            scheduleKey
                    ),

            let decoded =
                try?
                    JSONDecoder()
                        .decode(
                            [ScheduledMatch]
                                .self,
                            from:
                                data
                        )
        else {

            return
        }

        scheduledMatches =
            decoded.sorted {

                $0.date <
                    $1.date
            }
    }


    private func saveHistory(
        _ records:
            [MatchRecord]
    ) {

        guard let data =
            try?
                JSONEncoder()
                    .encode(
                        records
                    )
        else {

            return
        }

        UserDefaults
            .standard
            .set(
                data,
                forKey:
                    historyKey
            )
    }


    private func loadHistory() {

        guard
            let data =
                UserDefaults
                    .standard
                    .data(
                        forKey:
                            historyKey
                    ),

            let decoded =
                try?
                    JSONDecoder()
                        .decode(
                            [MatchRecord]
                                .self,
                            from:
                                data
                        )
        else {

            return
        }

        history =
            decoded
    }


    // MARK: - COMPUTED

    private var fieldPlayersCount:
        Int {

        players.filter {
            $0.inField
        }.count
    }


    private var totalMatchTime:
        Int {

        timing.totalMatchElapsedSeconds
    }


    private var phaseTitle:
        String {

        if inTimeout {

            return
                "TIME-OUT \(timeoutOwner)"
        }

        switch phase {

        case .firstHalf:

            return
                "1° TEMPO"

        case .halftime:

            return
                "INTERVALLO"

        case .secondHalf:

            return
                "2° TEMPO"

        case .finished:

            return
                "PARTITA TERMINATA"
        }
    }


    private var mainTimerText:
        String {

        if inTimeout {

            return
                formatTime(
                    timeoutRemaining
                )
        }

        switch phase {

        case .firstHalf:

            return
                formatTime(
                    halfDuration -
                        firstHalfElapsed
                )

        case .halftime:

            return
                formatTime(
                    halftimeRemaining
                )

        case .secondHalf:

            return
                formatTime(
                    halfDuration -
                        secondHalfElapsed
                )

        case .finished:

            return
                formatTime(
                    totalMatchTime
                )
        }
    }
}


// MARK: - WELCOME

struct WelcomeView: View {

    let onEnter: () -> Void

    @State private var showTitle = false
    @State private var showButton = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Image("WelcomeBackground")
                    .resizable()
                    .scaledToFill()
                    .frame(
                        width: geometry.size.width,
                        height: geometry.size.height
                    )
                    .clipped()
                    .ignoresSafeArea()

                Image("WelcomeLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(
                        width: min(290, geometry.size.width - 80)
                    )
                    .position(
                        x: geometry.size.width / 2,
                        y: geometry.size.height * 0.28
                    )
                    .opacity(showTitle ? 1 : 0)
                    .scaleEffect(showTitle ? 1 : 0.78)
                    .offset(y: showTitle ? 0 : -18)
                    .accessibilityLabel("MAPI 5 GROUP")

                Button {
                    onEnter()
                } label: {
                    HStack(spacing: 11) {
                        Text("ENTRA")
                            .font(
                                .system(
                                    size: 18,
                                    weight: .bold,
                                    design: .rounded
                                )
                            )
                            .tracking(2)

                        Image(systemName: "arrow.right")
                            .font(
                                .system(
                                    size: 16,
                                    weight: .bold
                                )
                            )
                    }
                    .foregroundStyle(.white)
                    .frame(
                        width: min(220, geometry.size.width - 80),
                        height: 58
                    )
                    .background(MapiTheme.olive)
                    .clipShape(Capsule())
                    .shadow(
                        color: .black.opacity(0.18),
                        radius: 12,
                        y: 6
                    )
                }
                .buttonStyle(.plain)
                .position(
                    x: geometry.size.width / 2,
                    y: geometry.size.height * 0.50
                )
                .opacity(showButton ? 1 : 0)
                .scaleEffect(showButton ? 1 : 0.84)
                .offset(y: showButton ? 0 : 14)
            }
        }
        .ignoresSafeArea()
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            withAnimation(
                .spring(
                    response: 0.65,
                    dampingFraction: 0.62
                )
            ) {
                showTitle = true
            }

            DispatchQueue.main.asyncAfter(
                deadline: .now() + 0.16
            ) {
                withAnimation(
                    .spring(
                        response: 0.58,
                        dampingFraction: 0.68
                    )
                ) {
                    showButton = true
                }
            }
        }
    }
}


// MARK: - ARC TEXT

struct ArcText:
    View {

    let text:
        String

    let radius:
        CGFloat

    let startAngle:
        Double

    let endAngle:
        Double

    let fontSize:
        CGFloat


    var body:
        some View {

        GeometryReader {
            geometry in

            let characters =
                Array(
                    text
                )

            let center =
                CGPoint(
                    x:
                        geometry.size.width /
                        2,
                    y:
                        geometry.size.height /
                        2
                )

            ForEach(
                Array(
                    characters
                        .enumerated()
                ),
                id:
                    \.offset
            ) {
                index,
                character in

                let progress =
                    characters.count <=
                        1
                    ? 0.5
                    :
                    Double(
                        index
                    )
                    /
                    Double(
                        characters.count -
                            1
                    )

                let angle =
                    startAngle +
                    (
                        endAngle -
                            startAngle
                    )
                    *
                    progress

                let radians =
                    angle *
                    .pi /
                    180

                let x =
                    center.x +
                    radius *
                    CGFloat(
                        cos(
                            radians
                        )
                    )

                let y =
                    center.y +
                    radius *
                    CGFloat(
                        sin(
                            radians
                        )
                    )

                Text(
                    String(
                        character
                    )
                )
                .font(
                    .system(
                        size:
                            fontSize,
                        weight:
                            .black,
                        design:
                            .rounded
                    )
                )
                .position(
                    x:
                        x,
                    y:
                        y
                )
            }
        }
    }
}


// MARK: - CALENDAR MANAGEMENT

struct CalendarManagementView:
    View {

    @State private var matches:
        [ScheduledMatch]

    let history:
        [MatchRecord]

    let selectedMatchID:
        UUID?

    let onSave:
        ([ScheduledMatch]) -> Void

    let onSelectForCurrentMatch:
        (ScheduledMatch) -> Void

    let onClearSelection:
        () -> Void

    let onBack:
        () -> Void

    @State private var showNewMatch =
        false

    @State private var editingMatch:
        ScheduledMatch?

    @State private var deletingMatch:
        ScheduledMatch?

    @State private var showFileImporter =
        false

    @State private var importPreview:
        CalendarImportPreview?

    @State private var importError:
        String?


    init(
        initialMatches:
            [ScheduledMatch],
        history:
            [MatchRecord],
        selectedMatchID:
            UUID?,
        onSave:
            @escaping
            ([ScheduledMatch]) -> Void,
        onSelectForCurrentMatch:
            @escaping
            (ScheduledMatch) -> Void,
        onClearSelection:
            @escaping
            () -> Void,
        onBack:
            @escaping
            () -> Void
    ) {

        _matches =
            State(
                initialValue:
                    initialMatches
                        .sorted {

                            $0.date <
                                $1.date
                        }
            )

        self.history =
            history

        self.selectedMatchID =
            selectedMatchID

        self.onSave =
            onSave

        self.onSelectForCurrentMatch =
            onSelectForCurrentMatch

        self.onClearSelection =
            onClearSelection

        self.onBack =
            onBack
    }


    var body:
        some View {

        List {

            Section {

                Button {

                    showFileImporter =
                        true

                } label: {

                    Label(
                        "Importa calendario CSV",
                        systemImage:
                            "square.and.arrow.down"
                    )
                }

                Text(
                    "Formato: giornata, data, ora, avversario, casa. Luogo e note sono opzionali."
                )
                .font(
                    .footnote
                )
                .foregroundStyle(
                    MapiTheme.textSecondary
                )
            }

            if matches.isEmpty {

                ContentUnavailableView(
                    "Calendario vuoto",
                    systemImage:
                        "calendar.badge.plus",
                    description:
                        Text(
                            "Aggiungi una partita oppure importa il calendario."
                        )
                )

            } else {

                if !upcomingMatches
                    .isEmpty {

                    Section(
                        "Prossime"
                    ) {

                        ForEach(
                            upcomingMatches
                        ) {
                            match in

                            calendarRow(
                                match
                            )
                        }
                    }
                }

                if !pastMatches
                    .isEmpty {

                    Section(
                        "Passate"
                    ) {

                        ForEach(
                            pastMatches
                        ) {
                            match in

                            calendarRow(
                                match
                            )
                        }
                    }
                }
            }
        }
        .scrollContentBackground(
            .hidden
        )
        .background(
            MapiTheme.background
        )
        .tint(
            MapiTheme.olive
        )
        .navigationTitle(
            "Calendario"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    onBack()
                }
            }

            ToolbarItem(
                placement:
                    .primaryAction
            ) {

                Button {

                    showNewMatch =
                        true

                } label: {

                    Image(
                        systemName:
                            "plus"
                    )
                }
            }
        }
        .fileImporter(
            isPresented:
                $showFileImporter,
            allowedContentTypes:
                [
                    .commaSeparatedText,
                    .plainText
                ],
            allowsMultipleSelection:
                false
        ) {
            result in

            handleImportResult(
                result
            )
        }
        .sheet(
            isPresented:
                $showNewMatch
        ) {

            ScheduledMatchEditorView(
                initialMatch:
                    nil
            ) {
                match in

                matches.append(
                    match
                )

                normalizeAndSave()
            }
        }
        .sheet(
            item:
                $editingMatch
        ) {
            match in

            ScheduledMatchEditorView(
                initialMatch:
                    match
            ) {
                updated in

                guard let index =
                    matches.firstIndex(
                        where: {

                            $0.id ==
                                updated.id
                        }
                    )
                else {

                    return
                }

                matches[index] =
                    updated

                normalizeAndSave()
            }
        }
        .sheet(
            item:
                $importPreview
        ) {
            preview in

            CalendarImportPreviewView(
                preview:
                    preview,

                onAppend: {

                    appendImported(
                        preview.matches
                    )

                    importPreview =
                        nil
                },

                onReplace: {

                    replaceImported(
                        preview.matches
                    )

                    importPreview =
                        nil
                }
            )
        }
        .alert(
            "Importazione non riuscita",
            isPresented:
                Binding(
                    get: {

                        importError !=
                            nil
                    },

                    set: {
                        value in

                        if !value {

                            importError =
                                nil
                        }
                    }
                )
        ) {

            Button(
                "OK"
            ) {

                importError =
                    nil
            }

        } message: {

            Text(
                importError ??
                    ""
            )
        }
        .alert(
            "Eliminare la partita?",
            isPresented:
                Binding(
                    get: {

                        deletingMatch !=
                            nil
                    },

                    set: {
                        value in

                        if !value {

                            deletingMatch =
                                nil
                        }
                    }
                )
        ) {

            Button(
                "Annulla",
                role:
                    .cancel
            ) {

                deletingMatch =
                    nil
            }

            Button(
                "Elimina",
                role:
                    .destructive
            ) {

                if let deletingMatch {

                    matches.removeAll {

                        $0.id ==
                            deletingMatch.id
                    }

                    normalizeAndSave()
                }

                deletingMatch =
                    nil
            }
        }
    }


    private var upcomingMatches:
        [ScheduledMatch] {

        let cutoff =
            Calendar.current.date(
                byAdding:
                    .hour,
                value:
                    -6,
                to:
                    Date()
            )
            ??
            Date()

        return matches.filter {

            $0.date >=
                cutoff
        }
    }


    private var pastMatches:
        [ScheduledMatch] {

        let cutoff =
            Calendar.current.date(
                byAdding:
                    .hour,
                value:
                    -6,
                to:
                    Date()
            )
            ??
            Date()

        return matches.filter {

            $0.date <
                cutoff
        }
    }


    private func historyRecord(
        for match:
            ScheduledMatch
    ) -> MatchRecord? {

        history.first {

            $0.scheduledMatchID ==
                match.id
        }
    }


    @ViewBuilder
    private func calendarRow(
        _ match:
            ScheduledMatch
    ) -> some View {

        VStack(
            alignment:
                .leading,
            spacing:
                10
        ) {

            HStack {

                VStack(
                    alignment:
                        .leading,
                    spacing:
                        4
                ) {

                    if let round =
                        match.round,
                       !round.isEmpty {

                        Text(
                            round
                        )
                        .font(
                            .caption
                        )
                        .foregroundStyle(
                            MapiTheme.mauve
                        )
                    }

                    Text(
                        match.opponentName
                    )
                    .font(
                        .system(
                            size: 18,
                            weight: .bold,
                            design: .rounded
                        )
                    )

                    Text(
                        match.date.formatted(
                            date:
                                .abbreviated,
                            time:
                                .shortened
                        )
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )

                    MapiStatusPill(
                        text:
                            match.isHome
                            ? "CASA"
                            : "TRASFERTA",
                        color:
                            match.isHome
                            ? MapiTheme.olive
                            : MapiTheme.mauve
                    )
                }

                Spacer()

                if let record =
                    historyRecord(
                        for:
                            match
                    ) {

                    Text(
                        "\(record.ourScore ?? 0)-\(record.opponentScore ?? 0)"
                    )
                    .font(
                        .system(
                            size: 22,
                            weight: .black,
                            design: .rounded
                        )
                    )

                } else if selectedMatchID ==
                    match.id {

                    Image(
                        systemName:
                            "checkmark.circle.fill"
                    )
                    .foregroundStyle(
                        MapiTheme.olive
                    )
                    .font(
                        .title2
                    )
                }
            }

            HStack {

                if historyRecord(
                    for:
                        match
                ) ==
                    nil {

                    if selectedMatchID ==
                        match.id {

                        Button(
                            "RIMUOVI"
                        ) {

                            onClearSelection()
                        }

                    } else {

                        Button(
                            "USA PER LA PARTITA"
                        ) {

                            onSelectForCurrentMatch(
                                match
                            )
                        }
                    }
                }

                Spacer()

                Button(
                    "Modifica"
                ) {

                    editingMatch =
                        match
                }

                Button(
                    "Elimina",
                    role:
                        .destructive
                ) {

                    deletingMatch =
                        match
                }
            }
            .font(
                .caption
            )
        }
        .padding(
            .vertical,
            5
        )
        .listRowBackground(
            MapiTheme.surface
        )
    }


    private func handleImportResult(
        _ result:
            Result<
                [URL],
                Error
            >
    ) {

        switch result {

        case .failure(
            let error
        ):

            importError =
                error
                    .localizedDescription


        case .success(
            let urls
        ):

            guard let url =
                urls.first
            else {

                importError =
                    "Nessun file selezionato."

                return
            }

            let access =
                url
                    .startAccessingSecurityScopedResource()

            defer {

                if access {

                    url
                        .stopAccessingSecurityScopedResource()
                }
            }

            do {

                let data =
                    try Data(
                        contentsOf:
                            url
                    )

                let text:
                    String

                if let utf8 =
                    String(
                        data:
                            data,
                        encoding:
                            .utf8
                    ) {

                    text =
                        utf8

                } else if let latin =
                    String(
                        data:
                            data,
                        encoding:
                            .isoLatin1
                    ) {

                    text =
                        latin

                } else {

                    throw
                        CocoaError(
                            .fileReadInapplicableStringEncoding
                        )
                }

                let preview =
                    try
                        ScheduleCSVImporter
                            .parse(
                                text
                            )

                guard
                    !preview.matches
                        .isEmpty
                else {

                    importError =
                        preview.issues
                            .isEmpty
                        ? "Il file non contiene partite importabili."
                        :
                        preview.issues
                            .joined(
                                separator:
                                    "\n"
                            )

                    return
                }

                importPreview =
                    preview

            } catch {

                importError =
                    error
                        .localizedDescription
            }
        }
    }


    private func appendImported(
        _ imported:
            [ScheduledMatch]
    ) {

        for match in imported {

            let duplicate =
                matches.contains {
                    existing in

                    sameCalendarIdentity(
                        existing,
                        match
                    )
                }

            if !duplicate {

                matches.append(
                    match
                )
            }
        }

        normalizeAndSave()
    }


    private func replaceImported(
        _ imported:
            [ScheduledMatch]
    ) {

        var replaced:
            [ScheduledMatch] = []

        for importedMatch in
            imported {

            if let old =
                matches.first(
                    where: {

                        sameCalendarIdentity(
                            $0,
                            importedMatch
                        )
                    }
                ) {

                replaced.append(
                    ScheduledMatch(
                        id:
                            old.id,
                        round:
                            importedMatch.round,
                        opponentName:
                            importedMatch.opponentName,
                        date:
                            importedMatch.date,
                        isHome:
                            importedMatch.isHome,
                        location:
                            importedMatch.location,
                        notes:
                            importedMatch.notes
                    )
                )

            } else {

                replaced.append(
                    importedMatch
                )
            }
        }

        matches =
            replaced

        normalizeAndSave()
    }


    private func sameCalendarIdentity(
        _ lhs:
            ScheduledMatch,
        _ rhs:
            ScheduledMatch
    ) -> Bool {

        let sameOpponent =
            lhs.opponentName
                .localizedCaseInsensitiveCompare(
                    rhs.opponentName
                )
            ==
            .orderedSame

        guard sameOpponent
        else {

            return false
        }

        let leftRound =
            clean(
                lhs.round ??
                    ""
            )

        let rightRound =
            clean(
                rhs.round ??
                    ""
            )

        if
            !leftRound.isEmpty,
            !rightRound.isEmpty,
            leftRound
                .localizedCaseInsensitiveCompare(
                    rightRound
                )
            ==
            .orderedSame {

            return true
        }

        return
            abs(
                lhs.date
                    .timeIntervalSince(
                        rhs.date
                    )
            )
            <
            60
    }


    private func normalizeAndSave() {

        matches =
            matches.sorted {

                $0.date <
                    $1.date
            }

        onSave(
            matches
        )
    }
}


// MARK: - IMPORT PREVIEW

struct CalendarImportPreviewView:
    View {

    let preview:
        CalendarImportPreview

    let onAppend:
        () -> Void

    let onReplace:
        () -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    var body:
        some View {

        NavigationStack {

            List {

                Section {

                    LabeledContent(
                        "Partite trovate",
                        value:
                            "\(preview.matches.count)"
                    )

                    LabeledContent(
                        "Avvisi",
                        value:
                            "\(preview.issues.count)"
                    )
                }

                Section(
                    "Anteprima"
                ) {

                    ForEach(
                        preview.matches
                    ) {
                        match in

                        VStack(
                            alignment:
                                .leading,
                            spacing:
                                4
                        ) {

                            Text(
                                match.opponentName
                            )
                            .font(
                                .headline
                            )

                            Text(
                                match.date.formatted(
                                    date:
                                        .abbreviated,
                                    time:
                                        .shortened
                                )
                            )
                            .foregroundStyle(
                                MapiTheme.textSecondary
                            )
                        }
                    }
                }

                if !preview.issues.isEmpty {

                    Section(
                        "Avvisi"
                    ) {

                        ForEach(
                            Array(
                                preview.issues.enumerated()
                            ),
                            id:
                                \.offset
                        ) {
                            _,
                            issue in

                            Text(
                                issue
                            )
                            .font(
                                .footnote
                            )
                        }
                    }
                }

                Section {

                    Button(
                        "AGGIUNGI AL CALENDARIO"
                    ) {

                        onAppend()

                        dismiss()
                    }

                    Button(
                        "SOSTITUISCI CALENDARIO",
                        role:
                            .destructive
                    ) {

                        onReplace()

                        dismiss()
                    }
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Importazione"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }
            }
        }
    }
}


// MARK: - SCHEDULE EDITOR

struct ScheduledMatchEditorView:
    View {

    @State private var round:
        String

    @State private var opponentName:
        String

    @State private var date:
        Date

    @State private var isHome:
        Bool

    @State private var location:
        String

    @State private var notes:
        String

    private let existingID:
        UUID?

    let onSave:
        (ScheduledMatch) -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    init(
        initialMatch:
            ScheduledMatch?,
        onSave:
            @escaping
            (ScheduledMatch) -> Void
    ) {

        existingID =
            initialMatch?.id

        _round =
            State(
                initialValue:
                    initialMatch?
                        .round
                    ?? ""
            )

        _opponentName =
            State(
                initialValue:
                    initialMatch?
                        .opponentName
                    ?? ""
            )

        _date =
            State(
                initialValue:
                    initialMatch?
                        .date
                    ?? Date()
            )

        _isHome =
            State(
                initialValue:
                    initialMatch?
                        .isHome
                    ?? true
            )

        _location =
            State(
                initialValue:
                    initialMatch?
                        .location
                    ?? ""
            )

        _notes =
            State(
                initialValue:
                    initialMatch?
                        .notes
                    ?? ""
            )

        self.onSave =
            onSave
    }


    var body:
        some View {

        NavigationStack {

            Form {

                Section(
                    "Partita"
                ) {

                    TextField(
                        "Giornata",
                        text:
                            $round
                    )

                    TextField(
                        "Avversario",
                        text:
                            $opponentName
                    )

                    DatePicker(
                        "Data e ora",
                        selection:
                            $date
                    )

                    Picker(
                        "Campo",
                        selection:
                            $isHome
                    ) {

                        Text(
                            "Casa"
                        )
                        .tag(
                            true
                        )

                        Text(
                            "Trasferta"
                        )
                        .tag(
                            false
                        )
                    }
                    .pickerStyle(
                        .segmented
                    )
                }

                Section(
                    "Dettagli"
                ) {

                    TextField(
                        "Luogo",
                        text:
                            $location
                    )

                    TextField(
                        "Note",
                        text:
                            $notes,
                        axis:
                            .vertical
                    )
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .tint(
                MapiTheme.olive
            )
            .navigationTitle(
                existingID ==
                    nil
                ? "Nuova partita"
                : "Modifica partita"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }

                ToolbarItem(
                    placement:
                        .confirmationAction
                ) {

                    Button(
                        "Salva"
                    ) {

                        save()
                    }
                    .disabled(
                        clean(
                            opponentName
                        )
                        .isEmpty
                    )
                }
            }
        }
    }


    private func save() {

        let opponent =
            clean(
                opponentName
            )

        guard
            !opponent.isEmpty
        else {

            return
        }

        let cleanRound =
            clean(
                round
            )

        let cleanLocation =
            clean(
                location
            )

        let cleanNotes =
            clean(
                notes
            )

        onSave(
            ScheduledMatch(
                id:
                    existingID ??
                    UUID(),

                round:
                    cleanRound.isEmpty
                    ? nil
                    : cleanRound,

                opponentName:
                    opponent,

                date:
                    date,

                isHome:
                    isHome,

                location:
                    cleanLocation.isEmpty
                    ? nil
                    : cleanLocation,

                notes:
                    cleanNotes.isEmpty
                    ? nil
                    : cleanNotes
            )
        )

        dismiss()
    }
}


// MARK: - ROSTER

struct RosterManagementView: View {

    let onSave:
        ([RosterPlayer]) -> Void

    let onBack:
        () -> Void

    @State private var roster:
        [RosterPlayer]

    @State private var newPlayerName =
        ""

    @State private var validationMessage:
        String?

    @State private var editingPlayer:
        RosterPlayer?

    @State private var deletingPlayer:
        RosterPlayer?

    @FocusState private var nameFocused:
        Bool


    init(
        initialRoster:
            [RosterPlayer],
        onSave:
            @escaping
            ([RosterPlayer]) -> Void,
        onBack:
            @escaping
            () -> Void
    ) {

        self.onSave =
            onSave

        self.onBack =
            onBack

        _roster =
            State(
                initialValue:
                    initialRoster
            )
    }


    var body:
        some View {

        List {

            // MARK: Nuovo giocatore

            Section(
                "Nuovo tesserato"
            ) {

                TextField(
                    "Nome giocatore",
                    text:
                        $newPlayerName
                )
                .focused(
                    $nameFocused
                )
                .onSubmit {

                    addPlayer()
                }


                Button {

                    addPlayer()

                } label: {

                    Label(
                        "Aggiungi giocatore",
                        systemImage:
                            "person.badge.plus"
                    )
                }
                .foregroundStyle(
                    MapiTheme.olive
                )
                .disabled(
                    trimmedName
                        .isEmpty
                )


                if let validationMessage {

                    Text(
                        validationMessage
                    )
                    .foregroundStyle(
                        .red
                    )
                    .font(
                        .footnote
                    )
                }
            }


            // MARK: Giocatori

            Section(
                "Tesserati"
            ) {

                if roster.isEmpty {

                    Text(
                        "Nessun tesserato."
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )

                } else {

                    ForEach(
                        roster
                    ) {
                        player in

                        rosterPlayerRow(
                            player
                        )
                    }
                }
            }
        }
        .scrollContentBackground(
            .hidden
        )
        .background(
            MapiTheme.background
        )
        .navigationTitle(
            "Gestione rosa"
        )
        .mapiNavigationChrome()


        // MARK: Modifica

        .sheet(
            item:
                $editingPlayer
        ) {
            player in

            RosterPlayerEditorView(
                player:
                    player,

                existingPlayers:
                    roster
            ) {
                updatedPlayer in

                updatePlayer(
                    updatedPlayer
                )
            }
        }


        // MARK: Eliminazione

        .alert(
            "Eliminare il giocatore?",
            isPresented:
                Binding(
                    get: {

                        deletingPlayer !=
                            nil
                    },

                    set: {
                        value in

                        if !value {

                            deletingPlayer =
                                nil
                        }
                    }
                )
        ) {

            Button(
                "Annulla",
                role:
                    .cancel
            ) {

                deletingPlayer =
                    nil
            }


            Button(
                "Elimina",
                role:
                    .destructive
            ) {

                if let deletingPlayer {

                    deletePlayer(
                        deletingPlayer
                    )
                }

                deletingPlayer =
                    nil
            }

        } message: {

            if let deletingPlayer {

                Text(
                    "Vuoi davvero eliminare \(deletingPlayer.name) dalla rosa?"
                )

            } else {

                Text(
                    "Il giocatore verrà eliminato dalla rosa."
                )
            }
        }


        // MARK: Toolbar

        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    save()

                    onBack()
                }
            }
        }
    }


    // MARK: - ROW

    private func rosterPlayerRow(
        _ player:
            RosterPlayer
    ) -> some View {

        VStack(
            alignment:
                .leading,
            spacing:
                12
        ) {

            HStack {

                VStack(
                    alignment:
                        .leading,
                    spacing:
                        4
                ) {

                    HStack(
                        spacing: 8
                    ) {

                        Text(
                            player.name
                        )
                        .font(
                            .system(
                                size: 18,
                                weight: .bold,
                                design: .rounded
                            )
                        )
                        .foregroundStyle(
                            MapiTheme.darkMauve
                        )

                        if player.isGoalkeeper {

                            MapiStatusPill(
                                text:
                                    "Portiere",

                                color:
                                    MapiTheme.mauve
                            )
                        }
                    }


                    Text(
                        player.active
                        ? "Tesserato attivo"
                        : "Tesserato non attivo"
                    )
                    .font(
                        .caption
                    )
                    .foregroundStyle(
                        player.active
                        ? MapiTheme.olive
                        : MapiTheme.textSecondary
                    )
                }


                Spacer()


                Toggle(
                    "",
                    isOn:
                        activeBinding(
                            for:
                                player.id
                        )
                )
                .labelsHidden()
                .tint(
                    MapiTheme.olive
                )
            }


            HStack(
                spacing:
                    10
            ) {

                Button {

                    editingPlayer =
                        player

                } label: {

                    Label(
                        "Modifica",
                        systemImage:
                            "pencil"
                    )
                }
                .buttonStyle(
                    MapiCompactButtonStyle(
                        filled:
                            false
                    )
                )


                Spacer()


                Button(
                    role:
                        .destructive
                ) {

                    deletingPlayer =
                        player

                } label: {

                    Label(
                        "Elimina",
                        systemImage:
                            "trash"
                    )
                }
                .font(
                    .system(
                        size:
                            13,
                        weight:
                            .bold,
                        design:
                            .rounded
                    )
                )
                .foregroundStyle(
                    .red
                )
            }
        }
        .padding(
            .vertical,
            4
        )
    }


    // MARK: - BINDINGS

    private func activeBinding(
        for id:
            UUID
    ) -> Binding<Bool> {

        Binding(
            get: {

                roster.first(
                    where: {

                        $0.id ==
                            id
                    }
                )?
                .active
                ??
                false
            },

            set: {
                newValue in

                guard let index =
                    roster.firstIndex(
                        where: {

                            $0.id ==
                                id
                        }
                    )
                else {

                    return
                }

                roster[index]
                    .active =
                    newValue

                save()
            }
        )
    }


    // MARK: - ADD

    private var trimmedName:
        String {

        clean(
            newPlayerName
        )
    }


    private func addPlayer() {

        let name =
            trimmedName

        guard
            !name.isEmpty
        else {

            return
        }


        let duplicate =
            roster.contains {

                clean(
                    $0.name
                )
                .localizedCaseInsensitiveCompare(
                    name
                )
                ==
                .orderedSame
            }


        guard
            !duplicate
        else {

            validationMessage =
                "Esiste già un tesserato con questo nome."

            return
        }


        roster.append(
            RosterPlayer(
                name:
                    name
            )
        )


        newPlayerName =
            ""

        validationMessage =
            nil


        save()


        nameFocused =
            true
    }


    // MARK: - UPDATE

    private func updatePlayer(
        _ updatedPlayer:
            RosterPlayer
    ) {

        guard let index =
            roster.firstIndex(
                where: {

                    $0.id ==
                        updatedPlayer.id
                }
            )
        else {

            return
        }


        roster[index] =
            updatedPlayer


        save()
    }


    // MARK: - DELETE

    private func deletePlayer(
        _ player:
            RosterPlayer
    ) {

        roster.removeAll {

            $0.id ==
                player.id
        }


        save()
    }


    // MARK: - SAVE

    private func save() {

        var cleaned =
            roster


        for index in
            cleaned.indices {

            cleaned[index]
                .name =
                clean(
                    cleaned[index]
                        .name
                )
        }


        cleaned.removeAll {

            $0.name
                .isEmpty
        }


        roster =
            cleaned


        onSave(
            cleaned
        )
    }
}


// MARK: - ROSTER PLAYER EDITOR

struct RosterPlayerEditorView: View {

    @State private var name:
        String

    @State private var active:
        Bool

    @State private var isGoalkeeper:
        Bool

    @State private var validationMessage:
        String?

    let player:
        RosterPlayer

    let existingPlayers:
        [RosterPlayer]

    let onSave:
        (RosterPlayer) -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    init(
        player:
            RosterPlayer,
        existingPlayers:
            [RosterPlayer],
        onSave:
            @escaping
            (RosterPlayer) -> Void
    ) {

        self.player =
            player

        self.existingPlayers =
            existingPlayers

        self.onSave =
            onSave


        _name =
            State(
                initialValue:
                    player.name
            )


        _active =
            State(
                initialValue:
                    player.active
            )


        _isGoalkeeper =
            State(
                initialValue:
                    player.isGoalkeeper
            )
    }


    var body:
        some View {

        NavigationStack {

            Form {

                Section(
                    "Giocatore"
                ) {

                    TextField(
                        "Nome",
                        text:
                            $name
                    )


                    Toggle(
                        "Tesserato attivo",
                        isOn:
                            $active
                    )
                    .tint(
                        MapiTheme.olive
                    )


                    Toggle(
                        "Portiere",
                        isOn:
                            $isGoalkeeper
                    )
                    .tint(
                        MapiTheme.olive
                    )
                }


                if let validationMessage {

                    Section {

                        Text(
                            validationMessage
                        )
                        .foregroundStyle(
                            .red
                        )
                        .font(
                            .footnote
                        )
                    }
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Modifica giocatore"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }


                ToolbarItem(
                    placement:
                        .confirmationAction
                ) {

                    Button(
                        "Salva"
                    ) {

                        savePlayer()
                    }
                }
            }
        }
    }


    private func savePlayer() {

        let cleanedName =
            clean(
                name
            )


        guard
            !cleanedName.isEmpty
        else {

            validationMessage =
                "Il nome non può essere vuoto."

            return
        }


        let duplicate =
            existingPlayers.contains {
                existing in

                existing.id !=
                    player.id
                &&
                clean(
                    existing.name
                )
                .localizedCaseInsensitiveCompare(
                    cleanedName
                )
                ==
                .orderedSame
            }


        guard
            !duplicate
        else {

            validationMessage =
                "Esiste già un tesserato con questo nome."

            return
        }


        onSave(
            RosterPlayer(
                id:
                    player.id,

                name:
                    cleanedName,

                active:
                    active,

                isGoalkeeper:
                    isGoalkeeper
            )
        )


        dismiss()
    }
}
// MARK: - PRESENCE

struct PresenceSelectionView:
    View {

    let roster:
        [RosterPlayer]

    @Binding var selectedIDs:
        Set<UUID>

    let maxPlayersOnField:
        Int

    let timerTitle:
        String

    let timerText:
        String

    let timerRunning:
        Bool

    let clockStarted:
        Bool

    let onTimer:
        () -> Void

    let onBack:
        () -> Void

    let onNext:
        () -> Void


    var body:
        some View {

        List {

            Section {

                HStack {

                    VStack(
                        alignment:
                            .leading,
                        spacing:
                            3
                    ) {

                        Text(
                            timerTitle
                        )
                        .font(
                            .caption
                        )

                        Text(
                            timerText
                        )
                        .font(
                            .system(
                                size: 26,
                                weight: .black,
                                design: .rounded
                            )
                        )
                    }

                    Spacer()

                    Button(
                        timerRunning
                        ? "Pausa"
                        :
                        (
                            clockStarted
                            ? "Riprendi"
                            : "Avvia"
                        )
                    ) {

                        onTimer()
                    }
                    .buttonStyle(
                        MapiCompactButtonStyle(
                            filled:
                                true
                        )
                    )
                }
            }

            Section(
                "Chi è presente oggi?"
            ) {

                ForEach(
                    roster
                ) {
                    player in

                    Button {

                        toggle(
                            player.id
                        )

                    } label: {

                        HStack {

                            Text(
                                player.name
                            )
                            .foregroundStyle(
                                MapiTheme.darkMauve
                            )

                            Spacer()

                            Image(
                                systemName:
                                    selectedIDs.contains(
                                        player.id
                                    )
                                    ? "checkmark.circle.fill"
                                    : "circle"
                            )
                            .foregroundStyle(
                                selectedIDs.contains(
                                    player.id
                                )
                                ? MapiTheme.olive
                                : MapiTheme.mauve
                            )
                        }
                    }
                }
            }

            Section {

                Button(
                    selectedIDs.count ==
                        roster.count
                    ? "Deseleziona tutti"
                    : "Seleziona tutti"
                ) {

                    if selectedIDs.count ==
                        roster.count {

                        selectedIDs
                            .removeAll()

                    } else {

                        selectedIDs =
                            Set(
                                roster.map(
                                    \.id
                                )
                            )
                    }
                }
            }
        }
        .scrollContentBackground(
            .hidden
        )
        .background(
            MapiTheme.background
        )
        .navigationTitle(
            "Presenze"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    onBack()
                }
            }

            ToolbarItem(
                placement:
                    .confirmationAction
            ) {

                Button(
                    "Avanti"
                ) {

                    onNext()
                }
                .disabled(
                    selectedIDs.count <
                        maxPlayersOnField
                )
            }
        }
    }


    private func toggle(
        _ id:
            UUID
    ) {

        if selectedIDs
            .contains(
                id
            ) {

            selectedIDs
                .remove(
                    id
                )

        } else {

            selectedIDs
                .insert(
                    id
                )
        }
    }
}


// MARK: - LINEUP

struct LineupSelectionView:
    View {

    let players:
        [RosterPlayer]

    @Binding var starterIDs:
        Set<UUID>

    let maxPlayersOnField:
        Int

    let timerTitle:
        String

    let timerText:
        String

    let timerRunning:
        Bool

    let clockStarted:
        Bool

    let onTimer:
        () -> Void

    let onBack:
        () -> Void

    let onNext:
        () -> Void


    var body:
        some View {

        List {

            Section {

                HStack {

                    VStack(
                        alignment:
                            .leading
                    ) {

                        Text(
                            timerTitle
                        )
                        .font(
                            .caption
                        )

                        Text(
                            timerText
                        )
                        .font(
                            .system(
                                size: 27,
                                weight: .black,
                                design: .rounded
                            )
                        )
                    }

                    Spacer()

                    Button(
                        timerRunning
                        ? "Pausa"
                        :
                        (
                            clockStarted
                            ? "Riprendi"
                            : "Avvia"
                        )
                    ) {

                        onTimer()
                    }
                    .buttonStyle(
                        MapiCompactButtonStyle(
                            filled:
                                true
                        )
                    )
                }

                if clockStarted {

                    Text(
                        "I minuti di gioco si conteggiano dal primo avvio esplicito."
                    )
                    .font(
                        .footnote
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )
                }
            }

            Section(
                "Scegli i \(maxPlayersOnField) titolari"
            ) {

                ForEach(
                    players
                ) {
                    player in

                    Button {

                        toggle(
                            player.id
                        )

                    } label: {

                        HStack {

                            VStack(
                                alignment:
                                    .leading
                            ) {

                                Text(
                                    player.name
                                )
                                .foregroundStyle(
                                    MapiTheme.darkMauve
                                )

                                Text(
                                    starterIDs.contains(
                                        player.id
                                    )
                                    ? "Titolare"
                                    : "Panchina"
                                )
                                .font(
                                    .caption
                                )
                                .foregroundStyle(
                                    MapiTheme.textSecondary
                                )
                            }

                            Spacer()

                            Image(
                                systemName:
                                    starterIDs.contains(
                                        player.id
                                    )
                                    ? "checkmark.circle.fill"
                                    : "circle"
                            )
                            .foregroundStyle(
                                starterIDs.contains(
                                    player.id
                                )
                                ? MapiTheme.olive
                                : MapiTheme.mauve
                            )
                        }
                    }
                }
            }
        }
        .scrollContentBackground(
            .hidden
        )
        .background(
            MapiTheme.background
        )
        .navigationTitle(
            "Titolari"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    onBack()
                }
            }

            ToolbarItem(
                placement:
                    .confirmationAction
            ) {

                Button(
                    "Avanti"
                ) {

                    onNext()
                }
                .disabled(
                    starterIDs.count !=
                        maxPlayersOnField
                )
            }
        }
    }


    private func toggle(
        _ id:
            UUID
    ) {

        if starterIDs
            .contains(
                id
            ) {

            starterIDs
                .remove(
                    id
                )

        } else {

            guard
                starterIDs.count <
                    maxPlayersOnField
            else {

                return
            }

            starterIDs
                .insert(
                    id
                )
        }
    }
}


// MARK: - SUBSTITUTIONS

struct OutgoingSubstitutionView:
    View {

    let playerOut:
        MatchPlayer

    let benchPlayers:
        [MatchPlayer]

    let onSubstitute:
        (MatchPlayer) -> Void

    let onSkip:
        () -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    var body:
        some View {

        NavigationStack {

            List {

                Section(
                    "Esce"
                ) {

                    Text(
                        playerOut.name
                    )
                    .font(
                        .system(
                            size: 20,
                            weight: .black,
                            design: .rounded
                        )
                    )
                }

                Section(
                    "Chi entra?"
                ) {

                    if benchPlayers.isEmpty {

                        Text(
                            "Nessun sostituto disponibile."
                        )
                        .foregroundStyle(
                            MapiTheme.textSecondary
                        )

                    } else {

                        ForEach(
                            benchPlayers
                        ) {
                            player in

                            Button(
                                player.name
                            ) {

                                onSubstitute(
                                    player
                                )

                                dismiss()
                            }
                        }
                    }
                }

                Section {

                    Button(
                        "SKIP — NESSUN SOSTITUTO",
                        role:
                            .destructive
                    ) {

                        onSkip()

                        dismiss()
                    }

                    Text(
                        "La squadra rimane temporaneamente con un giocatore in meno."
                    )
                    .font(
                        .footnote
                    )
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Cambio"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }
            }
        }
    }
}


struct IncomingSubstitutionView:
    View {

    let playerIn:
        MatchPlayer

    let fieldPlayers:
        [MatchPlayer]

    let onReplace:
        (MatchPlayer) -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    var body:
        some View {

        NavigationStack {

            List {

                Section(
                    "\(playerIn.name) entra"
                ) {

                    ForEach(
                        fieldPlayers
                    ) {
                        player in

                        Button(
                            "\(player.name) esce"
                        ) {

                            onReplace(
                                player
                            )

                            dismiss()
                        }
                    }
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Cambio"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }
            }
        }
    }
}


// MARK: - ASSIST

struct AssistSelectionView:
    View {

    let scorerName:
        String

    let players:
        [MatchPlayer]

    let onAssist:
        (MatchPlayer) -> Void

    let onNoAssist:
        () -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    var body:
        some View {

        NavigationStack {

            List {

                Section {

                    Text(
                        "Gol di \(scorerName)"
                    )
                    .font(
                        .headline
                    )
                }

                Section(
                    "Assist"
                ) {

                    ForEach(
                        players
                    ) {
                        player in

                        Button(
                            player.name
                        ) {

                            onAssist(
                                player
                            )

                            dismiss()
                        }
                    }
                }

                Section {

                    Button(
                        "Nessun assist"
                    ) {

                        onNoAssist()

                        dismiss()
                    }
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Assist"
            )
            .mapiNavigationChrome()
        }
    }
}


// MARK: - HISTORY

struct HistoryListView:
    View {

    let history:
        [MatchRecord]

    let onBack:
        () -> Void

    let onSelect:
        (MatchRecord) -> Void


    var body:
        some View {

        Group {

            if history.isEmpty {

                ZStack {

                    MapiTheme.background
                        .ignoresSafeArea()

                    ContentUnavailableView(
                        "Nessuna partita",
                        systemImage:
                            "clock",
                        description:
                            Text(
                                "Le partite terminate compariranno qui."
                            )
                    )
                }

            } else {

                List(
                    history
                ) {
                    match in

                    Button {

                        onSelect(
                            match
                        )

                    } label: {

                        HStack {

                            VStack(
                                alignment:
                                    .leading,
                                spacing:
                                    5
                            ) {

                                Text(
                                    match.opponentName
                                        .map {
                                            "vs \($0)"
                                        }
                                    ??
                                    "Partita"
                                )
                                .font(
                                    .system(
                                        size: 17,
                                        weight: .bold,
                                        design: .rounded
                                    )
                                )
                                .foregroundStyle(
                                    MapiTheme.darkMauve
                                )

                                Text(
                                    match.date.formatted(
                                        date:
                                            .abbreviated,
                                        time:
                                            .shortened
                                    )
                                )
                                .foregroundStyle(
                                    MapiTheme.textSecondary
                                )

                                if let isHome =
                                    match.isHome {

                                    MapiStatusPill(
                                        text:
                                            isHome
                                            ? "CASA"
                                            : "TRASFERTA",
                                        color:
                                            isHome
                                            ? MapiTheme.olive
                                            : MapiTheme.mauve
                                    )
                                }
                            }

                            Spacer()

                            Text(
                                "\(match.ourScore ?? 0)-\(match.opponentScore ?? 0)"
                            )
                            .font(
                                .system(
                                    size: 27,
                                    weight: .black,
                                    design: .rounded
                                )
                            )
                            .foregroundStyle(
                                MapiTheme.darkMauve
                            )
                        }
                        .padding(
                            .vertical,
                            6
                        )
                    }
                    .buttonStyle(
                        .plain
                    )
                    .listRowBackground(
                        MapiTheme.surface
                    )
                }
                .scrollContentBackground(
                    .hidden
                )
                .background(
                    MapiTheme.background
                )
            }
        }
        .navigationTitle(
            "Storico partite"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    onBack()
                }
            }
        }
    }
}


struct HistoryDetailView:
    View {

    let record:
        MatchRecord

    let roster:
        [RosterPlayer]

    let schedule:
        [ScheduledMatch]

    let onBack:
        () -> Void

    let onSave:
        (MatchRecord) -> Void

    let onDelete:
        () -> Void

    @State private var showEditor =
        false

    @State private var showDeleteConfirmation =
        false


    var body:
        some View {

        List {

            MatchRecordContentView(
                record:
                    record
            )

            Section {

                Button(
                    "Elimina partita",
                    role:
                        .destructive
                ) {

                    showDeleteConfirmation =
                        true
                }
            }
        }
        .scrollContentBackground(
            .hidden
        )
        .background(
            MapiTheme.background
        )
        .navigationTitle(
            "Partita"
        )
        .mapiNavigationChrome()
        .toolbar {

            ToolbarItem(
                placement:
                    .cancellationAction
            ) {

                Button(
                    "Indietro"
                ) {

                    onBack()
                }
            }

            ToolbarItem(
                placement:
                    .confirmationAction
            ) {

                Button(
                    "Modifica"
                ) {

                    showEditor =
                        true
                }
            }
        }
        .sheet(
            isPresented:
                $showEditor
        ) {

            HistoryEditorView(
                record:
                    record,
                roster:
                    roster,
                schedule:
                    schedule,
                onSave:
                    onSave
            )
        }
        .alert(
            "Eliminare questa partita?",
            isPresented:
                $showDeleteConfirmation
        ) {

            Button(
                "Annulla",
                role:
                    .cancel
            ) {}

            Button(
                "Elimina",
                role:
                    .destructive
            ) {

                onDelete()
            }
        }
    }
}


// MARK: - HISTORY EDITOR

struct HistoryEditorView:
    View {

    @State private var draft:
        MatchRecord

    @State private var events:
        [GoalEvent]

    @State private var scoreFromEvents:
        Bool

    @State private var statsFromEvents:
        Bool

    @State private var newHistoricalPlayerID:
        UUID?

    let roster:
        [RosterPlayer]

    let schedule:
        [ScheduledMatch]

    let onSave:
        (MatchRecord) -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    init(
        record:
            MatchRecord,
        roster:
            [RosterPlayer],
        schedule:
            [ScheduledMatch],
        onSave:
            @escaping
            (MatchRecord) -> Void
    ) {

        var copy =
            record

        let initialEvents =
            record.events ??
            []

        copy.events =
            initialEvents

        let calculatedOur =
            initialEvents.filter {

                $0.team ==
                    .ours
            }.count

        let calculatedOpponent =
            initialEvents.filter {

                $0.team ==
                    .opponent
            }.count

        let scoresMatch =
            calculatedOur ==
                (
                    record.ourScore ??
                    0
                )
            &&
            calculatedOpponent ==
                (
                    record.opponentScore ??
                    0
                )

        _draft =
            State(
                initialValue:
                    copy
            )

        _events =
            State(
                initialValue:
                    initialEvents
            )

        _scoreFromEvents =
            State(
                initialValue:
                    !initialEvents.isEmpty &&
                    scoresMatch
            )

        _statsFromEvents =
            State(
                initialValue:
                    !initialEvents.isEmpty
            )

        _newHistoricalPlayerID =
            State(
                initialValue:
                    nil
            )

        self.roster =
            roster

        self.schedule =
            schedule

        self.onSave =
            onSave
    }


    var body:
        some View {

        NavigationStack {

            List {

                Section(
                    "Calendario"
                ) {

                    Picker(
                        "Partita associata",
                        selection:
                            $draft
                                .scheduledMatchID
                    ) {

                        Text(
                            "Nessuna"
                        )
                        .tag(
                            Optional<UUID>
                                .none
                        )

                        ForEach(
                            schedule.sorted {

                                $0.date <
                                    $1.date
                            }
                        ) {
                            match in

                            Text(
                                "\(match.date.formatted(date: .numeric, time: .shortened)) · \(match.opponentName)"
                            )
                            .tag(
                                Optional(
                                    match.id
                                )
                            )
                        }
                    }
                    .onChange(
                        of:
                            draft
                                .scheduledMatchID
                    ) {
                        _,
                        newID in

                        guard
                            let newID,
                            let match =
                                schedule.first(
                                    where: {

                                        $0.id ==
                                            newID
                                    }
                                )
                        else {

                            return
                        }

                        draft.opponentName =
                            match
                                .opponentName

                        draft.isHome =
                            match
                                .isHome
                    }
                }

                Section(
                    "Partita"
                ) {

                    DatePicker(
                        "Data e ora",
                        selection:
                            $draft.date
                    )

                    TextField(
                        "Avversario",
                        text:
                            opponentBinding
                    )

                    Picker(
                        "Campo",
                        selection:
                            homeAwayBinding
                    ) {

                        Text(
                            "Casa"
                        )
                        .tag(
                            0
                        )

                        Text(
                            "Trasferta"
                        )
                        .tag(
                            1
                        )

                        Text(
                            "Non specificato"
                        )
                        .tag(
                            2
                        )
                    }

                    TextField(
                        "Durata in secondi",
                        value:
                            $draft.duration,
                        format:
                            .number
                    )
                }

                Section(
                    "Risultato"
                ) {

                    Toggle(
                        "Calcola dagli eventi",
                        isOn:
                            $scoreFromEvents
                    )
                    .tint(
                        MapiTheme.olive
                    )

                    if scoreFromEvents {

                        LabeledContent(
                            "Noi",
                            value:
                                "\(eventOurScore)"
                        )

                        LabeledContent(
                            "Avversari",
                            value:
                                "\(eventOpponentScore)"
                        )

                    } else {

                        Stepper(
                            "Noi: \(draft.ourScore ?? 0)",
                            value:
                                ourScoreBinding,
                            in:
                                0...99
                        )

                        Stepper(
                            "Avversari: \(draft.opponentScore ?? 0)",
                            value:
                                opponentScoreBinding,
                            in:
                                0...99
                        )
                    }
                }

                Section(
                    "Eventi / Gol"
                ) {

                    if events.isEmpty {

                        Text(
                            "Nessun evento registrato."
                        )
                        .foregroundStyle(
                            MapiTheme.textSecondary
                        )

                    } else {

                        ForEach(
                            Array(
                                events.indices
                            ),
                            id:
                                \.self
                        ) {
                            index in

                            let eventID =
                                events[index]
                                    .id

                            HistoryEventEditorRow(
                                event:
                                    $events[
                                        index
                                    ],
                                onDelete: {

                                    events.removeAll {

                                        $0.id ==
                                            eventID
                                    }
                                }
                            )
                        }
                    }

                    Button(
                        "Aggiungi evento"
                    ) {

                        events.append(
                            GoalEvent(
                                team:
                                    .ours,
                                matchSecond:
                                    max(
                                        0,
                                        draft.duration
                                    )
                            )
                        )
                    }
                }

                Section(
                    "Statistiche"
                ) {

                    Toggle(
                        "Ricalcola gol e assist dagli eventi",
                        isOn:
                            $statsFromEvents
                    )
                    .tint(
                        MapiTheme.olive
                    )
                }

                Section(
                    "Giocatori"
                ) {

                    if draft.players.isEmpty {

                        Text(
                            "Nessun giocatore."
                        )
                        .foregroundStyle(
                            MapiTheme.textSecondary
                        )

                    } else {

                        ForEach(
                            Array(
                                draft
                                    .players
                                    .indices
                            ),
                            id:
                                \.self
                        ) {
                            index in

                            let rowID =
                                draft.players[
                                    index
                                ].id

                            VStack(
                                alignment:
                                    .leading,
                                spacing:
                                    8
                            ) {

                                TextField(
                                    "Nome",
                                    text:
                                        $draft
                                            .players[
                                                index
                                            ]
                                            .playerName
                                )

                                TextField(
                                    "Secondi giocati",
                                    value:
                                        $draft
                                            .players[
                                                index
                                            ]
                                            .secondsPlayed,
                                    format:
                                        .number
                                )

                                Text(
                                    "Tempo: \(formatTime(draft.players[index].secondsPlayed))"
                                )
                                .font(
                                    .footnote
                                )

                                if statsFromEvents {

                                    let stats =
                                        calculatedStats(
                                            for:
                                                draft.players[
                                                    index
                                                ]
                                        )

                                    Text(
                                        "Gol \(stats.goals) · Assist \(stats.assists)"
                                    )

                                } else {

                                    Stepper(
                                        "Gol: \(draft.players[index].goals)",
                                        value:
                                            $draft
                                                .players[
                                                    index
                                                ]
                                                .goals,
                                        in:
                                            0...99
                                    )

                                    Stepper(
                                        "Assist: \(draft.players[index].assists)",
                                        value:
                                            $draft
                                                .players[
                                                    index
                                                ]
                                                .assists,
                                        in:
                                            0...99
                                    )
                                }

                                Button(
                                    "Rimuovi dalla partita",
                                    role:
                                        .destructive
                                ) {

                                    draft.players
                                        .removeAll {

                                            $0.id ==
                                                rowID
                                        }
                                }
                            }
                        }
                    }
                }

                if !availableRosterPlayers
                    .isEmpty {

                    Section(
                        "Aggiungi giocatore"
                    ) {

                        Picker(
                            "Tesserato",
                            selection:
                                $newHistoricalPlayerID
                        ) {

                            Text(
                                "Seleziona..."
                            )
                            .tag(
                                Optional<UUID>
                                    .none
                            )

                            ForEach(
                                availableRosterPlayers
                            ) {
                                player in

                                Text(
                                    player.name
                                )
                                .tag(
                                    Optional(
                                        player.id
                                    )
                                )
                            }
                        }

                        Button(
                            "Aggiungi alla partita"
                        ) {

                            addHistoricalPlayer()
                        }
                        .disabled(
                            newHistoricalPlayerID ==
                                nil
                        )
                    }
                }
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .tint(
                MapiTheme.olive
            )
            .navigationTitle(
                "Modifica partita"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Annulla"
                    ) {

                        dismiss()
                    }
                }

                ToolbarItem(
                    placement:
                        .confirmationAction
                ) {

                    Button(
                        "Salva"
                    ) {

                        save()
                    }
                }
            }
        }
    }


    private var opponentBinding:
        Binding<String> {

        Binding(
            get: {

                draft.opponentName ??
                    ""
            },

            set: {

                let value =
                    clean(
                        $0
                    )

                draft.opponentName =
                    value.isEmpty
                    ? nil
                    : value
            }
        )
    }


    private var homeAwayBinding:
        Binding<Int> {

        Binding(
            get: {

                if draft.isHome ==
                    true {

                    return 0
                }

                if draft.isHome ==
                    false {

                    return 1
                }

                return 2
            },

            set: {

                switch $0 {

                case 0:

                    draft.isHome =
                        true

                case 1:

                    draft.isHome =
                        false

                default:

                    draft.isHome =
                        nil
                }
            }
        )
    }


    private var eventOurScore:
        Int {

        events.filter {

            $0.team ==
                .ours
        }.count
    }


    private var eventOpponentScore:
        Int {

        events.filter {

            $0.team ==
                .opponent
        }.count
    }


    private var ourScoreBinding:
        Binding<Int> {

        Binding(
            get: {

                max(
                    0,
                    draft.ourScore ??
                        0
                )
            },

            set: {

                draft.ourScore =
                    max(
                        0,
                        $0
                    )
            }
        )
    }


    private var opponentScoreBinding:
        Binding<Int> {

        Binding(
            get: {

                max(
                    0,
                    draft.opponentScore ??
                        0
                )
            },

            set: {

                draft.opponentScore =
                    max(
                        0,
                        $0
                    )
            }
        )
    }


    private var availableRosterPlayers:
        [RosterPlayer] {

        roster.filter {
            rosterPlayer in

            !draft.players
                .contains {
                    summary in

                    summary.rosterPlayerID ==
                        rosterPlayer.id
                }
        }
    }


    private func addHistoricalPlayer() {

        guard let id =
            newHistoricalPlayerID
        else {

            return
        }

        guard let player =
            roster.first(
                where: {

                    $0.id ==
                        id
                }
            )
        else {

            return
        }

        draft.players.append(
            PlayerMatchSummary(
                rosterPlayerID:
                    player.id,
                playerName:
                    player.name,
                secondsPlayed:
                    0,
                goals:
                    0,
                assists:
                    0
            )
        )

        newHistoricalPlayerID =
            nil
    }


    private func calculatedStats(
        for player:
            PlayerMatchSummary
    ) -> (
        goals: Int,
        assists: Int
    ) {

        let goals =
            events.filter {
                event in

                guard
                    event.team ==
                        .ours
                else {

                    return false
                }

                return
                    eventMatchesPlayer(
                        eventID:
                            event.scorerID,
                        eventName:
                            event.scorerName,
                        player:
                            player
                    )
            }
            .count

        let assists =
            events.filter {
                event in

                guard
                    event.team ==
                        .ours
                else {

                    return false
                }

                return
                    eventMatchesPlayer(
                        eventID:
                            event.assistID,
                        eventName:
                            event.assistName,
                        player:
                            player
                    )
            }
            .count

        return (
            goals,
            assists
        )
    }


    private func eventMatchesPlayer(
        eventID:
            UUID?,
        eventName:
            String?,
        player:
            PlayerMatchSummary
    ) -> Bool {

        if
            let eventID,
            let rosterID =
                player.rosterPlayerID,
            eventID ==
                rosterID {

            return true
        }

        guard let eventName
        else {

            return false
        }

        return
            clean(
                eventName
            )
            .localizedCaseInsensitiveCompare(
                clean(
                    player.playerName
                )
            )
            ==
            .orderedSame
    }


    private func findPlayer(
        named name:
            String,
        in players:
            [PlayerMatchSummary]
    ) -> PlayerMatchSummary? {

        players.first {

            clean(
                $0.playerName
            )
            .localizedCaseInsensitiveCompare(
                clean(
                    name
                )
            )
            ==
            .orderedSame
        }
    }


    private func normalizedEvents(
        players:
            [PlayerMatchSummary]
    ) -> [GoalEvent] {

        var result =
            events

        for index in
            result.indices {

            result[index]
                .matchSecond =
                max(
                    0,
                    min(
                        result[index]
                            .matchSecond,
                        max(
                            0,
                            draft.duration
                        )
                    )
                )

            if result[index]
                .team ==
                .opponent {

                result[index]
                    .scorerID =
                    nil

                result[index]
                    .scorerName =
                    nil

                result[index]
                    .assistID =
                    nil

                result[index]
                    .assistName =
                    nil

                continue
            }

            if
                let scorerID =
                    result[index]
                        .scorerID,
                let player =
                    players.first(
                        where: {

                            $0.rosterPlayerID ==
                                scorerID
                        }
                    ) {

                result[index]
                    .scorerName =
                    player.playerName

            } else if
                let scorerName =
                    result[index]
                        .scorerName,
                let player =
                    findPlayer(
                        named:
                            scorerName,
                        in:
                            players
                    ) {

                result[index]
                    .scorerID =
                    player
                        .rosterPlayerID

                result[index]
                    .scorerName =
                    player
                        .playerName

            } else {

                let value =
                    result[index]
                        .scorerName
                        .map(
                            clean
                        )

                result[index]
                    .scorerName =
                    value?.isEmpty ==
                        true
                    ? nil
                    : value

                result[index]
                    .scorerID =
                    nil
            }

            if
                let assistID =
                    result[index]
                        .assistID,
                let player =
                    players.first(
                        where: {

                            $0.rosterPlayerID ==
                                assistID
                        }
                    ) {

                result[index]
                    .assistName =
                    player.playerName

            } else if
                let assistName =
                    result[index]
                        .assistName,
                let player =
                    findPlayer(
                        named:
                            assistName,
                        in:
                            players
                    ) {

                result[index]
                    .assistID =
                    player
                        .rosterPlayerID

                result[index]
                    .assistName =
                    player
                        .playerName

            } else {

                let value =
                    result[index]
                        .assistName
                        .map(
                            clean
                        )

                result[index]
                    .assistName =
                    value?.isEmpty ==
                        true
                    ? nil
                    : value

                result[index]
                    .assistID =
                    nil
            }
        }

        return result.sorted {

            $0.matchSecond <
                $1.matchSecond
        }
    }


    private func save() {

        draft.duration =
            max(
                0,
                draft.duration
            )

        for index in
            draft.players.indices {

            draft.players[
                index
            ].playerName =
                clean(
                    draft.players[
                        index
                    ].playerName
                )

            draft.players[
                index
            ].secondsPlayed =
                max(
                    0,
                    draft.players[
                        index
                    ].secondsPlayed
                )

            draft.players[
                index
            ].goals =
                max(
                    0,
                    draft.players[
                        index
                    ].goals
                )

            draft.players[
                index
            ].assists =
                max(
                    0,
                    draft.players[
                        index
                    ].assists
                )
        }

        draft.players.removeAll {

            $0.playerName
                .isEmpty
        }

        let cleanEvents =
            normalizedEvents(
                players:
                    draft.players
            )

        draft.events =
            cleanEvents

        if scoreFromEvents {

            draft.ourScore =
                cleanEvents.filter {

                    $0.team ==
                        .ours
                }.count

            draft.opponentScore =
                cleanEvents.filter {

                    $0.team ==
                        .opponent
                }.count

        } else {

            draft.ourScore =
                max(
                    0,
                    draft.ourScore ??
                        0
                )

            draft.opponentScore =
                max(
                    0,
                    draft.opponentScore ??
                        0
                )
        }

        if statsFromEvents {

            for index in
                draft.players.indices {

                let player =
                    draft.players[
                        index
                    ]

                draft.players[
                    index
                ].goals =
                    cleanEvents.filter {
                        event in

                        event.team ==
                            .ours
                        &&
                        eventMatchesPlayer(
                            eventID:
                                event.scorerID,
                            eventName:
                                event.scorerName,
                            player:
                                player
                        )
                    }
                    .count

                draft.players[
                    index
                ].assists =
                    cleanEvents.filter {
                        event in

                        event.team ==
                            .ours
                        &&
                        eventMatchesPlayer(
                            eventID:
                                event.assistID,
                            eventName:
                                event.assistName,
                            player:
                                player
                        )
                    }
                    .count
            }
        }

        onSave(
            draft
        )

        dismiss()
    }
}


// MARK: - EVENT EDITOR

struct HistoryEventEditorRow:
    View {

    @Binding var event:
        GoalEvent

    let onDelete:
        () -> Void


    var body:
        some View {

        VStack(
            alignment:
                .leading,
            spacing:
                8
        ) {

            Picker(
                "Squadra",
                selection:
                    $event.team
            ) {

                Text(
                    "Noi"
                )
                .tag(
                    GoalTeam.ours
                )

                Text(
                    "Avversari"
                )
                .tag(
                    GoalTeam.opponent
                )
            }
            .pickerStyle(
                .segmented
            )

            TextField(
                "Secondo",
                value:
                    $event.matchSecond,
                format:
                    .number
            )

            if event.team ==
                .ours {

                TextField(
                    "Marcatore",
                    text:
                        scorerBinding
                )

                TextField(
                    "Assist",
                    text:
                        assistBinding
                )
            }

            Button(
                "Elimina evento",
                role:
                    .destructive
            ) {

                onDelete()
            }
        }
    }


    private var scorerBinding:
        Binding<String> {

        Binding(
            get: {

                event.scorerName ??
                    ""
            },

            set: {

                let value =
                    clean(
                        $0
                    )

                event.scorerName =
                    value.isEmpty
                    ? nil
                    : value

                event.scorerID =
                    nil
            }
        )
    }


    private var assistBinding:
        Binding<String> {

        Binding(
            get: {

                event.assistName ??
                    ""
            },

            set: {

                let value =
                    clean(
                        $0
                    )

                event.assistName =
                    value.isEmpty
                    ? nil
                    : value

                event.assistID =
                    nil
            }
        )
    }
}


// MARK: - SUMMARY

struct MatchSummaryView:
    View {

    let record:
        MatchRecord

    let onOpenHistory:
        () -> Void

    @Environment(
        \.dismiss
    )
    private var dismiss


    var body:
        some View {

        NavigationStack {

            List {

                MatchRecordContentView(
                    record:
                        record
                )
            }
            .scrollContentBackground(
                .hidden
            )
            .background(
                MapiTheme.background
            )
            .navigationTitle(
                "Riepilogo"
            )
            .mapiNavigationChrome()
            .toolbar {

                ToolbarItem(
                    placement:
                        .cancellationAction
                ) {

                    Button(
                        "Chiudi"
                    ) {

                        dismiss()
                    }
                }

                ToolbarItem(
                    placement:
                        .confirmationAction
                ) {

                    Button(
                        "Storico"
                    ) {

                        onOpenHistory()

                        dismiss()
                    }
                }
            }
        }
    }
}


// MARK: - MATCH RECORD

struct MatchRecordContentView:
    View {

    let record:
        MatchRecord


    var body:
        some View {

        Section(
            "Partita"
        ) {

            if let opponent =
                record.opponentName {

                VStack(
                    spacing:
                        5
                ) {

                    Text(
                        "MAPI GROUP"
                    )
                    .font(
                        .caption
                    )
                    .foregroundStyle(
                        MapiTheme.mauve
                    )

                    Text(
                        "vs \(opponent)"
                    )
                    .font(
                        .system(
                            size: 20,
                            weight: .black,
                            design: .rounded
                        )
                    )
                }
                .frame(
                    maxWidth:
                        .infinity
                )
            }

            Text(
                "\(record.ourScore ?? 0) - \(record.opponentScore ?? 0)"
            )
            .font(
                .system(
                    size: 37,
                    weight: .black,
                    design: .rounded
                )
            )
            .frame(
                maxWidth:
                    .infinity
            )
            .foregroundStyle(
                MapiTheme.darkMauve
            )

            LabeledContent(
                "Data",
                value:
                    record.date.formatted(
                        date:
                            .abbreviated,
                        time:
                            .shortened
                    )
            )

            LabeledContent(
                "Durata",
                value:
                    formatTime(
                        record.duration
                    )
            )
        }

        if
            let events =
                record.events,
            !events.isEmpty {

            Section(
                "Eventi"
            ) {

                ForEach(
                    Array(
                        events.enumerated()
                    ),
                    id:
                        \.element.id
                ) {
                    index,
                    event in

                    Text(
                        describeEvent(
                            event,
                            index:
                                index,
                            events:
                                events
                        )
                    )
                }
            }
        }

        Section(
            "Giocatori"
        ) {

            ForEach(
                record.players
            ) {
                player in

                VStack(
                    alignment:
                        .leading,
                    spacing:
                        5
                ) {

                    HStack {

                        Text(
                            player.playerName
                        )
                        .font(
                            .headline
                        )

                        Spacer()

                        Text(
                            formatTime(
                                player.secondsPlayed
                            )
                        )
                        .monospacedDigit()
                    }

                    Text(
                        "⚽ \(player.goals) · Assist \(player.assists)"
                    )
                    .foregroundStyle(
                        MapiTheme.textSecondary
                    )
                }
            }
        }
    }
}


// MARK: - PREVIEW

#Preview {
    ContentView()
}

