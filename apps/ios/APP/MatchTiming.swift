import Foundation

protocol MatchTimingClock {
    func nowNanoseconds() -> Int64
}

struct ContinuousMatchTimingClock: MatchTimingClock {
    private let clock: ContinuousClock
    private let origin: ContinuousClock.Instant

    init() {
        let clock = ContinuousClock()
        self.clock = clock
        self.origin = clock.now
    }

    func nowNanoseconds() -> Int64 {
        let components = origin.duration(to: clock.now).components
        let (wholeSeconds, secondsOverflow) = components.seconds
            .multipliedReportingOverflow(by: 1_000_000_000)
        guard !secondsOverflow else {
            return components.seconds >= 0 ? .max : .min
        }

        let fractionalNanoseconds = components.attoseconds / 1_000_000_000
        let (nanoseconds, fractionOverflow) = wholeSeconds
            .addingReportingOverflow(fractionalNanoseconds)
        guard !fractionOverflow else {
            return wholeSeconds >= 0 ? .max : .min
        }
        return nanoseconds
    }
}

struct MatchTimingConfiguration: Codable, Equatable {
    let requiredStartingPlayers: Int
    let periodDurationSeconds: Int
    let halftimeDurationSeconds: Int
    let timeoutDurationSeconds: Int
    let timeoutsPerTeamPerHalf: Int

    var periodDurationNanoseconds: Int64 {
        Int64(periodDurationSeconds) * 1_000_000_000
    }

    var halftimeDurationNanoseconds: Int64 {
        Int64(halftimeDurationSeconds) * 1_000_000_000
    }

    var timeoutDurationNanoseconds: Int64 {
        Int64(timeoutDurationSeconds) * 1_000_000_000
    }
}

enum FutsalMatchRules {
    static let timing = MatchTimingConfiguration(
        requiredStartingPlayers: 5,
        periodDurationSeconds: 20 * 60,
        halftimeDurationSeconds: 5 * 60,
        timeoutDurationSeconds: 60,
        timeoutsPerTeamPerHalf: 1
    )
}

enum MatchPhase: String, Codable, Equatable {
    case firstHalf
    case halftime
    case secondHalf
    case finished
}

enum MatchTimingActivity: String, Codable, Equatable {
    case stopped
    case playing
    case halftimeCountdown
    case timeout
}

enum MatchTimeoutOwner: String, Codable, Equatable {
    case ours = "NOI"
    case opponent = "AVVERSARI"
}

enum MatchTimingToggleResult: Equatable {
    case started
    case paused
    case resumed
    case halftimeStarted
    case halftimePaused
    case requiresConfirmedStartingLineup
    case unavailable
}

enum MatchTimingCorrectionError: LocalizedError, Equatable {
    case unavailable
    case outOfRange
    case incompleteTimeline
    case timelineConflict
    case invalidPlayer
    case invalidMinutes
    case correctionRequiresPause
    case stalePreview
    case undoUnavailable
    case snapshotEncodingFailed

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Il tempo non può essere corretto nello stato attuale della partita."
        case .outOfRange: return "Il tempo corretto supera i limiti del periodo."
        case .incompleteTimeline: return "La cronologia non consente di ricalcolare questo tempo senza inventare presenze."
        case .timelineConflict: return "La correzione attraversa uno o più cambi che richiedono una riconciliazione esplicita."
        case .invalidPlayer: return "Il giocatore selezionato non appartiene alla partita."
        case .invalidMinutes: return "I minuti indicati non sono validi."
        case .correctionRequiresPause: return "Metti in pausa la partita prima di applicare una correzione."
        case .stalePreview: return "La partita è cambiata dopo l'anteprima. Ricalcola la correzione."
        case .undoUnavailable: return "Non è disponibile una correzione da annullare."
        case .snapshotEncodingFailed: return "La correzione non può essere preparata per il salvataggio."
        }
    }
}

struct MatchTimingParticipantSnapshot: Codable, Equatable {
    let id: UUID
    var accumulatedNanoseconds: Int64
    var inField: Bool
}

/// Serializable timing state for a future persistence adapter.
/// `capturedAt` is a durable wall-clock checkpoint; the engine's live clock anchor is deliberately omitted.
struct MatchTimingSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 2
    static let legacySchemaVersion = 1

    let schemaVersion: Int
    let configuration: MatchTimingConfiguration
    let phase: MatchPhase
    let activity: MatchTimingActivity
    let hasStarted: Bool
    let attendanceConfirmed: Bool
    let lineupConfirmed: Bool
    let firstHalfElapsedNanoseconds: Int64
    let secondHalfElapsedNanoseconds: Int64
    let halftimeElapsedNanoseconds: Int64
    let timeoutRemainingNanoseconds: Int64
    let timeoutOwner: MatchTimeoutOwner?
    let resumeAfterTimeout: Bool
    let ourTimeoutsUsed: Int
    let opponentTimeoutsUsed: Int
    let participants: [MatchTimingParticipantSnapshot]
    let capturedAt: Date
    /// Optional additions remain decodable from C2 snapshots that predate C3.3.
    var correctionMetadata: MatchCorrectionMetadata? = nil

    var totalMatchElapsedSeconds: Int {
        Int((firstHalfElapsedNanoseconds + secondHalfElapsedNanoseconds) / 1_000_000_000)
    }
}

struct MatchTimingCorrectionChange: Equatable, Identifiable {
    let playerID: UUID
    let beforeSeconds: Int
    let afterSeconds: Int

    var id: UUID { playerID }
}

struct MatchTimingCorrectionPreview: Equatable, Identifiable {
    let id: UUID
    let summary: String
    let before: MatchTimingSnapshot
    let after: MatchTimingSnapshot
    let affectedPlayers: [MatchTimingCorrectionChange]
}

enum MatchTimingRestoreError: LocalizedError, Equatable {
    case unsupportedSchema(Int)
    case invalidConfiguration
    case invalidSnapshot(String)
    case negativeRecoveryInterval

    var errorDescription: String? {
        switch self {
        case let .unsupportedSchema(version):
            return "Versione dello snapshot temporale non supportata: \(version)."
        case .invalidConfiguration:
            return "La configurazione temporale salvata non è valida."
        case let .invalidSnapshot(reason):
            return "Lo snapshot temporale non è coerente: \(reason)."
        case .negativeRecoveryInterval:
            return "L'intervallo temporale di recupero non può essere negativo."
        }
    }
}

/// A deterministic, in-process match clock. All active durations are measured from monotonic anchors,
/// not from the number of UI timer callbacks. A caller may supply a controllable clock in tests.
struct MatchTiming {
    private static let nanosecondsPerSecond: Int64 = 1_000_000_000
    let configuration: MatchTimingConfiguration
    private let clock: any MatchTimingClock

    private(set) var phase: MatchPhase = .firstHalf
    private(set) var activity: MatchTimingActivity = .stopped
    private(set) var hasStarted = false
    private(set) var attendanceConfirmed = false
    private(set) var lineupConfirmed = false
    private(set) var firstHalfElapsedNanoseconds: Int64 = 0
    private(set) var secondHalfElapsedNanoseconds: Int64 = 0
    private(set) var halftimeElapsedNanoseconds: Int64 = 0
    private(set) var timeoutRemainingNanoseconds: Int64 = 0
    private(set) var timeoutOwner: MatchTimeoutOwner?
    private(set) var resumeAfterTimeout = false
    private(set) var ourTimeoutsUsed = 0
    private(set) var opponentTimeoutsUsed = 0
    private(set) var participants: [MatchTimingParticipantSnapshot] = []
    private(set) var correctionMetadata = MatchCorrectionMetadata()

    private var attendanceIDs: Set<UUID> = []
    private var segmentAnchorNanoseconds: Int64?

    init(
        configuration: MatchTimingConfiguration = FutsalMatchRules.timing,
        clock: any MatchTimingClock = ContinuousMatchTimingClock()
    ) {
        self.configuration = configuration
        self.clock = clock
    }

    /// Rebuilds the engine from a durable snapshot. Process-local monotonic anchors are
    /// always created anew; recovered elapsed time is consumed through the same transition
    /// logic used for delayed callbacks, so period and timeout boundaries remain authoritative.
    static func restoring(
        from snapshot: MatchTimingSnapshot,
        clock: any MatchTimingClock = ContinuousMatchTimingClock(),
        recoveredElapsedNanoseconds: Int64 = 0
    ) throws -> MatchTiming {
        try validate(snapshot)
        guard recoveredElapsedNanoseconds >= 0 else {
            throw MatchTimingRestoreError.negativeRecoveryInterval
        }

        var timing = MatchTiming(configuration: snapshot.configuration, clock: clock)
        timing.phase = snapshot.phase
        timing.activity = snapshot.activity
        timing.hasStarted = snapshot.hasStarted
        timing.attendanceConfirmed = snapshot.attendanceConfirmed
        timing.lineupConfirmed = snapshot.lineupConfirmed
        timing.firstHalfElapsedNanoseconds = snapshot.firstHalfElapsedNanoseconds
        timing.secondHalfElapsedNanoseconds = snapshot.secondHalfElapsedNanoseconds
        timing.halftimeElapsedNanoseconds = snapshot.halftimeElapsedNanoseconds
        timing.timeoutRemainingNanoseconds = snapshot.timeoutRemainingNanoseconds
        timing.timeoutOwner = snapshot.timeoutOwner
        timing.resumeAfterTimeout = snapshot.resumeAfterTimeout
        timing.ourTimeoutsUsed = snapshot.ourTimeoutsUsed
        timing.opponentTimeoutsUsed = snapshot.opponentTimeoutsUsed
        timing.participants = snapshot.participants
        timing.attendanceIDs = Set(snapshot.participants.map(\.id))
        var restoredCorrectionMetadata = snapshot.correctionMetadata ?? MatchCorrectionMetadata()
        if restoredCorrectionMetadata.schemaVersion == MatchCorrectionMetadata.legacySchemaVersion {
            restoredCorrectionMetadata.schemaVersion = MatchCorrectionMetadata.currentSchemaVersion
        }
        timing.correctionMetadata = restoredCorrectionMetadata
        if timing.correctionMetadata.participationTimeline == nil,
           snapshot.lineupConfirmed,
           snapshot.hasStarted {
            timing.correctionMetadata.participationTimeline = try MatchParticipationTimelineSnapshot.partialRecoveryBaseline(
                participants: snapshot.participants,
                phase: snapshot.phase,
                firstHalfElapsedNanoseconds: snapshot.firstHalfElapsedNanoseconds,
                secondHalfElapsedNanoseconds: snapshot.secondHalfElapsedNanoseconds,
                periodDurationNanoseconds: Int64(snapshot.configuration.periodDurationSeconds) * Self.nanosecondsPerSecond
            )
        } else if timing.correctionMetadata.participationTimeline == nil,
                  snapshot.lineupConfirmed,
                  !snapshot.hasStarted {
            timing.correctionMetadata.participationTimeline = try MatchParticipationTimelineSnapshot.complete(
                participants: snapshot.participants,
                starters: Set(snapshot.participants.filter(\.inField).map(\.id))
            )
        }

        if timing.hasActiveSegment {
            timing.segmentAnchorNanoseconds = clock.nowNanoseconds()
        }
        if recoveredElapsedNanoseconds > 0 {
            timing.consume(recoveredElapsedNanoseconds)
        }
        timing.segmentAnchorNanoseconds = timing.hasActiveSegment
            ? clock.nowNanoseconds()
            : nil
        return timing
    }

    static func validate(_ snapshot: MatchTimingSnapshot) throws {
        guard snapshot.schemaVersion == MatchTimingSnapshot.legacySchemaVersion ||
              snapshot.schemaVersion == MatchTimingSnapshot.currentSchemaVersion else {
            throw MatchTimingRestoreError.unsupportedSchema(snapshot.schemaVersion)
        }

        let configuration = snapshot.configuration
        let maximumDurationSeconds = 24 * 60 * 60
        guard configuration.requiredStartingPlayers > 0,
              configuration.requiredStartingPlayers <= 32,
              configuration.periodDurationSeconds > 0,
              configuration.periodDurationSeconds <= maximumDurationSeconds,
              configuration.halftimeDurationSeconds > 0,
              configuration.halftimeDurationSeconds <= maximumDurationSeconds,
              configuration.timeoutDurationSeconds > 0,
              configuration.timeoutDurationSeconds <= maximumDurationSeconds,
              configuration.timeoutsPerTeamPerHalf >= 0,
              configuration.timeoutsPerTeamPerHalf <= 10 else {
            throw MatchTimingRestoreError.invalidConfiguration
        }

        let periodDuration = Int64(configuration.periodDurationSeconds) * nanosecondsPerSecond
        let halftimeDuration = Int64(configuration.halftimeDurationSeconds) * nanosecondsPerSecond
        let timeoutDuration = Int64(configuration.timeoutDurationSeconds) * nanosecondsPerSecond
        let firstHalf = snapshot.firstHalfElapsedNanoseconds
        let secondHalf = snapshot.secondHalfElapsedNanoseconds
        let halftime = snapshot.halftimeElapsedNanoseconds
        let timeoutRemaining = snapshot.timeoutRemainingNanoseconds
        let identifiers = snapshot.participants.map(\.id)
        let fieldCount = snapshot.participants.filter(\.inField).count

        guard firstHalf >= 0, firstHalf <= periodDuration,
              secondHalf >= 0, secondHalf <= periodDuration,
              halftime >= 0, halftime <= halftimeDuration,
              timeoutRemaining >= 0, timeoutRemaining <= timeoutDuration,
              identifiers.count == Set(identifiers).count,
              snapshot.participants.allSatisfy({ $0.accumulatedNanoseconds >= 0 }),
              fieldCount <= configuration.requiredStartingPlayers,
              snapshot.ourTimeoutsUsed >= 0,
              snapshot.ourTimeoutsUsed <= configuration.timeoutsPerTeamPerHalf,
              snapshot.opponentTimeoutsUsed >= 0,
              snapshot.opponentTimeoutsUsed <= configuration.timeoutsPerTeamPerHalf else {
            throw MatchTimingRestoreError.invalidSnapshot("tempi, contatori o identificativi fuori dai limiti")
        }

        guard snapshot.lineupConfirmed == snapshot.attendanceConfirmed,
              snapshot.attendanceConfirmed == !snapshot.participants.isEmpty,
              snapshot.participants.isEmpty || snapshot.participants.count >= configuration.requiredStartingPlayers,
              !snapshot.hasStarted || snapshot.lineupConfirmed,
              snapshot.phase == .firstHalf || snapshot.phase == .finished || snapshot.hasStarted else {
            throw MatchTimingRestoreError.invalidSnapshot("distinta, formazione e stato di avvio non coincidono")
        }

        let maximumMatchNanoseconds = periodDuration * 2
        guard snapshot.participants.allSatisfy({
            $0.accumulatedNanoseconds <= maximumMatchNanoseconds
        }), snapshot.hasStarted || snapshot.participants.allSatisfy({ $0.accumulatedNanoseconds == 0 }) else {
            throw MatchTimingRestoreError.invalidSnapshot("il minutaggio individuale supera la durata massima della gara")
        }
        if !snapshot.hasStarted && !snapshot.participants.isEmpty && fieldCount != configuration.requiredStartingPlayers {
            throw MatchTimingRestoreError.invalidSnapshot("la formazione iniziale non contiene il numero richiesto di giocatori")
        }

        switch snapshot.phase {
        case .firstHalf:
            guard secondHalf == 0, halftime == 0, firstHalf < periodDuration else {
                throw MatchTimingRestoreError.invalidSnapshot("tempi incompatibili con il primo periodo")
            }
        case .halftime:
            guard firstHalf == periodDuration, secondHalf == 0 else {
                throw MatchTimingRestoreError.invalidSnapshot("tempi incompatibili con l'intervallo")
            }
        case .secondHalf:
            guard firstHalf == periodDuration, halftime == 0, secondHalf < periodDuration else {
                throw MatchTimingRestoreError.invalidSnapshot("tempi incompatibili con il secondo periodo")
            }
        case .finished:
            guard secondHalf == 0 || firstHalf == periodDuration,
                  secondHalf == 0 || halftime == 0 else {
                throw MatchTimingRestoreError.invalidSnapshot("tempi incompatibili con la conclusione della partita")
            }
        }

        switch snapshot.activity {
        case .stopped:
            guard timeoutRemaining == 0,
                  snapshot.timeoutOwner == nil,
                  !snapshot.resumeAfterTimeout else {
                throw MatchTimingRestoreError.invalidSnapshot("attività ferma con dati di timeout attivi")
            }
        case .playing:
            guard snapshot.hasStarted,
                  snapshot.phase == .firstHalf || snapshot.phase == .secondHalf,
                  timeoutRemaining == 0,
                  snapshot.timeoutOwner == nil,
                  !snapshot.resumeAfterTimeout else {
                throw MatchTimingRestoreError.invalidSnapshot("stato di gioco attivo incompatibile con la fase")
            }
        case .halftimeCountdown:
            guard snapshot.hasStarted,
                  snapshot.phase == .halftime,
                  halftime < halftimeDuration,
                  timeoutRemaining == 0,
                  snapshot.timeoutOwner == nil,
                  !snapshot.resumeAfterTimeout else {
                throw MatchTimingRestoreError.invalidSnapshot("countdown dell'intervallo incoerente")
            }
        case .timeout:
            guard snapshot.hasStarted,
                  snapshot.phase == .firstHalf || snapshot.phase == .secondHalf,
                  timeoutRemaining > 0,
                  snapshot.timeoutOwner != nil else {
                throw MatchTimingRestoreError.invalidSnapshot("timeout senza fase, proprietario o durata validi")
            }
        }

        if snapshot.phase == .finished && snapshot.activity != .stopped {
            throw MatchTimingRestoreError.invalidSnapshot("partita conclusa ma cronometro ancora attivo")
        }

        if let metadata = snapshot.correctionMetadata {
            guard metadata.schemaVersion == MatchCorrectionMetadata.legacySchemaVersion ||
                  metadata.schemaVersion == MatchCorrectionMetadata.currentSchemaVersion else {
                throw MatchTimingRestoreError.invalidSnapshot("versione dei metadati di correzione non supportata")
            }
            let participantIDs = Set(identifiers)
            let adjustmentIDs = metadata.minuteAdjustments.map(\.playerID)
            let correctionIDs = metadata.minuteCorrections.map(\.playerID)
            guard adjustmentIDs.count == Set(adjustmentIDs).count,
                  correctionIDs.count == Set(correctionIDs).count,
                  adjustmentIDs.allSatisfy(participantIDs.contains),
                  correctionIDs.allSatisfy(participantIDs.contains),
                  metadata.minuteCorrections.allSatisfy({ $0.adjustedSeconds >= 0 && $0.adjustedSeconds <= configuration.periodDurationSeconds * 2 }) else {
                throw MatchTimingRestoreError.invalidSnapshot("metadati dei minutaggi non validi")
            }
            if let timeline = metadata.participationTimeline {
                do {
                    try timeline.validate(
                        participantIDs: participantIDs,
                        periodDurationNanoseconds: periodDuration,
                        firstHalfEndNanoseconds: firstHalf,
                        secondHalfEndNanoseconds: secondHalf
                    )
                    let calculated = try timeline.nanosecondsPlayed(
                        participantIDs: participantIDs,
                        firstHalfEndNanoseconds: firstHalf,
                        secondHalfEndNanoseconds: secondHalf
                    )
                    let adjustments = Dictionary(uniqueKeysWithValues: metadata.minuteAdjustments.map {
                        ($0.playerID, $0.adjustmentNanoseconds)
                    })
                    for participant in snapshot.participants {
                        let (value, overflow) = calculated[participant.id, default: 0]
                            .addingReportingOverflow(adjustments[participant.id, default: 0])
                        let expected = overflow ? Int64.max : max(0, value)
                        guard participant.accumulatedNanoseconds == expected else {
                            throw MatchTimingRestoreError.invalidSnapshot("i minutaggi non coincidono con la cronologia delle presenze")
                        }
                    }
                    let expectedField: Set<UUID>
                    switch snapshot.phase {
                    case .firstHalf, .halftime:
                        expectedField = try timeline.fieldPlayerIDs(
                            participantIDs: participantIDs,
                            period: .firstHalf,
                            through: firstHalf
                        )
                    case .secondHalf:
                        expectedField = try timeline.fieldPlayerIDs(
                            participantIDs: participantIDs,
                            period: .secondHalf,
                            through: secondHalf
                        )
                    case .finished:
                        expectedField = Set(snapshot.participants.filter(\.inField).map(\.id))
                    }
                    if snapshot.phase != .finished,
                       expectedField != Set(snapshot.participants.filter(\.inField).map(\.id)) {
                        throw MatchTimingRestoreError.invalidSnapshot("lo stato in campo non coincide con la cronologia")
                    }
                } catch let error as MatchTimingRestoreError {
                    throw error
                } catch {
                    throw MatchTimingRestoreError.invalidSnapshot(error.localizedDescription)
                }
            } else if !metadata.minuteAdjustments.isEmpty {
                throw MatchTimingRestoreError.invalidSnapshot("rettifiche minuti senza cronologia o base osservata")
            }
        }
    }

    static func maximumRecoverableElapsedNanoseconds(for snapshot: MatchTimingSnapshot) -> Int64 {
        let periodDuration = snapshot.configuration.periodDurationNanoseconds
        switch snapshot.activity {
        case .stopped:
            return 0
        case .playing:
            let elapsed = snapshot.phase == .firstHalf
                ? snapshot.firstHalfElapsedNanoseconds
                : snapshot.secondHalfElapsedNanoseconds
            return max(0, periodDuration - elapsed)
        case .halftimeCountdown:
            return max(0, snapshot.configuration.halftimeDurationNanoseconds - snapshot.halftimeElapsedNanoseconds)
        case .timeout:
            let timeoutElapsed = snapshot.timeoutRemainingNanoseconds
            guard snapshot.resumeAfterTimeout else { return timeoutElapsed }
            let periodElapsed = snapshot.phase == .firstHalf
                ? snapshot.firstHalfElapsedNanoseconds
                : snapshot.secondHalfElapsedNanoseconds
            return timeoutElapsed + max(0, periodDuration - periodElapsed)
        }
    }

    private var hasActiveSegment: Bool {
        activity == .playing || activity == .halftimeCountdown || activity == .timeout
    }

    var isRunning: Bool {
        activity == .playing || activity == .halftimeCountdown
    }

    var isInTimeout: Bool {
        activity == .timeout
    }

    var firstHalfElapsedSeconds: Int {
        wholeSeconds(firstHalfElapsedNanoseconds)
    }

    var secondHalfElapsedSeconds: Int {
        wholeSeconds(secondHalfElapsedNanoseconds)
    }

    var halftimeRemainingSeconds: Int {
        countdownSecondsRemaining(
            duration: configuration.halftimeDurationNanoseconds,
            elapsed: halftimeElapsedNanoseconds
        )
    }

    var timeoutRemainingSeconds: Int {
        countdownSecondsRemaining(
            duration: configuration.timeoutDurationNanoseconds,
            elapsed: configuration.timeoutDurationNanoseconds - timeoutRemainingNanoseconds
        )
    }

    var totalMatchElapsedSeconds: Int {
        wholeSeconds(firstHalfElapsedNanoseconds + secondHalfElapsedNanoseconds)
    }

    var fieldPlayerCount: Int {
        participants.filter(\.inField).count
    }

    var participantSecondsPlayed: [UUID: Int] {
        Dictionary(
            uniqueKeysWithValues: participants.map { ($0.id, wholeSeconds($0.accumulatedNanoseconds)) }
        )
    }

    var canStartFirstPeriod: Bool {
        attendanceConfirmed &&
        lineupConfirmed &&
        fieldPlayerCount == configuration.requiredStartingPlayers
    }

    mutating func confirmAttendance(presentPlayerIDs: [UUID]) -> Bool {
        synchronize()
        guard !hasStarted, phase == .firstHalf else {
            return false
        }

        let ids = Set(presentPlayerIDs)
        guard
            ids.count == presentPlayerIDs.count,
            ids.count >= configuration.requiredStartingPlayers
        else {
            attendanceIDs = []
            attendanceConfirmed = false
            lineupConfirmed = false
            participants = []
            correctionMetadata = MatchCorrectionMetadata()
            return false
        }

        attendanceIDs = ids
        attendanceConfirmed = true
        lineupConfirmed = false
        participants = []
        correctionMetadata = MatchCorrectionMetadata()
        return true
    }

    mutating func confirmStartingLineup(fieldPlayerIDs: Set<UUID>) -> Bool {
        synchronize()
        guard !hasStarted, attendanceConfirmed else {
            return false
        }
        guard
            fieldPlayerIDs.count == configuration.requiredStartingPlayers,
            fieldPlayerIDs.isSubset(of: attendanceIDs)
        else {
            lineupConfirmed = false
            participants = []
            correctionMetadata = MatchCorrectionMetadata()
            return false
        }

        participants = attendanceIDs
            .sorted { $0.uuidString < $1.uuidString }
            .map { id in
                MatchTimingParticipantSnapshot(
                    id: id,
                    accumulatedNanoseconds: 0,
                    inField: fieldPlayerIDs.contains(id)
                )
            }
        lineupConfirmed = true
        do {
            correctionMetadata.participationTimeline = try MatchParticipationTimelineSnapshot.complete(
                participants: participants,
                starters: fieldPlayerIDs
            )
            correctionMetadata.minuteAdjustments = []
            correctionMetadata.minuteCorrections = []
        } catch {
            lineupConfirmed = false
            participants = []
            correctionMetadata.participationTimeline = nil
            return false
        }
        return true
    }

    mutating func toggleMainClock() -> MatchTimingToggleResult {
        synchronize()

        switch phase {
        case .finished:
            return .unavailable

        case .halftime:
            guard activity != .timeout else {
                return .unavailable
            }
            if activity == .halftimeCountdown {
                stopActiveSegment()
                return .halftimePaused
            }
            guard activity == .stopped else {
                return .unavailable
            }
            invalidateTimingUndo()
            activity = .halftimeCountdown
            segmentAnchorNanoseconds = clock.nowNanoseconds()
            return .halftimeStarted

        case .firstHalf, .secondHalf:
            guard activity != .timeout else {
                return .unavailable
            }
            if activity == .playing {
                stopActiveSegment()
                return .paused
            }
            guard activity == .stopped else {
                return .unavailable
            }
            if !hasStarted {
                guard canStartFirstPeriod else {
                    return .requiresConfirmedStartingLineup
                }
                invalidateTimingUndo()
                hasStarted = true
                activity = .playing
                segmentAnchorNanoseconds = clock.nowNanoseconds()
                return .started
            }
            invalidateTimingUndo()
            activity = .playing
            resumeAfterTimeout = false
            segmentAnchorNanoseconds = clock.nowNanoseconds()
            return .resumed
        }
    }

    mutating func startSecondHalfManually() {
        synchronize()
        guard phase == .halftime, activity != .timeout else {
            return
        }
        invalidateTimingUndo()
        beginSecondHalf()
    }

    mutating func startTimeout(for owner: MatchTimeoutOwner) -> Bool {
        synchronize()
        guard
            hasStarted,
            phase == .firstHalf || phase == .secondHalf,
            activity != .timeout
        else {
            return false
        }

        invalidateTimingUndo()
        switch owner {
        case .ours:
            guard ourTimeoutsUsed < configuration.timeoutsPerTeamPerHalf else {
                return false
            }
            ourTimeoutsUsed += 1
        case .opponent:
            guard opponentTimeoutsUsed < configuration.timeoutsPerTeamPerHalf else {
                return false
            }
            opponentTimeoutsUsed += 1
        }

        resumeAfterTimeout = activity == .playing
        activity = .timeout
        timeoutOwner = owner
        timeoutRemainingNanoseconds = configuration.timeoutDurationNanoseconds
        segmentAnchorNanoseconds = clock.nowNanoseconds()
        return true
    }

    mutating func endTimeout() {
        synchronize()
        guard activity == .timeout else {
            return
        }
        invalidateTimingUndo()
        finishTimeout()
    }

    mutating func setParticipantInField(_ id: UUID, inField: Bool) -> Bool {
        synchronize()
        guard let index = participants.firstIndex(where: { $0.id == id }) else {
            return false
        }
        guard participants[index].inField != inField else {
            return true
        }
        invalidateTimingUndo()
        if hasStarted, phase == .firstHalf || phase == .secondHalf {
            let period = phase == .firstHalf ? MatchPeriod.firstHalf : .secondHalf
            let elapsed = phase == .firstHalf ? firstHalfElapsedNanoseconds : secondHalfElapsedNanoseconds
            guard recordPresenceBoundary(
                playerID: id,
                period: period,
                elapsedNanoseconds: elapsed,
                transition: inField ? .enteredField : .leftField,
                origin: .manualCorrection
            ) else { return false }
        }
        participants[index].inField = inField
        if !hasStarted {
            do {
                correctionMetadata.participationTimeline = try MatchParticipationTimelineSnapshot.complete(
                    participants: participants,
                    starters: Set(participants.filter(\.inField).map(\.id))
                )
            } catch {
                return false
            }
        }
        refreshParticipantTimesFromTimeline()
        return true
    }

    mutating func substitute(outgoingID: UUID, incomingID: UUID) -> Bool {
        synchronize()
        guard outgoingID != incomingID,
              let outgoingIndex = participants.firstIndex(where: { $0.id == outgoingID }),
              let incomingIndex = participants.firstIndex(where: { $0.id == incomingID }),
              participants[outgoingIndex].inField,
              !participants[incomingIndex].inField
        else {
            return false
        }

        invalidateTimingUndo()
        if hasStarted, phase == .firstHalf || phase == .secondHalf {
            let period = phase == .firstHalf ? MatchPeriod.firstHalf : .secondHalf
            let elapsed = phase == .firstHalf ? firstHalfElapsedNanoseconds : secondHalfElapsedNanoseconds
            guard var timeline = correctionMetadata.participationTimeline else { return false }
            let substitutionID = UUID()
            do {
                _ = try timeline.record(
                    playerID: outgoingID,
                    period: period,
                    elapsedNanoseconds: elapsed,
                    transition: .leftField,
                    origin: .substitution,
                    substitutionID: substitutionID
                )
                _ = try timeline.record(
                    playerID: incomingID,
                    period: period,
                    elapsedNanoseconds: elapsed,
                    transition: .enteredField,
                    origin: .substitution,
                    substitutionID: substitutionID
                )
            } catch {
                return false
            }
            correctionMetadata.participationTimeline = timeline
        }
        participants[outgoingIndex].inField = false
        participants[incomingIndex].inField = true
        if !hasStarted {
            do {
                correctionMetadata.participationTimeline = try MatchParticipationTimelineSnapshot.complete(
                    participants: participants,
                    starters: Set(participants.filter(\.inField).map(\.id))
                )
            } catch {
                return false
            }
        }
        refreshParticipantTimesFromTimeline()
        return true
    }

    /// Changes only the current playing period. Callers must resolve any later
    /// substitution or goal conflicts before applying this operation.
    mutating func correctCurrentPeriodElapsed(toSeconds seconds: Int) throws {
        synchronize()
        var proposed = self
        try proposed.applyCurrentPeriodElapsedCorrection(toSeconds: seconds)
        self = proposed
    }

    private mutating func applyCurrentPeriodElapsedCorrection(toSeconds seconds: Int) throws {
        invalidateTimingUndo()
        guard phase == .firstHalf || phase == .secondHalf,
              activity != .timeout,
              activity != .halftimeCountdown,
              activity != .stopped || hasStarted else {
            throw MatchTimingCorrectionError.unavailable
        }
        guard seconds >= 0, seconds <= configuration.periodDurationSeconds else {
            throw MatchTimingCorrectionError.outOfRange
        }
        guard let timeline = correctionMetadata.participationTimeline else {
            throw MatchTimingCorrectionError.incompleteTimeline
        }
        let target = Int64(seconds) * Self.nanosecondsPerSecond
        let period = phase == .firstHalf ? MatchPeriod.firstHalf : .secondHalf
        guard target >= timeline.coverageStart(for: period) else {
            throw MatchTimingCorrectionError.incompleteTimeline
        }
        guard !timeline.boundaries.contains(where: {
            $0.period == period && $0.elapsedNanoseconds > target
        }) else {
            throw MatchTimingCorrectionError.timelineConflict
        }

        if phase == .firstHalf {
            firstHalfElapsedNanoseconds = target
        } else {
            secondHalfElapsedNanoseconds = target
        }
        if target == configuration.periodDurationNanoseconds {
            completeCurrentPeriod()
            try refreshParticipantTimesFromTimeline(throwing: true)
            try validateParticipantMinutesAgainstElapsedMatchTime()
            return
        }
        let ids = Set(participants.map(\.id))
        let newField = try timeline.fieldPlayerIDs(
            participantIDs: ids,
            period: period,
            through: target
        )
        for index in participants.indices {
            participants[index].inField = newField.contains(participants[index].id)
        }
        try refreshParticipantTimesFromTimeline(throwing: true)
        try validateParticipantMinutesAgainstElapsedMatchTime()
        segmentAnchorNanoseconds = hasActiveSegment ? clock.nowNanoseconds() : nil
    }

    /// Sets a persistent per-player offset from attendance-derived time. Later
    /// playing time accrues normally and cannot erase this explicit correction.
    mutating func correctParticipantMinutes(
        playerID: UUID,
        toSeconds seconds: Int,
        reason: String? = nil,
        correctedAt: Date = Date()
    ) throws {
        synchronize()
        guard seconds >= 0,
              seconds <= configuration.periodDurationSeconds * 2,
              seconds <= totalMatchElapsedSeconds else {
            throw MatchTimingCorrectionError.invalidMinutes
        }
        guard let index = participants.firstIndex(where: { $0.id == playerID }) else {
            throw MatchTimingCorrectionError.invalidPlayer
        }
        let raw = try rawParticipantNanoseconds(playerID: playerID)
        let requested = Int64(seconds) * Self.nanosecondsPerSecond
        let (offset, overflow) = requested.subtractingReportingOverflow(raw)
        guard !overflow else { throw MatchTimingCorrectionError.invalidMinutes }
        var adjustments = correctionMetadata.minuteAdjustments
        if let adjustmentIndex = adjustments.firstIndex(where: { $0.playerID == playerID }) {
            adjustments[adjustmentIndex].adjustmentNanoseconds = offset
        } else {
            adjustments.append(MatchTimingMinuteAdjustment(playerID: playerID, adjustmentNanoseconds: offset))
        }
        correctionMetadata.minuteAdjustments = adjustments.sorted { $0.playerID.uuidString < $1.playerID.uuidString }
        var corrections = correctionMetadata.minuteCorrections
        let trimmedReason = reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        let detail = MatchPlayerMinuteCorrection(
            playerID: playerID,
            adjustedSeconds: seconds,
            reason: trimmedReason?.isEmpty == true ? nil : trimmedReason,
            correctedAt: correctedAt
        )
        if let correctionIndex = corrections.firstIndex(where: { $0.playerID == playerID }) {
            corrections[correctionIndex] = detail
        } else {
            corrections.append(detail)
        }
        correctionMetadata.minuteCorrections = corrections.sorted { $0.playerID.uuidString < $1.playerID.uuidString }
        participants[index].accumulatedNanoseconds = requested
        invalidateTimingUndo()
    }

    mutating func correctRecordedSubstitution(
        id substitutionID: UUID,
        outgoingID: UUID,
        incomingID: UUID,
        toSeconds seconds: Int
    ) throws {
        synchronize()
        guard activity == .stopped,
              phase == .firstHalf || phase == .halftime || phase == .secondHalf else {
            throw MatchTimingCorrectionError.correctionRequiresPause
        }
        var proposed = self
        try proposed.applyRecordedSubstitutionCorrection(
            id: substitutionID,
            outgoingID: outgoingID,
            incomingID: incomingID,
            toSeconds: seconds
        )
        self = proposed
    }

    mutating func previewRecordedSubstitutionCorrection(
        id substitutionID: UUID,
        outgoingID: UUID,
        incomingID: UUID,
        toSeconds seconds: Int
    ) throws -> MatchTimingCorrectionPreview {
        synchronize()
        guard activity == .stopped,
              phase == .firstHalf || phase == .halftime || phase == .secondHalf else {
            throw MatchTimingCorrectionError.correctionRequiresPause
        }
        let capturedAt = Date()
        let before = snapshot(capturedAt: capturedAt)
        var proposed = self
        try proposed.applyRecordedSubstitutionCorrection(
            id: substitutionID,
            outgoingID: outgoingID,
            incomingID: incomingID,
            toSeconds: seconds
        )
        let after = proposed.snapshot(capturedAt: capturedAt)
        return MatchTimingCorrectionPreview(
            id: UUID(),
            summary: "Correzione di una sostituzione",
            before: before,
            after: after,
            affectedPlayers: Self.changedParticipants(from: before, to: after)
        )
    }

    private mutating func applyRecordedSubstitutionCorrection(
        id substitutionID: UUID,
        outgoingID: UUID,
        incomingID: UUID,
        toSeconds seconds: Int
    ) throws {
        guard seconds >= 0,
              seconds <= configuration.periodDurationSeconds,
              var timeline = correctionMetadata.participationTimeline,
              let substitution = timeline.substitutions.first(where: { $0.id == substitutionID }),
              participants.contains(where: { $0.id == outgoingID }),
              participants.contains(where: { $0.id == incomingID }) else {
            throw MatchTimingCorrectionError.incompleteTimeline
        }
        guard substitution.period == .firstHalf
                ? Int64(seconds) * Self.nanosecondsPerSecond <= firstHalfElapsedNanoseconds
                : Int64(seconds) * Self.nanosecondsPerSecond <= secondHalfElapsedNanoseconds else {
            throw MatchTimingCorrectionError.timelineConflict
        }

        try timeline.correctSubstitution(
            id: substitutionID,
            outgoingID: outgoingID,
            incomingID: incomingID,
            elapsedNanoseconds: Int64(seconds) * Self.nanosecondsPerSecond
        )
        try timeline.validate(
            participantIDs: Set(participants.map(\.id)),
            periodDurationNanoseconds: configuration.periodDurationNanoseconds,
            firstHalfEndNanoseconds: firstHalfElapsedNanoseconds,
            secondHalfEndNanoseconds: secondHalfElapsedNanoseconds
        )
        invalidateTimingUndo()
        correctionMetadata.participationTimeline = timeline

        let currentPeriod: MatchPeriod?
        switch phase {
        case .firstHalf, .halftime: currentPeriod = .firstHalf
        case .secondHalf: currentPeriod = .secondHalf
        case .finished: currentPeriod = nil
        }
        if let currentPeriod {
            let currentElapsed = elapsedNanoseconds(in: currentPeriod)
            let field = try timeline.fieldPlayerIDs(
                participantIDs: Set(participants.map(\.id)),
                period: currentPeriod,
                through: currentElapsed
            )
            for index in participants.indices {
                participants[index].inField = field.contains(participants[index].id)
            }
        }
        try refreshParticipantTimesFromTimeline(throwing: true)
        try validateParticipantMinutesAgainstElapsedMatchTime()
    }

    mutating func previewCurrentPeriodElapsed(toSeconds seconds: Int) throws -> MatchTimingCorrectionPreview {
        synchronize()
        guard activity != .playing && activity != .timeout && activity != .halftimeCountdown else {
            throw MatchTimingCorrectionError.correctionRequiresPause
        }
        let capturedAt = Date()
        let before = snapshot(capturedAt: capturedAt)
        var proposed = self
        try proposed.correctCurrentPeriodElapsed(toSeconds: seconds)
        let after = proposed.snapshot(capturedAt: capturedAt)
        return MatchTimingCorrectionPreview(
            id: UUID(),
            summary: "Correzione del cronometro a \(seconds / 60):\(String(format: "%02d", seconds % 60))",
            before: before,
            after: after,
            affectedPlayers: Self.changedParticipants(from: before, to: after)
        )
    }

    mutating func previewParticipantMinutes(
        playerID: UUID,
        toSeconds seconds: Int,
        reason: String? = nil,
        correctedAt: Date = Date()
    ) throws -> MatchTimingCorrectionPreview {
        synchronize()
        guard activity != .playing && activity != .timeout && activity != .halftimeCountdown else {
            throw MatchTimingCorrectionError.correctionRequiresPause
        }
        let capturedAt = correctedAt
        let before = snapshot(capturedAt: capturedAt)
        var proposed = self
        try proposed.correctParticipantMinutes(
            playerID: playerID,
            toSeconds: seconds,
            reason: reason,
            correctedAt: correctedAt
        )
        let after = proposed.snapshot(capturedAt: capturedAt)
        return MatchTimingCorrectionPreview(
            id: UUID(),
            summary: "Correzione minutaggio giocatore",
            before: before,
            after: after,
            affectedPlayers: Self.changedParticipants(from: before, to: after)
        )
    }

    mutating func confirmCorrection(_ preview: MatchTimingCorrectionPreview) throws {
        guard activity != .playing && activity != .timeout && activity != .halftimeCountdown else {
            throw MatchTimingCorrectionError.correctionRequiresPause
        }
        let current = snapshot(capturedAt: preview.before.capturedAt)
        guard current == preview.before else { throw MatchTimingCorrectionError.stalePreview }

        var previous = preview.before
        var previousMetadata = previous.correctionMetadata ?? MatchCorrectionMetadata()
        previousMetadata.lastUndo = nil
        previous.correctionMetadata = previousMetadata
        guard let payload = try? JSONEncoder().encode(previous) else {
            throw MatchTimingCorrectionError.snapshotEncodingFailed
        }

        var corrected = preview.after
        var metadata = corrected.correctionMetadata ?? MatchCorrectionMetadata()
        metadata.lastUndo = MatchCorrectionUndoRecord(
            id: preview.id,
            scope: .timing,
            summary: preview.summary,
            previousStatePayload: payload,
            recordedAt: Date()
        )
        corrected.correctionMetadata = metadata
        let restored = try Self.restoring(from: corrected, clock: clock)
        self = restored
    }

    mutating func undoLastCorrection() throws {
        guard activity != .playing && activity != .timeout && activity != .halftimeCountdown,
              let undo = correctionMetadata.lastUndo,
              undo.scope == .timing else {
            throw MatchTimingCorrectionError.undoUnavailable
        }
        guard var previous = try? JSONDecoder().decode(MatchTimingSnapshot.self, from: undo.previousStatePayload) else {
            throw MatchTimingCorrectionError.snapshotEncodingFailed
        }
        var metadata = previous.correctionMetadata ?? MatchCorrectionMetadata()
        metadata.lastUndo = nil
        previous.correctionMetadata = metadata
        let restored = try Self.restoring(from: previous, clock: clock)
        self = restored
    }

    private static func changedParticipants(
        from before: MatchTimingSnapshot,
        to after: MatchTimingSnapshot
    ) -> [MatchTimingCorrectionChange] {
        let old = Dictionary(uniqueKeysWithValues: before.participants.map { ($0.id, Int($0.accumulatedNanoseconds / 1_000_000_000)) })
        let new = Dictionary(uniqueKeysWithValues: after.participants.map { ($0.id, Int($0.accumulatedNanoseconds / 1_000_000_000)) })
        return Set(old.keys).union(new.keys).sorted { $0.uuidString < $1.uuidString }.compactMap { id in
            let oldValue = old[id, default: 0]
            let newValue = new[id, default: 0]
            guard oldValue != newValue else { return nil }
            return MatchTimingCorrectionChange(playerID: id, beforeSeconds: oldValue, afterSeconds: newValue)
        }
    }

    mutating func finish() {
        synchronize()
        invalidateTimingUndo()
        closeCurrentPresence(origin: .periodBoundary)
        phase = .finished
        stopActiveSegment()
        timeoutRemainingNanoseconds = 0
        timeoutOwner = nil
        resumeAfterTimeout = false
    }

    private func validateParticipantMinutesAgainstElapsedMatchTime() throws {
        let elapsed = firstHalfElapsedNanoseconds + secondHalfElapsedNanoseconds
        guard participants.allSatisfy({ $0.accumulatedNanoseconds >= 0 && $0.accumulatedNanoseconds <= elapsed }) else {
            throw MatchTimingCorrectionError.invalidMinutes
        }
    }

    private mutating func invalidateTimingUndo() {
        correctionMetadata.lastUndo = nil
    }

    mutating func reset() {
        phase = .firstHalf
        activity = .stopped
        hasStarted = false
        attendanceConfirmed = false
        lineupConfirmed = false
        firstHalfElapsedNanoseconds = 0
        secondHalfElapsedNanoseconds = 0
        halftimeElapsedNanoseconds = 0
        timeoutRemainingNanoseconds = 0
        timeoutOwner = nil
        resumeAfterTimeout = false
        ourTimeoutsUsed = 0
        opponentTimeoutsUsed = 0
        participants = []
        correctionMetadata = MatchCorrectionMetadata()
        attendanceIDs = []
        segmentAnchorNanoseconds = nil
    }

    mutating func synchronize() {
        guard let anchor = segmentAnchorNanoseconds else {
            return
        }
        let current = max(clock.nowNanoseconds(), anchor)
        let (elapsed, overflow) = current.subtractingReportingOverflow(anchor)
        let elapsedNanoseconds = overflow ? Int64.max : max(0, elapsed)
        consume(elapsedNanoseconds)

        if activity == .stopped {
            segmentAnchorNanoseconds = nil
        } else {
            segmentAnchorNanoseconds = current
        }
    }

    mutating func snapshot(capturedAt: Date) -> MatchTimingSnapshot {
        synchronize()
        return MatchTimingSnapshot(
            schemaVersion: MatchTimingSnapshot.currentSchemaVersion,
            configuration: configuration,
            phase: phase,
            activity: activity,
            hasStarted: hasStarted,
            attendanceConfirmed: attendanceConfirmed,
            lineupConfirmed: lineupConfirmed,
            firstHalfElapsedNanoseconds: firstHalfElapsedNanoseconds,
            secondHalfElapsedNanoseconds: secondHalfElapsedNanoseconds,
            halftimeElapsedNanoseconds: halftimeElapsedNanoseconds,
            timeoutRemainingNanoseconds: timeoutRemainingNanoseconds,
            timeoutOwner: timeoutOwner,
            resumeAfterTimeout: resumeAfterTimeout,
            ourTimeoutsUsed: ourTimeoutsUsed,
            opponentTimeoutsUsed: opponentTimeoutsUsed,
            participants: participants,
            capturedAt: capturedAt,
            correctionMetadata: correctionMetadata
        )
    }

    private var currentMatchPeriod: MatchPeriod? {
        switch phase {
        case .firstHalf: .firstHalf
        case .secondHalf: .secondHalf
        case .halftime, .finished: nil
        }
    }

    private func elapsedNanoseconds(in period: MatchPeriod) -> Int64 {
        period == .firstHalf ? firstHalfElapsedNanoseconds : secondHalfElapsedNanoseconds
    }

    private func rawParticipantNanoseconds(playerID: UUID) throws -> Int64 {
        if let timeline = correctionMetadata.participationTimeline {
            let totals = try timeline.nanosecondsPlayed(
                participantIDs: Set(participants.map(\.id)),
                firstHalfEndNanoseconds: firstHalfElapsedNanoseconds,
                secondHalfEndNanoseconds: secondHalfElapsedNanoseconds
            )
            return totals[playerID, default: 0]
        }
        guard let participant = participants.first(where: { $0.id == playerID }) else {
            throw MatchTimingCorrectionError.invalidPlayer
        }
        return participant.accumulatedNanoseconds
    }

    private mutating func refreshParticipantTimesFromTimeline(throwing: Bool) throws {
        guard let timeline = correctionMetadata.participationTimeline else { return }
        let ids = Set(participants.map(\.id))
        let rawTotals: [UUID: Int64]
        do {
            rawTotals = try timeline.nanosecondsPlayed(
                participantIDs: ids,
                firstHalfEndNanoseconds: firstHalfElapsedNanoseconds,
                secondHalfEndNanoseconds: secondHalfElapsedNanoseconds
            )
        } catch {
            if throwing { throw error }
            return
        }
        let adjustments = Dictionary(uniqueKeysWithValues: correctionMetadata.minuteAdjustments.map {
            ($0.playerID, $0.adjustmentNanoseconds)
        })
        for index in participants.indices {
            let (adjusted, overflow) = rawTotals[participants[index].id, default: 0]
                .addingReportingOverflow(adjustments[participants[index].id, default: 0])
            guard !overflow else {
                if throwing { throw MatchTimingCorrectionError.invalidMinutes }
                continue
            }
            participants[index].accumulatedNanoseconds = max(0, adjusted)
        }
    }

    private mutating func refreshParticipantTimesFromTimeline() {
        try? refreshParticipantTimesFromTimeline(throwing: false)
    }

    @discardableResult
    private mutating func recordPresenceBoundary(
        playerID: UUID,
        period: MatchPeriod,
        elapsedNanoseconds: Int64,
        transition: MatchParticipationTransition,
        origin: MatchParticipationOrigin,
        substitutionID: UUID? = nil
    ) -> Bool {
        guard var timeline = correctionMetadata.participationTimeline else { return false }
        do {
            _ = try timeline.record(
                playerID: playerID,
                period: period,
                elapsedNanoseconds: elapsedNanoseconds,
                transition: transition,
                origin: origin,
                substitutionID: substitutionID
            )
            correctionMetadata.participationTimeline = timeline
            return true
        } catch {
            return false
        }
    }

    private mutating func closeCurrentPresence(origin: MatchParticipationOrigin) {
        guard let period = currentMatchPeriod else { return }
        let elapsed = elapsedNanoseconds(in: period)
        guard var timeline = correctionMetadata.participationTimeline else { return }
        do {
            for participant in participants where participant.inField {
                _ = try timeline.record(
                    playerID: participant.id,
                    period: period,
                    elapsedNanoseconds: elapsed,
                    transition: .leftField,
                    origin: origin
                )
            }
            correctionMetadata.participationTimeline = timeline
            refreshParticipantTimesFromTimeline()
        } catch {
            // The open interval remains reconstructible through the period endpoint.
            // No partial boundary batch is committed.
        }
    }

    private mutating func consume(_ elapsedNanoseconds: Int64) {
        var remaining = elapsedNanoseconds
        while remaining > 0 {
            switch activity {
            case .stopped:
                return

            case .playing:
                let elapsed = phase == .firstHalf
                    ? firstHalfElapsedNanoseconds
                    : secondHalfElapsedNanoseconds
                let periodRemaining = max(0, configuration.periodDurationNanoseconds - elapsed)
                guard periodRemaining > 0 else {
                    completeCurrentPeriod()
                    return
                }
                let consumed = min(remaining, periodRemaining)
                if phase == .firstHalf {
                    firstHalfElapsedNanoseconds += consumed
                } else {
                    secondHalfElapsedNanoseconds += consumed
                }
                remaining -= consumed
                if consumed == periodRemaining {
                    completeCurrentPeriod()
                    return
                }
                refreshParticipantTimesFromTimeline()

            case .halftimeCountdown:
                let halftimeRemaining = max(
                    0,
                    configuration.halftimeDurationNanoseconds - halftimeElapsedNanoseconds
                )
                guard halftimeRemaining > 0 else {
                    beginSecondHalf()
                    return
                }
                let consumed = min(remaining, halftimeRemaining)
                halftimeElapsedNanoseconds += consumed
                remaining -= consumed
                if consumed == halftimeRemaining {
                    beginSecondHalf()
                    return
                }

            case .timeout:
                let consumed = min(remaining, timeoutRemainingNanoseconds)
                timeoutRemainingNanoseconds -= consumed
                remaining -= consumed
                if timeoutRemainingNanoseconds == 0 {
                    let shouldResume = resumeAfterTimeout
                    timeoutOwner = nil

                    if shouldResume {
                        // The timeout's expiry authorizes resumption. Continue consuming any
                        // elapsed time after its exact deadline, including a delayed/background gap.
                        activity = .playing
                        resumeAfterTimeout = false
                    } else {
                        // A timeout begun while paused never authorizes automatic resumption.
                        activity = .stopped
                        resumeAfterTimeout = false
                        segmentAnchorNanoseconds = nil
                        return
                    }
                }
            }
        }
    }

    private mutating func completeCurrentPeriod() {
        if phase == .firstHalf {
            // Keep the selected on-field lineup through halftime. Its playing
            // interval is naturally capped by firstHalfEnd during calculation;
            // second-half kickoff records fresh entries at period-local time 0.
            firstHalfElapsedNanoseconds = configuration.periodDurationNanoseconds
            phase = .halftime
            halftimeElapsedNanoseconds = 0
            activity = .stopped
            resumeAfterTimeout = false
            refreshParticipantTimesFromTimeline()
        } else if phase == .secondHalf {
            closeCurrentPresence(origin: .periodBoundary)
            secondHalfElapsedNanoseconds = configuration.periodDurationNanoseconds
            phase = .finished
            activity = .stopped
            timeoutRemainingNanoseconds = 0
            timeoutOwner = nil
            resumeAfterTimeout = false
        }
        segmentAnchorNanoseconds = nil
    }

    private mutating func beginSecondHalf() {
        phase = .secondHalf
        activity = .stopped
        halftimeElapsedNanoseconds = 0
        timeoutRemainingNanoseconds = 0
        timeoutOwner = nil
        resumeAfterTimeout = false
        ourTimeoutsUsed = 0
        opponentTimeoutsUsed = 0
        segmentAnchorNanoseconds = nil
        if correctionMetadata.participationTimeline != nil {
            for participant in participants where participant.inField {
                _ = recordPresenceBoundary(
                    playerID: participant.id,
                    period: .secondHalf,
                    elapsedNanoseconds: 0,
                    transition: .enteredField,
                    origin: .halftimeRestart
                )
            }
            refreshParticipantTimesFromTimeline()
        }
    }

    private mutating func finishTimeout() {
        let shouldResume = resumeAfterTimeout
        timeoutRemainingNanoseconds = 0
        timeoutOwner = nil
        resumeAfterTimeout = false
        activity = shouldResume ? .playing : .stopped
        segmentAnchorNanoseconds = shouldResume ? clock.nowNanoseconds() : nil
    }

    private mutating func stopActiveSegment() {
        activity = .stopped
        segmentAnchorNanoseconds = nil
    }

    private func wholeSeconds(_ nanoseconds: Int64) -> Int {
        Int(max(0, nanoseconds) / Self.nanosecondsPerSecond)
    }

    private func countdownSecondsRemaining(duration: Int64, elapsed: Int64) -> Int {
        let remaining = max(0, duration - elapsed)
        guard remaining > 0 else {
            return 0
        }
        return Int((remaining + Self.nanosecondsPerSecond - 1) / Self.nanosecondsPerSecond)
    }
}
