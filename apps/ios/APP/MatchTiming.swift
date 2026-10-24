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

struct MatchTimingParticipantSnapshot: Codable, Equatable {
    let id: UUID
    var accumulatedNanoseconds: Int64
    var inField: Bool
}

/// Serializable timing state for a future persistence adapter.
/// `capturedAt` is a durable wall-clock checkpoint; the engine's live clock anchor is deliberately omitted.
struct MatchTimingSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 1

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

    var totalMatchElapsedSeconds: Int {
        Int((firstHalfElapsedNanoseconds + secondHalfElapsedNanoseconds) / 1_000_000_000)
    }
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
        guard snapshot.schemaVersion == MatchTimingSnapshot.currentSchemaVersion else {
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

        let totalPlayed = firstHalf + secondHalf
        guard snapshot.participants.allSatisfy({ $0.accumulatedNanoseconds <= totalPlayed }),
              snapshot.hasStarted || snapshot.participants.allSatisfy({ $0.accumulatedNanoseconds == 0 }) else {
            throw MatchTimingRestoreError.invalidSnapshot("il minutaggio individuale supera il tempo di gara")
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
            return false
        }

        attendanceIDs = ids
        attendanceConfirmed = true
        lineupConfirmed = false
        participants = []
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
                hasStarted = true
                activity = .playing
                segmentAnchorNanoseconds = clock.nowNanoseconds()
                return .started
            }
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
        participants[index].inField = inField
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

        participants[outgoingIndex].inField = false
        participants[incomingIndex].inField = true
        return true
    }

    mutating func finish() {
        synchronize()
        phase = .finished
        stopActiveSegment()
        timeoutRemainingNanoseconds = 0
        timeoutOwner = nil
        resumeAfterTimeout = false
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
            capturedAt: capturedAt
        )
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
                for index in participants.indices where participants[index].inField {
                    participants[index].accumulatedNanoseconds += consumed
                }
                remaining -= consumed
                if consumed == periodRemaining {
                    completeCurrentPeriod()
                    return
                }

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
            firstHalfElapsedNanoseconds = configuration.periodDurationNanoseconds
            phase = .halftime
            halftimeElapsedNanoseconds = 0
            activity = .stopped
            resumeAfterTimeout = false
        } else if phase == .secondHalf {
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
