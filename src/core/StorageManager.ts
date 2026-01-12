import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../config/ConfigManager';

export interface SlotState {
    runsRemaining: number;
    currentEnergy: number; // 0-3
    currentScore: number;
    dailyHighScore: number;
    bestAnalysis: {
        category: string;
        percentage: number;
        text: string;
    } | null;
}

export interface DailyStats {
    date: string;

    // Activity - Primary Time Fields (Smart Gap)
    activeSeconds: number;
    humanEditSeconds: number;    // Human editing time (keyboard input)
    humanReviewSeconds: number;  // Human review time (reading/thinking)

    // Legacy Time Fields (kept for backward compatibility)
    typingSeconds: number;
    reviewingSeconds: number;

    // Granular Matrix: SOURCE (Bio/Synth/Ghost) x ACTION (Add/Refactor)
    // These are the 6 primary buckets that get incremented by the tracker
    humanAddedLines: number;       // Bio + Add: Human typing new code
    humanRefactoredLines: number;  // Bio + Refactor: Human modifying existing code
    aiAddedLines: number;          // Synth + Add: AI inserting new code
    aiRefactoredLines: number;     // Synth + Refactor: AI modifying existing code
    externalAddedLines: number;    // Ghost + Add: External insertion (unfocused)
    externalRefactoredLines: number; // Ghost + Refactor: External modification (unfocused)

    // Noise filter counter
    stormEvents: number;

    // Legacy fields (kept for backward compatibility, will be deprecated)
    humanTypedLines: number;
    aiGeneratedLines: number;
    aiEditedLines: number;
    humanChars: number;
    aiChars: number;
    refactorChars: number;

    // Feature State
    slotState: SlotState;
}

export interface History {
    [date: string]: DailyStats;
}

export class StorageManager {
    private static _instance: StorageManager;
    private _historyFile: string;
    private _history: History = {};
    private _debounceTimer: NodeJS.Timeout | undefined;

    private constructor(context: vscode.ExtensionContext) {
        // Use globalStorageUri for persistence across sessions/workspaces
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this._historyFile = path.join(storagePath, 'viber-history.json');
        this.loadHistory();
    }

    public static init(context: vscode.ExtensionContext): StorageManager {
        if (!this._instance) {
            this._instance = new StorageManager(context);
        }
        return this._instance;
    }

    public static get instance(): StorageManager {
        if (!this._instance) {
            throw new Error('StorageManager not initialized');
        }
        return this._instance;
    }

    private loadHistory() {
        try {
            if (fs.existsSync(this._historyFile)) {
                const data = fs.readFileSync(this._historyFile, 'utf8');
                const rawHistory = JSON.parse(data) as History;

                // Schema Hydration: Backfill missing fields for each day's stats
                let needsSave = false;
                for (const date of Object.keys(rawHistory)) {
                    const hydrated = this.hydrateStats(date, rawHistory[date]);
                    if (hydrated !== rawHistory[date]) {
                        rawHistory[date] = hydrated;
                        needsSave = true;
                    }
                }

                this._history = rawHistory;
                Logger.info(`StorageManager: Loaded history from ${this._historyFile}`);

                // Persist hydrated data immediately so schema is updated on disk
                if (needsSave) {
                    Logger.info('StorageManager: Schema migration - backfilling missing fields');
                    this.saveHistory();
                }
            } else {
                Logger.info('StorageManager: No history file found. Starting fresh.');
                this._history = {};
            }
        } catch (e) {
            Logger.error('StorageManager: Failed to load history', e);
            this._history = {};
        }
    }

    /**
     * Schema Hydration: Merge saved stats with defaults to backfill missing fields.
     * This ensures existing users get new fields (like stormEvents) set to 0
     * without losing their existing data (like activeSeconds).
     */
    private hydrateStats(date: string, saved: Partial<DailyStats>): DailyStats {
        const defaults = this.getEmptyStats(date);

        // Deep merge for nested objects like slotState
        const hydrated: DailyStats = {
            ...defaults,
            ...saved,
            // Ensure slotState is properly merged (not just overwritten)
            slotState: {
                ...defaults.slotState,
                ...(saved.slotState || {})
            }
        };

        // Legacy Migration: Map old time fields to new fields if not already set
        // This preserves the user's today progress on upgrade
        if (!saved.humanEditSeconds && saved.typingSeconds) {
            hydrated.humanEditSeconds = saved.typingSeconds;
        }
        if (!saved.humanReviewSeconds && saved.reviewingSeconds) {
            hydrated.humanReviewSeconds = saved.reviewingSeconds;
        }

        return hydrated;
    }

    private saveHistory() {
        try {
            fs.writeFileSync(this._historyFile, JSON.stringify(this._history, null, 2));
            // Logger.info('StorageManager: Saved history'); // Verbose
        } catch (e) {
            Logger.error('StorageManager: Failed to save history', e);
        }
    }

    // Debounced save
    public requestSave() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.saveHistory();
        }, 1000); // Save at most once per second
    }

    public getTodayKey(): string {
        const now = new Date();
        if (now.getHours() < ConfigManager.dayStartHour) {
            now.setDate(now.getDate() - 1);
        }
        return now.toISOString().split('T')[0];
    }

    private getEmptyStats(date: string): DailyStats {
        return {
            date,
            activeSeconds: 0,
            humanEditSeconds: 0,
            humanReviewSeconds: 0,
            // Legacy time fields (for backward compatibility)
            typingSeconds: 0,
            reviewingSeconds: 0,
            // Granular Matrix: 6 primary buckets
            humanAddedLines: 0,
            humanRefactoredLines: 0,
            aiAddedLines: 0,
            aiRefactoredLines: 0,
            externalAddedLines: 0,
            externalRefactoredLines: 0,
            stormEvents: 0,
            // Legacy fields (deprecated)
            humanTypedLines: 0,
            aiGeneratedLines: 0,
            aiEditedLines: 0,
            humanChars: 0,
            aiChars: 0,
            refactorChars: 0,
            slotState: {
                runsRemaining: 1,
                currentEnergy: 3,
                currentScore: 0,
                dailyHighScore: 0,
                bestAnalysis: null
            }
        };
    }

    public getToday(): DailyStats {
        const today = this.getTodayKey();
        if (!this._history[today]) {
            this._history[today] = this.getEmptyStats(today);
            this.requestSave();

            // Hook: New Day Started
            Logger.info('StorageManager: New Day Started. Triggering Update Check...');
            setTimeout(() => {
                const { UpdateManager } = require('./UpdateManager');
                UpdateManager.instance.checkForUpdates(false);
            }, 5000);
        } else {
            // Safety net: Hydrate existing entry in case it was loaded from old schema
            // (This handles edge cases where loadHistory hydration was bypassed)
            this._history[today] = this.hydrateStats(today, this._history[today]);
        }
        return this._history[today];
    }

    public getStats(date: string): DailyStats | undefined {
        return this._history[date];
    }

    public updateToday(updater: (stats: DailyStats) => void) {
        const todayUrl = this.getTodayKey();
        if (!this._history[todayUrl]) {
            this._history[todayUrl] = this.getEmptyStats(todayUrl);
        }
        updater(this._history[todayUrl]);
        this.requestSave();
    }

    // Migration Logic
    public importLegacyData(globalState: vscode.Memento) {
        const savedDate = globalState.get<string>('metrics.date');
        // Only migrate if we have data and it matches 'today' (or close to it)
        // Actually, we just want to rescue meaningful data if our file is empty.

        const todayKey = this.getTodayKey();
        if (Object.keys(this._history).length === 0) {
            Logger.info('StorageManager: Migrating legacy data from globalState...');

            // We'll dump everything into 'today' or the saved date
            const targetDate = savedDate || todayKey;

            const stats = this.getEmptyStats(targetDate);

            stats.humanChars = globalState.get<number>('metrics.humanChars', 0);
            stats.aiChars = globalState.get<number>('metrics.aiChars', 0);
            stats.refactorChars = globalState.get<number>('metrics.refactorChars', 0);

            stats.humanTypedLines = globalState.get<number>('metrics.humanTypedLines', 0) || globalState.get<number>('metrics.humanLines', 0);
            stats.humanRefactoredLines = globalState.get<number>('metrics.humanRefactoredLines', 0);
            stats.aiGeneratedLines = globalState.get<number>('metrics.aiGeneratedLines', 0) || globalState.get<number>('metrics.aiLines', 0);
            stats.aiEditedLines = globalState.get<number>('metrics.aiEditedLines', 0);

            stats.activeSeconds = globalState.get<number>('activity.seconds', 0);
            stats.typingSeconds = globalState.get<number>('activity.typingSeconds', 0);
            stats.reviewingSeconds = globalState.get<number>('activity.reviewingSeconds', 0);

            this._history[targetDate] = stats;
            this.saveHistory();
            Logger.info('StorageManager: Migration Complete.');
        }
    }
}
