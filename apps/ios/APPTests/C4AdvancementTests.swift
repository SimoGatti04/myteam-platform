import XCTest
@testable import APP

final class C4AdvancementTests: XCTestCase {

    func testTeamBrandProfileDefaultsMatchMapi() {
        let brand = TeamBrandProfile.mapiDefault
        XCTAssertEqual(brand.teamName, "MAPI GROUP")
        XCTAssertEqual(brand.shortName, "MAPI")
        XCTAssertEqual(brand.primaryColorHex, "#4A3B4E")
        XCTAssertEqual(brand.secondaryColorHex, "#7B6680")
        XCTAssertEqual(brand.accentColorHex, "#6B7A54")
        XCTAssertEqual(brand.backgroundColorHex, "#EFECE8")
        XCTAssertEqual(brand.logoAssetName, "WelcomeLogo")
        XCTAssertEqual(brand.welcomeBackgroundAssetName, "WelcomeBackground")
        XCTAssertEqual(brand.footerAssetName, "FooterGeese")
    }

    func testTeamBrandProfileCodableRoundTrip() throws {
        let original = TeamBrandProfile(
            teamName: "Test Club",
            shortName: "TC",
            primaryColorHex: "#112233",
            secondaryColorHex: "#445566",
            accentColorHex: "#778899",
            backgroundColorHex: "#FFFFFF",
            logoAssetName: "CustomLogo",
            welcomeBackgroundAssetName: "CustomBg",
            footerAssetName: "CustomFooter"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(TeamBrandProfile.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testCompetitionRulesConfigurationDefaults() {
        let standard = CompetitionRulesConfiguration.standardFutsal
        XCTAssertEqual(standard.numberOfPeriods, 2)
        XCTAssertEqual(standard.periodDurationsSeconds, [1200, 1200])
        XCTAssertEqual(standard.halftimeDurationSeconds, 300)
        XCTAssertEqual(standard.timeoutDurationSeconds, 60)
        XCTAssertEqual(standard.timeoutsPerTeamPerHalf, 1)
        XCTAssertEqual(standard.playersOnField, 5)
        XCTAssertEqual(standard.primaryPeriodDurationSeconds, 1200)
    }

    func testCompetitionRulesConfigurationCustomPeriods() throws {
        let custom = CompetitionRulesConfiguration(
            numberOfPeriods: 3,
            periodDurationsSeconds: [900, 900, 900], // 3 x 15 min
            halftimeDurationSeconds: 180,
            timeoutDurationSeconds: 60,
            timeoutsPerTeamPerHalf: 1,
            playersOnField: 5
        )
        let data = try JSONEncoder().encode(custom)
        let decoded = try JSONDecoder().decode(CompetitionRulesConfiguration.self, from: data)
        XCTAssertEqual(decoded, custom)
        XCTAssertEqual(decoded.numberOfPeriods, 3)
    }

    func testTacticalPositionsAndCoordinates() {
        XCTAssertEqual(TacticalPosition.allCases.count, 5)
        let gk = TacticalPosition.goalkeeper
        XCTAssertEqual(gk.rawValue, "POR")
        XCTAssertEqual(gk.displayName, "Portiere")
        XCTAssertEqual(gk.defaultPitchCoordinates.x, 0.50)
        XCTAssertEqual(gk.defaultPitchCoordinates.y, 0.14)

        let defender = TacticalPosition.defender
        XCTAssertEqual(defender.rawValue, "DIF")

        let pivot = TacticalPosition.pivot
        XCTAssertEqual(pivot.rawValue, "PIV")
    }

    func testTacticalPitchLayoutAssignments() {
        var layout = TacticalPitchLayout()
        let player1 = UUID()
        let player2 = UUID()

        // Fallback index assignment
        XCTAssertEqual(layout.position(for: player1, fallbackIndex: 0), .goalkeeper)
        XCTAssertEqual(layout.position(for: player2, fallbackIndex: 1), .defender)

        // Explicit assignment override
        layout.assign(position: .pivot, to: player1)
        XCTAssertEqual(layout.position(for: player1, fallbackIndex: 0), .pivot)
    }

    func testAdvancedGoalDetailsDefaults() {
        let details = AdvancedGoalDetails()
        XCTAssertEqual(details.situation, .openPlay)
        XCTAssertEqual(details.bodyPart, .rightFoot)
        XCTAssertEqual(details.dynamics, .direct)
        XCTAssertFalse(details.isOwnGoal)
        XCTAssertNil(details.targetX)
        XCTAssertNil(details.targetY)
    }

    func testAdvancedGoalDetailsCodable() throws {
        var details = AdvancedGoalDetails()
        details.situation = .penalty
        details.bodyPart = .leftFoot
        details.dynamics = .direct
        details.targetX = 0.85
        details.targetY = 0.20

        let data = try JSONEncoder().encode(details)
        let decoded = try JSONDecoder().decode(AdvancedGoalDetails.self, from: data)
        XCTAssertEqual(decoded, details)
        XCTAssertEqual(decoded.targetX, 0.85)
        XCTAssertEqual(decoded.targetY, 0.20)
    }
}
