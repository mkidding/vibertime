import * as vscode from "vscode";
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ActivityTracker } from "../core/ActivityTracker";
import { MetricsEngine } from "../core/MetricsEngine";
import { ConfigManager } from "../config/ConfigManager";
import { NotificationManager } from "../core/NotificationManager";
import { Logger } from "../utils/Logger";
import { StorageManager } from "../core/StorageManager";
import { UpdateManager } from "../core/UpdateManager";

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private readonly _extensionUri: Uri;

    private constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._setWebviewMessageListener(this._panel.webview);

        // Send initial update
        this.sendUpdate();

        // Start polling for updates
        const interval = setInterval(() => this.sendUpdate(), 1000);
        this._disposables.push({ dispose: () => clearInterval(interval) });
    }

    public static render(extensionUri: Uri) {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(ViewColumn.One);
        } else {
            const panel = window.createWebviewPanel(
                "vibertime-dashboard",
                "Viber Time",
                ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        Uri.joinPath(extensionUri, "out")
                    ],
                }
            );

            DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
        }
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private sendUpdate() {
        // Get raw data from storage
        const rawStats = MetricsEngine.instance.stats;

        // Combine with computed getters and config
        const payload = {
            ...rawStats,

            // Computed Metrics (Getters)
            cyborgRatio: MetricsEngine.instance.cyborgRatio,
            timeRatio: ActivityTracker.instance.timeRatio,

            // Configuration
            bedtime: ConfigManager.bedtime,
            dayStartHour: ConfigManager.dayStartHour,
            idleTimeoutSeconds: ConfigManager.idleTimeoutSeconds,

            // Runtime State
            timeUntilBedtime: NotificationManager.instance.getTimeUntilBedtime(),
            targetBedtimeMs: NotificationManager.instance.getTargetBedtimeTimestamp(),
            currentSimulatedTime: NotificationManager.instance.getSimulatedTime(),
            isSnoozed: NotificationManager.instance.isSnoozed()
        };

        this._panel.webview.postMessage({
            type: 'update',
            payload: payload
        });
    }

    private _setWebviewMessageListener(webview: Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case "checkUpdates":
                        Logger.info('Manual Update Check Requested from Webview');
                        UpdateManager.instance.checkForUpdates(true);
                        return;
                    case "refresh":
                        this.sendUpdate();
                        return;
                    case "snooze":
                        const minutes = message.minutes || 30;
                        Logger.info(`Webview snooze request: ${minutes} minutes`);
                        NotificationManager.instance.snooze(minutes);
                        this.sendUpdate(); // Immediate Push
                        return;
                    case "saveSettings":
                        // Persist settings to VS Code configuration
                        const { bedtime, softNudgeMinutes, autoSnoozeMinutes, dayStartHour, idleTimeoutSeconds } = message.payload || {};
                        Logger.info(`Saving settings: bedtime=${bedtime}, start=${dayStartHour}, timeout=${idleTimeoutSeconds}`);
                        if (bedtime !== undefined) await ConfigManager.saveBedtime(bedtime);
                        if (softNudgeMinutes !== undefined) await ConfigManager.saveSoftNudgeMinutes(softNudgeMinutes);
                        if (autoSnoozeMinutes !== undefined) await ConfigManager.saveAutoSnoozeMinutes(autoSnoozeMinutes);
                        if (dayStartHour !== undefined) await ConfigManager.saveDayStartHour(dayStartHour);
                        if (idleTimeoutSeconds !== undefined) await ConfigManager.saveIdleTimeoutSeconds(idleTimeoutSeconds);
                        this.sendUpdate();
                        return;
                    case "getSettings":
                        // Send current settings to webview
                        this._panel.webview.postMessage({
                            type: 'settings',
                            payload: {
                                bedtime: ConfigManager.bedtime,
                                softNudgeMinutes: ConfigManager.softNudgeMinutes,
                                autoSnoozeMinutes: ConfigManager.autoSnoozeMinutes,
                                dayStartHour: ConfigManager.dayStartHour,
                                idleTimeoutSeconds: ConfigManager.idleTimeoutSeconds
                            }
                        });
                        return;
                    case "triggerSoftWarning":
                        // Debug: trigger soft warning notification
                        Logger.info('Debug: Triggering Soft Warning from webview');
                        NotificationManager.instance.triggerSoftNudge();
                        return;
                    case "triggerHardStop":
                        // Debug: trigger hard stop notification
                        Logger.info('Debug: Triggering Hard Stop from webview');
                        NotificationManager.instance.triggerHardStop();
                        return;
                    case "debugAddLines":
                        const { humanLines, aiLines } = message.payload || {};
                        Logger.info(`Debug: Adding lines: human=${humanLines}, ai=${aiLines}`);
                        MetricsEngine.instance.debugAddLines(humanLines || 0, aiLines || 0);
                        this.sendUpdate();
                        return;
                    case "debugAddSpecificLines":
                        const { type, amount } = message.payload || {};
                        Logger.info(`Debug: Adding specific lines: type=${type}, amount=${amount}`);
                        MetricsEngine.instance.debugAddSpecificLines(type, amount || 0);
                        this.sendUpdate();
                        return;
                    case "debugAddMinutes":
                        const { typingMins, reviewingMins } = message.payload || {};
                        Logger.info(`Debug: Adding minutes: typing=${typingMins}, reviewing=${reviewingMins}`);
                        ActivityTracker.instance.debugAddMinutes(typingMins || 0, reviewingMins || 0);
                        this.sendUpdate();
                        return;
                    case "debugSetTime":
                        const { time } = message.payload || {};
                        Logger.info(`Debug: Setting simulated time to ${time}`);
                        NotificationManager.instance.debugSetTime(time);
                        this.sendUpdate();
                        return;
                    case "saveSlotState":
                        const partialSlotState = message.payload;
                        // Logger.info(`Saving Slot State: runs=${partialSlotState.runsRemaining}, energy=${partialSlotState.currentEnergy}`);
                        StorageManager.instance.updateToday(s => {
                            s.slotState = { ...s.slotState, ...partialSlotState };
                        });
                        this.sendUpdate();
                        return;
                    case "resetForNewDay":
                        Logger.info('Debug: Resetting for new day (full reset: stats + slot)');
                        ActivityTracker.instance.resetForNewDay();
                        NotificationManager.instance.reset();
                        this.sendUpdate();
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        // IMMUNITY PROTOCOL: Dynamically discover hashed asset filenames
        const assetsDir = path.join(extensionUri.fsPath, "out", "webview", "assets");
        let jsFile = "index.js";
        let cssFile = "index.css";

        try {
            const files = fs.readdirSync(assetsDir);
            // Find the hashed JS and CSS files (e.g., index-abc123.js)
            const jsMatch = files.find(f => f.startsWith("index-") && f.endsWith(".js"));
            const cssMatch = files.find(f => f.startsWith("index-") && f.endsWith(".css"));
            if (jsMatch) jsFile = jsMatch;
            if (cssMatch) cssFile = cssMatch;
            Logger.info(`WebviewAssets: JS=${jsFile}, CSS=${cssFile}`);
        } catch (e) {
            Logger.warn(`Could not read assets dir, using fallback filenames: ${e}`);
        }

        const stylesUri = getUri(webview, extensionUri, ["out", "webview", "assets", cssFile]);
        const scriptUri = getUri(webview, extensionUri, ["out", "webview", "assets", jsFile]);

        const nonce = getNonce();

        return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <!-- IMMUNITY PROTOCOL: Anti-Cache Headers -->
          <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
          <meta http-equiv="Pragma" content="no-cache" />
          <meta http-equiv="Expires" content="0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri}" />
          <title>Viber Time</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
    }
}

function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
