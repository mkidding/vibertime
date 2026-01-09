import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { Logger } from '../utils/Logger';

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
        Logger.info(`Snoozed for ${minutes} minutes until ${new Date(this._snoozedUntil).toLocaleTimeString()}`);
        vscode.window.showInformationMessage(`Viber Time: Snoozed for ${minutes} minutes.`);
    }

    public isSnoozed(): boolean {
        return this.now().getTime() < this._snoozedUntil;
    }

    public reset() {
        this._snoozedUntil = 0;
        this._softNudgeFired = false;
        Logger.info('NotificationManager state reset (Snooze cleared)');
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
        Logger.info('Notification scheduler started');
    }

    private setupConfigListener() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vibertime')) {
                Logger.info('Config changed - forcing time check');
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
        const diffMins = Math.floor(diffMs / 60000); // For soft nudge comparison

        // Hard Stop (within 1 second of bedtime or overdue)
        // logic: if diffMs is <= 0, we are DONE.
        // But we want to avoid spamming. We need a flag?
        // Actually, if we are snooze-able, we show the modal.
        // If we are snoozed, getTargetBedtimeTimestamp returns the EXTENDED time.
        // So checking <= 0 is correct for "Effective Bedtime".

        // To prevent spamming hard stop every second:
        // We only trigger if NOT snoozed (implicit in getTargetBedtimeTimestamp returning future)
        // AND we haven't already triggered for this instance? 
        // The modal blocks interaction.

        // Wait, if snoozed, targetMs IS in the future. So diffMs > 0.
        // If diffMs <= 0, it means we hit the deadline (original or snoozed).
        // So we trigger Hard Stop.

        // Optimization: Don't trigger if deep in the past (e.g. valid "next day" logic might be tricky?)
        // If we represent "Tomorrow's Bedtime", diffMs is huge positive.
        // If we just missed bedtime, diffMs is small negative.
        // Let's say we trigger if diffMs <= 0 and diffMs > -5000 (within 5 seconds of expiry).
        // But if user was away, they might miss it.
        // Let's stick to the previous logic but with ms precision.

        if (diffMs <= -2000 && diffMs > -60000) { // Grace Buffer: Wait 2s past zero.
            // Check if we already handled this "session" of expiry?
            // Existing logic was "diffMins <= 0 && diffMins > -5".

            // We need to be careful not to spam.
            // But triggerHardStop shows a modal.
            // Let's rely on standard debounce or just the fact that it's a modal?
            // Ideally we check a flag "isHardStopActive"?
            // For now, let's keep it simple but precise.
            // Throttle: only trigger every 30s if persistent?

            // Actually, existing logic relied on 60s interval.
            // Now we rely on 1s interval.
            // We MUST allow one-shot trigger.

            // Let's use a simplified check:
            // If we are mostly just checking time:
            if (Math.abs(diffMs + 2000) < 1500) { // Trigger window shifted by 2s
                Logger.info(`[DEBUG_TRAP] Triggering Hard Stop. Raw MS: ${diffMs}`);
                this.triggerHardStop();
                return;
            }
        }

        // Soft Nudge
        const nudgeMinutes = ConfigManager.softNudgeMinutes;
        // Exact minute boundary check: e.g. if nudge is 30m.
        // We want to trigger when diffMs is approx 30 * 60 * 1000.
        // Range: [29m59s ... 30m01s]
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

        vscode.window.showErrorMessage(
            "🛏️ VIBER TIME: BEDTIME EXCEEDED. GO TO SLEEP!",
            { modal: true },
            "Snooze 30m",
            "Snooze 1h",
            "Snooze 2h"
        ).then(selection => {
            this._isHardStopActive = false; // Release Lock

            if (selection === "Snooze 30m") {
                this.snooze(30);
            } else if (selection === "Snooze 1h") {
                this.snooze(60);
            } else if (selection === "Snooze 2h") {
                this.snooze(120);
            } else {
                // User dismissed without selecting - Auto-Snooze per spec
                Logger.info(`User dismissed - applying auto-snooze of ${autoSnooze} minutes`);
                this.snooze(autoSnooze);
            }
        });

        // Open dashboard
        vscode.commands.executeCommand('vibertime.showDashboard');
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
