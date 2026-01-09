import * as vscode from 'vscode';

export class ConfigManager {
    static get config() {
        return vscode.workspace.getConfiguration('vibertime');
    }

    static get bedtime(): string {
        return this.config.get<string>('bedtime', '00:00');
    }

    static get softNudgeMinutes(): number {
        return this.config.get<number>('softNudgeMinutes', 30);
    }

    static get autoSnoozeMinutes(): number {
        return this.config.get<number>('autoSnoozeMinutes', 60);
    }

    static get dayStartHour(): number {
        return this.config.get<number>('dayStartHour', 4);
    }

    static get idleTimeoutSeconds(): number {
        return this.config.get<number>('idleTimeoutSeconds', 30);
    }

    // =====================================================
    // SAVE METHODS (for webview settings persistence)
    // =====================================================

    static async saveBedtime(value: string): Promise<void> {
        await this.config.update('bedtime', value, vscode.ConfigurationTarget.Global);
    }

    static async saveSoftNudgeMinutes(value: number): Promise<void> {
        await this.config.update('softNudgeMinutes', value, vscode.ConfigurationTarget.Global);
    }

    static async saveAutoSnoozeMinutes(value: number): Promise<void> {
        await this.config.update('autoSnoozeMinutes', value, vscode.ConfigurationTarget.Global);
    }

    static async saveDayStartHour(value: number): Promise<void> {
        await this.config.update('dayStartHour', value, vscode.ConfigurationTarget.Global);
    }

    static async saveIdleTimeoutSeconds(value: number): Promise<void> {
        await this.config.update('idleTimeoutSeconds', value, vscode.ConfigurationTarget.Global);
    }
}
