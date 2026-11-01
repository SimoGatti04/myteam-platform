import SwiftUI

// MARK: - Tactical Lineup State & Persistence Support

/// Stores tactical positioning on the futsal court for active match players.
struct TacticalPitchLayout: Codable, Equatable {
    var assignments: [UUID: TacticalPosition]

    init(assignments: [UUID: TacticalPosition] = [:]) {
        self.assignments = assignments
    }

    func position(for playerID: UUID, fallbackIndex: Int) -> TacticalPosition {
        if let assigned = assignments[playerID] {
            return assigned
        }
        let all = TacticalPosition.allCases
        return all[min(fallbackIndex, all.count - 1)]
    }

    mutating func assign(position: TacticalPosition, to playerID: UUID) {
        assignments[playerID] = position
    }
}

// MARK: - Interactive Futsal Pitch Section

struct InteractiveFutsalPitchSection: View {
    let fieldPlayers: [MatchPlayer]
    let benchPlayers: [MatchPlayer]
    let maxPlayersOnField: Int
    let canRecordEvents: Bool
    let isTimingRunning: Bool
    @Binding var layout: TacticalPitchLayout
    @Binding var selectedPlayerForDetail: MatchPlayer?

    let onGoal: (MatchPlayer) -> Void
    let onSubstituteOut: (MatchPlayer) -> Void
    let onQuickSubstitute: (MatchPlayer, MatchPlayer) -> Void // (out, in)
    let onToggleSuperpower: (MatchPlayer) -> Void

    @State private var activeQuickBenchPickerPlayer: MatchPlayer? = nil
    @State private var draggingPlayerID: UUID? = nil

    var body: some View {
        VStack(spacing: 12) {
            // Pitch Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "sportscourt.fill")
                        .foregroundStyle(MapiTheme.mauve)
                    Text("CAMPO & FORMAZIONE")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .foregroundStyle(MapiTheme.darkMauve)
                }

                Spacer()

                MapiStatusPill(
                    text: "\(fieldPlayers.count)/\(maxPlayersOnField) IN CAMPO",
                    color: fieldPlayers.count == maxPlayersOnField ? MapiTheme.olive : MapiTheme.mauve
                )
            }

            // Interactive Futsal Pitch Surface
            ZStack {
                FutsalPitchBackground()
                    .frame(height: 290)
                    .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: 3)

                GeometryReader { geo in
                    let w = geo.size.width
                    let h = geo.size.height

                    ForEach(Array(fieldPlayers.enumerated()), id: \.element.id) { index, player in
                        let pos = layout.position(for: player.id, fallbackIndex: index)
                        let coords = pos.defaultPitchCoordinates

                        PitchPlayerToken(
                            player: player,
                            positionTag: pos.rawValue,
                            isSelected: selectedPlayerForDetail?.id == player.id,
                            onTap: {
                                selectedPlayerForDetail = player
                            }
                        )
                        .position(x: w * coords.x, y: h * coords.y)
                        .contextMenu {
                            pitchPlayerContextMenu(player: player, currentPosition: pos)
                        }
                    }
                }
            }
            .frame(height: 290)

            // Bench Horizontal Scroll Strip
            if !benchPlayers.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("PANCHINA DISPONIBILE (\(benchPlayers.count))")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(MapiTheme.mauve)
                            .tracking(1)

                        Spacer()
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(benchPlayers) { player in
                                BenchPlayerQuickCard(
                                    player: player,
                                    canSubstitute: fieldPlayers.count < maxPlayersOnField,
                                    onTap: {
                                        selectedPlayerForDetail = player
                                    }
                                )
                                .contextMenu {
                                    benchPlayerContextMenu(player: player)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                        .padding(.horizontal, 2)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .mapiCard(accent: MapiTheme.darkMauve)
        .confirmationDialog(
            "Sostituisci \(activeQuickBenchPickerPlayer?.name ?? "") con:",
            isPresented: Binding(
                get: { activeQuickBenchPickerPlayer != nil },
                set: { if !$0 { activeQuickBenchPickerPlayer = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let outPlayer = activeQuickBenchPickerPlayer {
                ForEach(benchPlayers) { benchPlayer in
                    Button("\(benchPlayer.name) (\(benchPlayer.timePlayed / 60)')") {
                        onQuickSubstitute(outPlayer, benchPlayer)
                        activeQuickBenchPickerPlayer = nil
                    }
                }
                Button("Annulla", role: .cancel) {
                    activeQuickBenchPickerPlayer = nil
                }
            }
        }
    }

    // MARK: - Context Menu for Field Player
    @ViewBuilder
    private func pitchPlayerContextMenu(player: MatchPlayer, currentPosition: TacticalPosition) -> some View {
        Button {
            onGoal(player)
        } label: {
            Label("Segna Gol", systemImage: "soccerball")
        }
        .disabled(!canRecordEvents)

        Menu {
            ForEach(TacticalPosition.allCases) { pos in
                Button {
                    layout.assign(position: pos, to: player.id)
                } label: {
                    if pos == currentPosition {
                        Label(pos.displayName, systemImage: "checkmark")
                    } else {
                        Text(pos.displayName)
                    }
                }
            }
        } label: {
            Label("Cambia Ruolo / Posizione", systemImage: "arrow.triangle.swap")
        }

        if !benchPlayers.isEmpty {
            Menu {
                ForEach(benchPlayers) { benchPlayer in
                    Button("Entra \(benchPlayer.name) (\(benchPlayer.timePlayed / 60)')") {
                        onQuickSubstitute(player, benchPlayer)
                    }
                }
            } label: {
                Label("Sostituisci con panchina...", systemImage: "person.2.arrowhead.up.forward")
            }
        }

        Button {
            onSubstituteOut(player)
        } label: {
            Label("Fai Uscire (Panchina)", systemImage: "arrow.uturn.down")
        }

        Button {
            onToggleSuperpower(player)
        } label: {
            Label(
                player.superpower ? "Disattiva Superpower" : "Attiva Superpower ★",
                systemImage: player.superpower ? "star.slash" : "star.fill"
            )
        }
    }

    // MARK: - Context Menu for Bench Player
    @ViewBuilder
    private func benchPlayerContextMenu(player: MatchPlayer) -> some View {
        if fieldPlayers.count < maxPlayersOnField {
            Button {
                // Direct enter if vacancy
                onSubstituteOut(player) // Will be handled
            } label: {
                Label("Entra in campo", systemImage: "arrow.uturn.up")
            }
        } else {
            Menu {
                ForEach(fieldPlayers) { fieldPlayer in
                    Button("Al posto di \(fieldPlayer.name) (\(fieldPlayer.timePlayed / 60)')") {
                        onQuickSubstitute(fieldPlayer, player)
                    }
                }
            } label: {
                Label("Entra al posto di...", systemImage: "arrow.triangle.swap")
            }
        }

        Button {
            onToggleSuperpower(player)
        } label: {
            Label(
                player.superpower ? "Disattiva Superpower" : "Attiva Superpower ★",
                systemImage: player.superpower ? "star.slash" : "star.fill"
            )
        }
    }
}

// MARK: - Bench Player Quick Card

struct BenchPlayerQuickCard: View {
    let player: MatchPlayer
    let canSubstitute: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(player.isGoalkeeper ? MapiTheme.olive : MapiTheme.mauve)
                        .frame(width: 8, height: 8)

                    Text(player.name)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(MapiTheme.darkMauve)
                        .lineLimit(1)

                    if player.superpower {
                        Text("★")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Color.orange)
                    }
                }

                HStack(spacing: 6) {
                    Text("\(player.timePlayed / 60)' giocati")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.secondary)

                    if player.isGoalkeeper {
                        Text("POR")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundStyle(MapiTheme.olive)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.85))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(MapiTheme.mauve.opacity(0.25), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Advanced Goal Detail Sheet

struct AdvancedGoalDetailsSheet: View {
    let goalEvent: GoalEvent
    let scorerName: String
    @Binding var details: AdvancedGoalDetails
    let onSave: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Dettagli Gol (\(scorerName))") {
                    Picker("Situazione", selection: $details.situation) {
                        ForEach(AdvancedGoalDetails.GoalSituation.allCases) { sit in
                            Text(sit.rawValue).tag(sit)
                        }
                    }

                    Picker("Parte del corpo", selection: $details.bodyPart) {
                        ForEach(AdvancedGoalDetails.GoalBodyPart.allCases) { part in
                            Text(part.rawValue).tag(part)
                        }
                    }

                    Picker("Dinamica", selection: $details.dynamics) {
                        ForEach(AdvancedGoalDetails.GoalDynamics.allCases) { dyn in
                            Text(dyn.rawValue).tag(dyn)
                        }
                    }

                    Toggle("Autogol", isOn: $details.isOwnGoal)
                }

                Section("Posizione porta (Porta Avversaria)") {
                    Text("Tocca la porta per indicare dove è entrato il pallone:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    InteractiveGoalTarget(
                        targetX: $details.targetX,
                        targetY: $details.targetY
                    )
                    .frame(height: 120)
                    .padding(.vertical, 4)

                    if details.targetX != nil {
                        Button("Reimposta posizione") {
                            details.targetX = nil
                            details.targetY = nil
                        }
                        .font(.caption)
                        .foregroundStyle(MapiTheme.mauve)
                    }
                }
            }
            .navigationTitle("Dettagli Realizzazione")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Chiudi", action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salva", action: onSave)
                        .fontWeight(.bold)
                }
            }
        }
    }
}

// MARK: - Goal Target Coordinate Picker

struct InteractiveGoalTarget: View {
    @Binding var targetX: Double?
    @Binding var targetY: Double?

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height

            ZStack {
                // Goal frame
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(white: 0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.white, lineWidth: 3)
                    )

                // Goal net pattern
                VStack(spacing: 8) {
                    ForEach(0..<8) { _ in
                        Divider().background(Color.white.opacity(0.2))
                    }
                }
                HStack(spacing: 14) {
                    ForEach(0..<12) { _ in
                        Divider().background(Color.white.opacity(0.2))
                    }
                }

                // Selected target
                if let tx = targetX, let ty = targetY {
                    Circle()
                        .fill(Color.yellow)
                        .frame(width: 16, height: 16)
                        .overlay(Circle().stroke(Color.black, lineWidth: 2))
                        .shadow(radius: 3)
                        .position(x: w * CGFloat(tx), y: h * CGFloat(ty))
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        let clampedX = min(max(value.location.x / w, 0.05), 0.95)
                        let clampedY = min(max(value.location.y / h, 0.05), 0.95)
                        targetX = Double(clampedX)
                        targetY = Double(clampedY)
                    }
            )
        }
    }
}
