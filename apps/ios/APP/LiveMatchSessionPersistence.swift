import CryptoKit
import Foundation

#if canImport(Darwin)
import Darwin
#endif

@MainActor
protocol LiveMatchSessionRepository {
    func load() -> LiveMatchSessionLoadResult
    func save(_ snapshot: LiveMatchSessionSnapshot) throws
    func restoreBackup() throws -> LiveMatchSessionSnapshot
    func removeFinalized(sessionID: UUID) throws
}

@MainActor
protocol LiveMatchSessionFileSystem {
    func fileExists(at url: URL) -> Bool
    func readData(at url: URL) throws -> Data
    func writeAtomically(_ data: Data, to url: URL) throws
    func createDirectory(at url: URL) throws
    func removeItem(at url: URL) throws
}

@MainActor
struct FoundationLiveMatchSessionFileSystem: LiveMatchSessionFileSystem {
    func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    func readData(at url: URL) throws -> Data {
        try Data(contentsOf: url)
    }

    func writeAtomically(_ data: Data, to url: URL) throws {
        try createDirectory(at: url.deletingLastPathComponent())
        try data.write(to: url, options: .atomic)
    }

    func createDirectory(at url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func removeItem(at url: URL) throws {
        guard fileExists(at: url) else { return }
        try FileManager.default.removeItem(at: url)
    }
}

enum LiveMatchSessionLoadResult {
    case none
    case primary(LiveMatchSessionSnapshot)
    case backupAvailable(snapshot: LiveMatchSessionSnapshot, reason: String)
    case unavailable(message: String)
}

enum LiveMatchSessionPersistenceError: LocalizedError {
    case unreadableExistingSession(String)
    case anotherSessionExists(UUID)
    case sessionMustBeRecoveredBeforeOverwrite
    case invalidStatusTransition(from: LiveMatchSessionStatus, to: LiveMatchSessionStatus)
    case noUsableBackup
    case validPrimaryCannotBeReplaced
    case sessionNotFinalized(UUID)
    case unsupportedEnvelopeVersion(Int)
    case checksumMismatch
    case invalidPayload(String)
    case finalRecordMissing
    case historyConflict(UUID)

    var errorDescription: String? {
        switch self {
        case let .unreadableExistingSession(reason):
            return "Il salvataggio esistente non è leggibile e non è stato sovrascritto. Dettaglio: \(reason)"
        case let .anotherSessionExists(id):
            return "Esiste già una sessione live non finalizzata (\(id)); non è stata sovrascritta."
        case .sessionMustBeRecoveredBeforeOverwrite:
            return "È disponibile soltanto una copia di recupero. Confermare il ripristino prima di salvare una nuova sessione."
        case let .invalidStatusTransition(from, to):
            return "Transizione di stato della sessione non valida: \(from.rawValue) → \(to.rawValue)."
        case .noUsableBackup:
            return "Non è disponibile una copia di recupero valida. I file esistenti sono stati conservati."
        case .validPrimaryCannotBeReplaced:
            return "Il salvataggio principale è valido e non può essere sostituito con la copia precedente."
        case let .sessionNotFinalized(id):
            return "La sessione \(id) non risulta finalizzata; il salvataggio non è stato rimosso."
        case let .unsupportedEnvelopeVersion(version):
            return "Versione del contenitore della sessione non supportata: \(version)."
        case .checksumMismatch:
            return "Il controllo d'integrità della sessione live non è riuscito."
        case let .invalidPayload(reason):
            return "Il contenuto della sessione live non è valido: \(reason)"
        case .finalRecordMissing:
            return "La sessione non contiene il record necessario alla finalizzazione."
        case let .historyConflict(id):
            return "Esiste già un record storico diverso con l'identificativo della sessione \(id)."
        }
    }
}

private struct LiveMatchSessionEnvelope: Codable {
    static let currentVersion = 1
    let formatVersion: Int
    let payload: Data
    let sha256: String
}

/// A two-generation, single-document store. The active file is replaced atomically;
/// the previous verified generation is retained until the next successful save.
/// Legacy UserDefaults keys and the SwiftData business-data store are not touched here.
@MainActor
final class LiveMatchSessionStore: LiveMatchSessionRepository {
    static let fileName = "live-match-session.json"
    static let backupFileName = "live-match-session.backup.json"

    let directoryURL: URL
    let primaryURL: URL
    let backupURL: URL
    private let fileSystem: any LiveMatchSessionFileSystem

    init(
        directoryURL: URL,
        fileSystem: (any LiveMatchSessionFileSystem)? = nil
    ) {
        self.directoryURL = directoryURL
        self.primaryURL = directoryURL.appendingPathComponent(Self.fileName)
        self.backupURL = directoryURL.appendingPathComponent(Self.backupFileName)
        self.fileSystem = fileSystem ?? FoundationLiveMatchSessionFileSystem()
    }

    static func applicationSupportStore(fileManager: FileManager = .default) throws -> LiveMatchSessionStore {
        let applicationSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = applicationSupport
            .appendingPathComponent("AURINFORMATC", isDirectory: true)
            .appendingPathComponent("LiveMatchSession", isDirectory: true)
        return LiveMatchSessionStore(directoryURL: directory)
    }

    func load() -> LiveMatchSessionLoadResult {
        if fileSystem.fileExists(at: primaryURL) {
            do {
                return .primary(try decode(fileSystem.readData(at: primaryURL)))
            } catch {
                let primaryFailure = error.localizedDescription
                guard fileSystem.fileExists(at: backupURL) else {
                    return .unavailable(message: "Il salvataggio live principale non è leggibile. \(primaryFailure) Il file è stato conservato.")
                }
                do {
                    let backup = try decode(fileSystem.readData(at: backupURL))
                    return .backupAvailable(
                        snapshot: backup,
                        reason: "Il salvataggio principale non è leggibile; è disponibile la generazione precedente. \(primaryFailure)"
                    )
                } catch {
                    return .unavailable(message: "Il salvataggio principale e la copia di recupero non sono leggibili. Nessun file è stato rimosso. Dettaglio: \(error.localizedDescription)")
                }
            }
        }

        guard fileSystem.fileExists(at: backupURL) else { return .none }
        do {
            return .backupAvailable(
                snapshot: try decode(fileSystem.readData(at: backupURL)),
                reason: "Il salvataggio principale non è presente; è disponibile la generazione precedente."
            )
        } catch {
            return .unavailable(message: "La copia di recupero non è leggibile. Il file è stato conservato. Dettaglio: \(error.localizedDescription)")
        }
    }

    func save(_ snapshot: LiveMatchSessionSnapshot) throws {
        try snapshot.validate()
        try fileSystem.createDirectory(at: directoryURL)

        if fileSystem.fileExists(at: primaryURL) {
            let currentData: Data
            let currentSnapshot: LiveMatchSessionSnapshot
            do {
                currentData = try fileSystem.readData(at: primaryURL)
                currentSnapshot = try decode(currentData)
            } catch {
                throw LiveMatchSessionPersistenceError.unreadableExistingSession(error.localizedDescription)
            }
            guard currentSnapshot.sessionID == snapshot.sessionID else {
                throw LiveMatchSessionPersistenceError.anotherSessionExists(currentSnapshot.sessionID)
            }
            try validateStatusTransition(from: currentSnapshot.status, to: snapshot.status)
            try fileSystem.writeAtomically(currentData, to: backupURL)
        } else if fileSystem.fileExists(at: backupURL) {
            throw LiveMatchSessionPersistenceError.sessionMustBeRecoveredBeforeOverwrite
        }

        try fileSystem.writeAtomically(try encode(snapshot), to: primaryURL)
        let written = try decode(fileSystem.readData(at: primaryURL))
        guard written.sessionID == snapshot.sessionID,
              written.status == snapshot.status else {
            throw LiveMatchSessionPersistenceError.invalidPayload("la verifica dopo la scrittura non coincide")
        }
    }

    func restoreBackup() throws -> LiveMatchSessionSnapshot {
        guard fileSystem.fileExists(at: backupURL) else {
            throw LiveMatchSessionPersistenceError.noUsableBackup
        }
        let backupData = try fileSystem.readData(at: backupURL)
        let backupSnapshot: LiveMatchSessionSnapshot
        do {
            backupSnapshot = try decode(backupData)
        } catch {
            throw LiveMatchSessionPersistenceError.noUsableBackup
        }

        if fileSystem.fileExists(at: primaryURL) {
            let primaryData = try fileSystem.readData(at: primaryURL)
            if (try? decode(primaryData)) != nil {
                throw LiveMatchSessionPersistenceError.validPrimaryCannotBeReplaced
            }

            // Any decode/validation failure makes this primary generation unusable,
            // including typed persistence errors such as a checksum mismatch or a
            // future envelope version. Preserve its exact bytes before promotion.
            let quarantine = directoryURL.appendingPathComponent("live-match-session-corrupt-\(UUID().uuidString).json")
            try fileSystem.writeAtomically(primaryData, to: quarantine)
        }

        try fileSystem.writeAtomically(backupData, to: primaryURL)
        let promoted = try decode(fileSystem.readData(at: primaryURL))
        guard promoted.sessionID == backupSnapshot.sessionID else {
            throw LiveMatchSessionPersistenceError.invalidPayload("la copia promossa non coincide")
        }
        return promoted
    }

    func removeFinalized(sessionID: UUID) throws {
        let candidateURL = fileSystem.fileExists(at: primaryURL) ? primaryURL : backupURL
        guard fileSystem.fileExists(at: candidateURL) else {
            throw LiveMatchSessionPersistenceError.sessionNotFinalized(sessionID)
        }
        let snapshot: LiveMatchSessionSnapshot
        do {
            snapshot = try decode(fileSystem.readData(at: candidateURL))
        } catch {
            throw LiveMatchSessionPersistenceError.unreadableExistingSession(error.localizedDescription)
        }
        guard snapshot.sessionID == sessionID, snapshot.status == .finalized else {
            throw LiveMatchSessionPersistenceError.sessionNotFinalized(sessionID)
        }

        // Remove the older copy first. If interrupted, the finalized primary remains
        // sufficient to prove that history was committed before the session is cleaned up.
        try fileSystem.removeItem(at: backupURL)
        try fileSystem.removeItem(at: primaryURL)
    }

    private func validateStatusTransition(from old: LiveMatchSessionStatus, to new: LiveMatchSessionStatus) throws {
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

    private func encode(_ snapshot: LiveMatchSessionSnapshot) throws -> Data {
        let payloadEncoder = JSONEncoder()
        payloadEncoder.dateEncodingStrategy = .millisecondsSince1970
        payloadEncoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let payload = try payloadEncoder.encode(snapshot)
        let checksum = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        let envelope = LiveMatchSessionEnvelope(
            formatVersion: LiveMatchSessionEnvelope.currentVersion,
            payload: payload,
            sha256: checksum
        )
        let envelopeEncoder = JSONEncoder()
        envelopeEncoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try envelopeEncoder.encode(envelope)
    }

    private func decode(_ data: Data) throws -> LiveMatchSessionSnapshot {
        let envelope = try JSONDecoder().decode(LiveMatchSessionEnvelope.self, from: data)
        guard envelope.formatVersion == LiveMatchSessionEnvelope.currentVersion else {
            throw LiveMatchSessionPersistenceError.unsupportedEnvelopeVersion(envelope.formatVersion)
        }
        let checksum = SHA256.hash(data: envelope.payload).map { String(format: "%02x", $0) }.joined()
        guard checksum == envelope.sha256 else {
            throw LiveMatchSessionPersistenceError.checksumMismatch
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        let snapshot = try decoder.decode(LiveMatchSessionSnapshot.self, from: envelope.payload)
        try snapshot.validate()
        return snapshot
    }
}

enum LiveMatchSessionStartup {
    case none
    case resume(snapshot: LiveMatchSessionSnapshot, elapsedNanoseconds: Int64, clockAdjustmentDetected: Bool)
    case review(snapshot: LiveMatchSessionSnapshot, suggestedElapsedNanoseconds: Int64, maximumElapsedNanoseconds: Int64, reason: String, restoreBackupFirst: Bool)
    case finalizationPending(snapshot: LiveMatchSessionSnapshot, restoreBackupFirst: Bool, reason: String?)
    case unavailable(message: String)
}

enum LiveMatchSessionStartupFactory {
    static func make(
        from loadResult: LiveMatchSessionLoadResult,
        now: LiveMatchRecoveryReading
    ) -> LiveMatchSessionStartup {
        switch loadResult {
        case .none:
            return .none
        case let .primary(snapshot):
            if snapshot.status == .finalizing || snapshot.status == .finalized {
                return .finalizationPending(snapshot: snapshot, restoreBackupFirst: false, reason: nil)
            }
            do {
                let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: now)
                switch decision.kind {
                case .automatic:
                    return .resume(
                        snapshot: snapshot,
                        elapsedNanoseconds: decision.elapsedNanoseconds,
                        clockAdjustmentDetected: decision.clockAdjustmentDetected
                    )
                case let .reviewRequired(reason):
                    return .review(
                        snapshot: snapshot,
                        suggestedElapsedNanoseconds: decision.elapsedNanoseconds,
                        maximumElapsedNanoseconds: MatchTiming.maximumRecoverableElapsedNanoseconds(for: snapshot.timing),
                        reason: reason,
                        restoreBackupFirst: false
                    )
                }
            } catch {
                return .unavailable(message: error.localizedDescription)
            }
        case let .backupAvailable(snapshot, reason):
            if snapshot.status == .finalizing || snapshot.status == .finalized {
                return .finalizationPending(snapshot: snapshot, restoreBackupFirst: true, reason: reason)
            }
            do {
                let decision = try LiveMatchRecoveryPolicy.decide(snapshot: snapshot, now: now)
                let suggested: Int64
                if case .automatic = decision.kind {
                    suggested = decision.elapsedNanoseconds
                } else {
                    suggested = decision.elapsedNanoseconds
                }
                return .review(
                    snapshot: snapshot,
                    suggestedElapsedNanoseconds: suggested,
                    maximumElapsedNanoseconds: MatchTiming.maximumRecoverableElapsedNanoseconds(for: snapshot.timing),
                    reason: reason,
                    restoreBackupFirst: true
                )
            } catch {
                return .unavailable(message: "La copia di recupero non ha superato la validazione. \(error.localizedDescription)")
            }
        case let .unavailable(message):
            return .unavailable(message: message)
        }
    }
}

@MainActor
final class LiveMatchFinalizationCoordinator {
    private let sessionRepository: any LiveMatchSessionRepository
    private let dataStore: MatchDataStore

    init(sessionRepository: any LiveMatchSessionRepository, dataStore: MatchDataStore) {
        self.sessionRepository = sessionRepository
        self.dataStore = dataStore
    }

    /// The live snapshot is made durable before history is inserted. History is keyed by
    /// the stable session UUID; retries compare the existing record and never duplicate it.
    /// The session is marked finalized and removed only after the history write/readback succeeds.
    func finalize(_ input: LiveMatchSessionSnapshot) throws {
        var snapshot = input
        guard let record = snapshot.finalRecord else {
            throw LiveMatchSessionPersistenceError.finalRecordMissing
        }
        if snapshot.status == .active {
            snapshot.status = .finalizing
        }
        try snapshot.validate()
        try sessionRepository.save(snapshot)
        // Before the history side effect, ensure both retained generations carry the
        // stable final record. If the newest file is later corrupted after history
        // commits, the previous generation can still resume finalization idempotently.
        try sessionRepository.save(snapshot)
        try dataStore.insertHistoryRecordIfAbsent(record)

        if snapshot.status != .finalized {
            snapshot.status = .finalized
            try sessionRepository.save(snapshot)
        }
        try sessionRepository.removeFinalized(sessionID: snapshot.sessionID)
    }
}
