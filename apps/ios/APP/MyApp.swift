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
        do {
            let container = try MatchDataStore.makePersistentContainer()
            let store = MatchDataStore(container: container)
            var data = try store.bootstrap()
            let legacySessionSource = try LegacyLiveMatchSessionJSONSource.applicationSupportSource()
            try store.importLegacyLiveSessionIfNeeded(from: legacySessionSource)
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
}

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
