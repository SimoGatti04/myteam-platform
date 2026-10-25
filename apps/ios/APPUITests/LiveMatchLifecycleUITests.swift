import XCTest

final class LiveMatchLifecycleUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testActivePausedAndFinalizedMatchSurvivesProcessTermination() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.buttons["ENTRA"].waitForExistence(timeout: 10))
        app.buttons["ENTRA"].tap()

        XCTAssertTrue(app.buttons["Rosa"].waitForExistence(timeout: 10))
        app.buttons["Rosa"].tap()
        let nameField = app.textFields["Nome giocatore"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 10))
        for index in 1...6 {
            nameField.tap()
            nameField.typeText("Synthetic Player \(index)\n")
        }
        app.buttons["Indietro"].tap()

        let setupFormation = app.buttons["IMPOSTA FORMAZIONE"]
        XCTAssertTrue(setupFormation.waitForExistence(timeout: 10))
        setupFormation.tap()
        let selectAll = app.buttons["Seleziona tutti"]
        XCTAssertTrue(selectAll.waitForExistence(timeout: 10))
        selectAll.tap()
        app.buttons["Avanti"].tap()

        for index in 1...5 {
            let player = app.buttons["lineup.player.Synthetic Player \(index)"]
            XCTAssertTrue(player.waitForExistence(timeout: 5), "Missing lineup row for player \(index)")
            player.tap()
        }
        app.buttons["Avanti"].tap()

        let clock = app.staticTexts["live.match-clock"]
        XCTAssertTrue(clock.waitForExistence(timeout: 10), "The confirmed lineup did not open the live match")
        XCTAssertEqual(clock.label, "20:00", "Confirming a lineup must not start the clock")
        let start = app.buttons["AVVIA"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 2.2)
        XCTAssertEqual(clock.label, "20:00", "The first explicit Play action should be required")
        start.tap()
        XCTAssertTrue(app.buttons["PAUSA"].waitForExistence(timeout: 5))

        let firstPlayerStats = app.staticTexts["live.player-stats.Synthetic Player 1"]
        XCTAssertTrue(firstPlayerStats.waitForExistence(timeout: 5))
        let goal = app.buttons.matching(identifier: "⚽ GOL").firstMatch
        XCTAssertTrue(goal.waitForExistence(timeout: 5))
        bringIntoView(goal, in: app)
        goal.tap()
        let assist = app.buttons["Synthetic Player 2"]
        XCTAssertTrue(assist.waitForExistence(timeout: 5))
        assist.tap()
        XCTAssertTrue(firstPlayerStats.waitForExistence(timeout: 5))

        let outgoing = app.buttons.matching(identifier: "ESCE").firstMatch
        XCTAssertTrue(outgoing.waitForExistence(timeout: 5))
        bringIntoView(outgoing, in: app)
        outgoing.tap()
        let incoming = app.buttons["Synthetic Player 6"]
        XCTAssertTrue(incoming.waitForExistence(timeout: 5))
        incoming.tap()

        let playerSixTime = app.staticTexts["live.player-time.Synthetic Player 6"]
        XCTAssertTrue(playerSixTime.waitForExistence(timeout: 5))
        let playerSixTimeAtEntry = playerSixTime.label
        Thread.sleep(forTimeInterval: 3.0)
        let clockBeforeTermination = clock.label
        let playerSixTimeBeforeTermination = seconds(from: playerSixTime.label)
        XCTAssertNotEqual(clockBeforeTermination, "20:00", "The live clock did not advance after Play")
        XCTAssertGreaterThan(seconds(from: playerSixTime.label), seconds(from: playerSixTimeAtEntry), "The substitute did not accrue time after entering")

        app.terminate()
        Thread.sleep(forTimeInterval: 2.0)
        app.launch()
        dismissRecoveryNoticeIfPresent(in: app)

        XCTAssertTrue(clock.waitForExistence(timeout: 10), "Active session was not restored after process termination")
        XCTAssertTrue(app.buttons["PAUSA"].waitForExistence(timeout: 5), "Recovered running match did not remain active")
        XCTAssertTrue(firstPlayerStats.waitForExistence(timeout: 5))
        XCTAssertTrue(firstPlayerStats.label.contains("⚽ 1"), "Scoring event was not restored")
        let secondPlayerStats = app.staticTexts["live.player-stats.Synthetic Player 2"]
        XCTAssertTrue(secondPlayerStats.waitForExistence(timeout: 5))
        XCTAssertTrue(secondPlayerStats.label.contains("A 1"), "Assist was not restored")
        XCTAssertLessThan(
            seconds(from: clock.label),
            seconds(from: clockBeforeTermination),
            "The running match did not account for time across process termination"
        )
        XCTAssertGreaterThanOrEqual(
            seconds(from: playerSixTime.label),
            playerSixTimeBeforeTermination,
            "The substitute's accumulated time was not restored"
        )
        XCTAssertTrue(app.staticTexts["Synthetic Player 6"].waitForExistence(timeout: 5), "Substitute was not restored")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'IN CAMPO'")).firstMatch.exists)

        // A real background/foreground cycle via XCTest's device Home action.
        let playerSixTimeBeforeBackground = seconds(from: playerSixTime.label)
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 2.0)
        app.activate()
        XCTAssertTrue(clock.waitForExistence(timeout: 10))
        let clockAfterBackground = clock.label
        XCTAssertNotEqual(clockAfterBackground, clockBeforeTermination, "Clock did not account for the real background interval")
        XCTAssertGreaterThan(
            seconds(from: playerSixTime.label),
            playerSixTimeBeforeBackground,
            "The player who remained in the field did not accrue time in background"
        )

        app.buttons["PAUSA"].tap()
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5))
        let pausedClock = clock.label
        let pausedPlayerTime = playerSixTime.label
        Thread.sleep(forTimeInterval: 2.2)
        XCTAssertEqual(clock.label, pausedClock, "Game time advanced while paused")
        XCTAssertEqual(playerSixTime.label, pausedPlayerTime, "Player time advanced while paused")

        app.terminate()
        Thread.sleep(forTimeInterval: 2.0)
        app.launch()
        dismissRecoveryNoticeIfPresent(in: app)
        XCTAssertTrue(clock.waitForExistence(timeout: 10), "Paused session was not restored")
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5), "Paused state was not restored")
        let clockAfterPausedRelaunch = clock.label
        Thread.sleep(forTimeInterval: 2.0)
        XCTAssertEqual(clock.label, clockAfterPausedRelaunch, "Paused game time advanced across termination")
        XCTAssertEqual(playerSixTime.label, pausedPlayerTime, "Paused individual time advanced across termination")

        app.buttons["RIPRENDI"].tap()
        XCTAssertTrue(app.buttons["PAUSA"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1.5)
        XCTAssertNotEqual(clock.label, clockAfterPausedRelaunch, "Explicit resume did not restart game time")

        let finish = app.buttons["FINE PARTITA"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
        bringIntoView(finish, in: app)
        finish.tap()
        XCTAssertTrue(app.alerts["Terminare la partita?"].waitForExistence(timeout: 5))
        app.alerts.buttons["Salva e termina"].tap()
        XCTAssertTrue(app.buttons["STORICO"].waitForExistence(timeout: 10), "Finalized match did not return to the live screen")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["ENTRA"].waitForExistence(timeout: 10), "Finalized match unexpectedly relaunched as a recoverable live session")
        app.buttons["ENTRA"].tap()
        let historyEntry = app.buttons["STORICO PARTITE"]
        XCTAssertTrue(historyEntry.waitForExistence(timeout: 10))
        historyEntry.tap()
        let matchRecord = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Partita'")).firstMatch
        XCTAssertTrue(matchRecord.waitForExistence(timeout: 10), "Finalized record is missing from history")
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Partita'")).count, 1, "History contains a duplicate record")
        matchRecord.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Synthetic Player 1'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Assist 1'")).firstMatch.exists)
    }

    @MainActor
    private func bringIntoView(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 where !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, "Element is not hittable: \(element.identifier), label=\(element.label)")
    }

    private func seconds(from clock: String) -> Int {
        let components = clock.split(separator: ":").compactMap { Int($0) }
        guard components.count == 2 else { return 0 }
        return components[0] * 60 + components[1]
    }

    @MainActor
    private func dismissRecoveryNoticeIfPresent(in app: XCUIApplication) {
        let recoveryNotice = app.alerts["Partita recuperata"]
        if recoveryNotice.waitForExistence(timeout: 3) {
            recoveryNotice.buttons["OK"].tap()
        }
    }
}
