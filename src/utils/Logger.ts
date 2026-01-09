import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export const Logger = {
    init(): void {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel("Viber Time");
        }
    },

    info(message: string): void {
        this.init();
        const timestamp = new Date().toLocaleTimeString();
        outputChannel?.appendLine(`[${timestamp}] INFO: ${message}`);
    },

    warn(message: string): void {
        this.init();
        const timestamp = new Date().toLocaleTimeString();
        outputChannel?.appendLine(`[${timestamp}] WARN: ${message}`);
    },

    error(message: string, error?: unknown): void {
        this.init();
        const timestamp = new Date().toLocaleTimeString();
        outputChannel?.appendLine(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            outputChannel?.appendLine(`  ${error}`);
        }
    },

    show(): void {
        outputChannel?.show();
    },

    dispose(): void {
        outputChannel?.dispose();
        outputChannel = undefined;
    }
};
