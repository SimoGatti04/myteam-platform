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
