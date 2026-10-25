import CryptoKit
import Foundation

@MainActor
protocol LiveMatchSessionRepository {
    func load() -> LiveMatchSessionLoadResult
    func save(_ snapshot: LiveMatchSessionSnapshot) throws
    func restoreBackup() throws -> LiveMatchSessionSnapshot
    /// Commits history and removes the live aggregate in one SwiftData context transaction.
    func finalize(_ snapshot: LiveMatchSessionSnapshot) throws
}

@MainActor
protocol LegacyLiveMatchSessionFileAccess {
    func fileExists(at url: URL) -> Bool
    func readData(at url: URL) throws -> Data
}

@MainActor
struct FoundationLegacyLiveMatchSessionFileAccess: LegacyLiveMatchSessionFileAccess {
    func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    func readData(at url: URL) throws -> Data {
        try Data(contentsOf: url)
    }
}

enum LiveMatchSessionLoadResult {
    case none
    case primary(LiveMatchSessionSnapshot)
    case backupAvailable(snapshot: LiveMatchSessionSnapshot, reason: String)
    case unavailable(message: String)
}

enum LiveMatchSessionLegacySourceKind: String {
    case none
    case primary
    case backup
}

enum LiveMatchSessionPersistenceError: LocalizedError {
    case anotherSessionExists(UUID)
    case sessionMustBeRecoveredBeforeOverwrite
    case invalidStatusTransition(from: LiveMatchSessionStatus, to: LiveMatchSessionStatus)
    case noUsableBackup
    case validPrimaryCannotBeReplaced
    case unsupportedEnvelopeVersion(Int)
    case checksumMismatch
    case invalidPayload(String)
    case finalRecordMissing
    case sessionNotFound(UUID)
    case historyConflict(UUID)

    var errorDescription: String? {
        switch self {
        case let .anotherSessionExists(id):
            return "Esiste già una sessione live non finalizzata (\(id)); non è stata sovrascritta."
        case .sessionMustBeRecoveredBeforeOverwrite:
            return "È disponibile soltanto una copia di recupero. Confermare il ripristino prima di salvare una nuova sessione."
        case let .invalidStatusTransition(from, to):
            return "Transizione di stato della sessione non valida: \(from.rawValue) → \(to.rawValue)."
        case .noUsableBackup:
            return "Non è disponibile una copia di recupero valida. I dati esistenti sono stati conservati."
        case .validPrimaryCannotBeReplaced:
            return "La sessione principale è valida e non può essere sostituita con una copia precedente."
        case let .unsupportedEnvelopeVersion(version):
            return "Versione del contenitore della sessione non supportata: \(version)."
        case .checksumMismatch:
            return "Il controllo d'integrità della sessione live non è riuscito."
        case let .invalidPayload(reason):
            return "Il contenuto della sessione live non è valido: \(reason)"
        case .finalRecordMissing:
            return "La sessione non contiene il record necessario alla finalizzazione."
        case let .sessionNotFound(id):
            return "La sessione live \(id) non è presente nello store."
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

enum LiveMatchSessionDocumentCodec {
    static func encode(_ snapshot: LiveMatchSessionSnapshot) throws -> Data {
        try snapshot.validate()
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

    static func decode(_ document: Data) throws -> LiveMatchSessionSnapshot {
        let envelope = try JSONDecoder().decode(LiveMatchSessionEnvelope.self, from: document)
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

/// Read-only compatibility source for the JSON files written by the previous
/// C3 build. It is used only by the one-time importer; live writes go to SwiftData.
@MainActor
struct LegacyLiveMatchSessionJSONSource {
    static let directoryName = "LiveMatchSession"
    static let fileName = "live-match-session.json"
    static let backupFileName = "live-match-session.backup.json"

    let directoryURL: URL
    private let fileAccess: any LegacyLiveMatchSessionFileAccess

    var primaryURL: URL { directoryURL.appendingPathComponent(Self.fileName) }
    var backupURL: URL { directoryURL.appendingPathComponent(Self.backupFileName) }

    init(directoryURL: URL, fileAccess: (any LegacyLiveMatchSessionFileAccess)? = nil) {
        self.directoryURL = directoryURL
        self.fileAccess = fileAccess ?? FoundationLegacyLiveMatchSessionFileAccess()
    }

    static func applicationSupportSource(fileManager: FileManager = .default) throws -> LegacyLiveMatchSessionJSONSource {
        guard let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw CocoaError(.fileNoSuchFile)
        }
        let directory = applicationSupport
            .appendingPathComponent("AURINFORMATC", isDirectory: true)
            .appendingPathComponent(directoryName, isDirectory: true)
        return LegacyLiveMatchSessionJSONSource(directoryURL: directory)
    }

    func load() -> LiveMatchSessionLoadResult {
        if fileAccess.fileExists(at: primaryURL) {
            do {
                return .primary(try LiveMatchSessionDocumentCodec.decode(fileAccess.readData(at: primaryURL)))
            } catch {
                let primaryFailure = error.localizedDescription
                guard fileAccess.fileExists(at: backupURL) else {
                    return .unavailable(message: "Il salvataggio live legacy non è leggibile. \(primaryFailure) Il file originale è stato conservato.")
                }
                do {
                    return .backupAvailable(
                        snapshot: try LiveMatchSessionDocumentCodec.decode(fileAccess.readData(at: backupURL)),
                        reason: "Il salvataggio principale legacy non è leggibile; è disponibile la generazione precedente. \(primaryFailure)"
                    )
                } catch {
                    return .unavailable(message: "I salvataggi live legacy principale e di recupero non sono leggibili. Nessun file è stato rimosso. Dettaglio: \(error.localizedDescription)")
                }
            }
        }

        guard fileAccess.fileExists(at: backupURL) else { return .none }
        do {
            return .backupAvailable(
                snapshot: try LiveMatchSessionDocumentCodec.decode(fileAccess.readData(at: backupURL)),
                reason: "Il salvataggio principale legacy non è presente; è disponibile la generazione precedente."
            )
        } catch {
            return .unavailable(message: "La copia legacy di recupero non è leggibile. Il file originale è stato conservato. Dettaglio: \(error.localizedDescription)")
        }
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
                    return .resume(snapshot: snapshot, elapsedNanoseconds: decision.elapsedNanoseconds, clockAdjustmentDetected: decision.clockAdjustmentDetected)
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
                return .review(
                    snapshot: snapshot,
                    suggestedElapsedNanoseconds: decision.elapsedNanoseconds,
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

    init(sessionRepository: any LiveMatchSessionRepository) {
        self.sessionRepository = sessionRepository
    }

    /// The repository commits the history record and session removal atomically.
    /// A failed transaction leaves the saved session available for an explicit retry.
    func finalize(_ input: LiveMatchSessionSnapshot) throws {
        var snapshot = input
        guard snapshot.finalRecord != nil else {
            throw LiveMatchSessionPersistenceError.finalRecordMissing
        }
        if snapshot.status == .active {
            snapshot.status = .finalizing
        }
        try snapshot.validate()

        // Persist the finalization intent before the terminal transaction. This
        // keeps the exact finished snapshot available for retry after a failure;
        // history insertion and session removal still happen atomically below.
        switch sessionRepository.load() {
        case .none:
            // A completed retry may already have removed the session. The store
            // will accept it only when the matching history record is present.
            break
        case let .primary(current):
            guard current.sessionID == snapshot.sessionID else {
                throw LiveMatchSessionPersistenceError.anotherSessionExists(current.sessionID)
            }
            if current.status == .active {
                try sessionRepository.save(snapshot)
            }
        case .backupAvailable:
            throw LiveMatchSessionPersistenceError.sessionMustBeRecoveredBeforeOverwrite
        case let .unavailable(message):
            throw LiveMatchSessionPersistenceError.invalidPayload(message)
        }

        try sessionRepository.finalize(snapshot)
    }
}
