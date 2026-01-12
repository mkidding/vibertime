import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { InputListener } from './InputListener';
import { ConfigManager } from '../config/ConfigManager';
import { StorageManager } from './StorageManager';

export class ActivityTracker {
    private static _instance: ActivityTracker;
    private static _context: vscode.ExtensionContext;
    private _trackingInterval: NodeJS.Timeout | undefined;
    private _disposables: vscode.Disposable[] = [];

    // State
    private _isFocused: boolean = true;

    // "Zombie" Timer State (Retroactive Revival)
    // When the timer "dies" (timeouts), we record the time of death.
    // If an AI Resurrection (code generation) happens shortly after, we
    // retroactively count the "dead" time as "Observation/Reviewing".
    private _zombieStartTimestamp: number | null = null;
    private static readonly ZOMBIE_REVIVAL_WINDOW_MS = 300000; // 5 Minutes

    // Smart Gap State
    private _lastActiveTimestamp: number = Date.now();
    private _previousState: 'edit' | 'review' = 'review';
    private _wasIdle: boolean = false; // For "Ambush on Return"

    // Smart Gap Constants
    private static readonly PRESENCE_THRESHOLD_MS = 120000;   // 2 min - user is "present"
    private static readonly GAP_THINKING_MS = 60000;          // < 60s = thinking bridge
    private static readonly GAP_READING_MS = 120000;          // 60-120s = reading
    private static readonly GAP_IDLE_CAP_SECONDS = 30;        // > 120s = cap at 30s

    private constructor() {
        this.startTracking();
    }

    public static init(context: vscode.ExtensionContext): ActivityTracker {
        this._context = context;
        return this.instance;
    }

    public static get instance(): ActivityTracker {
        if (!this._instance) {
            this._instance = new ActivityTracker();
        }
        return this._instance;
    }

    public get activeSeconds(): number {
        return StorageManager.instance.getToday().activeSeconds;
    }

    public set activeSeconds(value: number) {
        StorageManager.instance.updateToday(s => s.activeSeconds = value);
    }

    // New Human Time getters (Smart Gap)
    public get humanEditSeconds(): number {
        return StorageManager.instance.getToday().humanEditSeconds;
    }

    public get humanReviewSeconds(): number {
        return StorageManager.instance.getToday().humanReviewSeconds;
    }

    // Legacy getters (for backward compatibility)
    public get typingSeconds(): number {
        return StorageManager.instance.getToday().typingSeconds;
    }

    public get reviewingSeconds(): number {
        return StorageManager.instance.getToday().reviewingSeconds;
    }

    // Time ratio now uses humanEditSeconds / humanReviewSeconds
    public get timeRatio(): number {
        const total = this.humanEditSeconds + this.humanReviewSeconds;
        if (total === 0) return 50; // Default 50/50
        return (this.humanEditSeconds / total) * 100;
    }

    public debugAddMinutes(typing: number, reviewing: number) {
        StorageManager.instance.updateToday(s => {
            // Update new fields
            s.humanEditSeconds += typing * 60;
            s.humanReviewSeconds += reviewing * 60;
            // Also update legacy fields for backward compat
            s.typingSeconds += typing * 60;
            s.reviewingSeconds += reviewing * 60;
            s.activeSeconds += (typing + reviewing) * 60;
        });
    }

    // Classic Idle Logic
    public get isCurrentlyActive(): boolean {
        // Active if focused AND recent activity (within 30s)
        const isRecent = Date.now() - this._lastActivityTime < 30000;
        return this._isFocused && isRecent;
    }

    // Presence Detection (Empty Chair Rule)
    // User is "present" if they had input within 2 minutes
    public get isUserPresent(): boolean {
        return InputListener.timeSinceHumanInput < ActivityTracker.PRESENCE_THRESHOLD_MS;
    }

    // For "Ambush on Return" logic
    public get wasIdle(): boolean {
        return this._wasIdle;
    }

    // Clear the wasIdle flag after handling return
    public clearWasIdle(): void {
        this._wasIdle = false;
    }

    // Tracks last "Alive" signal (Input OR Focus)
    private get _lastActivityTime(): number {
        const msSinceInput = InputListener.timeSinceHumanInput;
        return Date.now() - msSinceInput;
    }

    private startTracking() {
        // 1. Window Focus Listener
        this._isFocused = vscode.window.state.focused;
        this._disposables.push(
            vscode.window.onDidChangeWindowState(state => {
                this._isFocused = state.focused;
            })
        );

        // 2. AI Revival Listener (Document Changes without Human Input)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                const msSinceHuman = InputListener.timeSinceHumanInput;
                const isHumanInput = msSinceHuman < 1000;

                if (e.contentChanges.length > 0) {
                    if (isHumanInput) {
                        // Human broke the trance. Zombie is dead for good.
                        this._zombieStartTimestamp = null;
                    } else {
                        // AI / Automated Edit
                        // Check for Zombie Revival (Gap < 5min)
                        if (this._zombieStartTimestamp) {
                            const deadTime = Date.now() - this._zombieStartTimestamp;
                            if (deadTime < ActivityTracker.ZOMBIE_REVIVAL_WINDOW_MS) {
                                // REVIVAL! Credit ENTIRE gap to Review (user was waiting for AI)
                                const secondsAdded = Math.floor(deadTime / 1000);
                                if (secondsAdded > 0) {
                                    StorageManager.instance.updateToday(s => {
                                        s.activeSeconds += secondsAdded;
                                        s.humanReviewSeconds += secondsAdded; // Smart Gap field
                                        s.reviewingSeconds += secondsAdded; // Legacy
                                    });
                                    vscode.window.setStatusBarMessage(`$(pulse) Viber Time: Detected AI Wait (+${secondsAdded}s)`, 3000);
                                }
                            }
                            this._zombieStartTimestamp = null; // Reset after revival
                        }
                    }
                }
            })
        );


        // 3. Main Activity Loop (1s Tick) with Smart Gap
        this._trackingInterval = setInterval(() => {
            const msSinceInput = InputListener.timeSinceHumanInput;
            const isActive = this._isFocused && (msSinceInput < 30000); // 30s Timeout
            const now = Date.now();

            if (isActive) {
                // We are alive.
                this._zombieStartTimestamp = null; // Ensure zombie state is clear

                // SMART GAP: If returning from idle, calculate retroactive credit
                if (this._wasIdle) {
                    const gap = now - this._lastActiveTimestamp;
                    let retroSeconds = 0;

                    if (gap < ActivityTracker.GAP_THINKING_MS) {
                        // Gap < 60s: Credit to Previous State (thinking bridge)
                        retroSeconds = Math.floor(gap / 1000);
                        StorageManager.instance.updateToday(s => {
                            s.activeSeconds += retroSeconds;
                            if (this._previousState === 'edit') {
                                s.humanEditSeconds += retroSeconds;
                                s.typingSeconds += retroSeconds; // Legacy
                            } else {
                                s.humanReviewSeconds += retroSeconds;
                                s.reviewingSeconds += retroSeconds; // Legacy
                            }
                        });
                    } else if (gap < ActivityTracker.GAP_READING_MS) {
                        // Gap 60-120s: Credit to Review (reading)
                        retroSeconds = Math.floor(gap / 1000);
                        StorageManager.instance.updateToday(s => {
                            s.activeSeconds += retroSeconds;
                            s.humanReviewSeconds += retroSeconds;
                            s.reviewingSeconds += retroSeconds; // Legacy
                        });
                    } else {
                        // Gap > 120s: Cap at 30s Review
                        retroSeconds = ActivityTracker.GAP_IDLE_CAP_SECONDS;
                        StorageManager.instance.updateToday(s => {
                            s.activeSeconds += retroSeconds;
                            s.humanReviewSeconds += retroSeconds;
                            s.reviewingSeconds += retroSeconds; // Legacy
                        });
                    }

                    this._wasIdle = false;
                }

                // Regular live tracking (1 second at a time)
                StorageManager.instance.updateToday(s => {
                    s.activeSeconds++;
                    if (msSinceInput < 2000) {
                        // Editing (Interactive - keyboard input)
                        s.humanEditSeconds++;
                        s.typingSeconds++; // Legacy
                        this._previousState = 'edit';
                    } else {
                        // Reviewing (Observing - reading/thinking)
                        s.humanReviewSeconds++;
                        s.reviewingSeconds++; // Legacy
                        this._previousState = 'review';
                    }
                });

                this._lastActiveTimestamp = now;

            } else {
                // We are dead (Timeout or Blurred).
                // Mark as idle for "Ambush on Return"
                if (!this._wasIdle) {
                    this._wasIdle = true;
                }
                // If we JUST died (zombie start is null), mark the time of death.
                if (!this._zombieStartTimestamp) {
                    this._zombieStartTimestamp = Date.now();
                }
            }
        }, 1000);

        Logger.info('ActivityTracker started');
    }

    public populateDummyData() {
        StorageManager.instance.updateToday(s => {
            s.activeSeconds = 7200; // 2 hours
            s.typingSeconds = 2100; // 35 mins
            s.reviewingSeconds = 5100; // 85 mins
        });
        Logger.info('Populated dummy activity data');
    }

    // =====================================================
    // MORNING AFTER DEFENSE - Snooze Guard Logic
    // =====================================================

    public static readonly EARLY_BUFFER_MS = 30 * 60 * 1000;  // 30 minutes before bedtime
    public static readonly LATE_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours after bedtime (max snooze)

    public handleSnooze(targetBedtimeMs: number): { success: boolean; reason?: 'TOO_EARLY' | 'STALE_RESET' } {
        const now = Date.now();

        // Guard 1: Too Early - User clicked snooze way before bedtime (probably stale UI)
        if (now < (targetBedtimeMs - ActivityTracker.EARLY_BUFFER_MS)) {
            Logger.warn(`Snooze Guard: TOO_EARLY. Now: ${new Date(now).toLocaleTimeString()}, Target: ${new Date(targetBedtimeMs).toLocaleTimeString()}`);
            return { success: false, reason: 'TOO_EARLY' };
        }

        // Guard 2: Stale/Next Day - User clicking snooze the morning after (more than 2h past bedtime)
        if (now > (targetBedtimeMs + ActivityTracker.LATE_BUFFER_MS)) {
            Logger.warn(`Snooze Guard: STALE_RESET. Now: ${new Date(now).toLocaleTimeString()}, Target: ${new Date(targetBedtimeMs).toLocaleTimeString()}`);
            return { success: false, reason: 'STALE_RESET' };
        }

        // Within valid window - allow snooze
        Logger.info(`Snooze Guard: ALLOWED. Within valid window.`);
        return { success: true };
    }

    /**
     * Complete daily reset: Clears all activity stats AND slot machine state.
     * Called when user explicitly starts a new day or when "morning after" is detected.
     */
    public resetForNewDay(): void {
        StorageManager.instance.updateToday(s => {
            // Reset activity tracking
            s.activeSeconds = 0;
            s.humanEditSeconds = 0;
            s.humanReviewSeconds = 0;
            // Legacy time fields
            s.typingSeconds = 0;
            s.reviewingSeconds = 0;

            // Reset Granular Matrix: 6 primary buckets
            s.humanAddedLines = 0;
            s.humanRefactoredLines = 0;
            s.aiAddedLines = 0;
            s.aiRefactoredLines = 0;
            s.externalAddedLines = 0;
            s.externalRefactoredLines = 0;
            s.stormEvents = 0;

            // Reset legacy code metrics
            s.humanTypedLines = 0;
            s.aiGeneratedLines = 0;
            s.aiEditedLines = 0;
            s.humanChars = 0;
            s.aiChars = 0;
            s.refactorChars = 0;

            // Reset slot machine state
            s.slotState = {
                runsRemaining: 1,
                currentEnergy: 3,
                currentScore: 0,
                dailyHighScore: 0,
                bestAnalysis: null
            };
        });
        Logger.info('ActivityTracker: Full daily reset complete (stats + slot machine).');
    }

    public dispose() {
        if (this._trackingInterval) clearInterval(this._trackingInterval);
        // if (this._interruptionTimeout) clearTimeout(this._interruptionTimeout);
        // if (this._terminalVelocityInterval) clearInterval(this._terminalVelocityInterval);
        this._disposables.forEach(d => d.dispose());
        StorageManager.instance.requestSave();
    }

    // Note: Implicit "New Day" is handled by StorageManager on getToday() rollover.
    // Ideally we hook that event.
    // For now, let's just expose a method if the plan requires it, or hook into the constructor?
    // User asked to hook into `startNewDay`. I don't see `startNewDay` in `ActivityTracker.ts`.
    // I will add a check in the main loop or similar if day changes.
    // Actually, StorageManager handles the rollover.
    // Let's implement `checkForNewDay` logic in the loop or simply add the method if it's meant to be called externally.
    // BUT the prompt says "Hook checkForUpdates... into ActivityTracker.startNewDay()".
    // Since `startNewDay` doesn't exist, I should probably CREATE it or find where rollover happens.
    // Scanning StorageManager might reveal it.
    // I will postpone this specific edits until I check StorageManager or just add it to the interval loop roughly.
    // Actually, I'll add a simple day tracker in the loop.
}
