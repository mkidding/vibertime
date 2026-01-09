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

    // Activity
    activeSeconds: number;
    typingSeconds: number;
    reviewingSeconds: number;

    // Metrics (Granular)
    humanTypedLines: number;
    humanRefactoredLines: number;
    aiGeneratedLines: number;
    aiEditedLines: number;

    // Legacy/Aggregate
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
                this._history = JSON.parse(data);
                Logger.info(`StorageManager: Loaded history from ${this._historyFile}`);
            } else {
                Logger.info('StorageManager: No history file found. Starting fresh.');
                this._history = {};
            }
        } catch (e) {
            Logger.error('StorageManager: Failed to load history', e);
            this._history = {};
        }
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
            typingSeconds: 0,
            reviewingSeconds: 0,
            humanTypedLines: 0,
            humanRefactoredLines: 0,
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
            // Avoid circular dependency by using dynamic import or ensuring UpdateManager is ready
            // We can just trust the singleton is ready since extension.ts inits it.
            // But StorageManager doesn't import UpdateManager yet.
            // Let's defer execution slightly to be safe.
            setTimeout(() => {
                const { UpdateManager } = require('./UpdateManager');
                UpdateManager.instance.checkForUpdates(false);
            }, 5000);
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
