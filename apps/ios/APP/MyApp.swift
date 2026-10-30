import SwiftUI
import SwiftData

private enum ApplicationLaunchState {
    case ready(
        container: ModelContainer,
        store: MatchDataStore,
        data: MatchDataSnapshot,
        liveSessionStore: any LiveMatchSessionRepository,
        liveStartup: LiveMatchSessionStartup
    )
    case persistenceUnavailable(message: String)
}

@main
struct MyApp: App {
    private let launchState: ApplicationLaunchState

    init() {
        let launchEnvironment = ProcessInfo.processInfo.environment
        let testStoreID = Self.validUITestStoreID(in: launchEnvironment)

#if DEBUG
        if launchEnvironment["AURINFORMATC_UI_TEST_CLEANUP_STORE"] == "1",
           let testStoreID,
           let storeURL = Self.uiTestStoreURL(for: testStoreID) {
            do {
                try FileManager.default.removeItem(at: storeURL.deletingLastPathComponent())
                UserDefaults.standard.removePersistentDomain(
                    forName: "AURINFORMATC-UI-Test-\(testStoreID)"
                )
                launchState = .persistenceUnavailable(message: "Archivio sintetico UI test rimosso.")
            } catch {
                launchState = .persistenceUnavailable(message: "Pulizia archivio sintetico UI test non riuscita: \(error.localizedDescription)")
            }
            return
        }
#endif

        do {
            let container: ModelContainer
            let userDefaults: UserDefaults
            if let testStoreID,
               let storeURL = Self.uiTestStoreURL(for: testStoreID) {
                container = try MatchDataStore.makePersistentContainer(storeURL: storeURL)
                guard let isolatedDefaults = UserDefaults(suiteName: "AURINFORMATC-UI-Test-\(testStoreID)") else {
                    throw UITestHarnessError.isolatedDefaultsUnavailable
                }
                userDefaults = isolatedDefaults
            } else {
                container = try MatchDataStore.makePersistentContainer()
                userDefaults = .standard
            }
            let store = MatchDataStore(container: container, userDefaults: userDefaults)
            var data = try store.bootstrap()

#if DEBUG
            if testStoreID != nil,
               launchEnvironment["AURINFORMATC_UI_TEST_SEED"] == "temporal-uncertainty" {
                switch store.load() {
                case .none:
                    try store.save(Self.makeTemporalUncertaintyFixture())
                case let .primary(snapshot)
                    where snapshot.opponentName == "Recovery Synthetic FC"
                        && snapshot.timing.configuration.periodDurationSeconds == 30:
                    // The same isolated store is intentionally reopened by the UI test.
                    // Preserve the reviewed/paused fixture instead of reseeding or
                    // treating a legitimate relaunch as a dirty initial store.
                    break
                default:
                    throw UITestHarnessError.fixtureStoreWasNotEmpty
                }
            }
#endif

            if testStoreID == nil {
                let legacySessionSource = try LegacyLiveMatchSessionJSONSource.applicationSupportSource()
                try store.importLegacyLiveSessionIfNeeded(from: legacySessionSource)
            }
            let liveSessionStore: any LiveMatchSessionRepository = store
            var liveStartup = LiveMatchSessionStartupFactory.make(
                from: liveSessionStore.load(),
                now: SystemLiveMatchRecoveryClock().reading()
            )

            if case let .finalizationPending(snapshot, restoreBackupFirst, _) = liveStartup {
                do {
                    let pendingSnapshot = restoreBackupFirst
                        ? try liveSessionStore.restoreBackup()
                        : snapshot
                    try LiveMatchFinalizationCoordinator(
                        sessionRepository: liveSessionStore
                    ).finalize(pendingSnapshot)
                    data = try store.loadSnapshot()
                    liveStartup = .none
                } catch {
                    liveStartup = .finalizationPending(
                        snapshot: snapshot,
                        restoreBackupFirst: restoreBackupFirst,
                        reason: error.localizedDescription
                    )
                }
            }

            launchState = .ready(
                container: container,
                store: store,
                data: data,
                liveSessionStore: liveSessionStore,
                liveStartup: liveStartup
            )
        } catch {
            launchState = .persistenceUnavailable(message: error.localizedDescription)
        }
    }

    var body: some Scene {
        WindowGroup {
            switch launchState {
            case let .ready(container, store, data, liveSessionStore, liveStartup):
                ContentView(
                    dataStore: store,
                    initialData: data,
                    liveSessionStore: liveSessionStore,
                    initialLiveStartup: liveStartup
                )
                .modelContainer(container)
            case let .persistenceUnavailable(message):
                PersistenceUnavailableView(message: message)
            }
        }
    }

    private static func validUITestStoreID(in environment: [String: String]) -> String? {
#if DEBUG
        guard let value = environment["AURINFORMATC_UI_TEST_STORE_ID"],
              UUID(uuidString: value) != nil else {
            return nil
        }
        return value
#else
        return nil
#endif
    }

    private static func uiTestStoreURL(for id: String) -> URL? {
#if DEBUG
        guard UUID(uuidString: id) != nil,
              let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return nil
        }
        return cacheDirectory
            .appendingPathComponent("AURINFORMATC-UI-Tests", isDirectory: true)
            .appendingPathComponent(id, isDirectory: true)
            .appendingPathComponent("MatchData.store", isDirectory: false)
#else
        return nil
#endif
    }

#if DEBUG
    private static func makeTemporalUncertaintyFixture() throws -> LiveMatchSessionSnapshot {
        let configuration = MatchTimingConfiguration(
            requiredStartingPlayers: 5,
            periodDurationSeconds: 30,
            halftimeDurationSeconds: 5,
            timeoutDurationSeconds: 60,
            timeoutsPerTeamPerHalf: 1
        )
        let ids = (1...6).map { index in
            UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index))!
        }
        let starters = Array(ids.prefix(configuration.requiredStartingPlayers))
        let clock = UITestFrozenMatchTimingClock()
        var timing = MatchTiming(configuration: configuration, clock: clock)
        guard timing.confirmAttendance(presentPlayerIDs: ids),
              timing.confirmStartingLineup(fieldPlayerIDs: Set(starters)),
              timing.toggleMainClock() == .started else {
            throw UITestHarnessError.fixtureCouldNotStart
        }

        clock.advance(seconds: 10)
        timing.synchronize()
        let goal = GoalEvent(
            team: .ours,
            matchSecond: 10,
            scorerID: ids[0],
            scorerName: "Synthetic Player 1",
            assistID: ids[1],
            assistName: "Synthetic Player 2"
        )
        clock.advance(seconds: 20)
        timing.synchronize()
        guard timing.phase == .halftime else {
            throw UITestHarnessError.fixtureCouldNotCompleteFirstHalf
        }
        timing.startSecondHalfManually()
        guard timing.toggleMainClock() == .resumed else {
            throw UITestHarnessError.fixtureCouldNotStartSecondHalf
        }

        let reading = SystemLiveMatchRecoveryClock().reading()
        let (futureContinuousTime, overflow) = reading.continuousTimeNanoseconds.addingReportingOverflow(60_000_000_000)
        let timingSnapshot = timing.snapshot(capturedAt: reading.wallClockDate.addingTimeInterval(-90))
        let snapshot = LiveMatchSessionSnapshot(
            schemaVersion: LiveMatchSessionSnapshot.currentSchemaVersion,
            sessionID: UUID(),
            status: .active,
            timing: timingSnapshot,
            startingPlayerIDs: starters,
            players: ids.enumerated().map { offset, id in
                LiveMatchPlayerSnapshot(
                    rosterPlayerID: id,
                    name: "Synthetic Player \(offset + 1)",
                    isGoalkeeper: offset == 0,
                    playWeight: [1.0, 0.75, 0.5, 0.25, 1.0, 0.75][offset],
                    superpower: false
                )
            },
            events: [goal],
            scheduledMatchID: nil,
            scheduledMatchDate: nil,
            opponentName: "Recovery Synthetic FC",
            isHome: true,
            continuousTimeNanoseconds: overflow ? .max : futureContinuousTime,
            finalRecord: nil
        )
        try snapshot.validate()
        return snapshot
    }
#endif
}

#if DEBUG
private final class UITestFrozenMatchTimingClock: MatchTimingClock {
    private(set) var instantNanoseconds: Int64 = 0

    func nowNanoseconds() -> Int64 { instantNanoseconds }

    func advance(seconds: Int64) {
        instantNanoseconds += seconds * 1_000_000_000
    }
}

private enum UITestHarnessError: LocalizedError {
    case isolatedDefaultsUnavailable
    case fixtureStoreWasNotEmpty
    case fixtureCouldNotStart
    case fixtureCouldNotCompleteFirstHalf
    case fixtureCouldNotStartSecondHalf

    var errorDescription: String? {
        switch self {
        case .isolatedDefaultsUnavailable:
            "L'archivio UserDefaults isolato del test non è disponibile."
        case .fixtureStoreWasNotEmpty:
            "L'archivio SwiftData del test doveva essere vuoto prima della fixture."
        case .fixtureCouldNotStart:
            "La fixture sintetica non ha potuto avviare il primo tempo."
        case .fixtureCouldNotCompleteFirstHalf:
            "La fixture sintetica non ha potuto completare il primo tempo."
        case .fixtureCouldNotStartSecondHalf:
            "La fixture sintetica non ha potuto avviare il secondo tempo."
        }
    }
}
#endif

/// Deliberately shown instead of the normal app when the persistent store or
/// legacy import cannot be read. It prevents a storage error looking like an
/// empty roster/history and never modifies the legacy source keys.
private struct PersistenceUnavailableView: View {
    let message: String

    var body: some View {
        VStack(spacing: 14) {
            Text("Impossibile caricare i dati salvati")
                .font(.headline)
            Text("I dati originali non sono stati rimossi. Non disinstallare l'app; riaprila o chiedi assistenza se il problema persiste.")
                .font(.body)
            Text(message)
                .font(.footnote)
                .textSelection(.enabled)
        }
        .multilineTextAlignment(.center)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MapiTheme.background.ignoresSafeArea())
    }
}
