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

        // Return to the home screen after inspecting the saved record, then prove
        // that a distinct match can be started without replacing that history.
        app.buttons["Indietro"].tap()
        app.buttons["Indietro"].tap()
        let newMatchSetup = app.buttons["IMPOSTA FORMAZIONE"]
        XCTAssertTrue(newMatchSetup.waitForExistence(timeout: 10))
        newMatchSetup.tap()
        let selectAllForNewMatch = app.buttons["Seleziona tutti"]
        XCTAssertTrue(selectAllForNewMatch.waitForExistence(timeout: 5))
        selectAllForNewMatch.tap()
        app.buttons["Avanti"].tap()
        for index in 1...5 {
            let player = app.buttons["lineup.player.Synthetic Player \(index)"]
            XCTAssertTrue(player.waitForExistence(timeout: 5), "Missing new lineup row for player \(index)")
            player.tap()
        }
        app.buttons["Avanti"].tap()
        XCTAssertTrue(clock.waitForExistence(timeout: 10), "A new match did not open after finalization")
        XCTAssertEqual(clock.label, "20:00", "A new match did not start from a fresh clock")
        app.buttons["AVVIA"].tap()
        XCTAssertTrue(app.buttons["PAUSA"].waitForExistence(timeout: 5))
        app.buttons["PAUSA"].tap()
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5))

        let historyFromNewMatch = app.buttons["STORICO"]
        bringIntoView(historyFromNewMatch, in: app)
        historyFromNewMatch.tap()
        let recordsAfterNewMatch = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Partita'"))
        XCTAssertEqual(recordsAfterNewMatch.count, 1, "Starting a new match changed or duplicated the saved history")
        recordsAfterNewMatch.firstMatch.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Synthetic Player 1'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Assist 1'")).firstMatch.exists)
        app.buttons["Indietro"].tap()
        app.buttons["Indietro"].tap()
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5), "The new paused match was not preserved after visiting history")
        app.terminate()
    }

    @MainActor
    func testTemporallyUncertainRecoveryCanBeCorrectedAndSurvivesRelaunch() throws {
        let app = XCUIApplication()
        app.launch()

        let recoveryHeading = app.staticTexts["PARTITA DA RIPRISTINARE"]
        XCTAssertTrue(recoveryHeading.waitForExistence(timeout: 10), "The uncertain session did not open the recovery review")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Recovery Synthetic FC'")).firstMatch.exists, "The opponent was not preserved in the recovery review")
        XCTAssertTrue(
            app.staticTexts["Il dispositivo potrebbe essere stato riavviato; il tempo trascorso non è verificabile automaticamente."].exists,
            "The fixture did not enter the temporal-uncertainty recovery path"
        )
        let recoveryStepper = app.steppers.firstMatch
        XCTAssertTrue(recoveryStepper.waitForExistence(timeout: 5), "The recovery value is not exposed as an adjustable stepper")
        let stepperButtons = recoveryStepper.buttons.allElementsBoundByIndex
        let recoveryControlsAttachment = XCTAttachment(
            string: "Stepper label: \(recoveryStepper.label)\nButtons: \(stepperButtons.map(\.label))\n\(app.debugDescription)"
        )
        recoveryControlsAttachment.name = "Recovery review accessibility controls"
        recoveryControlsAttachment.lifetime = .keepAlways
        XCTContext.runActivity(named: "Inspect bounded recovery controls") { activity in
            activity.add(recoveryControlsAttachment)
        }
        let suggestedValue = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "00:30")
        ).firstMatch
        XCTAssertTrue(suggestedValue.exists, "The suggested gap was not clamped to the 30-second period remainder")
        XCTAssertEqual(stepperButtons.count, 2, "The time stepper did not expose both adjustment controls")
        let incrementButton = recoveryStepper.buttons.matching(
            NSPredicate(format: "identifier == %@", "Increment")
        ).firstMatch
        let decrementButton = recoveryStepper.buttons.matching(
            NSPredicate(format: "identifier == %@", "Decrement")
        ).firstMatch
        XCTAssertTrue(incrementButton.exists, "The recovery stepper increment control is not exposed")
        XCTAssertFalse(incrementButton.isEnabled, "The increment control remained enabled at the period maximum")
        XCTAssertTrue(decrementButton.exists && decrementButton.isEnabled, "The recovery value cannot be corrected downward")
        XCTAssertTrue(app.buttons["RIPRENDI CON QUESTO TEMPO"].exists, "The suggested recovery action is unavailable")
        let correctWithoutTime = app.buttons["RIPRENDI SENZA AGGIUNGERE TEMPO"]
        XCTAssertTrue(correctWithoutTime.exists, "The user cannot correct the suggested recovery time")
        correctWithoutTime.tap()

        dismissRecoveryNoticeIfPresent(in: app)
        let clock = app.staticTexts["live.match-clock"]
        XCTAssertTrue(clock.waitForExistence(timeout: 10), "The corrected recovery did not restore the live match")
        XCTAssertTrue(clock.label.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil, "The recovered clock was not readable: \(clock.label)")
        let correctedRemainingSeconds = seconds(from: clock.label)
        XCTAssertGreaterThanOrEqual(correctedRemainingSeconds, 0, "Recovery produced a negative period remainder")
        XCTAssertLessThanOrEqual(correctedRemainingSeconds, 30, "Recovery exceeded the saved period's 30-second remainder")
        XCTAssertTrue(app.staticTexts["Recovery Synthetic FC"].exists, "The recovered opponent was lost")
        let scorerStats = app.staticTexts["live.player-stats.Synthetic Player 1"]
        let assistStats = app.staticTexts["live.player-stats.Synthetic Player 2"]
        XCTAssertTrue(scorerStats.waitForExistence(timeout: 5))
        XCTAssertTrue(scorerStats.label.contains("⚽ 1"), "The recovered goal event was lost")
        XCTAssertTrue(assistStats.waitForExistence(timeout: 5))
        XCTAssertTrue(assistStats.label.contains("A 1"), "The recovered assist event was lost")
        let starterTime = app.staticTexts["live.player-time.Synthetic Player 1"]
        let substituteTime = app.staticTexts["live.player-time.Synthetic Player 6"]
        XCTAssertTrue(starterTime.waitForExistence(timeout: 5))
        XCTAssertTrue(substituteTime.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(seconds(from: starterTime.label), 0, "The starter's accumulated time was lost")
        XCTAssertEqual(seconds(from: substituteTime.label), 0, "A substitute received time retroactively")

        app.buttons["PAUSA"].tap()
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5))
        let pausedClock = clock.label
        let pausedStarterTime = starterTime.label
        app.terminate()
        app.launch()
        dismissRecoveryNoticeIfPresent(in: app)
        XCTAssertFalse(recoveryHeading.waitForExistence(timeout: 1), "The already-reviewed session requested a second recovery decision")
        XCTAssertTrue(clock.waitForExistence(timeout: 10), "The reviewed session was not restored after the second relaunch")
        XCTAssertTrue(app.buttons["RIPRENDI"].waitForExistence(timeout: 5), "The paused state was not preserved after recovery")
        XCTAssertEqual(clock.label, pausedClock, "Paused game time changed after the recovery decision was saved")
        XCTAssertEqual(starterTime.label, pausedStarterTime, "Player time changed after the recovery decision was saved")
        XCTAssertTrue(scorerStats.label.contains("⚽ 1"), "The recovery decision did not preserve the goal after relaunch")
        XCTAssertTrue(assistStats.label.contains("A 1"), "The recovery decision did not preserve the assist after relaunch")
        app.terminate()
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
