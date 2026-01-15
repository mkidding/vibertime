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

    // Storm Shield State
    private _ignoreUpdatesUntil: number = 0;

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

    // =====================================================
    // DERIVED VALUES: Computed from 6 granular buckets
    // =====================================================

    public get bioVolume(): number {
        const s = this.currentStats;
        return (s.humanAddedLines || 0) + (s.humanRefactoredLines || 0);
    }

    public get synthVolume(): number {
        const s = this.currentStats;
        return (s.aiAddedLines || 0) + (s.aiRefactoredLines || 0);
    }

    public get externalVolume(): number {
        const s = this.currentStats;
        return (s.externalAddedLines || 0) + (s.externalRefactoredLines || 0);
    }

    public get totalLines(): number {
        return this.bioVolume + this.synthVolume + this.externalVolume;
    }

    // =====================================================
    // LOGIC SIEVE: 4-Filter Classification System
    // =====================================================

    // Noise filter state: track unique files modified in last 1 second
    private _recentFileChanges: Map<string, number> = new Map(); // filename -> timestamp
    private static readonly NOISE_WINDOW_MS = 1000; // 1 second window
    private static readonly NOISE_THRESHOLD = 2;    // 2+ files = noise

    private startMonitoring() {
        // Track Selection for Smart Delete Heuristic (Legacy)
        this._disposables.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.selections.length > 0) {
                    this._previousSelection = e.selections[0];
                }
            })
        );

        // Main document change listener with 4-filter Logic Sieve
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                // Skip Undo/Redo
                if (e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo) {
                    return;
                }
                if (e.contentChanges.length === 0) return;

                // =========================================
                // FILTER -1: STORM SHIELD (Grace Period)
                // =========================================
                if (Date.now() < this._ignoreUpdatesUntil) {
                    Logger.info('MetricsEngine: Ignoring update (Storm Shield active)');
                    return;
                }

                // =========================================
                // FILTER 0: Skip non-file documents (Output, Debug Console, etc.)
                // =========================================
                const docUri = e.document.uri;
                if (docUri.scheme !== 'file') {
                    // Skip output channels, debug consoles, virtual docs, etc.
                    return;
                }

                // =========================================
                // FILTER 0.5: Skip binary and non-text files
                // =========================================
                const languageId = e.document.languageId;
                const filePath = e.document.fileName.toLowerCase();

                // Skip binary file extensions
                const binaryExtensions = [
                    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
                    '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
                    '.zip', '.tar', '.gz', '.rar', '.7z',
                    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                    '.exe', '.dll', '.so', '.dylib', '.bin',
                    '.woff', '.woff2', '.ttf', '.otf', '.eot',
                    '.lock', '.sqlite', '.db'
                ];

                if (binaryExtensions.some(ext => filePath.endsWith(ext))) {
                    return;
                }

                // Also skip if VS Code thinks it's a binary/unknown language
                if (languageId === 'binary' || languageId === 'unknown') {
                    return;
                }

                const now = Date.now();
                const fileName = e.document.fileName;

                // =========================================
                // FILTER 1: NOISE PROTECTION (2-File Rule)
                // =========================================
                // Clean up old entries
                for (const [file, ts] of this._recentFileChanges) {
                    if (now - ts > MetricsEngine.NOISE_WINDOW_MS) {
                        this._recentFileChanges.delete(file);
                    }
                }
                // Record this file change
                this._recentFileChanges.set(fileName, now);

                // Check noise threshold
                if (this._recentFileChanges.size >= MetricsEngine.NOISE_THRESHOLD) {
                    // Track storm events for debugging
                    StorageManager.instance.updateToday(s => {
                        s.stormEvents = (s.stormEvents || 0) + 1;
                    });
                    // Storm event ignored
                    return; // IGNORE: git checkout, Save All, refactors
                }

                // =========================================
                // FILTER 2: GHOST (External/Unfocused)
                // =========================================
                const isFocused = vscode.window.state.focused;

                // Calculate total lines changed and detect operation type
                let linesAdded = 0;
                let linesRemoved = 0;
                let totalChars = 0;
                let isRefactor = false;
                let hasSubstantialContent = false; // Track if change has real content (not just whitespace)

                for (const change of e.contentChanges) {
                    const text = change.text;
                    totalChars += text.length;

                    // Check if this change has substantial content (not just whitespace)
                    const trimmedText = text.trim();
                    if (trimmedText.length > 0) {
                        hasSubstantialContent = true;
                    }

                    // Count lines REMOVED (from the replaced range)
                    const removedLineCount = change.range.end.line - change.range.start.line;
                    if (removedLineCount > 0) {
                        linesRemoved += removedLineCount;
                        isRefactor = true;
                    }

                    // Detect refactor: any change that replaces existing content
                    if (change.rangeLength > 0) {
                        isRefactor = true;
                    }

                    if (text === '') {
                        // Pure deletion - already counted in linesRemoved
                        isRefactor = true;
                    } else {
                        // Count lines ADDED (by counting newlines in the text)
                        const newlineCount = (text.match(/\n/g) || []).length;
                        linesAdded += newlineCount;
                    }
                }

                // Skip pure whitespace-only changes (like auto-indent after Enter)
                // These are often secondary events that shouldn't count as new lines
                if (!hasSubstantialContent && linesAdded === 0 && linesRemoved === 0) {
                    return;
                }

                // CRITICAL FIX: Only count LINES when there are actual newlines
                // Single-character typing (no newlines) should NOT increment line counts
                // This prevents double-counting from VS Code's paired events
                let linesChanged = 0;
                if (isRefactor) {
                    // For refactors: count lines affected (deleted or added)
                    linesChanged = Math.max(linesAdded, linesRemoved, 1);
                } else if (linesAdded > 0) {
                    // For insertions with newlines: count the newlines
                    linesChanged = linesAdded;
                } else {
                    // For single-character typing without newlines: count 0 lines
                    // (Characters are tracked separately via humanChars/aiChars)
                    linesChanged = 0;
                }

                // Skip if no lines to count (but chars are still tracked below)
                if (linesChanged === 0 && !hasSubstantialContent) {
                    return;
                }

                // =========================================
                // CLASSIFY BY SOURCE AND ACTION
                // =========================================

                if (!isFocused) {
                    // GHOST: External change (AI agent, sync, etc)
                    StorageManager.instance.updateToday(s => {
                        if (isRefactor) {
                            s.externalRefactoredLines = (s.externalRefactoredLines || 0) + linesChanged;
                        } else {
                            s.externalAddedLines = (s.externalAddedLines || 0) + linesChanged;
                        }
                    });
                    return; // Do NOT update active time
                }

                if (totalChars > 50) {
                    // SYNTHETIC: Large burst = AI/autocomplete
                    StorageManager.instance.updateToday(s => {
                        if (isRefactor) {
                            s.aiRefactoredLines = (s.aiRefactoredLines || 0) + linesChanged;
                        } else {
                            s.aiAddedLines = (s.aiAddedLines || 0) + linesChanged;
                        }
                        // Also update legacy fields for backward compat
                        s.aiChars += totalChars;
                        s.aiGeneratedLines = (s.aiGeneratedLines || 0) + linesChanged;
                    });
                    return;
                }

                // BIOLOGICAL: Human typing
                StorageManager.instance.updateToday(s => {
                    if (isRefactor) {
                        s.humanRefactoredLines = (s.humanRefactoredLines || 0) + linesChanged;
                    } else {
                        s.humanAddedLines = (s.humanAddedLines || 0) + linesChanged;
                    }
                    // Also update legacy fields for backward compat
                    s.humanChars += totalChars;
                    s.humanTypedLines = (s.humanTypedLines || 0) + linesChanged;
                });
            })
        );

        Logger.info('MetricsEngine started');
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

    public ignoreUpdates(durationMs: number) {
        this._ignoreUpdatesUntil = Date.now() + durationMs;
        Logger.info(`MetricsEngine: Storm Shield activated for ${durationMs}ms`);
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
