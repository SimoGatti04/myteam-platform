import Foundation

/// Period-local game time. Pauses, timeouts and halftime are excluded because
/// these coordinates advance only when MatchTiming consumes playing time.
enum MatchPeriod: String, Codable, CaseIterable, Equatable, Identifiable {
    case firstHalf
    case secondHalf

    var id: String { rawValue }
}

enum MatchParticipationTransition: String, Codable, Equatable {
    case enteredField
    case leftField
}

enum MatchParticipationOrigin: String, Codable, Equatable {
    case startingLineup
    case substitution
    case periodBoundary
    case halftimeRestart
    case recoveryBaseline
    case manualCorrection
}

/// One ordered field-membership boundary. A substitution is represented by an
/// exit and entry with the same substitutionID and adjacent sequence values.
struct MatchParticipationBoundary: Identifiable, Codable, Equatable {
    let id: UUID
    let playerID: UUID
    let period: MatchPeriod
    var elapsedNanoseconds: Int64
    let sequence: Int64
    let transition: MatchParticipationTransition
    let origin: MatchParticipationOrigin
    let substitutionID: UUID?

    init(
        id: UUID = UUID(),
        playerID: UUID,
        period: MatchPeriod,
        elapsedNanoseconds: Int64,
        sequence: Int64,
        transition: MatchParticipationTransition,
        origin: MatchParticipationOrigin,
        substitutionID: UUID? = nil
    ) {
        self.id = id
        self.playerID = playerID
        self.period = period
        self.elapsedNanoseconds = elapsedNanoseconds
        self.sequence = sequence
        self.transition = transition
        self.origin = origin
        self.substitutionID = substitutionID
    }
}

/// Time already accumulated before reliable presence tracking began. It is
/// deliberately not reverse-engineered from a legacy snapshot.
struct MatchParticipationBaseline: Identifiable, Codable, Equatable {
    let playerID: UUID
    var observedNanoseconds: Int64

    var id: UUID { playerID }
}

struct MatchRecordedSubstitution: Identifiable, Equatable {
    let id: UUID
    let period: MatchPeriod
    let elapsedNanoseconds: Int64
    let outgoingPlayerID: UUID
    let incomingPlayerID: UUID
}

enum MatchParticipationTimelineError: LocalizedError, Equatable {
    case unsupportedSchema(Int)
    case duplicateBaseline(UUID)
    case duplicateBoundary(UUID)
    case duplicateSequence(Int64)
    case unknownParticipant(UUID)
    case invalidCoverage
    case invalidBoundary(UUID)
    case invalidTransition(playerID: UUID, period: MatchPeriod)
    case invalidBaseline(UUID)
    case invalidSubstitution(UUID)
    case arithmeticOverflow

    var errorDescription: String? {
        switch self {
        case let .unsupportedSchema(version):
            return "Versione della cronologia presenze non supportata: \(version)."
        case let .duplicateBaseline(id):
            return "La cronologia contiene una base minuti duplicata per \(id)."
        case let .duplicateBoundary(id):
            return "La cronologia contiene un confine duplicato (\(id))."
        case let .duplicateSequence(sequence):
            return "La cronologia contiene una sequenza duplicata (\(sequence))."
        case let .unknownParticipant(id):
            return "La cronologia fa riferimento a un giocatore sconosciuto (\(id))."
        case .invalidCoverage:
            return "La cronologia non copre il tempo di gara indicato."
        case let .invalidBoundary(id):
            return "Un confine di presenza non è compatibile con la partita (\(id))."
        case let .invalidTransition(playerID, period):
            return "Le entrate e le uscite di \(playerID) non sono coerenti nel periodo \(period.rawValue)."
        case let .invalidBaseline(id):
            return "La base minuti di \(id) non è valida."
        case let .invalidSubstitution(id):
            return "La sostituzione \(id) non è rappresentata da una coppia coerente."
        case .arithmeticOverflow:
            return "La somma dei minutaggi supera il limite rappresentabile."
        }
    }
}

/// Serializable attendance history owned by MatchTiming. Complete timelines
/// start at kickoff; partial timelines preserve the observed totals and only
/// claim certainty from their explicit coverage boundaries onward.
struct MatchParticipationTimelineSnapshot: Codable, Equatable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    var isCompleteFromStart: Bool
    var firstHalfCoverageStartNanoseconds: Int64
    var secondHalfCoverageStartNanoseconds: Int64
    var baselines: [MatchParticipationBaseline]
    var boundaries: [MatchParticipationBoundary]
    var nextSequence: Int64

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        isCompleteFromStart: Bool,
        firstHalfCoverageStartNanoseconds: Int64 = 0,
        secondHalfCoverageStartNanoseconds: Int64 = 0,
        baselines: [MatchParticipationBaseline] = [],
        boundaries: [MatchParticipationBoundary] = [],
        nextSequence: Int64 = 0
    ) {
        self.schemaVersion = schemaVersion
        self.isCompleteFromStart = isCompleteFromStart
        self.firstHalfCoverageStartNanoseconds = firstHalfCoverageStartNanoseconds
        self.secondHalfCoverageStartNanoseconds = secondHalfCoverageStartNanoseconds
        self.baselines = baselines
        self.boundaries = boundaries
        self.nextSequence = nextSequence
    }

    static func complete(
        participants: [MatchTimingParticipantSnapshot],
        starters: Set<UUID>
    ) throws -> Self {
        let ids = Set(participants.map(\.id))
        guard ids.count == participants.count,
              starters.count > 0,
              starters.isSubset(of: ids) else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        var result = Self(
            isCompleteFromStart: true,
            baselines: ids.sorted { $0.uuidString < $1.uuidString }
                .map { MatchParticipationBaseline(playerID: $0, observedNanoseconds: 0) }
        )
        for id in starters.sorted(by: { $0.uuidString < $1.uuidString }) {
            _ = try result.record(
                playerID: id,
                period: .firstHalf,
                elapsedNanoseconds: 0,
                transition: .enteredField,
                origin: .startingLineup
            )
        }
        return result
    }

    /// Adds a truthful baseline for legacy snapshots without inventing earlier
    /// substitutions. The current field state becomes reliable from the saved
    /// match coordinate forward.
    static func partialRecoveryBaseline(
        participants: [MatchTimingParticipantSnapshot],
        phase: MatchPhase,
        firstHalfElapsedNanoseconds: Int64,
        secondHalfElapsedNanoseconds: Int64,
        periodDurationNanoseconds: Int64
    ) throws -> Self {
        guard periodDurationNanoseconds > 0,
              firstHalfElapsedNanoseconds >= 0,
              firstHalfElapsedNanoseconds <= periodDurationNanoseconds,
              secondHalfElapsedNanoseconds >= 0,
              secondHalfElapsedNanoseconds <= periodDurationNanoseconds else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        let ids = Set(participants.map(\.id))
        guard ids.count == participants.count else {
            throw MatchParticipationTimelineError.invalidCoverage
        }

        let currentPeriod: MatchPeriod?
        switch phase {
        case .firstHalf:
            currentPeriod = .firstHalf
        case .secondHalf:
            currentPeriod = .secondHalf
        case .halftime, .finished:
            currentPeriod = nil
        }
        let firstCoverage: Int64
        let secondCoverage: Int64
        switch phase {
        case .firstHalf:
            firstCoverage = firstHalfElapsedNanoseconds
            secondCoverage = 0
        case .halftime:
            firstCoverage = periodDurationNanoseconds
            secondCoverage = 0
        case .secondHalf:
            firstCoverage = periodDurationNanoseconds
            secondCoverage = secondHalfElapsedNanoseconds
        case .finished:
            firstCoverage = firstHalfElapsedNanoseconds
            secondCoverage = secondHalfElapsedNanoseconds
        }

        var result = Self(
            isCompleteFromStart: false,
            firstHalfCoverageStartNanoseconds: firstCoverage,
            secondHalfCoverageStartNanoseconds: secondCoverage,
            baselines: participants.sorted { $0.id.uuidString < $1.id.uuidString }.map {
                MatchParticipationBaseline(
                    playerID: $0.id,
                    observedNanoseconds: max(0, $0.accumulatedNanoseconds)
                )
            }
        )
        guard let currentPeriod else {
            // C2 snapshots did not carry an attendance timeline. At halftime the
            // persisted in-field flags still describe the selected second-half
            // lineup, so record that state as a zero-duration recovery baseline
            // at the end of the first period. Earlier attendance remains unknown.
            if phase == .halftime {
                for participant in participants where participant.inField {
                    _ = try result.record(
                        playerID: participant.id,
                        period: .firstHalf,
                        elapsedNanoseconds: firstHalfElapsedNanoseconds,
                        transition: .enteredField,
                        origin: .recoveryBaseline
                    )
                }
            }
            return result
        }
        let elapsed = currentPeriod == .firstHalf
            ? firstHalfElapsedNanoseconds
            : secondHalfElapsedNanoseconds
        for participant in participants where participant.inField {
            _ = try result.record(
                playerID: participant.id,
                period: currentPeriod,
                elapsedNanoseconds: elapsed,
                transition: .enteredField,
                origin: .recoveryBaseline
            )
        }
        return result
    }

    var orderedBoundaries: [MatchParticipationBoundary] {
        boundaries.sorted {
            if $0.period != $1.period { return $0.period == .firstHalf }
            if $0.elapsedNanoseconds != $1.elapsedNanoseconds {
                return $0.elapsedNanoseconds < $1.elapsedNanoseconds
            }
            return $0.sequence < $1.sequence
        }
    }

    var substitutions: [MatchRecordedSubstitution] {
        let grouped = Dictionary(grouping: boundaries.compactMap { boundary in
            boundary.substitutionID.map { ($0, boundary) }
        }, by: { $0.0 })
        let orderedRecords: [(substitution: MatchRecordedSubstitution, sequence: Int64)] = grouped.compactMap { id, elements in
            let pair = elements.map(\.1)
            guard pair.count == 2,
                  let outgoing = pair.first(where: { $0.transition == .leftField }),
                  let incoming = pair.first(where: { $0.transition == .enteredField }),
                  outgoing.period == incoming.period,
                  outgoing.elapsedNanoseconds == incoming.elapsedNanoseconds else {
                return nil
            }
            let substitution = MatchRecordedSubstitution(
                id: id,
                period: outgoing.period,
                elapsedNanoseconds: outgoing.elapsedNanoseconds,
                outgoingPlayerID: outgoing.playerID,
                incomingPlayerID: incoming.playerID
            )
            return (substitution, pair.map(\.sequence).min() ?? Int64.max)
        }
        return orderedRecords.sorted {
            if $0.substitution.period != $1.substitution.period {
                return $0.substitution.period == .firstHalf
            }
            if $0.substitution.elapsedNanoseconds != $1.substitution.elapsedNanoseconds {
                return $0.substitution.elapsedNanoseconds < $1.substitution.elapsedNanoseconds
            }
            if $0.sequence != $1.sequence { return $0.sequence < $1.sequence }
            return $0.substitution.id.uuidString < $1.substitution.id.uuidString
        }.map(\.substitution)
    }

    var boundaryIDs: Set<UUID> { Set(boundaries.map(\.id)) }

    func coverageStart(for period: MatchPeriod) -> Int64 {
        switch period {
        case .firstHalf: firstHalfCoverageStartNanoseconds
        case .secondHalf: secondHalfCoverageStartNanoseconds
        }
    }

    @discardableResult
    mutating func record(
        playerID: UUID,
        period: MatchPeriod,
        elapsedNanoseconds: Int64,
        transition: MatchParticipationTransition,
        origin: MatchParticipationOrigin,
        substitutionID: UUID? = nil
    ) throws -> UUID {
        guard elapsedNanoseconds >= coverageStart(for: period),
              elapsedNanoseconds >= 0 else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        let (next, overflow) = nextSequence.addingReportingOverflow(1)
        guard !overflow else { throw MatchParticipationTimelineError.arithmeticOverflow }
        let id = UUID()
        boundaries.append(
            MatchParticipationBoundary(
                id: id,
                playerID: playerID,
                period: period,
                elapsedNanoseconds: elapsedNanoseconds,
                sequence: nextSequence,
                transition: transition,
                origin: origin,
                substitutionID: substitutionID
            )
        )
        nextSequence = next
        return id
    }

    mutating func moveBoundaries(
        withIDs ids: Set<UUID>,
        to elapsedNanoseconds: Int64,
        in period: MatchPeriod
    ) throws {
        guard elapsedNanoseconds >= coverageStart(for: period), !ids.isEmpty else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        let selected = boundaries.filter { ids.contains($0.id) }
        guard selected.count == ids.count,
              selected.allSatisfy({ $0.period == period }) else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        let substitutionIDs = Set(selected.compactMap(\.substitutionID))
        for substitutionID in substitutionIDs {
            let pair = boundaries.filter { $0.substitutionID == substitutionID }
            guard pair.count == 2, pair.allSatisfy({ ids.contains($0.id) }) else {
                throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
            }
        }
        for index in boundaries.indices where ids.contains(boundaries[index].id) {
            boundaries[index].elapsedNanoseconds = elapsedNanoseconds
        }
    }

    mutating func correctSubstitution(
        id substitutionID: UUID,
        outgoingID: UUID,
        incomingID: UUID,
        elapsedNanoseconds: Int64
    ) throws {
        guard let substitution = substitutions.first(where: { $0.id == substitutionID }),
              elapsedNanoseconds >= coverageStart(for: substitution.period),
              elapsedNanoseconds >= 0 else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }
        let boundaryIDs = Set(boundaries.filter { $0.substitutionID == substitutionID }.map(\.id))
        guard boundaryIDs.count == 2 else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }

        var proposed = self
        try proposed.replaceSubstitution(
            id: substitutionID,
            outgoingID: outgoingID,
            incomingID: incomingID
        )
        try proposed.moveBoundaries(
            withIDs: boundaryIDs,
            to: elapsedNanoseconds,
            in: substitution.period
        )
        self = proposed
    }

    mutating func removeSubstitution(id substitutionID: UUID) throws {
        let selected = boundaries.filter { $0.substitutionID == substitutionID }
        guard selected.count == 2,
              selected.contains(where: { $0.transition == .leftField }),
              selected.contains(where: { $0.transition == .enteredField }) else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }
        boundaries.removeAll { $0.substitutionID == substitutionID }
    }

    mutating func replaceSubstitution(
        id substitutionID: UUID,
        outgoingID: UUID,
        incomingID: UUID
    ) throws {
        guard outgoingID != incomingID else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }
        let indices = boundaries.indices.filter { boundaries[$0].substitutionID == substitutionID }
        guard indices.count == 2 else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }
        let left = indices.first { boundaries[$0].transition == .leftField }
        let entered = indices.first { boundaries[$0].transition == .enteredField }
        guard let left, let entered,
              boundaries[left].period == boundaries[entered].period,
              boundaries[left].elapsedNanoseconds == boundaries[entered].elapsedNanoseconds,
              abs(boundaries[left].sequence - boundaries[entered].sequence) == 1 else {
            throw MatchParticipationTimelineError.invalidSubstitution(substitutionID)
        }
        boundaries[left] = MatchParticipationBoundary(
            id: boundaries[left].id,
            playerID: outgoingID,
            period: boundaries[left].period,
            elapsedNanoseconds: boundaries[left].elapsedNanoseconds,
            sequence: boundaries[left].sequence,
            transition: .leftField,
            origin: .manualCorrection,
            substitutionID: substitutionID
        )
        boundaries[entered] = MatchParticipationBoundary(
            id: boundaries[entered].id,
            playerID: incomingID,
            period: boundaries[entered].period,
            elapsedNanoseconds: boundaries[entered].elapsedNanoseconds,
            sequence: boundaries[entered].sequence,
            transition: .enteredField,
            origin: .manualCorrection,
            substitutionID: substitutionID
        )
    }

    func nanosecondsPlayed(
        participantIDs: Set<UUID>,
        firstHalfEndNanoseconds: Int64,
        secondHalfEndNanoseconds: Int64
    ) throws -> [UUID: Int64] {
        try validateShape(participantIDs: participantIDs)
        var totals = Dictionary(uniqueKeysWithValues: baselines.map { ($0.playerID, $0.observedNanoseconds) })
        for period in MatchPeriod.allCases {
            let end = period == .firstHalf ? firstHalfEndNanoseconds : secondHalfEndNanoseconds
            let start = coverageStart(for: period)
            guard end >= start else { throw MatchParticipationTimelineError.invalidCoverage }
            for playerID in participantIDs {
                let events = orderedBoundaries.filter {
                    $0.playerID == playerID && $0.period == period && $0.elapsedNanoseconds <= end
                }
                var inField = false
                var openStart: Int64?
                var periodTotal: Int64 = 0
                for event in events {
                    guard event.elapsedNanoseconds >= start else {
                        throw MatchParticipationTimelineError.invalidBoundary(event.id)
                    }
                    switch event.transition {
                    case .enteredField:
                        guard !inField else {
                            throw MatchParticipationTimelineError.invalidTransition(playerID: playerID, period: period)
                        }
                        inField = true
                        openStart = event.elapsedNanoseconds
                    case .leftField:
                        guard inField, let intervalStart = openStart,
                              event.elapsedNanoseconds >= intervalStart else {
                            throw MatchParticipationTimelineError.invalidTransition(playerID: playerID, period: period)
                        }
                        let (sum, overflow) = periodTotal.addingReportingOverflow(event.elapsedNanoseconds - intervalStart)
                        guard !overflow else { throw MatchParticipationTimelineError.arithmeticOverflow }
                        periodTotal = sum
                        inField = false
                        openStart = nil
                    }
                }
                if let intervalStart = openStart {
                    let (sum, overflow) = periodTotal.addingReportingOverflow(end - intervalStart)
                    guard !overflow else { throw MatchParticipationTimelineError.arithmeticOverflow }
                    periodTotal = sum
                }
                let (sum, overflow) = totals[playerID, default: 0].addingReportingOverflow(periodTotal)
                guard !overflow else { throw MatchParticipationTimelineError.arithmeticOverflow }
                totals[playerID] = sum
            }
        }
        return totals
    }

    func fieldPlayerIDs(
        participantIDs: Set<UUID>,
        period: MatchPeriod,
        through elapsedNanoseconds: Int64
    ) throws -> Set<UUID> {
        try validateShape(participantIDs: participantIDs)
        guard elapsedNanoseconds >= coverageStart(for: period) else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        var field = Set<UUID>()
        let events = orderedBoundaries.filter {
            $0.period == period && $0.elapsedNanoseconds <= elapsedNanoseconds
        }
        for event in events {
            guard participantIDs.contains(event.playerID) else {
                throw MatchParticipationTimelineError.unknownParticipant(event.playerID)
            }
            switch event.transition {
            case .enteredField:
                guard field.insert(event.playerID).inserted else {
                    throw MatchParticipationTimelineError.invalidTransition(playerID: event.playerID, period: period)
                }
            case .leftField:
                guard field.remove(event.playerID) != nil else {
                    throw MatchParticipationTimelineError.invalidTransition(playerID: event.playerID, period: period)
                }
            }
        }
        return field
    }

    func validate(
        participantIDs: Set<UUID>,
        periodDurationNanoseconds: Int64,
        firstHalfEndNanoseconds: Int64,
        secondHalfEndNanoseconds: Int64
    ) throws {
        guard periodDurationNanoseconds > 0,
              firstHalfCoverageStartNanoseconds >= 0,
              firstHalfCoverageStartNanoseconds <= periodDurationNanoseconds,
              secondHalfCoverageStartNanoseconds >= 0,
              secondHalfCoverageStartNanoseconds <= periodDurationNanoseconds,
              firstHalfEndNanoseconds >= firstHalfCoverageStartNanoseconds,
              secondHalfEndNanoseconds >= secondHalfCoverageStartNanoseconds,
              firstHalfEndNanoseconds <= periodDurationNanoseconds,
              secondHalfEndNanoseconds <= periodDurationNanoseconds else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        try validateShape(participantIDs: participantIDs)
        guard Set(baselines.map(\.playerID)) == participantIDs else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        if isCompleteFromStart {
            guard firstHalfCoverageStartNanoseconds == 0,
                  secondHalfCoverageStartNanoseconds == 0,
                  baselines.allSatisfy({ $0.observedNanoseconds == 0 }) else {
                throw MatchParticipationTimelineError.invalidCoverage
            }
        }
        for boundary in boundaries {
            let end = boundary.period == .firstHalf ? firstHalfEndNanoseconds : secondHalfEndNanoseconds
            guard boundary.elapsedNanoseconds >= coverageStart(for: boundary.period),
                  boundary.elapsedNanoseconds <= periodDurationNanoseconds,
                  boundary.elapsedNanoseconds <= end else {
                throw MatchParticipationTimelineError.invalidBoundary(boundary.id)
            }
        }
        for (id, events) in Dictionary(grouping: boundaries.compactMap { boundary in
            boundary.substitutionID.map { ($0, boundary) }
        }, by: { $0.0 }) {
            let pair = events.map(\.1)
            guard pair.count == 2,
                  pair[0].period == pair[1].period,
                  pair[0].elapsedNanoseconds == pair[1].elapsedNanoseconds,
                  pair[0].transition != pair[1].transition,
                  abs(pair[0].sequence - pair[1].sequence) == 1 else {
                throw MatchParticipationTimelineError.invalidSubstitution(id)
            }
        }
        guard nextSequence > (boundaries.map(\.sequence).max() ?? -1) else {
            throw MatchParticipationTimelineError.invalidCoverage
        }
        _ = try nanosecondsPlayed(
            participantIDs: participantIDs,
            firstHalfEndNanoseconds: firstHalfEndNanoseconds,
            secondHalfEndNanoseconds: secondHalfEndNanoseconds
        )
    }

    private func validateShape(participantIDs: Set<UUID>) throws {
        guard schemaVersion == Self.currentSchemaVersion else {
            throw MatchParticipationTimelineError.unsupportedSchema(schemaVersion)
        }
        var baselineIDs = Set<UUID>()
        for baseline in baselines {
            guard baselineIDs.insert(baseline.playerID).inserted else {
                throw MatchParticipationTimelineError.duplicateBaseline(baseline.playerID)
            }
            guard participantIDs.contains(baseline.playerID) else {
                throw MatchParticipationTimelineError.unknownParticipant(baseline.playerID)
            }
            guard baseline.observedNanoseconds >= 0 else {
                throw MatchParticipationTimelineError.invalidBaseline(baseline.playerID)
            }
        }
        var boundaryIDs = Set<UUID>()
        var sequences = Set<Int64>()
        for boundary in boundaries {
            guard boundaryIDs.insert(boundary.id).inserted else {
                throw MatchParticipationTimelineError.duplicateBoundary(boundary.id)
            }
            guard sequences.insert(boundary.sequence).inserted,
                  boundary.sequence >= 0 else {
                throw MatchParticipationTimelineError.duplicateSequence(boundary.sequence)
            }
            guard participantIDs.contains(boundary.playerID) else {
                throw MatchParticipationTimelineError.unknownParticipant(boundary.playerID)
            }
        }
    }
}

/// Signed offset between attendance-derived time and a user's explicit minute
/// correction. Ongoing participation adds equally to observed time and leaves
/// this offset in place.
struct MatchTimingMinuteAdjustment: Codable, Equatable, Identifiable {
    let playerID: UUID
    var adjustmentNanoseconds: Int64

    var id: UUID { playerID }
}

struct MatchPlayerMinuteCorrection: Codable, Equatable, Identifiable {
    let playerID: UUID
    var adjustedSeconds: Int
    var reason: String?
    var correctedAt: Date

    var id: UUID { playerID }
}

/// Provenance for C3.3 additions. Optional at the parent snapshot boundary so
/// C3.2 JSON payloads decode unchanged.
enum MatchCorrectionUndoScope: String, Codable, Equatable {
    case timing
    case historyRecord
}

/// One bounded, durable undo slot. Payloads contain the pre-correction state
/// with any prior undo slot removed, so the encoded state cannot grow recursively.
struct MatchCorrectionUndoRecord: Codable, Equatable {
    let id: UUID
    let scope: MatchCorrectionUndoScope
    let summary: String
    let previousStatePayload: Data
    let recordedAt: Date
}

/// Final period endpoints copied into a historical record so a later clock
/// correction can recalculate minutes only when the persisted attendance
/// history actually covers the changed interval.
struct MatchHistoricalAttendance: Codable, Equatable {
    let periodDurationNanoseconds: Int64
    var firstHalfEndNanoseconds: Int64
    var secondHalfEndNanoseconds: Int64
}

struct MatchCorrectionMetadata: Codable, Equatable {
    static let legacySchemaVersion = 1
    static let currentSchemaVersion = 2

    var schemaVersion: Int
    var participationTimeline: MatchParticipationTimelineSnapshot?
    var minuteAdjustments: [MatchTimingMinuteAdjustment]
    var minuteCorrections: [MatchPlayerMinuteCorrection]
    var historicalAttendance: MatchHistoricalAttendance?
    var lastUndo: MatchCorrectionUndoRecord?

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        participationTimeline: MatchParticipationTimelineSnapshot? = nil,
        minuteAdjustments: [MatchTimingMinuteAdjustment] = [],
        minuteCorrections: [MatchPlayerMinuteCorrection] = [],
        historicalAttendance: MatchHistoricalAttendance? = nil,
        lastUndo: MatchCorrectionUndoRecord? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.participationTimeline = participationTimeline
        self.minuteAdjustments = minuteAdjustments
        self.minuteCorrections = minuteCorrections
        self.historicalAttendance = historicalAttendance
        self.lastUndo = lastUndo
    }
}
