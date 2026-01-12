import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { Logger } from '../utils/Logger';
import { ActivityTracker } from './ActivityTracker';

export class NotificationManager {
    private static _instance: NotificationManager;
    private _checkInterval: NodeJS.Timeout | undefined;
    private _snoozedUntil: number = 0;
    private _softNudgeFired: boolean = false;
    private _debugTimeOffset: number = 0;

    private constructor() {
        this.startScheduler();
        this.setupConfigListener();
    }

    public static get instance(): NotificationManager {
        if (!this._instance) {
            this._instance = new NotificationManager();
        }
        return this._instance;
    }

    public snooze(minutes: number) {
        this._snoozedUntil = this.now().getTime() + (minutes * 60000);
        vscode.window.showInformationMessage(`Viber Time: Snoozed for ${minutes} minutes.`);
    }

    public isSnoozed(): boolean {
        return this.now().getTime() < this._snoozedUntil;
    }

    public reset() {
        this._snoozedUntil = 0;
        this._softNudgeFired = false;
    }

    public debugSetTime(targetTime: string) {
        const parts = targetTime.split(':').map(Number);
        const h = parts[0];
        const m = parts[1];
        const s = parts.length > 2 ? parts[2] : 0;

        const targetDate = new Date();
        targetDate.setHours(h, m, s, 0);
        this._debugTimeOffset = targetDate.getTime() - Date.now();
        Logger.info(`Debug: Time travel enabled. Simulated time: ${this.now().toLocaleTimeString()}`);
    }

    private now(): Date {
        return new Date(Date.now() + this._debugTimeOffset);
    }

    public getSimulatedTime(): number {
        return this.now().getTime();
    }

    private startScheduler() {
        // Check every minute
        this._checkInterval = setInterval(() => {
            this.checkTime();
        }, 1000); // Check every second for precision
    }

    private setupConfigListener() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vibertime')) {
                this.checkTime();
            }
        });
    }

    public checkTime() {
        // We use the centralized getter to determine the EXACT target timestamp
        const now = this.now();
        const targetMs = this.getTargetBedtimeTimestamp();

        // Diff in milliseconds
        const diffMs = targetMs - now.getTime();

        // EMPTY CHAIR RULE: Suppress notifications if user is AFK
        const isUserPresent = ActivityTracker.instance.isUserPresent;

        // AMBUSH ON RETURN: If user was idle and just came back, trigger pending notifications
        if (isUserPresent && ActivityTracker.instance.wasIdle) {
            // User just returned! Check if we need to ambush them
            if (diffMs <= 0) {
                // EXPIRED: Show hard stop immediately
                ActivityTracker.instance.clearWasIdle();
                this.triggerHardStop();
                return;
            } else if (diffMs <= 5 * 60 * 1000 && !this._softNudgeFired) {
                // DANGER ZONE (last 5 min): Show soft nudge immediately
                this._softNudgeFired = true;
                vscode.window.showWarningMessage(`⚠️ Viber Time: You're in the Danger Zone! Less than 5 minutes until Bedtime!`);
            }
            // Don't clear wasIdle here - let ActivityTracker handle it on next tick
        }

        // If user is NOT present, skip all automatic notifications
        if (!isUserPresent) {
            return; // Empty Chair - don't notify an absent user
        }

        // Hard Stop (within 1 second of bedtime or overdue)
        if (diffMs <= -2000 && diffMs > -60000) { // Grace Buffer: Wait 2s past zero.
            if (Math.abs(diffMs + 2000) < 1500) { // Trigger window shifted by 2s
                this.triggerHardStop();
                return;
            }
        }

        // Soft Nudge
        const nudgeMinutes = ConfigManager.softNudgeMinutes;
        const nudgeMs = nudgeMinutes * 60 * 1000;
        if (Math.abs(diffMs - nudgeMs) < 1500 && !this._softNudgeFired) {
            this._softNudgeFired = true;
            Logger.warn(`Soft nudge triggered: ${nudgeMinutes} minutes until bedtime`);
            vscode.window.showWarningMessage(`⚠️ Viber Time: ${nudgeMinutes} minutes until Bedtime!`);
        }

        // Reset soft nudge flag
        if (diffMs > nudgeMs + 60000) {
            this._softNudgeFired = false;
        }
    }

    public triggerSoftNudge() {
        Logger.warn('Soft nudge manually triggered from debug panel');
        const nudgeMinutes = ConfigManager.softNudgeMinutes;
        vscode.window.showWarningMessage(`⚠️ Viber Time: ${nudgeMinutes} minutes until Bedtime!`);
    }

    private _isHardStopActive = false;

    public triggerHardStop() {
        if (this._isHardStopActive) return; // Prevent Stacking

        this._isHardStopActive = true;
        Logger.warn('HARD STOP triggered - Bedtime exceeded!');
        const autoSnooze = ConfigManager.autoSnoozeMinutes;
        const targetBedtimeMs = this.getTargetBedtimeTimestamp();

        vscode.window.showErrorMessage(
            "🛏️ VIBER TIME: BEDTIME EXCEEDED. GO TO SLEEP!",
            { modal: true },
            "Start New Day ☀️",
            "Snooze 30m",
            "Snooze 1h",
            "Snooze 2h"
        ).then(selection => {
            this._isHardStopActive = false; // Release Lock

            // Handle "Start New Day" button click
            if (selection === "Start New Day ☀️") {
                this.executeNewDayReset("Rise and grind! ☕ Stats reset.");
                return;
            }

            // Handle Snooze button clicks - with guard validation
            if (selection === "Snooze 30m" || selection === "Snooze 1h" || selection === "Snooze 2h") {
                const snoozeResult = ActivityTracker.instance.handleSnooze(targetBedtimeMs);

                // CRITICAL: If stale/morning after, reset instead of snoozing
                if (!snoozeResult.success && snoozeResult.reason === 'STALE_RESET') {
                    this.executeNewDayReset("Good morning! ☀️ Stats reset for the new day.");
                    return;
                }

                // Valid snooze window - proceed
                if (snoozeResult.success) {
                    if (selection === "Snooze 30m") {
                        this.snooze(30);
                    } else if (selection === "Snooze 1h") {
                        this.snooze(60);
                    } else if (selection === "Snooze 2h") {
                        this.snooze(120);
                    }
                    return;
                }

                // TOO_EARLY case - silently ignore (shouldn't happen normally)
                Logger.warn('Snooze ignored: TOO_EARLY');
                return;
            }

            // User dismissed without selecting - Auto-Snooze per spec (but also check guard)
            const autoSnoozeResult = ActivityTracker.instance.handleSnooze(targetBedtimeMs);
            if (!autoSnoozeResult.success && autoSnoozeResult.reason === 'STALE_RESET') {
                this.executeNewDayReset("Good morning! ☀️ Stats reset for the new day.");
                return;
            }
            if (autoSnoozeResult.success) {
                Logger.info(`User dismissed - applying auto-snooze of ${autoSnooze} minutes`);
                this.snooze(autoSnooze);
            }
        });

        // Open dashboard
        vscode.commands.executeCommand('vibertime.showDashboard');
    }

    /**
     * Executes the "New Day" reset: clears stats, hides snooze UI, shows message.
     */
    private executeNewDayReset(message: string): void {
        // Reset all daily stats
        ActivityTracker.instance.resetForNewDay();

        // Reset notification state (clear snooze)
        this.reset();

        // Notify webview to hide any snooze-related UI
        // This is done via command since we don't have direct panel access here
        vscode.commands.executeCommand('vibertime.hideSnoozeUI');

        // Show friendly message
        vscode.window.showInformationMessage(message);
        Logger.info(`New Day Reset executed: ${message}`);
    }

    public getTargetBedtimeTimestamp(): number {
        if (this._snoozedUntil > 0) {
            return this._snoozedUntil;
        }

        const now = this.now();
        const bedtime = ConfigManager.bedtime;
        const dayStartHour = ConfigManager.dayStartHour;

        const [bedH, bedM] = bedtime.split(':').map(Number);

        // Session Logic:
        // A "Day" runs from [Today dayStartHour] to [Tomorrow dayStartHour].
        // If we are currently BEFORE dayStartHour (e.g. 3AM), we belong to "Yesterday's" session.

        const sessionDate = new Date(now.getTime());
        if (now.getHours() < dayStartHour) {
            sessionDate.setDate(sessionDate.getDate() - 1);
        }

        // Calculate Target relative to Session Date
        const targetDate = new Date(sessionDate.getTime());
        targetDate.setHours(bedH, bedM, 0, 0);

        // Handle "Next Day" Bedtimes (e.g. Bedtime is 1AM, Session start was 4AM previous day)
        // If Bedtime Hour < Start Hour, it implies the Bedtime is on the following calendar day of the session.
        if (bedH < dayStartHour) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        return targetDate.getTime();
    }

    public getTimeUntilBedtime(): number {
        const targetMs = this.getTargetBedtimeTimestamp();
        return Math.round((targetMs - this.now().getTime()) / 60000);
    }

    public dispose() {
        if (this._checkInterval) clearInterval(this._checkInterval);
    }
}
