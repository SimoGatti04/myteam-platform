import SwiftUI

struct LiveClockCorrectionView: View {
    let timing: MatchTiming
    let maximumSeconds: Int
    let playerNames: [UUID: String]
    let onConfirm: (MatchTimingCorrectionPreview) -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var correctedSeconds: Int
    @State private var preview: MatchTimingCorrectionPreview?
    @State private var errorMessage: String?

    init(
        timing: MatchTiming,
        currentSeconds: Int,
        maximumSeconds: Int,
        playerNames: [UUID: String],
        onConfirm: @escaping (MatchTimingCorrectionPreview) -> Bool
    ) {
        self.timing = timing
        self.maximumSeconds = maximumSeconds
        self.playerNames = playerNames
        self.onConfirm = onConfirm
        _correctedSeconds = State(initialValue: min(max(currentSeconds, 0), maximumSeconds))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cronometro") {
                    LabeledContent("Tempo attuale", value: formatted(currentSeconds))
                    TextField("Nuovo tempo in secondi", value: $correctedSeconds, format: .number)
                        .accessibilityIdentifier("live.clock-correction.value")
                        .keyboardType(.numberPad)
                    HStack {
                        Button("−") { correctedSeconds = max(0, correctedSeconds - 1) }
                            .accessibilityIdentifier("live.clock-correction.decrement")
                            .buttonStyle(.borderless)
                        Text(formatted(correctedSeconds)).monospacedDigit()
                        Button("+") { correctedSeconds = min(maximumSeconds, correctedSeconds + 1) }
                            .accessibilityIdentifier("live.clock-correction.increment")
                            .buttonStyle(.borderless)
                    }
                    Text("Correggi il tempo del periodo corrente. La partita deve essere in pausa.")
                        .font(.footnote)
                        .foregroundStyle(MapiTheme.textSecondary)
                }

                if let preview {
                    Section("Anteprima") {
                        LabeledContent("Prima", value: formatted(preview.before.totalMatchElapsedSeconds))
                        LabeledContent("Dopo", value: formatted(preview.after.totalMatchElapsedSeconds))
                        ForEach(preview.affectedPlayers) { change in
                            LabeledContent(
                                playerNames[change.playerID] ?? "Giocatore",
                                value: "\(formatted(change.beforeSeconds)) → \(formatted(change.afterSeconds))"
                            )
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Calcola anteprima") {
                        var candidate = timing
                        do {
                            preview = try candidate.previewCurrentPeriodElapsed(toSeconds: correctedSeconds)
                            errorMessage = nil
                        } catch {
                            preview = nil
                            errorMessage = error.localizedDescription
                        }
                    }
                    .disabled(correctedSeconds < 0 || correctedSeconds > maximumSeconds)
                }
            }
            .navigationTitle("Correggi cronometro")
            .mapiNavigationChrome()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Conferma") {
                        guard let preview else { return }
                        if onConfirm(preview) { dismiss() }
                    }
                    .disabled(preview == nil)
                }
            }
            .onChange(of: correctedSeconds) { _, _ in preview = nil }
        }
    }

    private var currentSeconds: Int {
        timing.phase == .secondHalf ? timing.secondHalfElapsedSeconds : timing.firstHalfElapsedSeconds
    }

    private func formatted(_ seconds: Int) -> String {
        String(format: "%02d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}

struct LivePlayerMinutesCorrectionView: View {
    let timing: MatchTiming
    let playerID: UUID
    let playerName: String
    let currentSeconds: Int
    let maximumSeconds: Int
    let onConfirm: (MatchTimingCorrectionPreview) -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var correctedSeconds: Int
    @State private var reason = ""
    @State private var preview: MatchTimingCorrectionPreview?
    @State private var errorMessage: String?

    init(
        timing: MatchTiming,
        playerID: UUID,
        playerName: String,
        currentSeconds: Int,
        maximumSeconds: Int,
        onConfirm: @escaping (MatchTimingCorrectionPreview) -> Bool
    ) {
        self.timing = timing
        self.playerID = playerID
        self.playerName = playerName
        self.currentSeconds = currentSeconds
        self.maximumSeconds = maximumSeconds
        self.onConfirm = onConfirm
        _correctedSeconds = State(initialValue: min(max(currentSeconds, 0), maximumSeconds))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Minutaggio di \(playerName)") {
                    LabeledContent("Tempo registrato", value: formatted(currentSeconds))
                    TextField("Nuovo tempo in secondi", value: $correctedSeconds, format: .number)
                        .accessibilityIdentifier("live.minutes-correction.value")
                        .keyboardType(.numberPad)
                    HStack {
                        Button("−") { correctedSeconds = max(0, correctedSeconds - 1) }
                            .accessibilityIdentifier("live.minutes-correction.decrement")
                            .buttonStyle(.borderless)
                        Text(formatted(correctedSeconds))
                            .monospacedDigit()
                            .accessibilityIdentifier("live.minutes-correction.adjusted-time")
                        Button("+") { correctedSeconds = min(maximumSeconds, correctedSeconds + 1) }
                            .accessibilityIdentifier("live.minutes-correction.increment")
                            .buttonStyle(.borderless)
                    }
                    TextField("Motivo (facoltativo)", text: $reason)
                }

                if let preview {
                    Section("Anteprima") {
                        LabeledContent("Prima", value: formatted(preview.before.participants.first(where: { $0.id == playerID })?.accumulatedNanoseconds ?? 0))
                        LabeledContent("Dopo", value: formatted(preview.after.participants.first(where: { $0.id == playerID })?.accumulatedNanoseconds ?? 0))
                        Text("La rettifica viene mantenuta anche dopo la ripresa del cronometro.")
                            .font(.footnote)
                            .foregroundStyle(MapiTheme.textSecondary)
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }

                Section {
                    Button("Calcola anteprima") {
                        var candidate = timing
                        do {
                            preview = try candidate.previewParticipantMinutes(
                                playerID: playerID,
                                toSeconds: correctedSeconds,
                                reason: reason.isEmpty ? nil : reason
                            )
                            errorMessage = nil
                        } catch {
                            preview = nil
                            errorMessage = error.localizedDescription
                        }
                    }
                    .disabled(correctedSeconds < 0 || correctedSeconds > maximumSeconds)
                }
            }
            .navigationTitle("Correggi minutaggio")
            .mapiNavigationChrome()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Conferma") {
                        guard let preview else { return }
                        if onConfirm(preview) { dismiss() }
                    }
                    .disabled(preview == nil)
                }
            }
            .onChange(of: correctedSeconds) { _, _ in preview = nil }
            .onChange(of: reason) { _, _ in preview = nil }
        }
    }

    private func formatted(_ nanoseconds: Int64) -> String {
        let seconds = Int(max(0, nanoseconds) / 1_000_000_000)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    private func formatted(_ seconds: Int) -> String {
        String(format: "%02d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}

struct LiveGoalEventCorrectionView: View {
    let event: GoalEvent?
    let players: [MatchPlayer]
    let maximumSecond: Int
    let onConfirm: (GoalEvent?) -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var draft: GoalEvent
    @State private var isDeleting = false
    @State private var showConfirmation = false
    @State private var errorMessage: String?

    init(
        event: GoalEvent?,
        players: [MatchPlayer],
        maximumSecond: Int,
        onConfirm: @escaping (GoalEvent?) -> Bool
    ) {
        self.event = event
        self.players = players
        self.maximumSecond = max(0, maximumSecond)
        self.onConfirm = onConfirm
        _draft = State(initialValue: event ?? GoalEvent(team: .ours, matchSecond: max(0, maximumSecond)))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(event == nil ? "Nuovo evento" : "Correzione evento") {
                    HistoryEventEditorRow(
                        event: $draft,
                        playerOptions: players.map { MatchEventPlayerOption(id: $0.id, name: $0.name) },
                        showDelete: event != nil
                    ) {
                        isDeleting = true
                    }
                    if draft.matchSecond < 0 || draft.matchSecond > maximumSecond {
                        Text("L'evento deve ricadere entro il tempo di gioco corrente (\(maximumSecond) s).")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle(event == nil ? "Aggiungi evento" : "Modifica evento")
            .mapiNavigationChrome()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salva") { showConfirmation = true }
                        .accessibilityIdentifier("live.event-correction.save")
                }
            }
            .confirmationDialog(
                isDeleting ? "Eliminare questo evento?" : "Confermare la correzione?",
                isPresented: $showConfirmation,
                titleVisibility: .visible
            ) {
                Button(isDeleting ? "Elimina evento" : "Conferma", role: isDeleting ? .destructive : nil) {
                    guard isDeleting || (draft.matchSecond >= 0 && draft.matchSecond <= maximumSecond) else {
                        errorMessage = "L'orario non è compatibile con il tempo partita."
                        return
                    }
                    let candidate: GoalEvent? = isDeleting ? nil : normalized(draft)
                    if onConfirm(candidate) { dismiss() }
                }
                Button("Annulla", role: .cancel) {}
            } message: {
                Text(isDeleting ? "Il punteggio e le statistiche verranno aggiornati dall'elenco degli eventi." : "L'identificativo evento viene mantenuto durante la modifica; punteggio e statistiche saranno aggiornati.")
            }
        }
    }

    private func normalized(_ source: GoalEvent) -> GoalEvent {
        // The event selected when the correction sheet was presented is the
        // identity authority. Keep it explicitly rather than relying on the
        // editable draft's value identity surviving SwiftUI form updates.
        var result = GoalEvent(
            id: event?.id ?? source.id,
            team: source.team,
            matchSecond: source.matchSecond,
            scorerID: source.scorerID,
            scorerName: source.scorerName,
            assistID: source.assistID,
            assistName: source.assistName
        )
        if result.team == .opponent {
            result.scorerID = nil
            result.scorerName = nil
            result.assistID = nil
            result.assistName = nil
        }
        if result.assistID == result.scorerID {
            result.assistID = nil
            result.assistName = nil
        }
        return result
    }
}

struct LiveSubstitutionCorrectionView: View {
    let timing: MatchTiming
    let substitution: MatchRecordedSubstitution
    let players: [MatchPlayer]
    let onConfirm: (MatchTimingCorrectionPreview) -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var outgoingPlayerID: UUID
    @State private var incomingPlayerID: UUID
    @State private var correctedSecond: Int
    @State private var preview: MatchTimingCorrectionPreview?
    @State private var errorMessage: String?

    init(
        timing: MatchTiming,
        substitution: MatchRecordedSubstitution,
        players: [MatchPlayer],
        onConfirm: @escaping (MatchTimingCorrectionPreview) -> Bool
    ) {
        self.timing = timing
        self.substitution = substitution
        self.players = players
        self.onConfirm = onConfirm
        _outgoingPlayerID = State(initialValue: substitution.outgoingPlayerID)
        _incomingPlayerID = State(initialValue: substitution.incomingPlayerID)
        let roundedSecond = (substitution.elapsedNanoseconds + 500_000_000) / 1_000_000_000
        _correctedSecond = State(initialValue: Int(roundedSecond))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Sostituzione · \(periodTitle)") {
                    Picker("Esce", selection: $outgoingPlayerID) {
                        ForEach(players.sorted { $0.name < $1.name }) { player in
                            Text(player.name).tag(player.id)
                        }
                    }
                    .accessibilityIdentifier("live.substitution-correction.outgoing")
                    Picker("Entra", selection: $incomingPlayerID) {
                        ForEach(players.sorted { $0.name < $1.name }) { player in
                            Text(player.name).tag(player.id)
                        }
                    }
                    .accessibilityIdentifier("live.substitution-correction.incoming")
                    TextField("Secondo nel periodo", value: $correctedSecond, format: .number)
                        .keyboardType(.numberPad)
                        .accessibilityIdentifier("live.substitution-correction.second")
                    Text("La partita deve essere in pausa. La preview ricalcola soltanto i minutaggi ricostruibili.")
                        .font(.footnote)
                        .foregroundStyle(MapiTheme.textSecondary)
                }

                if let preview {
                    Section("Anteprima minutaggi") {
                        ForEach(preview.affectedPlayers) { change in
                            LabeledContent(
                                players.first(where: { $0.id == change.playerID })?.name ?? "Giocatore",
                                value: "\(formatted(change.beforeSeconds)) → \(formatted(change.afterSeconds))"
                            )
                        }
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button("Calcola anteprima") { makePreview() }
                        .disabled(!canPreview)
                        .accessibilityIdentifier("live.substitution-correction.preview")
                }
            }
            .navigationTitle("Correggi sostituzione")
            .mapiNavigationChrome()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Conferma") {
                        guard let preview, onConfirm(preview) else { return }
                        dismiss()
                    }
                    .disabled(preview == nil)
                    .accessibilityIdentifier("live.substitution-correction.confirm")
                }
            }
            .onChange(of: outgoingPlayerID) { _, _ in preview = nil }
            .onChange(of: incomingPlayerID) { _, _ in preview = nil }
            .onChange(of: correctedSecond) { _, _ in preview = nil }
        }
    }

    private var canPreview: Bool {
        outgoingPlayerID != incomingPlayerID &&
        correctedSecond >= 0 && correctedSecond <= timing.configuration.periodDurationSeconds
    }

    private var periodTitle: String {
        substitution.period == .firstHalf ? "primo tempo" : "secondo tempo"
    }

    private func makePreview() {
        var candidate = timing
        do {
            preview = try candidate.previewRecordedSubstitutionCorrection(
                id: substitution.id,
                outgoingID: outgoingPlayerID,
                incomingID: incomingPlayerID,
                toSeconds: correctedSecond
            )
            errorMessage = nil
        } catch {
            preview = nil
            errorMessage = error.localizedDescription
        }
    }

    private func formatted(_ seconds: Int) -> String {
        String(format: "%02d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}
