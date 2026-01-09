import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export class InputListener {
    private static _lastHumanTypeTime: number = 0;
    private static _lastPasteTime: number = 0;
    private static _lastManualTime: number = 0; // For Backspace/Delete detected elsewhere

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

        context.subscriptions.push(typeDisposable, pasteProvider);
        Logger.info('InputListener: Native Listeners registered.');
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

    public static markManualInteraction() {
        this._lastManualTime = Date.now();
    }

    public static get timeSincePaste(): number {
        return Date.now() - this._lastPasteTime;
    }
}
