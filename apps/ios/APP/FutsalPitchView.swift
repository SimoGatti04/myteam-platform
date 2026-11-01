import SwiftUI

// MARK: - Tactical Position on Pitch

enum TacticalPosition: String, CaseIterable, Identifiable, Codable {
    case goalkeeper = "POR"
    case defender = "DIF"
    case wingerLeft = "LAT SX"
    case wingerRight = "LAT DX"
    case pivot = "PIV"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .goalkeeper: return "Portiere"
        case .defender: return "Centrale / Difensore"
        case .wingerLeft: return "Laterale Sinistro"
        case .wingerRight: return "Laterale Destro"
        case .pivot: return "Pivot"
        }
    }

    /// Normalized pitch coordinates (x: 0.0...1.0, y: 0.0...1.0)
    /// where (0.5, 0.12) is our goal line and (0.5, 0.85) is opponent goal line.
    var defaultPitchCoordinates: (x: CGFloat, y: CGFloat) {
        switch self {
        case .goalkeeper:
            return (0.50, 0.14)
        case .defender:
            return (0.50, 0.36)
        case .wingerLeft:
            return (0.24, 0.58)
        case .wingerRight:
            return (0.76, 0.58)
        case .pivot:
            return (0.50, 0.82)
        }
    }
}

// MARK: - Advanced Goal Details

struct AdvancedGoalDetails: Codable, Equatable {
    enum GoalSituation: String, CaseIterable, Identifiable, Codable {
        case openPlay = "Azione"
        case setPiece = "Calcio piazzato"
        case penalty = "Rigore"
        case freeKick = "Punizione"
        case corner = "Calcio d'angolo"
        case counterAttack = "Contropiede"

        var id: String { rawValue }
    }

    enum GoalBodyPart: String, CaseIterable, Identifiable, Codable {
        case rightFoot = "Piede destro"
        case leftFoot = "Piede sinistro"
        case head = "Testa"
        case other = "Altro"

        var id: String { rawValue }
    }

    enum GoalDynamics: String, CaseIterable, Identifiable, Codable {
        case direct = "Diretto"
        case deflection = "Deviazione"
        case rebound = "Rimpallo"
        case ownGoal = "Autogol"

        var id: String { rawValue }
    }

    var situation: GoalSituation = .openPlay
    var bodyPart: GoalBodyPart = .rightFoot
    var dynamics: GoalDynamics = .direct
    var isOwnGoal: Bool = false
    /// Normalized coordinates in goal mouth (x: 0.0...1.0, y: 0.0...1.0), optional
    var targetX: Double? = nil
    var targetY: Double? = nil
}

// MARK: - Futsal Pitch Visual Element

struct FutsalPitchBackground: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let cornerRadius: CGFloat = 16

            ZStack {
                // Pitch surface - MAPI styled turf
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.16, green: 0.38, blue: 0.24),
                                Color(red: 0.12, green: 0.30, blue: 0.19)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                // Outer boundary
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Color.white.opacity(0.85), lineWidth: 2)
                    .padding(4)

                // Halfway line
                Path { path in
                    path.move(to: CGPoint(x: 4, y: h * 0.5))
                    path.addLine(to: CGPoint(x: w - 4, y: h * 0.5))
                }
                .stroke(Color.white.opacity(0.75), lineWidth: 1.5)

                // Center circle
                Circle()
                    .stroke(Color.white.opacity(0.75), lineWidth: 1.5)
                    .frame(width: min(w * 0.32, 100), height: min(w * 0.32, 100))
                    .position(x: w * 0.5, y: h * 0.5)

                // Center spot
                Circle()
                    .fill(Color.white.opacity(0.85))
                    .frame(width: 5, height: 5)
                    .position(x: w * 0.5, y: h * 0.5)

                // Defensive arc (top - 6m)
                Path { path in
                    path.addArc(
                        center: CGPoint(x: w * 0.5, y: 4),
                        radius: w * 0.30,
                        startAngle: .degrees(0),
                        endAngle: .degrees(180),
                        clockwise: false
                    )
                }
                .stroke(Color.white.opacity(0.75), lineWidth: 1.5)

                // Attacking arc (bottom - 6m)
                Path { path in
                    path.addArc(
                        center: CGPoint(x: w * 0.5, y: h - 4),
                        radius: w * 0.30,
                        startAngle: .degrees(180),
                        endAngle: .degrees(360),
                        clockwise: false
                    )
                }
                .stroke(Color.white.opacity(0.75), lineWidth: 1.5)

                // Penalty spots
                Circle()
                    .fill(Color.white.opacity(0.85))
                    .frame(width: 4, height: 4)
                    .position(x: w * 0.5, y: h * 0.20)

                Circle()
                    .fill(Color.white.opacity(0.85))
                    .frame(width: 4, height: 4)
                    .position(x: w * 0.5, y: h * 0.80)
            }
        }
    }
}

// MARK: - Pitch Player Token

struct PitchPlayerToken: View {
    let player: MatchPlayer
    let positionTag: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 3) {
                ZStack {
                    Circle()
                        .fill(player.isGoalkeeper ? MapiTheme.olive : MapiTheme.darkMauve)
                        .frame(width: 46, height: 46)
                        .overlay(
                            Circle()
                                .stroke(
                                    isSelected ? Color.yellow : (player.superpower ? Color.orange : Color.white),
                                    lineWidth: isSelected ? 3.5 : 2
                                )
                        )
                        .shadow(color: .black.opacity(0.35), radius: 3, x: 0, y: 2)

                    Text(positionTag)
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundStyle(Color.white)

                    if player.superpower {
                        Text("★")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color.yellow)
                            .offset(x: 18, y: -16)
                    }
                }

                VStack(spacing: 1) {
                    Text(player.name)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color.black.opacity(0.70))
                        )

                    Text("\(player.timePlayed / 60)'")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.95))
                }
            }
        }
        .buttonStyle(.plain)
    }
}
