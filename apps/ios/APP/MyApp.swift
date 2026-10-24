import SwiftUI
import SwiftData

private enum ApplicationLaunchState {
    case ready(container: ModelContainer, store: MatchDataStore, data: MatchDataSnapshot)
    case persistenceUnavailable(message: String)
}

@main
struct MyApp: App {
    private let launchState: ApplicationLaunchState

    init() {
        do {
            let container = try MatchDataStore.makePersistentContainer()
            let store = MatchDataStore(container: container)
            let data = try store.bootstrap()
            launchState = .ready(container: container, store: store, data: data)
        } catch {
            launchState = .persistenceUnavailable(message: error.localizedDescription)
        }
    }

    var body: some Scene {
        WindowGroup {
            switch launchState {
            case let .ready(container, store, data):
                ContentView(dataStore: store, initialData: data)
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
