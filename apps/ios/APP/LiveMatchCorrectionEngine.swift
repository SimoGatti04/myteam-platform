import Foundation

struct LiveMatchEventCorrectionState: Equatable {
    var events: [GoalEvent]
    var pendingAssist: LiveMatchPendingAssistSnapshot?
    var metadata: LiveMatchCorrectionMetadata
}

enum LiveMatchEventCorrectionError: LocalizedError, Equatable {
    case duplicateEventID
    case missingEvent(UUID)
    case eventIdentityChanged
    case cannotDeleteNewEvent
    case eventOutsideCurrentMatchTime
    case undoUnavailable

    var errorDescription: String? {
        switch self {
        case .duplicateEventID:
            return "La partita contiene eventi con identificativi duplicati."
        case let .missingEvent(id):
            return "L'evento da correggere non è più presente nella partita (\(id))."
        case .eventIdentityChanged:
            return "La correzione non può cambiare l'identificativo dell'evento."
        case .cannotDeleteNewEvent:
            return "Un nuovo evento non può essere eliminato prima di essere salvato."
        case .eventOutsideCurrentMatchTime:
            return "L'orario dell'evento non è compatibile con il tempo partita corrente."
        case .undoUnavailable:
            return "Non è disponibile una correzione degli eventi da annullare."
        }
    }
}

/// Applies one bounded live event correction. The returned state is still only a
/// proposal; callers must persist it before reporting success to the user.
enum LiveMatchEventCorrectionEngine {
    static func apply(
        _ correctedEvent: GoalEvent?,
        replacing eventID: UUID?,
        to events: [GoalEvent],
        pendingAssist: LiveMatchPendingAssistSnapshot?,
        metadata: LiveMatchCorrectionMetadata,
        maximumSecond: Int,
        recordedAt: Date = Date()
    ) throws -> LiveMatchEventCorrectionState {
        guard Set(events.map(\.id)).count == events.count else {
            throw LiveMatchEventCorrectionError.duplicateEventID
        }

        var updatedEvents = events
        if let eventID {
            guard let index = updatedEvents.firstIndex(where: { $0.id == eventID }) else {
                throw LiveMatchEventCorrectionError.missingEvent(eventID)
            }
            if let correctedEvent {
                guard correctedEvent.id == eventID else {
                    throw LiveMatchEventCorrectionError.eventIdentityChanged
                }
                guard (0...maximumSecond).contains(correctedEvent.matchSecond) else {
                    throw LiveMatchEventCorrectionError.eventOutsideCurrentMatchTime
                }
                updatedEvents[index] = correctedEvent
            } else {
                updatedEvents.remove(at: index)
            }
        } else if let correctedEvent {
            guard !updatedEvents.contains(where: { $0.id == correctedEvent.id }) else {
                throw LiveMatchEventCorrectionError.duplicateEventID
            }
            guard (0...maximumSecond).contains(correctedEvent.matchSecond) else {
                throw LiveMatchEventCorrectionError.eventOutsideCurrentMatchTime
            }
            updatedEvents.append(correctedEvent)
        } else {
            throw LiveMatchEventCorrectionError.cannotDeleteNewEvent
        }

        var updatedPendingAssist = pendingAssist
        if let pendingAssist, pendingAssist.goalEventID == eventID {
            if let changedGoal = updatedEvents.first(where: { $0.id == pendingAssist.goalEventID }),
               changedGoal.team == .ours,
               changedGoal.assistID == nil,
               let scorerID = changedGoal.scorerID,
               let scorerName = changedGoal.scorerName {
                updatedPendingAssist = LiveMatchPendingAssistSnapshot(
                    goalEventID: changedGoal.id,
                    scorerID: scorerID,
                    scorerName: scorerName
                )
            } else {
                updatedPendingAssist = nil
            }
        }

        var updatedMetadata = metadata
        updatedMetadata.lastEventUndo = LiveMatchEventCorrectionUndo(
            id: UUID(),
            previousEvents: events,
            previousPendingAssist: pendingAssist,
            recordedAt: recordedAt
        )
        return LiveMatchEventCorrectionState(
            events: updatedEvents,
            pendingAssist: updatedPendingAssist,
            metadata: updatedMetadata
        )
    }

    static func undo(
        events: [GoalEvent],
        pendingAssist: LiveMatchPendingAssistSnapshot?,
        metadata: LiveMatchCorrectionMetadata,
        maximumSecond: Int
    ) throws -> LiveMatchEventCorrectionState {
        guard let undo = metadata.lastEventUndo else {
            throw LiveMatchEventCorrectionError.undoUnavailable
        }
        guard Set(undo.previousEvents.map(\.id)).count == undo.previousEvents.count else {
            throw LiveMatchEventCorrectionError.duplicateEventID
        }
        guard undo.previousEvents.allSatisfy({ (0...maximumSecond).contains($0.matchSecond) }) else {
            throw LiveMatchEventCorrectionError.eventOutsideCurrentMatchTime
        }
        var updatedMetadata = metadata
        updatedMetadata.lastEventUndo = nil
        return LiveMatchEventCorrectionState(
            events: undo.previousEvents,
            pendingAssist: undo.previousPendingAssist,
            metadata: updatedMetadata
        )
    }
}
