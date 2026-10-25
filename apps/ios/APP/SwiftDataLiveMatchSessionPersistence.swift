import Foundation
import SwiftData

/// MatchDataStore is the single local SwiftData owner. Implementing the live
/// repository here lets history finalization share one ModelContext transaction.
@MainActor
extension MatchDataStore: LiveMatchSessionRepository {
    func load() -> LiveMatchSessionLoadResult {
        let context = makeContext()
        do {
            let rows = try context.fetch(FetchDescriptor<StoredLiveMatchSession>())
            guard rows.count <= 1 else {
                return .unavailable(message: "Nello store sono presenti più sessioni live; nessun dato è stato modificato.")
            }
            guard let row = rows.first else { return .none }

            do {
                let snapshot = try LiveMatchSessionDocumentCodec.decode(row.currentDocument)
                guard snapshot.sessionID == row.sessionID,
                      snapshot.schemaVersion == row.payloadVersion,
                      snapshot.status.rawValue == row.statusRawValue else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("i metadati SwiftData non corrispondono allo snapshot")
                }
                if row.requiresRecoveryReview {
                    return .backupAvailable(
                        snapshot: snapshot,
                        reason: row.recoveryReviewReason ?? "La sessione importata richiede una conferma esplicita prima di essere ripresa."
                    )
                }
                return .primary(snapshot)
            } catch {
                let currentFailure = error.localizedDescription
                guard let previousDocument = row.previousDocument else {
                    return .unavailable(message: "La sessione live in SwiftData non è leggibile e non esiste una generazione precedente verificabile. I dati sono stati conservati. Dettaglio: \(currentFailure)")
                }
                do {
                    let backup = try LiveMatchSessionDocumentCodec.decode(previousDocument)
                    guard backup.sessionID == row.sessionID else {
                        throw LiveMatchSessionPersistenceError.invalidPayload("la generazione precedente ha un identificativo diverso")
                    }
                    return .backupAvailable(
                        snapshot: backup,
                        reason: "La sessione live principale in SwiftData non è leggibile; è disponibile la generazione precedente. \(currentFailure)"
                    )
                } catch {
                    return .unavailable(message: "La sessione live principale e la generazione precedente non sono leggibili. Nessun dato è stato rimosso. Dettaglio: \(error.localizedDescription)")
                }
            }
        } catch {
            return .unavailable(message: "Lo store SwiftData non ha potuto leggere la sessione live. Nessun dato è stato modificato. Dettaglio: \(error.localizedDescription)")
        }
    }

    func save(_ snapshot: LiveMatchSessionSnapshot) throws {
        let document = try LiveMatchSessionDocumentCodec.encode(snapshot)
        let context = makeContext()
        do {
            try context.transaction {
                let rows = try context.fetch(FetchDescriptor<StoredLiveMatchSession>())
                guard rows.count <= 1 else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("sono presenti più sessioni live")
                }
                guard let row = rows.first else {
                    context.insert(StoredLiveMatchSession(snapshot: snapshot, document: document))
                    return
                }
                guard row.sessionID == snapshot.sessionID else {
                    throw LiveMatchSessionPersistenceError.anotherSessionExists(row.sessionID)
                }
                guard !row.requiresRecoveryReview else {
                    throw LiveMatchSessionPersistenceError.sessionMustBeRecoveredBeforeOverwrite
                }
                let current = try LiveMatchSessionDocumentCodec.decode(row.currentDocument)
                guard current.sessionID == row.sessionID,
                      current.schemaVersion == row.payloadVersion,
                      current.status.rawValue == row.statusRawValue else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("i metadati della sessione non corrispondono al contenuto")
                }
                try Self.validateStatusTransition(from: current.status, to: snapshot.status)
                guard row.currentGeneration < Int64.max else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("il contatore di generazione è esaurito")
                }
                row.previousDocument = row.currentDocument
                row.previousGeneration = row.currentGeneration
                row.currentDocument = document
                row.currentGeneration += 1
                row.payloadVersion = snapshot.schemaVersion
                row.statusRawValue = snapshot.status.rawValue
                row.updatedAt = .now
            }
        } catch {
            context.rollback()
            throw error
        }

        let readback = try loadSnapshot(sessionID: snapshot.sessionID)
        guard try Self.snapshotsAreEquivalent(readback, snapshot) else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(snapshot.sessionID)
        }
    }

    func restoreBackup() throws -> LiveMatchSessionSnapshot {
        let context = makeContext()
        let rows = try context.fetch(FetchDescriptor<StoredLiveMatchSession>())
        guard rows.count == 1, let row = rows.first else {
            throw LiveMatchSessionPersistenceError.noUsableBackup
        }

        if row.requiresRecoveryReview,
           let selected = try? LiveMatchSessionDocumentCodec.decode(row.currentDocument) {
            guard selected.sessionID == row.sessionID else {
                throw LiveMatchSessionPersistenceError.invalidPayload("la sessione di recupero ha un identificativo diverso")
            }
            do {
                try context.transaction {
                    row.requiresRecoveryReview = false
                    row.recoveryReviewReason = nil
                    row.updatedAt = .now
                }
            } catch {
                context.rollback()
                throw error
            }
            let readback = try loadSnapshot(sessionID: selected.sessionID)
            guard try Self.snapshotsAreEquivalent(readback, selected) else {
                throw MatchDataPersistenceError.liveSessionReadbackFailed(selected.sessionID)
            }
            return readback
        }

        guard let previousDocument = row.previousDocument,
              let previousGeneration = row.previousGeneration else {
            throw LiveMatchSessionPersistenceError.noUsableBackup
        }
        let backup = try LiveMatchSessionDocumentCodec.decode(previousDocument)
        guard backup.sessionID == row.sessionID else {
            throw LiveMatchSessionPersistenceError.invalidPayload("la generazione precedente ha un identificativo diverso")
        }

        let currentFailure: Error
        do {
            _ = try LiveMatchSessionDocumentCodec.decode(row.currentDocument)
            throw LiveMatchSessionPersistenceError.validPrimaryCannotBeReplaced
        } catch let error as LiveMatchSessionPersistenceError {
            if case .validPrimaryCannotBeReplaced = error { throw error }
            currentFailure = error
        } catch {
            currentFailure = error
        }
        guard row.quarantinedDocument == nil else {
            throw MatchDataPersistenceError.liveSessionQuarantineOccupied(row.sessionID)
        }

        let corruptDocument = row.currentDocument
        do {
            try context.transaction {
                row.quarantinedDocument = corruptDocument
                row.quarantineReason = currentFailure.localizedDescription
                row.quarantinedAt = .now
                row.currentDocument = previousDocument
                row.currentGeneration = previousGeneration
                row.previousDocument = nil
                row.previousGeneration = nil
                row.payloadVersion = backup.schemaVersion
                row.statusRawValue = backup.status.rawValue
                row.requiresRecoveryReview = false
                row.recoveryReviewReason = nil
                row.updatedAt = .now
            }
        } catch {
            context.rollback()
            throw error
        }

        let readback = try loadSnapshot(sessionID: backup.sessionID)
        guard try Self.snapshotsAreEquivalent(readback, backup) else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(backup.sessionID)
        }
        return readback
    }

    func finalize(_ snapshot: LiveMatchSessionSnapshot) throws {
        try snapshot.validate()
        guard let record = snapshot.finalRecord, record.id == snapshot.sessionID else {
            throw LiveMatchSessionPersistenceError.finalRecordMissing
        }
        try validateHistoryIdentifiers([record])
        let context = makeContext()
        do {
            try context.transaction {
                let sessions = try context.fetch(FetchDescriptor<StoredLiveMatchSession>())
                guard sessions.count <= 1 else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("sono presenti più sessioni live")
                }
                if let other = sessions.first, other.sessionID != snapshot.sessionID {
                    throw LiveMatchSessionPersistenceError.anotherSessionExists(other.sessionID)
                }

                let records = try context.fetch(FetchDescriptor<StoredMatchRecord>())
                let existingRecord = records.first { $0.id == record.id }
                if let existingRecord {
                    guard recordsAreEquivalent(try existingRecord.domainValue(), record) else {
                        throw MatchDataPersistenceError.liveSessionHistoryConflict(record.id)
                    }
                } else if sessions.isEmpty {
                    throw MatchDataPersistenceError.liveSessionMissing(snapshot.sessionID)
                }

                if let session = sessions.first {
                    guard !session.requiresRecoveryReview else {
                        throw LiveMatchSessionPersistenceError.sessionMustBeRecoveredBeforeOverwrite
                    }
                    let current = try LiveMatchSessionDocumentCodec.decode(session.currentDocument)
                    guard current.sessionID == snapshot.sessionID,
                          current.schemaVersion == session.payloadVersion,
                          current.status.rawValue == session.statusRawValue else {
                        throw LiveMatchSessionPersistenceError.invalidPayload("i metadati SwiftData non corrispondono allo snapshot")
                    }
                    if (current.status == .finalizing || current.status == .finalized),
                       let priorRecord = current.finalRecord,
                       !recordsAreEquivalent(priorRecord, record) {
                        throw MatchDataPersistenceError.liveSessionHistoryConflict(record.id)
                    }
                }

                if existingRecord == nil {
                    for item in records { item.position += 1 }
                    context.insert(StoredMatchRecord(record, position: 0))
                }
                if let session = sessions.first {
                    context.delete(session)
                }
            }
        } catch {
            context.rollback()
            throw error
        }

        let verificationContext = makeContext()
        let history = try verificationContext.fetch(FetchDescriptor<StoredMatchRecord>())
        guard let stored = history.first(where: { $0.id == record.id }),
              recordsAreEquivalent(try stored.domainValue(), record) else {
            throw MatchDataPersistenceError.historyRecordReadbackFailed(id: record.id)
        }
        let remainingSessions = try verificationContext.fetch(FetchDescriptor<StoredLiveMatchSession>())
        guard !remainingSessions.contains(where: { $0.sessionID == snapshot.sessionID }) else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(snapshot.sessionID)
        }
    }

    /// One-time, read-only import of the previous C3 JSON primary/backup into the
    /// SwiftData aggregate. Source files are never moved, rewritten, or deleted.
    func importLegacyLiveSessionIfNeeded(from source: LegacyLiveMatchSessionJSONSource) throws {
        let receiptContext = makeContext()
        if try receiptContext.fetch(FetchDescriptor<StoredLiveSessionImportReceipt>())
            .contains(where: { $0.id == Self.legacyLiveSessionReceiptID }) {
            return
        }

        switch source.load() {
        case .none:
            try writeLiveSessionImportReceipt(sessionID: nil, sourceKind: .none)
        case let .primary(snapshot):
            try importLegacySnapshot(snapshot, sourceKind: .primary, requiresReview: false, reason: nil)
        case let .backupAvailable(snapshot, reason):
            try importLegacySnapshot(snapshot, sourceKind: .backup, requiresReview: true, reason: reason)
        case let .unavailable(message):
            throw MatchDataPersistenceError.liveSessionLegacySourceUnavailable(message)
        }
    }

    private func importLegacySnapshot(
        _ snapshot: LiveMatchSessionSnapshot,
        sourceKind: LiveMatchSessionLegacySourceKind,
        requiresReview: Bool,
        reason: String?
    ) throws {
        try snapshot.validate()
        let document = try LiveMatchSessionDocumentCodec.encode(snapshot)
        let context = makeContext()
        do {
            try context.transaction {
                let sessions = try context.fetch(FetchDescriptor<StoredLiveMatchSession>())
                guard sessions.count <= 1 else {
                    throw LiveMatchSessionPersistenceError.invalidPayload("sono presenti più sessioni live")
                }
                if let existing = sessions.first {
                    guard existing.sessionID == snapshot.sessionID else {
                        throw MatchDataPersistenceError.liveSessionConflict(existing.sessionID)
                    }
                    guard existing.currentDocument == document,
                          existing.requiresRecoveryReview == requiresReview else {
                        throw MatchDataPersistenceError.liveSessionImportConflict(snapshot.sessionID)
                    }
                } else {
                    context.insert(
                        StoredLiveMatchSession(
                            snapshot: snapshot,
                            document: document,
                            requiresRecoveryReview: requiresReview,
                            recoveryReviewReason: reason
                        )
                    )
                }
            }
        } catch {
            context.rollback()
            throw error
        }

        let persisted = try loadSnapshot(sessionID: snapshot.sessionID)
        guard try Self.snapshotsAreEquivalent(persisted, snapshot) else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(snapshot.sessionID)
        }
        let persistedRows = try makeContext().fetch(FetchDescriptor<StoredLiveMatchSession>())
        guard persistedRows.count == 1,
              persistedRows[0].requiresRecoveryReview == requiresReview else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(snapshot.sessionID)
        }
        try writeLiveSessionImportReceipt(sessionID: snapshot.sessionID, sourceKind: sourceKind)
    }

    private func writeLiveSessionImportReceipt(sessionID: UUID?, sourceKind: LiveMatchSessionLegacySourceKind) throws {
        let context = makeContext()
        do {
            try context.transaction {
                let receipts = try context.fetch(FetchDescriptor<StoredLiveSessionImportReceipt>())
                if !receipts.contains(where: { $0.id == Self.legacyLiveSessionReceiptID }) {
                    context.insert(StoredLiveSessionImportReceipt(importedSessionID: sessionID, sourceKind: sourceKind))
                }
            }
        } catch {
            context.rollback()
            throw error
        }
        let readback = try makeContext().fetch(FetchDescriptor<StoredLiveSessionImportReceipt>())
        guard readback.contains(where: { $0.id == Self.legacyLiveSessionReceiptID }) else {
            throw MatchDataPersistenceError.liveSessionImportReceiptReadbackFailed
        }
    }

    private func loadSnapshot(sessionID: UUID) throws -> LiveMatchSessionSnapshot {
        let rows = try makeContext().fetch(FetchDescriptor<StoredLiveMatchSession>())
        guard let row = rows.first(where: { $0.sessionID == sessionID }) else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(sessionID)
        }
        let snapshot = try LiveMatchSessionDocumentCodec.decode(row.currentDocument)
        guard snapshot.sessionID == sessionID,
              snapshot.schemaVersion == row.payloadVersion,
              snapshot.status.rawValue == row.statusRawValue else {
            throw MatchDataPersistenceError.liveSessionReadbackFailed(sessionID)
        }
        return snapshot
    }

    private static func validateStatusTransition(from old: LiveMatchSessionStatus, to new: LiveMatchSessionStatus) throws {
        let allowed: Bool
        switch old {
        case .active:
            allowed = new == .active || new == .finalizing
        case .finalizing:
            allowed = new == .finalizing || new == .finalized
        case .finalized:
            allowed = new == .finalized
        }
        guard allowed else {
            throw LiveMatchSessionPersistenceError.invalidStatusTransition(from: old, to: new)
        }
    }

    private static func snapshotsAreEquivalent(
        _ lhs: LiveMatchSessionSnapshot,
        _ rhs: LiveMatchSessionSnapshot
    ) throws -> Bool {
        try LiveMatchSessionDocumentCodec.encode(lhs) == LiveMatchSessionDocumentCodec.encode(rhs)
    }
}
