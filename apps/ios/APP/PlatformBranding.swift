import SwiftUI

// MARK: - Team Brand Profile

/// Models team branding and design tokens. Defaults to MAPI GROUP for complete visual
/// equivalence with the legacy app, but cleanly decouples styling from hardcoded values.
struct TeamBrandProfile: Equatable, Codable {
    var teamName: String
    var shortName: String
    var primaryColorHex: String
    var secondaryColorHex: String
    var accentColorHex: String
    var backgroundColorHex: String
    var logoAssetName: String
    var welcomeBackgroundAssetName: String
    var footerAssetName: String

    static let mapiDefault = TeamBrandProfile(
        teamName: "MAPI GROUP",
        shortName: "MAPI",
        primaryColorHex: "#4A3B4E", // darkMauve
        secondaryColorHex: "#7B6680", // mauve
        accentColorHex: "#6B7A54", // olive
        backgroundColorHex: "#EFECE8", // background
        logoAssetName: "WelcomeLogo",
        welcomeBackgroundAssetName: "WelcomeBackground",
        footerAssetName: "FooterGeese"
    )
}

// MARK: - Competition Rules Configuration

/// Configurable match regulation according to C4 §6 decisions.
/// Matches inherit default settings from competition, with per-match operator overrides.
struct CompetitionRulesConfiguration: Equatable, Codable {
    var numberOfPeriods: Int
    var periodDurationsSeconds: [Int] // allows periods of different duration
    var halftimeDurationSeconds: Int
    var timeoutDurationSeconds: Int
    var timeoutsPerTeamPerHalf: Int
    var playersOnField: Int

    /// Standard Futsal 2x20 minutes backward-compatible regulation
    static let standardFutsal = CompetitionRulesConfiguration(
        numberOfPeriods: 2,
        periodDurationsSeconds: [20 * 60, 20 * 60],
        halftimeDurationSeconds: 5 * 60,
        timeoutDurationSeconds: 60,
        timeoutsPerTeamPerHalf: 1,
        playersOnField: 5
    )

    var primaryPeriodDurationSeconds: Int {
        periodDurationsSeconds.first ?? 20 * 60
    }
}
