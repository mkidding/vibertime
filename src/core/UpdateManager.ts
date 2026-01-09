import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    name?: string;
}

export class UpdateManager {
    private static _instance: UpdateManager;
    private _context: vscode.ExtensionContext | undefined;

    // GitHub Releases API
    private static readonly API_URL = 'https://api.github.com/repos/mkidding/vibertime/releases/latest';
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
            // 1. Fetch from GitHub Releases API
            const release = await this.fetchJson<GitHubRelease>(UpdateManager.API_URL);

            // 2. Clean version (remove 'v' prefix if present)
            const remoteVersion = release.tag_name.replace(/^v/, '');
            const localVersion = this._context.extension.packageJSON.version;

            Logger.info(`UpdateManager: Local v${localVersion} vs Remote v${remoteVersion}`);

            // 3. Compare
            if (this.isUpdateAvailable(localVersion, remoteVersion)) {

                // 4. Spam Prevention (Auto Mode)
                if (!isManual) {
                    const lastNotified = this._context.globalState.get<string>('lastNotifiedVersion');
                    if (lastNotified === remoteVersion) {
                        Logger.info(`UpdateManager: Update v${remoteVersion} found but user already notified. Silencing.`);
                        return;
                    }
                }

                // 5. Notify User
                const action = await vscode.window.showInformationMessage(
                    `Viber Time v${remoteVersion} is available!`,
                    'Download Update'
                );

                // Update "Last Notified" immediately to prevent spam if they dismiss
                await this._context.globalState.update('lastNotifiedVersion', remoteVersion);

                if (action === 'Download Update') {
                    vscode.env.openExternal(vscode.Uri.parse(UpdateManager.RELEASE_URL));
                }

            } else {
                // No Update
                if (isManual) {
                    vscode.window.showInformationMessage(`Viber Time is up to date (v${localVersion}).`);
                }
            }

        } catch (error) {
            // 6. Error Handling
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error(`UpdateManager: Check failed - ${msg}`);

            if (isManual) {
                vscode.window.showErrorMessage(`Update Check Failed: ${msg}`);
            }
            // Auto checks fail silently (no annoying popups)
        }
    }

    private fetchJson<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const options = {
                timeout: 5000,
                headers: {
                    'User-Agent': 'vibertime-vscode-extension',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            const req = https.get(url, options, (res: any) => {
                if (res.statusCode === 404) {
                    reject(new Error('No releases found'));
                    res.resume();
                    return;
                }
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
        // Semantic version comparison (x.y.z)
        const p1 = current.split('.').map(Number);
        const p2 = remote.split('.').map(Number);

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
