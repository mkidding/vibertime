import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export class InputListener {
    private static _lastHumanTypeTime: number = 0;
    private static _lastPasteTime: number = 0;
    private static _lastManualTime: number = 0; // For Backspace/Delete detected elsewhere
    private static _lastReviewActivityTime: number = 0; // Mouse-based review activity

    // Debounce state for high-frequency events
    private static _selectionDebounceTimer: NodeJS.Timeout | undefined;
    private static _scrollDebounceTimer: NodeJS.Timeout | undefined;
    private static readonly DEBOUNCE_MS = 500;

    public static init(context: vscode.ExtensionContext) {
        // 1. Intercept 'type' command (The Spy)
        // Confirms physical typing. 'type' is the only command where override is standard practice.
        const typeDisposable = vscode.commands.registerCommand('type', (args) => {
            InputListener._lastHumanTypeTime = Date.now();
            return vscode.commands.executeCommand('default:type', args);
        });

        // 2. Safe Paste Listener (Native API)
        // Uses DocumentPasteEditProvider to listen without overriding behaviors.
        const pasteProvider = vscode.languages.registerDocumentPasteEditProvider(
            { scheme: 'file', language: '*' },
            {
                provideDocumentPasteEdits(document, ranges, dataToken) {
                    InputListener._lastPasteTime = Date.now();
                    // Return undefined to let VS Code handle the paste normally
                    return undefined;
                }
            },
            {
                pasteMimeTypes: ['text/plain'],
                providedPasteEditKinds: []
            }
        );

        // 3. Selection Change Listener (Mouse clicks, cursor movement, text selection)
        // Debounced to avoid event avalanche during drag-select
        const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((e) => {
            // Filter out non-file documents (output panels, debug console, etc.)
            if (e.textEditor.document.uri.scheme !== 'file') return;

            // Debounce: Only update timestamp after activity settles
            if (InputListener._selectionDebounceTimer) {
                clearTimeout(InputListener._selectionDebounceTimer);
            }
            InputListener._selectionDebounceTimer = setTimeout(() => {
                InputListener._lastReviewActivityTime = Date.now();
            }, InputListener.DEBOUNCE_MS);
        });

        // 4. Active Editor Change Listener (Switching tabs/files)
        // No debounce needed - this is a discrete event
        const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.uri.scheme === 'file') {
                InputListener._lastReviewActivityTime = Date.now();
            }
        });

        // 5. Visible Ranges Change Listener (Scrolling)
        // Debounced to avoid spam during smooth scrolling
        const scrollDisposable = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            if (e.textEditor.document.uri.scheme !== 'file') return;

            if (InputListener._scrollDebounceTimer) {
                clearTimeout(InputListener._scrollDebounceTimer);
            }
            InputListener._scrollDebounceTimer = setTimeout(() => {
                InputListener._lastReviewActivityTime = Date.now();
            }, InputListener.DEBOUNCE_MS);
        });

        context.subscriptions.push(
            typeDisposable,
            pasteProvider,
            selectionDisposable,
            activeEditorDisposable,
            scrollDisposable
        );
        Logger.info('InputListener: Native Listeners registered (typing, paste, selection, scroll).');
    }

    public static get lastHumanTypeTime(): number {
        return this._lastHumanTypeTime;
    }

    public static get lastPasteTime(): number {
        return this._lastPasteTime;
    }

    public static get timeSinceHumanInput(): number {
        const lastInput = Math.max(this._lastHumanTypeTime, this._lastManualTime);
        return Date.now() - lastInput;
    }

    public static get timeSinceReviewActivity(): number {
        return Date.now() - this._lastReviewActivityTime;
    }

    public static markManualInteraction() {
        this._lastManualTime = Date.now();
    }

    public static get timeSincePaste(): number {
        return Date.now() - this._lastPasteTime;
    }
}
