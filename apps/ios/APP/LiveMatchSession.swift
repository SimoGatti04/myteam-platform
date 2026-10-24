import Foundation
import Darwin

/// The live session is one versioned aggregate. Participant time and current field
/// membership are authoritative only in MatchTimingSnapshot; the player metadata here
/// contains only values needed to reconstruct the match UI and final history record.
enum LiveMatchSessionStatus: String, Codable {
    case active
    case finalizing
    case finalized
}

struct LiveMatchPlayerSnapshot: Codable, Equatable {
    let rosterPlayerID: UUID
    let name: String
    let isGoalkeeper: Bool
    let playWeight: Double
    let superpower: Bool

    var id: UUID { rosterPlayerID }
}

struct LiveMatchPendingAssistSnapshot: Codable, Equatable {
    let goalEventID: UUID
    let scorerID: UUID
    let scorerName: String
}

struct LiveMatchSessionSnapshot: Codable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let sessionID: UUID
    var status: LiveMatchSessionStatus
    let timing: MatchTimingSnapshot
    let startingPlayerIDs: [UUID]
    let players: [LiveMatchPlayerSnapshot]
    let events: [GoalEvent]
    let pendingAssist: LiveMatchPendingAssistSnapshot?
    let scheduledMatchID: UUID?
    let scheduledMatchDate: Date?
    let opponentName: String?
    let isHome: Bool?
    /// `mach_continuous_time` nanoseconds from this device boot. It is used only to
    /// calculate the gap between processes; it is never fed back into MatchTiming's anchor.
    let continuousTimeNanoseconds: UInt64
    var finalRecord: MatchRecord?

    init(
        schemaVersion: Int,
        sessionID: UUID,
        status: LiveMatchSessionStatus,
        timing: MatchTimingSnapshot,
        startingPlayerIDs: [UUID],
        players: [LiveMatchPlayerSnapshot],
        events: [GoalEvent],
        pendingAssist: LiveMatchPendingAssistSnapshot? = nil,
        scheduledMatchID: UUID?,
        scheduledMatchDate: Date?,
        opponentName: String?,
        isHome: Bool?,
        continuousTimeNanoseconds: UInt64,
        finalRecord: MatchRecord?
    ) {
        self.schemaVersion = schemaVersion
        self.sessionID = sessionID
        self.status = status
        self.timing = timing
        self.startingPlayerIDs = startingPlayerIDs
        self.players = players
        self.events = events
        self.pendingAssist = pendingAssist
        self.scheduledMatchID = scheduledMatchID
        self.scheduledMatchDate = scheduledMatchDate
        self.opponentName = opponentName
        self.isHome = isHome
        self.continuousTimeNanoseconds = continuousTimeNanoseconds
        self.finalRecord = finalRecord
    }

    var capturedAt: Date { timing.capturedAt }
    var finalRecordID: UUID { sessionID }

    func makeMatchPlayers(using restoredTiming: MatchTiming) -> [MatchPlayer] {
        let times = restoredTiming.participantSecondsPlayed
        let fieldIDs = Set(restoredTiming.participants.filter(\.inField).map(\.id))
        return players.map { player in
            MatchPlayer(
                rosterPlayerID: player.rosterPlayerID,
                name: player.name,
                timePlayed: times[player.rosterPlayerID] ?? 0,
                inField: fieldIDs.contains(player.rosterPlayerID),
                playWeight: player.playWeight,
                superpower: player.superpower,
                isGoalkeeper: player.isGoalkeeper
            )
        }
    }

    func validate() throws {
        guard schemaVersion == Self.currentSchemaVersion else {
            throw LiveMatchSessionValidationError.unsupportedSchema(schemaVersion)
        }
        try MatchTiming.validate(timing)
        guard timing.attendanceConfirmed, timing.lineupConfirmed else {
            throw LiveMatchSessionValidationError.invalid("la distinta e la formazione devono essere confermate")
        }

        let playerIDs = players.map(\.rosterPlayerID)
        let timingIDs = timing.participants.map(\.id)
        let starterIDs = startingPlayerIDs
        guard !players.isEmpty,
              playerIDs.count == Set(playerIDs).count,
              Set(playerIDs) == Set(timingIDs) else {
            throw LiveMatchSessionValidationError.invalid("i partecipanti non coincidono con il motore temporale")
        }
        guard starterIDs.count == Set(starterIDs).count,
              starterIDs.count == timing.configuration.requiredStartingPlayers,
              Set(starterIDs).isSubset(of: Set(playerIDs)) else {
            throw LiveMatchSessionValidationError.invalid("la formazione iniziale non è coerente con la distinta")
        }
        guard players.allSatisfy({
            !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            [0.25, 0.50, 0.75, 1.0].contains($0.playWeight)
        }) else {
            throw LiveMatchSessionValidationError.invalid("i dati dei giocatori non sono validi")
        }

        let playersByID = Dictionary(uniqueKeysWithValues: players.map { ($0.rosterPlayerID, $0) })
        let eventIDs = events.map(\.id)
        guard eventIDs.count == Set(eventIDs).count,
              events.allSatisfy({ $0.matchSecond >= 0 && $0.matchSecond <= timing.totalMatchElapsedSeconds }) else {
            throw LiveMatchSessionValidationError.invalid("gli eventi contengono identificativi o tempi non validi")
        }
        for event in events {
            if event.team == .ours && event.scorerID == nil {
                throw LiveMatchSessionValidationError.invalid("un gol della squadra non identifica il marcatore")
            }
            if let scorerID = event.scorerID {
                guard let player = playersByID[scorerID], event.scorerName == player.name else {
                    throw LiveMatchSessionValidationError.invalid("un marcatore non coincide con i partecipanti della sessione")
                }
            } else if event.scorerName != nil {
                throw LiveMatchSessionValidationError.invalid("un nome marcatore non ha un identificativo associato")
            }
            if let assistID = event.assistID {
                guard assistID != event.scorerID,
                      let player = playersByID[assistID],
                      event.assistName == player.name else {
                    throw LiveMatchSessionValidationError.invalid("un assist non coincide con i partecipanti della sessione")
                }
            } else if event.assistName != nil {
                throw LiveMatchSessionValidationError.invalid("un nome assist non ha un identificativo associato")
            }
        }
        if let pendingAssist {
            guard let goal = events.first(where: { $0.id == pendingAssist.goalEventID }),
                  goal.team == .ours,
                  goal.assistID == nil,
                  goal.scorerID == pendingAssist.scorerID,
                  goal.scorerName == pendingAssist.scorerName,
                  playersByID[pendingAssist.scorerID] != nil else {
                throw LiveMatchSessionValidationError.invalid("la selezione assist in sospeso non corrisponde a un gol della sessione")
            }
        }
        if scheduledMatchID != nil, opponentName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            throw LiveMatchSessionValidationError.invalid("il riferimento al calendario non ha un avversario valido")
        }

        switch status {
        case .active:
            guard finalRecord == nil else {
                throw LiveMatchSessionValidationError.invalid("una sessione attiva non può contenere un record finalizzato")
            }
        case .finalizing, .finalized:
            guard let finalRecord else {
                throw LiveMatchSessionValidationError.invalid("manca il record necessario alla finalizzazione")
            }
            try validateFinalRecord(finalRecord)
        }
    }

    private func validateFinalRecord(_ record: MatchRecord) throws {
        let timingByPlayer = Dictionary(uniqueKeysWithValues: timing.participants.map {
            ($0.id, Int($0.accumulatedNanoseconds / 1_000_000_000))
        })
        guard record.id == sessionID,
              record.duration == timing.totalMatchElapsedSeconds,
              record.scheduledMatchID == scheduledMatchID,
              record.opponentName == opponentName,
              record.isHome == isHome,
              record.ourScore == events.filter({ $0.team == .ours }).count,
              record.opponentScore == events.filter({ $0.team == .opponent }).count,
              let recordEvents = record.events,
              eventsAreEquivalent(recordEvents, events),
              record.players.count == players.count else {
            throw LiveMatchSessionValidationError.invalid("il record finale non corrisponde allo snapshot della sessione")
        }

        for (summary, player) in zip(record.players, players) {
            guard summary.rosterPlayerID == player.rosterPlayerID,
                  summary.playerName == player.name,
                  summary.secondsPlayed == timingByPlayer[player.rosterPlayerID],
                  summary.goals == events.filter({ $0.team == .ours && $0.scorerID == player.rosterPlayerID }).count,
                  summary.assists == events.filter({ $0.team == .ours && $0.assistID == player.rosterPlayerID }).count else {
                throw LiveMatchSessionValidationError.invalid("le statistiche finali dei partecipanti non coincidono")
            }
        }
    }

    private func eventsAreEquivalent(_ lhs: [GoalEvent], _ rhs: [GoalEvent]) -> Bool {
        guard lhs.count == rhs.count else { return false }
        return zip(lhs, rhs).allSatisfy { left, right in
            left.id == right.id &&
            left.team == right.team &&
            left.matchSecond == right.matchSecond &&
            left.scorerID == right.scorerID &&
            left.scorerName == right.scorerName &&
            left.assistID == right.assistID &&
            left.assistName == right.assistName
        }
    }
}

struct RestoredLiveMatchSession {
    let snapshot: LiveMatchSessionSnapshot
    let timing: MatchTiming

    var players: [MatchPlayer] {
        snapshot.makeMatchPlayers(using: timing)
    }
}

enum LiveMatchSessionRestorer {
    static func restore(
        snapshot: LiveMatchSessionSnapshot,
        elapsedNanoseconds: Int64,
        timingClock: any MatchTimingClock = ContinuousMatchTimingClock(),
        recoveryClock: any LiveMatchRecoveryClock = SystemLiveMatchRecoveryClock()
    ) throws -> RestoredLiveMatchSession {
        try snapshot.validate()
        guard snapshot.status == .active else {
            throw LiveMatchSessionValidationError.invalid("solo una sessione attiva può essere ripristinata come partita in corso")
        }

        var timing = try MatchTiming.restoring(
            from: snapshot.timing,
            clock: timingClock,
            recoveredElapsedNanoseconds: elapsedNanoseconds
        )
        let reading = recoveryClock.reading()
        let timingSnapshot = timing.snapshot(capturedAt: reading.wallClockDate)
        let rebasedSnapshot = LiveMatchSessionSnapshot(
            schemaVersion: snapshot.schemaVersion,
            sessionID: snapshot.sessionID,
            status: .active,
            timing: timingSnapshot,
            startingPlayerIDs: snapshot.startingPlayerIDs,
            players: snapshot.players,
            events: snapshot.events,
            pendingAssist: snapshot.pendingAssist,
            scheduledMatchID: snapshot.scheduledMatchID,
            scheduledMatchDate: snapshot.scheduledMatchDate,
            opponentName: snapshot.opponentName,
            isHome: snapshot.isHome,
            continuousTimeNanoseconds: reading.continuousTimeNanoseconds,
            finalRecord: nil
        )
        try rebasedSnapshot.validate()
        return RestoredLiveMatchSession(snapshot: rebasedSnapshot, timing: timing)
    }
}

enum LiveMatchSessionValidationError: LocalizedError, Equatable {
    case unsupportedSchema(Int)
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case let .unsupportedSchema(version):
            return "Versione della sessione live non supportata: \(version)."
        case let .invalid(reason):
            return "La sessione live salvata non è coerente: \(reason)."
        }
    }
}

struct LiveMatchRecoveryReading: Equatable {
    let wallClockDate: Date
    let continuousTimeNanoseconds: UInt64
}

protocol LiveMatchRecoveryClock {
    func reading() -> LiveMatchRecoveryReading
}

struct SystemLiveMatchRecoveryClock: LiveMatchRecoveryClock {
    func reading() -> LiveMatchRecoveryReading {
        LiveMatchRecoveryReading(
            wallClockDate: Date(),
            continuousTimeNanoseconds: continuousNanosecondsSinceBoot()
        )
    }

    private func continuousNanosecondsSinceBoot() -> UInt64 {
        let ticks = mach_continuous_time()
        var timebase = mach_timebase_info_data_t()
        guard mach_timebase_info(&timebase) == KERN_SUCCESS,
              timebase.numer > 0,
              timebase.denom > 0 else {
            return 0
        }

        let denominator = UInt64(timebase.denom)
        let numerator = UInt64(timebase.numer)
        let quotient = ticks / denominator
        let remainder = ticks % denominator
        let (wholeNanoseconds, overflow) = quotient.multipliedReportingOverflow(by: numerator)
        guard !overflow else { return .max }
        let fractionalNanoseconds = (remainder * numerator) / denominator
        let (result, additionOverflow) = wholeNanoseconds.addingReportingOverflow(fractionalNanoseconds)
        return additionOverflow ? .max : result
    }
}

struct LiveMatchRecoveryDecision: Equatable {
    enum Kind: Equatable {
        case automatic
        case reviewRequired(reason: String)
    }

    let kind: Kind
    let elapsedNanoseconds: Int64
    let clockAdjustmentDetected: Bool
}

enum LiveMatchRecoveryPolicy {
    static let maximumUnverifiedWallGapSeconds: TimeInterval = 6 * 60 * 60
    static let wallClockDisagreementToleranceSeconds: TimeInterval = 90

    static func decide(
        snapshot: LiveMatchSessionSnapshot,
        now: LiveMatchRecoveryReading
    ) throws -> LiveMatchRecoveryDecision {
        try snapshot.validate()
        let maximumAdvance = MatchTiming.maximumRecoverableElapsedNanoseconds(for: snapshot.timing)
        guard snapshot.timing.activity != .stopped, maximumAdvance > 0 else {
            return LiveMatchRecoveryDecision(kind: .automatic, elapsedNanoseconds: 0, clockAdjustmentDetected: false)
        }

        let wallGap = now.wallClockDate.timeIntervalSince(snapshot.capturedAt)
        guard now.continuousTimeNanoseconds >= snapshot.continuousTimeNanoseconds else {
            let suggested: Int64
            if wallGap.isFinite, wallGap >= 0, wallGap <= maximumUnverifiedWallGapSeconds {
                let wallNanoseconds = Int64(min(wallGap, Double(Int64.max) / 1_000_000_000) * 1_000_000_000)
                suggested = min(maximumAdvance, max(0, wallNanoseconds))
            } else {
                suggested = 0
            }
            return LiveMatchRecoveryDecision(
                kind: .reviewRequired(reason: "Il dispositivo potrebbe essere stato riavviato; il tempo trascorso non è verificabile automaticamente."),
                elapsedNanoseconds: suggested,
                clockAdjustmentDetected: !wallGap.isFinite || wallGap < 0 || wallGap > maximumUnverifiedWallGapSeconds
            )
        }

        let monotonicGap = now.continuousTimeNanoseconds - snapshot.continuousTimeNanoseconds
        guard monotonicGap <= UInt64(Int64.max) else {
            return LiveMatchRecoveryDecision(
                kind: .reviewRequired(reason: "L'intervallo monotono salvato non è plausibile."),
                elapsedNanoseconds: 0,
                clockAdjustmentDetected: true
            )
        }
        let elapsed = min(Int64(monotonicGap), maximumAdvance)
        let monotonicSeconds = Double(monotonicGap) / 1_000_000_000
        let clockAdjustmentDetected = !wallGap.isFinite || wallGap < 0 ||
            abs(wallGap - monotonicSeconds) > wallClockDisagreementToleranceSeconds
        guard !clockAdjustmentDetected else {
            return LiveMatchRecoveryDecision(
                kind: .reviewRequired(reason: "Il tempo monotono e l'orologio civile non concordano; conferma il tempo da accreditare."),
                elapsedNanoseconds: elapsed,
                clockAdjustmentDetected: true
            )
        }
        return LiveMatchRecoveryDecision(
            kind: .automatic,
            elapsedNanoseconds: elapsed,
            clockAdjustmentDetected: false
        )
    }

    static func clampManualElapsed(_ seconds: Int, for snapshot: LiveMatchSessionSnapshot) -> Int64 {
        let requested = max(0, seconds)
        let maxNanoseconds = MatchTiming.maximumRecoverableElapsedNanoseconds(for: snapshot.timing)
        let maxSeconds = Int(maxNanoseconds / 1_000_000_000)
        return Int64(min(requested, maxSeconds)) * 1_000_000_000
    }
}
