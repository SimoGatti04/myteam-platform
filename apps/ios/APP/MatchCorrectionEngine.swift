import Foundation

enum MatchRecordCorrectionError: LocalizedError, Equatable {
    case identityChanged
    case duplicateIdentifiers
    case invalidDuration
    case invalidChangedParticipant(UUID)
    case invalidChangedEvent(UUID)
    case invalidAttendanceTimeline(String)
    case noUndoAvailable
    case invalidUndoPayload
    case nothingChanged

    var errorDescription: String? {
        switch self {
        case .identityChanged:
            return "Una correzione non può cambiare l'identificativo della partita."
        case .duplicateIdentifiers:
            return "La correzione contiene identificativi duplicati."
        case .invalidDuration:
            return "La durata della partita non è valida."
        case let .invalidChangedParticipant(id):
            return "Il minutaggio del giocatore \(id) non è compatibile con la durata della partita."
        case let .invalidChangedEvent(id):
            return "L'evento \(id) è successivo al tempo della partita. Correggi prima l'evento oppure annulla la modifica."
        case let .invalidAttendanceTimeline(reason):
            return "La correzione non è compatibile con la cronologia delle presenze: \(reason)"
        case .noUndoAvailable:
            return "Non è disponibile una correzione storica da annullare."
        case .invalidUndoPayload:
            return "La correzione precedente non può essere recuperata integralmente."
        case .nothingChanged:
            return "Non ci sono modifiche da confermare."
        }
    }
}

struct MatchRecordCorrectionPreview: Equatable, Identifiable {
    let id: UUID
    let before: MatchRecord
    let proposed: MatchRecord
    let affectedPlayerIDs: [UUID]
    let automaticallyRecalculatedPlayerIDs: [UUID]
    let preservedMinutePlayerIDs: [UUID]
    let affectedEventIDs: [UUID]
    let previousScore: (ours: Int?, opponent: Int?)
    let proposedScore: (ours: Int?, opponent: Int?)

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.before == rhs.before && lhs.proposed == rhs.proposed &&
        lhs.affectedPlayerIDs == rhs.affectedPlayerIDs &&
        lhs.automaticallyRecalculatedPlayerIDs == rhs.automaticallyRecalculatedPlayerIDs &&
        lhs.preservedMinutePlayerIDs == rhs.preservedMinutePlayerIDs &&
        lhs.affectedEventIDs == rhs.affectedEventIDs &&
        lhs.previousScore.ours == rhs.previousScore.ours && lhs.previousScore.opponent == rhs.previousScore.opponent &&
        lhs.proposedScore.ours == rhs.proposedScore.ours && lhs.proposedScore.opponent == rhs.proposedScore.opponent
    }
}

enum MatchRecordCorrectionEngine {
    private static let nanosecondsPerSecond: Int64 = 1_000_000_000

    static func preview(
        from original: MatchRecord,
        proposing proposedRecord: MatchRecord
    ) throws -> MatchRecordCorrectionPreview {
        guard original.id == proposedRecord.id else { throw MatchRecordCorrectionError.identityChanged }

        let historicalPeriodDuration = proposedRecord.correctionMetadata?.historicalAttendance?.periodDurationNanoseconds
        let configuredMaximum = historicalPeriodDuration.map { Int(($0 / nanosecondsPerSecond) * 2) }
            ?? FutsalMatchRules.timing.periodDurationSeconds * 2
        // Preserve editability of legacy records that already exceed today's configured limit,
        // while preventing a correction from extending them further.
        let maximumDuration = max(original.duration, configuredMaximum)
        guard proposedRecord.duration >= 0,
              proposedRecord.duration <= maximumDuration else {
            throw MatchRecordCorrectionError.invalidDuration
        }

        let proposedEventArray = proposedRecord.events
        let originalEventArray = original.events ?? []
        let nextEventArray = proposedEventArray ?? []
        let oldEventIDs = originalEventArray.map(\.id)
        let newEventIDs = nextEventArray.map(\.id)
        guard original.players.map(\.id).count == Set(original.players.map(\.id)).count,
              proposedRecord.players.map(\.id).count == Set(proposedRecord.players.map(\.id)).count,
              oldEventIDs.count == Set(oldEventIDs).count,
              newEventIDs.count == Set(newEventIDs).count else {
            throw MatchRecordCorrectionError.duplicateIdentifiers
        }

        for event in nextEventArray {
            guard event.matchSecond >= 0, event.matchSecond <= proposedRecord.duration else {
                throw MatchRecordCorrectionError.invalidChangedEvent(event.id)
            }
        }

        var proposed = proposedRecord
        var metadata = proposed.correctionMetadata ?? original.correctionMetadata ?? MatchCorrectionMetadata()
        var recalculatedPlayerIDs: Set<UUID> = []
        var preservedMinutePlayerIDs: Set<UUID> = []
        let oldPlayers = Dictionary(uniqueKeysWithValues: original.players.map { ($0.id, $0) })
        let editedMinuteRosterIDs = Set(proposed.players.compactMap { player -> UUID? in
            guard let old = oldPlayers[player.id], old.secondsPlayed != player.secondsPlayed else { return nil }
            return player.rosterPlayerID
        })

        var attendanceEnds = metadata.historicalAttendance
        let durationChanged = proposed.duration != original.duration
        if durationChanged, let attendance = attendanceEnds {
            attendanceEnds = try adjustedAttendanceEnds(
                attendance,
                toDurationSeconds: proposed.duration
            )
        }

        if let timeline = metadata.participationTimeline,
           let attendance = attendanceEnds {
            do {
                try timeline.validate(
                    participantIDs: Set(timeline.baselines.map(\.playerID)),
                    periodDurationNanoseconds: attendance.periodDurationNanoseconds,
                    firstHalfEndNanoseconds: attendance.firstHalfEndNanoseconds,
                    secondHalfEndNanoseconds: attendance.secondHalfEndNanoseconds
                )
                let rawMinutes = try timeline.nanosecondsPlayed(
                    participantIDs: Set(timeline.baselines.map(\.playerID)),
                    firstHalfEndNanoseconds: attendance.firstHalfEndNanoseconds,
                    secondHalfEndNanoseconds: attendance.secondHalfEndNanoseconds
                )
                let adjustmentIDs = metadata.minuteAdjustments.map(\.playerID)
                let correctionIDs = metadata.minuteCorrections.map(\.playerID)
                guard adjustmentIDs.count == Set(adjustmentIDs).count,
                      correctionIDs.count == Set(correctionIDs).count else {
                    throw MatchRecordCorrectionError.duplicateIdentifiers
                }
                var adjustments = Dictionary(uniqueKeysWithValues: metadata.minuteAdjustments.map {
                    ($0.playerID, $0.adjustmentNanoseconds)
                })
                var minuteCorrections = Dictionary(uniqueKeysWithValues: metadata.minuteCorrections.map {
                    ($0.playerID, $0)
                })

                let timelineChanged = timeline != original.correctionMetadata?.participationTimeline
                let shouldRecalculate = durationChanged || timelineChanged
                for index in proposed.players.indices {
                    let player = proposed.players[index]
                    guard let rosterID = player.rosterPlayerID else {
                        if shouldRecalculate {
                            preservedMinutePlayerIDs.insert(player.id)
                        }
                        continue
                    }
                    guard let raw = rawMinutes[rosterID] else {
                        if shouldRecalculate {
                            preservedMinutePlayerIDs.insert(rosterID)
                        }
                        continue
                    }

                    let explicitlyChanged = editedMinuteRosterIDs.contains(rosterID)
                    if explicitlyChanged {
                        let desiredNanoseconds = Int64(player.secondsPlayed) * nanosecondsPerSecond
                        let (offset, overflow) = desiredNanoseconds.subtractingReportingOverflow(raw)
                        guard !overflow else { throw MatchRecordCorrectionError.invalidChangedParticipant(player.id) }
                        adjustments[rosterID] = offset
                        minuteCorrections[rosterID] = MatchPlayerMinuteCorrection(
                            playerID: rosterID,
                            adjustedSeconds: player.secondsPlayed,
                            reason: "Rettifica manuale dello storico",
                            correctedAt: Date()
                        )
                        continue
                    }

                    if shouldRecalculate {
                        let (adjusted, overflow) = raw.addingReportingOverflow(adjustments[rosterID, default: 0])
                        guard !overflow,
                              adjusted >= 0,
                              adjusted <= Int64(proposed.duration) * nanosecondsPerSecond else {
                            throw MatchRecordCorrectionError.invalidChangedParticipant(player.id)
                        }
                        let recalculated = Int(adjusted / nanosecondsPerSecond)
                        if proposed.players[index].secondsPlayed != recalculated {
                            proposed.players[index].secondsPlayed = recalculated
                            recalculatedPlayerIDs.insert(rosterID)
                        }
                    }
                }
                metadata.minuteAdjustments = adjustments
                    .map { MatchTimingMinuteAdjustment(playerID: $0.key, adjustmentNanoseconds: $0.value) }
                    .sorted { $0.playerID.uuidString < $1.playerID.uuidString }
                metadata.minuteCorrections = minuteCorrections.values.sorted {
                    $0.playerID.uuidString < $1.playerID.uuidString
                }
            } catch let error as MatchRecordCorrectionError {
                throw error
            } catch {
                throw MatchRecordCorrectionError.invalidAttendanceTimeline(error.localizedDescription)
            }
        } else {
            for player in proposed.players {
                guard let old = oldPlayers[player.id],
                      old.secondsPlayed != player.secondsPlayed else { continue }
                metadata.minuteCorrections.removeAll { $0.playerID == player.rosterPlayerID }
                if let rosterID = player.rosterPlayerID {
                    metadata.minuteCorrections.append(
                        MatchPlayerMinuteCorrection(
                            playerID: rosterID,
                            adjustedSeconds: player.secondsPlayed,
                            reason: "Rettifica manuale dello storico",
                            correctedAt: Date()
                        )
                    )
                }
            }
            if durationChanged {
                preservedMinutePlayerIDs.formUnion(proposed.players.map(\.id))
            }
        }

        metadata.historicalAttendance = attendanceEnds

        let eventsChanged = proposed.events != original.events
        if eventsChanged {
            proposed.ourScore = nextEventArray.filter { $0.team == .ours }.count
            proposed.opponentScore = nextEventArray.filter { $0.team == .opponent }.count
            for index in proposed.players.indices {
                let player = proposed.players[index]
                proposed.players[index].goals = nextEventArray.filter {
                    $0.team == .ours && eventReferencesPlayer(
                        id: $0.scorerID,
                        name: $0.scorerName,
                        player: player
                    )
                }.count
                proposed.players[index].assists = nextEventArray.filter {
                    $0.team == .ours && eventReferencesPlayer(
                        id: $0.assistID,
                        name: $0.assistName,
                        player: player
                    )
                }.count
            }
        }
        if original.correctionMetadata != nil || proposedRecord.correctionMetadata != nil ||
            metadata != MatchCorrectionMetadata() {
            proposed.correctionMetadata = metadata
        }

        guard original != proposed else { throw MatchRecordCorrectionError.nothingChanged }
        let proposedPlayers = Dictionary(uniqueKeysWithValues: proposed.players.map { ($0.id, $0) })
        for player in proposed.players {
            guard player.secondsPlayed >= 0,
                  player.secondsPlayed <= proposed.duration else {
                throw MatchRecordCorrectionError.invalidChangedParticipant(player.id)
            }
        }
        let affectedPlayers = Set(oldPlayers.keys).union(proposedPlayers.keys).filter {
            oldPlayers[$0] != proposedPlayers[$0]
        }.sorted { $0.uuidString < $1.uuidString }
        let oldEvents = Dictionary(uniqueKeysWithValues: originalEventArray.map { ($0.id, $0) })
        let newEvents = Dictionary(uniqueKeysWithValues: nextEventArray.map { ($0.id, $0) })
        let affectedEvents = Set(oldEvents.keys).union(newEvents.keys).filter {
            oldEvents[$0] != newEvents[$0]
        }.sorted { $0.uuidString < $1.uuidString }

        // A roster identity should not occur more than once in a historical record.
        let rosterIDs = proposed.players.compactMap(\.rosterPlayerID)
        guard rosterIDs.count == Set(rosterIDs).count else {
            throw MatchRecordCorrectionError.duplicateIdentifiers
        }
        return MatchRecordCorrectionPreview(
            id: UUID(),
            before: original,
            proposed: proposed,
            affectedPlayerIDs: affectedPlayers,
            automaticallyRecalculatedPlayerIDs: recalculatedPlayerIDs.sorted { $0.uuidString < $1.uuidString },
            preservedMinutePlayerIDs: preservedMinutePlayerIDs.sorted { $0.uuidString < $1.uuidString },
            affectedEventIDs: affectedEvents,
            previousScore: (original.ourScore, original.opponentScore),
            proposedScore: (proposed.ourScore, proposed.opponentScore)
        )
    }

    static func confirmedRecord(
        from preview: MatchRecordCorrectionPreview,
        confirmedAt: Date = Date()
    ) throws -> MatchRecord {
        var previous = preview.before
        if var previousMetadata = previous.correctionMetadata {
            previousMetadata.lastUndo = nil
            previous.correctionMetadata = previousMetadata
        }
        guard let payload = try? JSONEncoder().encode(previous) else {
            throw MatchRecordCorrectionError.invalidUndoPayload
        }

        var result = preview.proposed
        var metadata = result.correctionMetadata ?? preview.before.correctionMetadata ?? MatchCorrectionMetadata()
        metadata.lastUndo = MatchCorrectionUndoRecord(
            id: preview.id,
            scope: .historyRecord,
            summary: "Modifica partita storica",
            previousStatePayload: payload,
            recordedAt: confirmedAt
        )
        result.correctionMetadata = metadata
        return result
    }

    static func undo(_ record: MatchRecord) throws -> MatchRecord {
        guard let undo = record.correctionMetadata?.lastUndo,
              undo.scope == .historyRecord else {
            throw MatchRecordCorrectionError.noUndoAvailable
        }
        guard var previous = try? JSONDecoder().decode(MatchRecord.self, from: undo.previousStatePayload) else {
            throw MatchRecordCorrectionError.invalidUndoPayload
        }
        if var metadata = previous.correctionMetadata {
            metadata.lastUndo = nil
            previous.correctionMetadata = metadata
        }
        return previous
    }

    private static func eventReferencesPlayer(
        id eventPlayerID: UUID?,
        name eventPlayerName: String?,
        player: PlayerMatchSummary
    ) -> Bool {
        if let rosterPlayerID = player.rosterPlayerID {
            if let eventPlayerID { return eventPlayerID == rosterPlayerID }
        }
        guard let eventPlayerName, !eventPlayerName.isEmpty else { return false }
        return eventPlayerName.trimmingCharacters(in: .whitespacesAndNewlines)
            .localizedCaseInsensitiveCompare(player.playerName.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
    }

    private static func adjustedAttendanceEnds(
        _ attendance: MatchHistoricalAttendance,
        toDurationSeconds duration: Int
    ) throws -> MatchHistoricalAttendance {
        let (oldTotal, oldOverflow) = attendance.firstHalfEndNanoseconds.addingReportingOverflow(
            attendance.secondHalfEndNanoseconds
        )
        let (target, targetOverflow) = Int64(duration).multipliedReportingOverflow(by: nanosecondsPerSecond)
        guard !oldOverflow, !targetOverflow else { throw MatchRecordCorrectionError.invalidDuration }
        var delta = target - oldTotal
        var first = attendance.firstHalfEndNanoseconds
        var second = attendance.secondHalfEndNanoseconds
        let periodMax = attendance.periodDurationNanoseconds

        if second > 0 {
            let candidate = second + delta
            if candidate < 0 {
                delta = candidate
                second = 0
            } else if candidate > periodMax {
                delta = candidate - periodMax
                second = periodMax
            } else {
                second = candidate
                delta = 0
            }
        }
        if delta != 0 || second == 0 {
            let candidate = first + delta
            guard candidate >= 0, candidate <= periodMax else {
                throw MatchRecordCorrectionError.invalidDuration
            }
            first = candidate
            delta = 0
        }
        guard delta == 0,
              first >= 0, first <= periodMax,
              second >= 0, second <= periodMax,
              first + second == target else {
            throw MatchRecordCorrectionError.invalidDuration
        }
        return MatchHistoricalAttendance(
            periodDurationNanoseconds: periodMax,
            firstHalfEndNanoseconds: first,
            secondHalfEndNanoseconds: second
        )
    }
}
