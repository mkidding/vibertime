import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { Logger } from '../utils/Logger';
import { InputListener } from './InputListener';
import { StorageManager, DailyStats } from './StorageManager';

export class MetricsEngine {
    private static _instance: MetricsEngine;
    private static _context: vscode.ExtensionContext;

    // Burst detection state
    private _recentChanges: { timestamp: number; length: number }[] = [];
    private static readonly BURST_WINDOW_MS = 500;
    private static readonly BURST_THRESHOLD_CPS = 50;

    // Selection state for "Smart Delete"
    private _previousSelection: vscode.Range | null = null;
    private _disposables: vscode.Disposable[] = [];

    private constructor() {
        this.startMonitoring();
    }

    public static init(context: vscode.ExtensionContext): MetricsEngine {
        this._context = context;
        return this.instance;
    }

    public static get instance(): MetricsEngine {
        if (!this._instance) {
            this._instance = new MetricsEngine();
        }
        return this._instance;
    }

    private get currentStats(): DailyStats {
        return StorageManager.instance.getToday();
    }

    public get cyborgRatio(): number {
        const s = this.currentStats;
        const total = s.humanChars + s.aiChars;
        if (total === 0) return 0;
        return (s.aiChars / total) * 100;
    }

    // Helper to get total lines
    public get humanLinesTotal(): number {
        const s = this.currentStats;
        return s.humanTypedLines + s.humanRefactoredLines;
    }

    public get aiLinesTotal(): number {
        const s = this.currentStats;
        return s.aiGeneratedLines + s.aiEditedLines;
    }

    public debugAddLines(humanLines: number, aiLines: number) {
        StorageManager.instance.updateToday(s => {
            // Distribute dummy data evenly
            s.humanTypedLines += Math.floor(humanLines * 0.8);
            s.humanRefactoredLines += Math.floor(humanLines * 0.2);
            s.aiGeneratedLines += Math.floor(aiLines * 0.9);
            s.aiEditedLines += Math.floor(aiLines * 0.1);

            s.humanChars += humanLines * 50;
            s.aiChars += aiLines * 50;
        });
    }

    public debugAddSpecificLines(type: 'typed' | 'refactored' | 'generated' | 'edited', amount: number) {
        StorageManager.instance.updateToday(s => {
            if (type === 'typed') {
                s.humanTypedLines += amount;
                s.humanChars += amount * 50;
            } else if (type === 'refactored') {
                s.humanRefactoredLines += amount;
                s.refactorChars += amount * 50;
            } else if (type === 'generated') {
                s.aiGeneratedLines += amount;
                s.aiChars += amount * 50;
            } else if (type === 'edited') {
                s.aiEditedLines += amount;
                s.aiChars += amount * 50;
            }
        });
    }

    public get volumeRatio(): number {
        const total = this.humanLinesTotal + this.aiLinesTotal;
        if (total === 0) return 0;
        return (this.aiLinesTotal / total) * 100;
    }

    // Proxy to StorageManager for UI consumption
    // We return the raw DailyStats object for simplicity, or we can map it.
    // The frontend expects the flattened `DashboardData`.
    // We should probably expose the full object and let DashboardPanel flatten it.
    // Or keep this getter for legacy compat.
    // Let's keep a getter that matches the old structure if needed, 
    // BUT we are pivoting architecture. DashboardPanel should use StorageManager directly or we pass the DailyStats.
    public get stats(): DailyStats {
        return this.currentStats;
    }

    private startMonitoring() {
        // Track Selection for Smart Delete Heuristic
        this._disposables.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.selections.length > 0) {
                    this._previousSelection = e.selections[0];
                }
            })
        );

        // Listen for document changes
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo) {
                    return;
                }

                if (e.contentChanges.length === 0) return;

                StorageManager.instance.updateToday(stats => {
                    for (const change of e.contentChanges) {
                        const text = change.text;
                        const len = text.length;
                        const lines = (text.match(/\n/g) || []).length;

                        const msSinceType = InputListener.timeSinceHumanInput;
                        const msSincePaste = InputListener.timeSincePaste;

                        // CASE 0: Deletion (Smart Delete Heuristic) - Human Refactor
                        if (text === '') {
                            const deletedLines = change.range.end.line - change.range.start.line;
                            if (deletedLines > 0) {
                                stats.humanRefactoredLines += deletedLines;
                            }
                            continue;
                        }

                        // CASE 1: Safe Paste (Native API) -> Human Refactor
                        if (msSincePaste < 100) {
                            stats.refactorChars += len;
                            stats.humanRefactoredLines += lines;
                            // Logger.info(`[Metrics] Refactor (Safe Paste): +${len} chars`);
                            continue;
                        }

                        // CASE 2: Human Typing (Fresh Input) -> Human Typed
                        if (msSinceType < 100) {
                            stats.humanChars += len;
                            stats.humanTypedLines += lines;
                            continue;
                        }

                        // CASE 3: AI / Cyborg (Ghost Text / Tab Complete)
                        if (len > 5) {
                            stats.aiChars += len;
                            if (change.rangeLength > 0) {
                                stats.aiEditedLines += lines;
                                // Logger.info(`[Metrics] AI Edit (Replacement): +${lines} lines`);
                            } else {
                                stats.aiGeneratedLines += lines;
                                // Logger.info(`[Metrics] AI Gen (Insert): +${lines} lines`);
                            }

                            // Fallback: Clipboard check
                            if (len > 50) {
                                vscode.env.clipboard.readText().then(clipText => {
                                    if (clipText === text) {
                                        // Async update - might be tricky with debouncing if we don't lock
                                        // But StorageManager updateToday handles the object reference.
                                        StorageManager.instance.updateToday(s => {
                                            s.aiChars -= len;
                                            if (change.rangeLength > 0) s.aiEditedLines -= lines;
                                            else s.aiGeneratedLines -= lines;

                                            s.refactorChars += len;
                                            s.humanRefactoredLines += lines;
                                        });
                                    }
                                });
                            }
                        } else {
                            // Tiny changes -> Human Typed (Generous)
                            stats.humanChars += len;
                            stats.humanTypedLines += lines;
                        }
                    }
                });
            })
        );

        Logger.info('MetricsEngine started with Granular Classification (StorageManager)');
    }

    public populateDummyData() {
        StorageManager.instance.updateToday(s => {
            s.humanTypedLines = 80;
            s.humanRefactoredLines = 40;
            s.aiGeneratedLines = 10;
            s.aiEditedLines = 5;

            s.humanChars = 1500;
            s.aiChars = 500;
            s.refactorChars = 200;
            s.activeSeconds = 7200; // This usually belongs to ActivityTracker but we share the DailyStats object now
            s.typingSeconds = 1200;
            s.reviewingSeconds = 600;
        });
        Logger.info('Populated dummy metrics data');
    }

    public reset() {
        // We probably shouldn't reset the whole day via this method anymore, 
        // or we rename it to 'clearToday'.
        StorageManager.instance.updateToday(s => {
            s.humanChars = 0;
            s.aiChars = 0;
            s.refactorChars = 0;
            s.humanTypedLines = 0;
            s.humanRefactoredLines = 0;
            s.aiGeneratedLines = 0;
            s.aiEditedLines = 0;
            // Activity reset handled by ActivityTracker or here if unified?
            // They share the same `DailyStats` object now.
            // Let's reset purely metrics fields here to be safe.
        });
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
