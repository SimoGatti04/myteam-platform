import Foundation
import SwiftData

// MARK: - Versioned local persistence schema

/// Schema V1 is the first SwiftData representation of the three legacy V1
/// collections. Add a new VersionedSchema and an explicit migration stage for
/// future incompatible changes; never edit a released schema in place.
enum MatchManagerSchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)

    static var models: [any PersistentModel.Type] {
        [
            StoredRosterPlayer.self,
            StoredScheduledMatch.self,
            StoredMatchRecord.self,
            StoredMatchParticipant.self,
            StoredGoalEvent.self,
            StoredLegacyImportReceipt.self
        ]
    }
}

/// Schema V2 adds the single live-session aggregate and its one-time legacy
/// import receipt. V1 remains unchanged so existing C3.1 stores migrate safely.
enum MatchManagerSchemaV2: VersionedSchema {
    static let versionIdentifier = Schema.Version(2, 0, 0)

    static var models: [any PersistentModel.Type] {
        MatchManagerSchemaV1.models + [
            StoredLiveMatchSession.self,
            StoredLiveSessionImportReceipt.self
        ]
    }
}

/// Schema V3 adds correction provenance for historical matches without altering
/// the released V1/V2 entities or the Codable live-session aggregate.
enum MatchManagerSchemaV3: VersionedSchema {
    static let versionIdentifier = Schema.Version(3, 0, 0)

    static var models: [any PersistentModel.Type] {
        MatchManagerSchemaV2.models + [StoredMatchCorrectionMetadata.self]
    }
}

enum MatchManagerMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [MatchManagerSchemaV1.self, MatchManagerSchemaV2.self, MatchManagerSchemaV3.self]
    }

    static var stages: [MigrationStage] {
        [
            .lightweight(fromVersion: MatchManagerSchemaV1.self, toVersion: MatchManagerSchemaV2.self),
            .lightweight(fromVersion: MatchManagerSchemaV2.self, toVersion: MatchManagerSchemaV3.self)
        ]
    }
}

@Model
final class StoredRosterPlayer {
    @Attribute(.unique) var id: UUID
    var name: String
    var active: Bool
    var isGoalkeeper: Bool
    var position: Int

    init(_ player: RosterPlayer, position: Int) {
        id = player.id
        name = player.name
        active = player.active
        isGoalkeeper = player.isGoalkeeper
        self.position = position
    }

    func update(from player: RosterPlayer, position: Int) {
        name = player.name
        active = player.active
        isGoalkeeper = player.isGoalkeeper
        self.position = position
    }

    var domainValue: RosterPlayer {
        RosterPlayer(id: id, name: name, active: active, isGoalkeeper: isGoalkeeper)
    }
}

@Model
final class StoredScheduledMatch {
    @Attribute(.unique) var id: UUID
    var round: String?
    var opponentName: String
    var date: Date
    var isHome: Bool
    var location: String?
    var notes: String?
    var position: Int

    init(_ match: ScheduledMatch, position: Int) {
        id = match.id
        round = match.round
        opponentName = match.opponentName
        date = match.date
        isHome = match.isHome
        location = match.location
        notes = match.notes
        self.position = position
    }

    func update(from match: ScheduledMatch, position: Int) {
        round = match.round
        opponentName = match.opponentName
        date = match.date
        isHome = match.isHome
        location = match.location
        notes = match.notes
        self.position = position
    }

    var domainValue: ScheduledMatch {
        ScheduledMatch(
            id: id,
            round: round,
            opponentName: opponentName,
            date: date,
            isHome: isHome,
            location: location,
            notes: notes
        )
    }
}

@Model
final class StoredMatchRecord {
    @Attribute(.unique) var id: UUID
    var date: Date
    var duration: Int
    var ourScore: Int?
    var opponentScore: Int?
    var eventsWereAbsent: Bool
    /// Logical reference only: deleting a calendar entry must not erase a
    /// historical association or the historical match itself.
    var scheduledMatchID: UUID?
    var opponentName: String?
    var isHome: Bool?
    var position: Int

    @Relationship(deleteRule: .cascade, inverse: \StoredMatchParticipant.match)
    var participants: [StoredMatchParticipant] = []

    @Relationship(deleteRule: .cascade, inverse: \StoredGoalEvent.match)
    var goalEvents: [StoredGoalEvent] = []

    init(_ record: MatchRecord, position: Int) {
        id = record.id
        date = record.date
        duration = record.duration
        ourScore = record.ourScore
        opponentScore = record.opponentScore
        eventsWereAbsent = record.events == nil
        scheduledMatchID = record.scheduledMatchID
        opponentName = record.opponentName
        isHome = record.isHome
        self.position = position

        participants = record.players.enumerated().map { index, player in
            StoredMatchParticipant(player, position: index)
        }
        goalEvents = (record.events ?? []).enumerated().map { index, event in
            StoredGoalEvent(event, position: index)
        }
        participants.forEach { $0.match = self }
        goalEvents.forEach { $0.match = self }
    }

    func update(from record: MatchRecord, position: Int, context: ModelContext) {
        date = record.date
        duration = record.duration
        ourScore = record.ourScore
        opponentScore = record.opponentScore
        eventsWereAbsent = record.events == nil
        scheduledMatchID = record.scheduledMatchID
        opponentName = record.opponentName
        isHome = record.isHome
        self.position = position

        let incomingPlayers = record.players
        let playerIDs = Set(incomingPlayers.map(\.id))
        for existing in participants where !playerIDs.contains(existing.id) {
            context.delete(existing)
        }
        var currentPlayers = Dictionary(participants.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        participants = incomingPlayers.enumerated().map { index, player in
            let stored = currentPlayers.removeValue(forKey: player.id) ?? StoredMatchParticipant(player, position: index)
            stored.update(from: player, position: index)
            stored.match = self
            return stored
        }

        let incomingEvents = record.events ?? []
        let eventIDs = Set(incomingEvents.map(\.id))
        for existing in goalEvents where !eventIDs.contains(existing.id) {
            context.delete(existing)
        }
        var currentEvents = Dictionary(goalEvents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        goalEvents = incomingEvents.enumerated().map { index, event in
            let stored = currentEvents.removeValue(forKey: event.id) ?? StoredGoalEvent(event, position: index)
            stored.update(from: event, position: index)
            stored.match = self
            return stored
        }
    }

    func domainValue() throws -> MatchRecord {
        let orderedParticipants = participants.sorted { $0.position < $1.position }
        let orderedEvents = try goalEvents.sorted { $0.position < $1.position }.map { try $0.domainValue() }
        var record = MatchRecord(
            id: id,
            date: date,
            duration: duration,
            players: orderedParticipants.map(\.domainValue),
            ourScore: ourScore ?? 0,
            opponentScore: opponentScore ?? 0,
            events: orderedEvents,
            scheduledMatchID: scheduledMatchID,
            opponentName: opponentName,
            isHome: isHome
        )
        record.ourScore = ourScore
        record.opponentScore = opponentScore
        record.events = eventsWereAbsent ? nil : orderedEvents
        return record
    }
}

@Model
final class StoredMatchParticipant {
    var id: UUID
    var rosterPlayerID: UUID?
    var playerName: String
    var secondsPlayed: Int
    var goals: Int
    var assists: Int
    var position: Int
    var match: StoredMatchRecord?

    init(_ player: PlayerMatchSummary, position: Int) {
        id = player.id
        rosterPlayerID = player.rosterPlayerID
        playerName = player.playerName
        secondsPlayed = player.secondsPlayed
        goals = player.goals
        assists = player.assists
        self.position = position
    }

    func update(from player: PlayerMatchSummary, position: Int) {
        rosterPlayerID = player.rosterPlayerID
        playerName = player.playerName
        secondsPlayed = player.secondsPlayed
        goals = player.goals
        assists = player.assists
        self.position = position
    }

    var domainValue: PlayerMatchSummary {
        PlayerMatchSummary(
            id: id,
            rosterPlayerID: rosterPlayerID,
            playerName: playerName,
            secondsPlayed: secondsPlayed,
            goals: goals,
            assists: assists
        )
    }
}

@Model
final class StoredGoalEvent {
    var id: UUID
    var teamRawValue: String
    var matchSecond: Int
    var scorerID: UUID?
    var scorerName: String?
    var assistID: UUID?
    var assistName: String?
    var position: Int
    var match: StoredMatchRecord?

    init(_ event: GoalEvent, position: Int) {
        id = event.id
        teamRawValue = event.team.rawValue
        matchSecond = event.matchSecond
        scorerID = event.scorerID
        scorerName = event.scorerName
        assistID = event.assistID
        assistName = event.assistName
        self.position = position
    }

    func update(from event: GoalEvent, position: Int) {
        teamRawValue = event.team.rawValue
        matchSecond = event.matchSecond
        scorerID = event.scorerID
        scorerName = event.scorerName
        assistID = event.assistID
        assistName = event.assistName
        self.position = position
    }

    func domainValue() throws -> GoalEvent {
        guard let team = GoalTeam(rawValue: teamRawValue) else {
            throw MatchDataPersistenceError.invalidStoredGoalTeam(id: id, value: teamRawValue)
        }
        return GoalEvent(
            id: id,
            team: team,
            matchSecond: matchSecond,
            scorerID: scorerID,
            scorerName: scorerName,
            assistID: assistID,
            assistName: assistName
        )
    }
}

@Model
final class StoredLegacyImportReceipt {
    @Attribute(.unique) var id: String
    var completedAt: Date

    init(id: String, completedAt: Date = .now) {
        self.id = id
        self.completedAt = completedAt
    }
}

/// The operational session is one versioned Codable snapshot stored as a row in
/// the same SwiftData store as history. The previous document is a bounded
/// recovery generation; a rejected/corrupt current document can be retained in
/// quarantine before an explicit recovery promotes the previous generation.
@Model
final class StoredLiveMatchSession {
    @Attribute(.unique) var sessionID: UUID
    var payloadVersion: Int
    var statusRawValue: String
    var currentDocument: Data
    var currentGeneration: Int64
    var previousDocument: Data?
    var previousGeneration: Int64?
    var quarantinedDocument: Data?
    var quarantineReason: String?
    var quarantinedAt: Date?
    var requiresRecoveryReview: Bool
    var recoveryReviewReason: String?
    var updatedAt: Date

    init(
        snapshot: LiveMatchSessionSnapshot,
        document: Data,
        requiresRecoveryReview: Bool = false,
        recoveryReviewReason: String? = nil
    ) {
        sessionID = snapshot.sessionID
        payloadVersion = snapshot.schemaVersion
        statusRawValue = snapshot.status.rawValue
        currentDocument = document
        currentGeneration = 1
        previousDocument = nil
        previousGeneration = nil
        quarantinedDocument = nil
        quarantineReason = nil
        quarantinedAt = nil
        self.requiresRecoveryReview = requiresRecoveryReview
        self.recoveryReviewReason = recoveryReviewReason
        updatedAt = .now
    }
}

@Model
final class StoredLiveSessionImportReceipt {
    @Attribute(.unique) var id: String
    var importedSessionID: UUID?
    var sourceKindRawValue: String
    var completedAt: Date

    init(importedSessionID: UUID?, sourceKind: LiveMatchSessionLegacySourceKind) {
        id = MatchDataStore.legacyLiveSessionReceiptID
        self.importedSessionID = importedSessionID
        sourceKindRawValue = sourceKind.rawValue
        completedAt = .now
    }
}

@Model
final class StoredMatchCorrectionMetadata {
    @Attribute(.unique) var recordID: UUID
    var payload: Data

    init(recordID: UUID, payload: Data) {
        self.recordID = recordID
        self.payload = payload
    }
}

// MARK: - Data boundary

struct MatchDataSnapshot {
    let roster: [RosterPlayer]
    let schedule: [ScheduledMatch]
    let history: [MatchRecord]
}

enum LegacyMatchDataKeys {
    static let roster = "FutsalRosterV1"
    static let schedule = "FutsalScheduleV1"
    static let history = "FutsalMatchHistoryV1"
}

enum MatchDataPersistenceError: LocalizedError {
    case legacyValueIsNotData(key: String)
    case legacyDecodeFailed(key: String, reason: String)
    case duplicateIdentifier(collection: String, id: UUID)
    case migrationConflict(collection: String, id: UUID)
    case migrationReadbackFailed(collection: String, id: UUID)
    case historyRecordConflict(id: UUID)
    case historyRecordMissing(id: UUID)
    case historyRecordReadbackFailed(id: UUID)
    case historyCorrectionMetadataInvalid(id: UUID, reason: String)
    case invalidStoredGoalTeam(id: UUID, value: String)
    case liveSessionConflict(UUID)
    case liveSessionImportConflict(UUID)
    case liveSessionReadbackFailed(UUID)
    case liveSessionQuarantineOccupied(UUID)
    case liveSessionMissing(UUID)
    case liveSessionLegacySourceUnavailable(String)
    case liveSessionHistoryConflict(UUID)
    case liveSessionImportReceiptReadbackFailed

    var errorDescription: String? {
        switch self {
        case let .legacyValueIsNotData(key):
            return "Il dato legacy per '\(key)' non è nel formato atteso. L'originale è stato conservato."
        case let .legacyDecodeFailed(key, reason):
            return "Il dato legacy per '\(key)' non è decodificabile. L'originale è stato conservato. Dettaglio: \(reason)"
        case let .duplicateIdentifier(collection, id):
            return "La raccolta '\(collection)' contiene l'identificativo duplicato \(id). La migrazione è stata interrotta senza cancellare i dati originali."
        case let .migrationConflict(collection, id):
            return "È già presente nello store un elemento '\(collection)' con identificativo \(id) ma contenuto diverso. La migrazione non ha sovrascritto i dati."
        case let .migrationReadbackFailed(collection, id):
            return "La verifica di rilettura non ha trovato un elemento '\(collection)' atteso (\(id)). La migrazione non è stata marcata come completata."
        case let .historyRecordConflict(id):
            return "Esiste già un record storico diverso con l'identificativo di finalizzazione \(id). Il record esistente non è stato modificato."
        case let .historyRecordMissing(id):
            return "Il record storico \(id) non esiste e non può essere corretto."
        case let .historyRecordReadbackFailed(id):
            return "Il record storico \(id) non è stato confermato dopo la scrittura. La sessione live è stata conservata per un nuovo tentativo."
        case let .historyCorrectionMetadataInvalid(id, reason):
            return "I metadati di correzione del record storico \(id) non sono validi: \(reason). Il record non è stato confermato come aggiornato."
        case let .invalidStoredGoalTeam(id, value):
            return "L'evento \(id) contiene un tipo squadra non riconosciuto ('\(value)')."
        case let .liveSessionConflict(id):
            return "Esiste già una sessione live diversa (\(id)); non è stata sovrascritta."
        case let .liveSessionImportConflict(id):
            return "La sessione JSON con identificativo \(id) è diversa dalla sessione già presente in SwiftData; l'importazione è stata interrotta."
        case let .liveSessionReadbackFailed(id):
            return "La sessione live \(id) non è stata confermata dopo il salvataggio. Il dato precedente è stato conservato."
        case let .liveSessionQuarantineOccupied(id):
            return "La sessione \(id) contiene già un documento in quarantena; non verrà sostituito automaticamente."
        case let .liveSessionMissing(id):
            return "La sessione live \(id) non è presente nello store e non può essere finalizzata in sicurezza."
        case let .liveSessionLegacySourceUnavailable(reason):
            return "Il salvataggio live legacy esiste ma non è recuperabile. Nessuna sessione vuota è stata avviata. Dettaglio: \(reason)"
        case let .liveSessionHistoryConflict(id):
            return "Esiste già un record storico diverso con l'identificativo della sessione \(id)."
        case .liveSessionImportReceiptReadbackFailed:
            return "La ricevuta di importazione della sessione live non è stata confermata; l'operazione può essere ripetuta in sicurezza."
        }
    }
}

/// The single local owner for roster, schedule and completed history.
/// Domain values stay Codable and independent from SwiftData; the SwiftData
/// entities are the local storage adapter. Legacy defaults are read only by
/// the one-time importer and are never used as a second operational store.
@MainActor
final class MatchDataStore {
    static let legacyReceiptID = "user-defaults-v1-import-complete"
    nonisolated static let legacyLiveSessionReceiptID = "application-support-live-session-json-v1-import-complete"

    let container: ModelContainer
    private let userDefaults: UserDefaults

    init(container: ModelContainer, userDefaults: UserDefaults = .standard) {
        self.container = container
        self.userDefaults = userDefaults
    }

    static func makePersistentContainer() throws -> ModelContainer {
        let schema = Schema(versionedSchema: MatchManagerSchemaV3.self)
        let configuration = ModelConfiguration(
            "AURINFORMATC",
            schema: schema,
            cloudKitDatabase: .none
        )
        return try ModelContainer(
            for: schema,
            migrationPlan: MatchManagerMigrationPlan.self,
            configurations: [configuration]
        )
    }

    /// Creates a persistent store at an explicit URL. This is used by the
    /// debug-only UI-test harness so process-relaunch tests never touch the
    /// user's normal SwiftData store.
    static func makePersistentContainer(storeURL: URL) throws -> ModelContainer {
        try FileManager.default.createDirectory(
            at: storeURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let schema = Schema(versionedSchema: MatchManagerSchemaV3.self)
        let configuration = ModelConfiguration(
            "AURINFORMATC-UI-Test",
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .none
        )
        return try ModelContainer(
            for: schema,
            migrationPlan: MatchManagerMigrationPlan.self,
            configurations: [configuration]
        )
    }

    static func makeInMemoryContainer() throws -> ModelContainer {
        let schema = Schema(versionedSchema: MatchManagerSchemaV3.self)
        let configuration = ModelConfiguration(
            "AURINFORMATC-InMemory",
            schema: schema,
            isStoredInMemoryOnly: true,
            cloudKitDatabase: .none
        )
        return try ModelContainer(
            for: schema,
            migrationPlan: MatchManagerMigrationPlan.self,
            configurations: [configuration]
        )
    }

    static func makeContainer(at url: URL, allowsSave: Bool = true) throws -> ModelContainer {
        let schema = Schema(versionedSchema: MatchManagerSchemaV3.self)
        let configuration = ModelConfiguration(
            "AURINFORMATC-Test",
            schema: schema,
            url: url,
            allowsSave: allowsSave,
            cloudKitDatabase: .none
        )
        return try ModelContainer(
            for: schema,
            migrationPlan: MatchManagerMigrationPlan.self,
            configurations: [configuration]
        )
    }

    func bootstrap() throws -> MatchDataSnapshot {
        try migrateLegacyDataIfNeeded()
        return try loadSnapshot()
    }

    func loadSnapshot() throws -> MatchDataSnapshot {
        try readSnapshot(using: makeContext())
    }

    func replaceRoster(_ roster: [RosterPlayer]) throws {
        try ensureUnique(roster.map(\.id), collection: "roster")
        let context = makeContext()
        do {
            let current = try context.fetch(FetchDescriptor<StoredRosterPlayer>())
            let incomingIDs = Set(roster.map(\.id))
            for item in current where !incomingIDs.contains(item.id) { context.delete(item) }
            let existing = Dictionary(current.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            for (position, player) in roster.enumerated() {
                if let stored = existing[player.id] {
                    stored.update(from: player, position: position)
                } else {
                    context.insert(StoredRosterPlayer(player, position: position))
                }
            }
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }

    func replaceSchedule(_ schedule: [ScheduledMatch]) throws {
        try ensureUnique(schedule.map(\.id), collection: "schedule")
        let context = makeContext()
        do {
            let current = try context.fetch(FetchDescriptor<StoredScheduledMatch>())
            let incomingIDs = Set(schedule.map(\.id))
            for item in current where !incomingIDs.contains(item.id) { context.delete(item) }
            let existing = Dictionary(current.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            for (position, match) in schedule.enumerated() {
                if let stored = existing[match.id] {
                    stored.update(from: match, position: position)
                } else {
                    context.insert(StoredScheduledMatch(match, position: position))
                }
            }
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }

    func replaceHistory(_ history: [MatchRecord]) throws {
        try validateHistoryIdentifiers(history)
        let context = makeContext()
        do {
            let current = try context.fetch(FetchDescriptor<StoredMatchRecord>())
            let storedMetadata = try context.fetch(FetchDescriptor<StoredMatchCorrectionMetadata>())
            let metadataByRecordID = Dictionary(storedMetadata.map { ($0.recordID, $0) }, uniquingKeysWith: { first, _ in first })
            let incomingIDs = Set(history.map(\.id))
            for record in current where !incomingIDs.contains(record.id) { context.delete(record) }
            for metadata in storedMetadata where !incomingIDs.contains(metadata.recordID) { context.delete(metadata) }
            let existing = Dictionary(current.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            for (position, record) in history.enumerated() {
                if let stored = existing[record.id] {
                    stored.update(from: record, position: position, context: context)
                } else {
                    context.insert(StoredMatchRecord(record, position: position))
                }
                try synchronizeCorrectionMetadata(for: record, existing: metadataByRecordID[record.id], context: context)
            }
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }

    /// Idempotent insert used by live-session finalization. A stable session UUID is
    /// also the history record UUID; retries accept only byte-for-byte equivalent domain
    /// content and never overwrite a different historical record.
    @discardableResult
    func insertHistoryRecordIfAbsent(_ record: MatchRecord) throws -> Bool {
        try validateHistoryIdentifiers([record])
        let context = makeContext()
        do {
            let current = try context.fetch(FetchDescriptor<StoredMatchRecord>())
            let storedMetadata = try context.fetch(FetchDescriptor<StoredMatchCorrectionMetadata>())
            let metadata = storedMetadata.first(where: { $0.recordID == record.id })
            if let existing = current.first(where: { $0.id == record.id }) {
                let existingDomain = try domainValue(existing, correctionMetadata: metadata)
                guard recordsAreEquivalent(existingDomain, record) else {
                    throw MatchDataPersistenceError.historyRecordConflict(id: record.id)
                }
                return false
            }

            for existing in current {
                existing.position += 1
            }
            context.insert(StoredMatchRecord(record, position: 0))
            try synchronizeCorrectionMetadata(for: record, existing: metadata, context: context)
            try context.save()
        } catch {
            context.rollback()
            throw error
        }

        let readback = try readSnapshot(using: makeContext()).history.first { $0.id == record.id }
        guard let readback, recordsAreEquivalent(readback, record) else {
            throw MatchDataPersistenceError.historyRecordReadbackFailed(id: record.id)
        }
        return true
    }

    /// Updates one history aggregate and its correction metadata in the same
    /// ModelContext save, then verifies the saved record through a fresh context.
    func updateHistoryRecord(_ record: MatchRecord) throws {
        try validateHistoryIdentifiers([record])
        let context = makeContext()
        do {
            guard let stored = try context.fetch(FetchDescriptor<StoredMatchRecord>())
                .first(where: { $0.id == record.id }) else {
                throw MatchDataPersistenceError.historyRecordMissing(id: record.id)
            }
            let metadata = try context.fetch(FetchDescriptor<StoredMatchCorrectionMetadata>())
                .first(where: { $0.recordID == record.id })
            stored.update(from: record, position: stored.position, context: context)
            try synchronizeCorrectionMetadata(for: record, existing: metadata, context: context)
            try context.save()
        } catch {
            context.rollback()
            throw error
        }

        let verificationContext = makeContext()
        guard let stored = try verificationContext.fetch(FetchDescriptor<StoredMatchRecord>())
            .first(where: { $0.id == record.id }) else {
            throw MatchDataPersistenceError.historyRecordReadbackFailed(id: record.id)
        }
        let metadata = try verificationContext.fetch(FetchDescriptor<StoredMatchCorrectionMetadata>())
            .first(where: { $0.recordID == record.id })
        let readback = try domainValue(stored, correctionMetadata: metadata)
        guard recordsAreEquivalent(readback, record) else {
            throw MatchDataPersistenceError.historyRecordReadbackFailed(id: record.id)
        }
    }

    private func migrateLegacyDataIfNeeded() throws {
        let markerContext = makeContext()
        if try hasCompletedLegacyImport(in: markerContext) { return }

        // Decode and validate all three sources before making any write. An
        // absent key is an empty collection; a present malformed key is fatal.
        let roster: [RosterPlayer] = try decodeLegacy(LegacyMatchDataKeys.roster)
        let schedule: [ScheduledMatch] = try decodeLegacy(LegacyMatchDataKeys.schedule)
        let history: [MatchRecord] = try decodeLegacy(LegacyMatchDataKeys.history)
        try ensureUnique(roster.map(\.id), collection: "roster")
        try ensureUnique(schedule.map(\.id), collection: "schedule")
        try validateHistoryIdentifiers(history)
        let legacy = MatchDataSnapshot(roster: roster, schedule: schedule, history: history)

        // Persist all imported rows in one context save. If the process stops
        // before the receipt is written, a retry compares existing IDs and is
        // idempotent rather than inserting duplicates.
        let importContext = makeContext()
        do {
            try mergeLegacy(legacy, into: importContext)
            try importContext.save()
        } catch {
            importContext.rollback()
            throw error
        }

        let persisted = try loadSnapshot()
        try verifyReadback(of: legacy, in: persisted)

        // This receipt is deliberately committed only after a fresh-context
        // readback. Original defaults keys are retained as recovery material.
        let receiptContext = makeContext()
        do {
            if try !hasCompletedLegacyImport(in: receiptContext) {
                receiptContext.insert(StoredLegacyImportReceipt(id: Self.legacyReceiptID))
                try receiptContext.save()
            }
        } catch {
            receiptContext.rollback()
            throw error
        }
    }

    private func decodeLegacy<T: Decodable>(_ key: String) throws -> [T] {
        guard let storedValue = userDefaults.object(forKey: key) else { return [] }
        guard let data = storedValue as? Data else {
            throw MatchDataPersistenceError.legacyValueIsNotData(key: key)
        }
        do {
            return try JSONDecoder().decode([T].self, from: data)
        } catch {
            throw MatchDataPersistenceError.legacyDecodeFailed(key: key, reason: error.localizedDescription)
        }
    }

    private func mergeLegacy(_ legacy: MatchDataSnapshot, into context: ModelContext) throws {
        let roster = try context.fetch(FetchDescriptor<StoredRosterPlayer>())
        let rosterByID = Dictionary(roster.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for (position, value) in legacy.roster.enumerated() {
            if let existing = rosterByID[value.id] {
                guard existing.domainValue == value, existing.position == position else {
                    throw MatchDataPersistenceError.migrationConflict(collection: "roster", id: value.id)
                }
            } else {
                context.insert(StoredRosterPlayer(value, position: position))
            }
        }

        let schedule = try context.fetch(FetchDescriptor<StoredScheduledMatch>())
        let scheduleByID = Dictionary(schedule.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for (position, value) in legacy.schedule.enumerated() {
            if let existing = scheduleByID[value.id] {
                guard existing.domainValue == value, existing.position == position else {
                    throw MatchDataPersistenceError.migrationConflict(collection: "schedule", id: value.id)
                }
            } else {
                context.insert(StoredScheduledMatch(value, position: position))
            }
        }

        let matches = try context.fetch(FetchDescriptor<StoredMatchRecord>())
        let matchesByID = Dictionary(matches.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for (position, value) in legacy.history.enumerated() {
            if let existing = matchesByID[value.id] {
                guard try recordsAreEquivalent(existing.domainValue(), value) else {
                    throw MatchDataPersistenceError.migrationConflict(collection: "history", id: value.id)
                }
            } else {
                context.insert(StoredMatchRecord(value, position: position))
            }
        }
    }

    private func verifyReadback(of legacy: MatchDataSnapshot, in persisted: MatchDataSnapshot) throws {
        let rosterByID = Dictionary(persisted.roster.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for expected in legacy.roster {
            guard rosterByID[expected.id] == expected else {
                throw MatchDataPersistenceError.migrationReadbackFailed(collection: "roster", id: expected.id)
            }
        }
        let scheduleByID = Dictionary(persisted.schedule.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for expected in legacy.schedule {
            guard scheduleByID[expected.id] == expected else {
                throw MatchDataPersistenceError.migrationReadbackFailed(collection: "schedule", id: expected.id)
            }
        }
        let historyByID = Dictionary(persisted.history.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for expected in legacy.history {
            guard let actual = historyByID[expected.id], recordsAreEquivalent(actual, expected) else {
                throw MatchDataPersistenceError.migrationReadbackFailed(collection: "history", id: expected.id)
            }
        }
    }

    func synchronizeCorrectionMetadata(
        for record: MatchRecord,
        existing: StoredMatchCorrectionMetadata?,
        context: ModelContext
    ) throws {
        guard let metadata = record.correctionMetadata else {
            if let existing { context.delete(existing) }
            return
        }
        guard metadata.schemaVersion == MatchCorrectionMetadata.currentSchemaVersion else {
            throw MatchDataPersistenceError.historyCorrectionMetadataInvalid(
                id: record.id,
                reason: "versione \(metadata.schemaVersion) non supportata"
            )
        }
        let payload = try JSONEncoder().encode(metadata)
        if let existing {
            existing.payload = payload
        } else {
            context.insert(StoredMatchCorrectionMetadata(recordID: record.id, payload: payload))
        }
    }

    func domainValue(
        _ stored: StoredMatchRecord,
        correctionMetadata: StoredMatchCorrectionMetadata?
    ) throws -> MatchRecord {
        var record = try stored.domainValue()
        guard let correctionMetadata else { return record }
        do {
            record.correctionMetadata = try JSONDecoder().decode(MatchCorrectionMetadata.self, from: correctionMetadata.payload)
            return record
        } catch {
            throw MatchDataPersistenceError.historyCorrectionMetadataInvalid(
                id: record.id,
                reason: error.localizedDescription
            )
        }
    }

    private func readSnapshot(using context: ModelContext) throws -> MatchDataSnapshot {
        let roster = try context.fetch(FetchDescriptor<StoredRosterPlayer>())
            .sorted { $0.position < $1.position }
            .map(\.domainValue)
        let schedule = try context.fetch(FetchDescriptor<StoredScheduledMatch>())
            .sorted {
                $0.date == $1.date
                    ? $0.position < $1.position
                    : $0.date < $1.date
            }
            .map(\.domainValue)
        let storedHistory = try context.fetch(FetchDescriptor<StoredMatchRecord>())
            .sorted { $0.position < $1.position }
        let storedMetadata = try context.fetch(FetchDescriptor<StoredMatchCorrectionMetadata>())
        let metadataByRecordID = Dictionary(storedMetadata.map { ($0.recordID, $0) }, uniquingKeysWith: { first, _ in first })
        let historyIDs = Set(storedHistory.map(\.id))
        if let orphan = storedMetadata.first(where: { !historyIDs.contains($0.recordID) }) {
            throw MatchDataPersistenceError.historyCorrectionMetadataInvalid(
                id: orphan.recordID,
                reason: "metadati senza record storico associato"
            )
        }
        let history = try storedHistory.map { try domainValue($0, correctionMetadata: metadataByRecordID[$0.id]) }
        return MatchDataSnapshot(roster: roster, schedule: schedule, history: history)
    }

    func makeContext() -> ModelContext {
        let context = ModelContext(container)
        context.autosaveEnabled = false
        return context
    }

    private func hasCompletedLegacyImport(in context: ModelContext) throws -> Bool {
        try context.fetch(FetchDescriptor<StoredLegacyImportReceipt>())
            .contains { $0.id == Self.legacyReceiptID }
    }

    private func ensureUnique(_ ids: [UUID], collection: String) throws {
        var seen = Set<UUID>()
        for id in ids where !seen.insert(id).inserted {
            throw MatchDataPersistenceError.duplicateIdentifier(collection: collection, id: id)
        }
    }

    func validateHistoryIdentifiers(_ history: [MatchRecord]) throws {
        try ensureUnique(history.map(\.id), collection: "history")
        for record in history {
            try ensureUnique(record.players.map(\.id), collection: "history participants in \(record.id)")
            if let events = record.events {
                try ensureUnique(events.map(\.id), collection: "history events in \(record.id)")
            }
        }
    }

    private func datesAreEquivalent(_ lhs: Date, _ rhs: Date) -> Bool {
        // LiveMatchSessionDocumentCodec encodes dates as millisecondsSince1970.
        // The Double conversion can shift a Date by a few hundred nanoseconds;
        // do not treat that serialization noise as a conflicting history record.
        let serializationTolerance: TimeInterval = 0.000_001
        return abs(lhs.timeIntervalSince(rhs)) <= serializationTolerance
    }

    func recordsAreEquivalent(_ lhs: MatchRecord, _ rhs: MatchRecord) -> Bool {
        guard lhs.id == rhs.id,
              datesAreEquivalent(lhs.date, rhs.date),
              lhs.duration == rhs.duration,
              lhs.ourScore == rhs.ourScore,
              lhs.opponentScore == rhs.opponentScore,
              lhs.scheduledMatchID == rhs.scheduledMatchID,
              lhs.opponentName == rhs.opponentName,
              lhs.isHome == rhs.isHome,
              lhs.correctionMetadata == rhs.correctionMetadata,
              lhs.players.count == rhs.players.count else { return false }

        for (left, right) in zip(lhs.players, rhs.players) {
            guard left.id == right.id,
                  left.rosterPlayerID == right.rosterPlayerID,
                  left.playerName == right.playerName,
                  left.secondsPlayed == right.secondsPlayed,
                  left.goals == right.goals,
                  left.assists == right.assists else { return false }
        }

        switch (lhs.events, rhs.events) {
        case (nil, nil): return true
        case let (left?, right?):
            guard left.count == right.count else { return false }
            for (leftEvent, rightEvent) in zip(left, right) {
                guard leftEvent.id == rightEvent.id,
                      leftEvent.team == rightEvent.team,
                      leftEvent.matchSecond == rightEvent.matchSecond,
                      leftEvent.scorerID == rightEvent.scorerID,
                      leftEvent.scorerName == rightEvent.scorerName,
                      leftEvent.assistID == rightEvent.assistID,
                      leftEvent.assistName == rightEvent.assistName else { return false }
            }
            return true
        default: return false
        }
    }
}
