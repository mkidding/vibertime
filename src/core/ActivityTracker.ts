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

    public get typingSeconds(): number {
        return StorageManager.instance.getToday().typingSeconds;
    }

    public get reviewingSeconds(): number {
        return StorageManager.instance.getToday().reviewingSeconds;
    }

    public get timeRatio(): number {
        const total = this.typingSeconds + this.reviewingSeconds;
        if (total === 0) return 50; // Default 50/50
        return (this.typingSeconds / total) * 100;
    }

    public debugAddMinutes(typing: number, reviewing: number) {
        StorageManager.instance.updateToday(s => {
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
                Logger.info(`ActivityTracker: Window Focus Changed -> ${state.focused}`);
                // Note: We DO NOT pause immediately on blur. We let natural timeout happen.
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
                        // Check for Revival
                        if (this._zombieStartTimestamp) {
                            const deadTime = Date.now() - this._zombieStartTimestamp;
                            if (deadTime < ActivityTracker.ZOMBIE_REVIVAL_WINDOW_MS) {
                                // REVIVAL!
                                const secondsAdded = Math.floor(deadTime / 1000);
                                if (secondsAdded > 0) {
                                    StorageManager.instance.updateToday(s => {
                                        s.activeSeconds += secondsAdded;
                                        s.reviewingSeconds += secondsAdded;
                                    });
                                    Logger.info(`ActivityTracker: ZOMBIE REVIVAL! Retroactively added ${secondsAdded}s of observation time.`);
                                    vscode.window.setStatusBarMessage(`$(pulse) Viber Time: Detected AI Wait (+${secondsAdded}s)`, 3000);
                                }
                            }
                            this._zombieStartTimestamp = null; // Reset after revival
                        }
                    }
                }
            })
        );


        // 3. Main Activity Loop (1s Tick)
        this._trackingInterval = setInterval(() => {
            const msSinceInput = InputListener.timeSinceHumanInput;
            const isActive = this._isFocused && (msSinceInput < 30000); // 30s Timeout

            if (isActive) {
                // We are alive.
                this._zombieStartTimestamp = null; // Ensure zombie state is clear

                StorageManager.instance.updateToday(s => {
                    s.activeSeconds++;
                    if (msSinceInput < 2000) {
                        // Typing (Interactive)
                        s.typingSeconds++;
                    } else {
                        // Reviewing (Observing)
                        s.reviewingSeconds++;
                    }
                });
            } else {
                // We are dead (Timeout or Blurred).
                // If we JUST died (zombie start is null), mark the time of death.
                if (!this._zombieStartTimestamp) {
                    this._zombieStartTimestamp = Date.now();
                    Logger.info('ActivityTracker: User Idle/Blurred -> Entered Zombie State (Waiting for AI or Input)');
                }
            }
        }, 1000);

        Logger.info('ActivityTracker started with Interrupt Protocol');
    }

    public populateDummyData() {
        StorageManager.instance.updateToday(s => {
            s.activeSeconds = 7200; // 2 hours
            s.typingSeconds = 2100; // 35 mins
            s.reviewingSeconds = 5100; // 85 mins
        });
        Logger.info('Populated dummy activity data');
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
