import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

interface UpdateData {
    version: string;
    description?: string;
}

export class UpdateManager {
    private static _instance: UpdateManager;
    private _context: vscode.ExtensionContext | undefined;

    // Constant Source
    private static readonly UPDATE_URL = 'https://raw.githubusercontent.com/mkidding/vibertime/main/latest.json';
    private static readonly RELEASE_URL = 'https://github.com/mkidding/vibertime/releases/latest';

    private constructor() { }

    public static get instance(): UpdateManager {
        if (!this._instance) {
            this._instance = new UpdateManager();
        }
        return this._instance;
    }

    public init(context: vscode.ExtensionContext) {
        this._context = context;
        Logger.info('UpdateManager initialized');
    }

    public async checkForUpdates(isManual: boolean = false): Promise<void> {
        if (!this._context) {
            Logger.error('UpdateManager: context not initialized');
            return;
        }

        Logger.info(`UpdateManager: Checking for updates (Manual: ${isManual})...`);

        try {
            // 1. Fetch using https (safer than fetch for VSCode extensions w/o dom lib)
            const data = await this.fetchJson<UpdateData>(UpdateManager.UPDATE_URL);

            const remoteVersion = data.version;
            const localVersion = this._context.extension.packageJSON.version;

            Logger.info(`UpdateManager: Local v${localVersion} vs Remote v${remoteVersion}`);

            // 2. Compare
            if (this.isUpdateAvailable(localVersion, remoteVersion)) {

                // 3. Spam Prevention (Auto Mode)
                if (!isManual) {
                    const lastNotified = this._context.globalState.get<string>('lastNotifiedVersion');
                    if (lastNotified === remoteVersion) {
                        Logger.info(`UpdateManager: Update v${remoteVersion} found but user already notified. Silencing.`);
                        return;
                    }
                }

                // 4. Notify
                const action = await vscode.window.showInformationMessage(
                    `Viber Time Update Available! (v${remoteVersion})`,
                    'Download'
                );

                // Update "Last Notified" immediately to prevent spam if they dismiss
                await this._context.globalState.update('lastNotifiedVersion', remoteVersion);

                if (action === 'Download') {
                    vscode.env.openExternal(vscode.Uri.parse(UpdateManager.RELEASE_URL));
                }

            } else {
                // No Update
                if (isManual) {
                    vscode.window.showInformationMessage(`You are on the latest version (v${localVersion}).`);
                }
            }

        } catch (error) {
            // 5. Error Handling
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error(`UpdateManager: Check failed - ${msg}`);

            if (isManual) {
                vscode.window.showErrorMessage(`Update Check Failed: ${msg}`);
            }
            // Auto checks fail silently
        }
    }

    private fetchJson<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const req = https.get(url, { timeout: 5000 }, (res: any) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP Status ${res.statusCode}`));
                    res.resume();
                    return;
                }
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', (e: any) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });
        });
    }

    private isUpdateAvailable(current: string, remote: string): boolean {
        // Simple semantic version comparison
        // Assumes format x.y.z
        // We can use a library or a simple split logic
        const p1 = current.split('.').map(Number);
        const p2 = remote.split('.').map(Number);

        // Pad if needed (e.g. 0.2 vs 0.2.1)
        const maxLength = Math.max(p1.length, p2.length);

        for (let i = 0; i < maxLength; i++) {
            const v1 = p1[i] || 0;
            const v2 = p2[i] || 0;

            if (v2 > v1) return true;
            if (v1 > v2) return false;
        }

        return false; // Equal
    }
}
