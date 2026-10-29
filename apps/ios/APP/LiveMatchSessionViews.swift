import SwiftUI

struct LiveMatchRecoveryReviewView: View {
    let snapshot: LiveMatchSessionSnapshot
    let reason: String
    let maximumElapsedNanoseconds: Int64
    let restoreBackupFirst: Bool
    let onRecover: (Int64) -> Void

    @State private var elapsedSeconds: Int

    init(
        snapshot: LiveMatchSessionSnapshot,
        suggestedElapsedNanoseconds: Int64,
        maximumElapsedNanoseconds: Int64,
        reason: String,
        restoreBackupFirst: Bool,
        onRecover: @escaping (Int64) -> Void
    ) {
        self.snapshot = snapshot
        self.reason = reason
        self.maximumElapsedNanoseconds = max(0, maximumElapsedNanoseconds)
        self.restoreBackupFirst = restoreBackupFirst
        self.onRecover = onRecover
        let maximumSeconds = Int(max(0, maximumElapsedNanoseconds) / 1_000_000_000)
        let suggestedSeconds = Int(max(0, suggestedElapsedNanoseconds) / 1_000_000_000)
        _elapsedSeconds = State(initialValue: min(maximumSeconds, suggestedSeconds))
    }

    private var maximumSeconds: Int {
        Int(maximumElapsedNanoseconds / 1_000_000_000)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("PARTITA DA RIPRISTINARE")
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .foregroundStyle(MapiTheme.darkMauve)
                    .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: 12) {
                    Text(snapshot.opponentName.map { "Contro \($0)" } ?? "Partita in corso")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(MapiTheme.darkMauve)
                    Text(reason)
                        .font(.body)
                        .foregroundStyle(MapiTheme.textSecondary)
                    if restoreBackupFirst {
                        Text("La copia recuperabile verrà promossa senza cancellare il file principale danneggiato.")
                            .font(.footnote)
                            .foregroundStyle(MapiTheme.textSecondary)
                    }
                }
                .mapiCard(accent: MapiTheme.olive)

                VStack(alignment: .leading, spacing: 14) {
                    Text("Tempo da aggiungere")
                        .font(.headline)
                        .foregroundStyle(MapiTheme.darkMauve)
                    Stepper(value: $elapsedSeconds, in: 0...maximumSeconds) {
                        Text(formattedTime(elapsedSeconds))
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .monospacedDigit()
                    }
                    .disabled(maximumSeconds == 0)
                    Text("Il valore è limitato al tempo residuo del periodo o del countdown salvato.")
                        .font(.footnote)
                        .foregroundStyle(MapiTheme.textSecondary)
                }
                .mapiCard(accent: MapiTheme.mauve)

                Button("RIPRENDI CON QUESTO TEMPO") {
                    onRecover(Int64(elapsedSeconds) * 1_000_000_000)
                }
                .buttonStyle(MapiPrimaryButtonStyle())

                Button("RIPRENDI SENZA AGGIUNGERE TEMPO") {
                    onRecover(0)
                }
                .buttonStyle(MapiSecondaryButtonStyle())
            }
            .padding(20)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(MapiTheme.background.ignoresSafeArea())
    }

    private func formattedTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}

struct LiveMatchSessionUnavailableView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text("SESSIONE LIVE NON LEGGIBILE")
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(MapiTheme.darkMauve)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 12) {
                Text("I dati della partita sono stati conservati. Non verrà avviata una sessione vuota né sovrascritto il salvataggio.")
                    .font(.body)
                    .foregroundStyle(MapiTheme.textSecondary)
                Text(message)
                    .font(.footnote)
                    .textSelection(.enabled)
            }
            .mapiCard(accent: MapiTheme.mauve)
            Button("RIPROVA A LEGGERE") { onRetry() }
                .buttonStyle(MapiPrimaryButtonStyle())
        }
        .padding(20)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MapiTheme.background.ignoresSafeArea())
    }
}

struct LiveMatchFinalizationRecoveryView: View {
    let opponentName: String?
    let reason: String?
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text("CONCLUSIONE DA COMPLETARE")
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(MapiTheme.darkMauve)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 12) {
                Text(opponentName.map { "La partita contro \($0) è conclusa." } ?? "La partita è conclusa.")
                    .font(.headline)
                    .foregroundStyle(MapiTheme.darkMauve)
                Text("La sessione resta conservata finché il record storico non è stato salvato e verificato. Riprovare non crea una seconda partita.")
                    .font(.body)
                    .foregroundStyle(MapiTheme.textSecondary)
                if let reason {
                    Text(reason)
                        .font(.footnote)
                        .textSelection(.enabled)
                }
            }
            .mapiCard(accent: MapiTheme.olive)
            Button("RIPROVA IL SALVATAGGIO") { onRetry() }
                .buttonStyle(MapiPrimaryButtonStyle())
        }
        .padding(20)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MapiTheme.background.ignoresSafeArea())
    }
}
