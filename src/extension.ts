import * as vscode from 'vscode';
import { ActivityTracker } from './core/ActivityTracker';
import { MetricsEngine } from './core/MetricsEngine';
import { InputListener } from './core/InputListener';
import { NotificationManager } from './core/NotificationManager';
import { DashboardPanel } from './panels/DashboardPanel';
import { Logger } from './utils/Logger';
import { StorageManager } from './core/StorageManager';
import { UpdateManager } from './core/UpdateManager';

let statusBarItem: vscode.StatusBarItem;

// ...

export function activate(context: vscode.ExtensionContext) {
    Logger.init();
    Logger.info('Viber Time: Activating...');

    try {
        // Initialize Singletons with context for persistence
        StorageManager.init(context);
        StorageManager.instance.importLegacyData(context.globalState);

        InputListener.init(context);
        const activityTracker = ActivityTracker.init(context);
        MetricsEngine.init(context);
        const notificationManager = NotificationManager.instance;

        // Update Manager (Auto-Check on Startup)
        UpdateManager.instance.init(context);
        setTimeout(() => UpdateManager.instance.checkForUpdates(false), 5000); // Check after 5s delay

        // Status Bar
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'vibertime.showDashboard';
        context.subscriptions.push(statusBarItem);
        statusBarItem.show();

        // Update Status Bar Loop
        setInterval(() => {
            const targetMs = notificationManager.getTargetBedtimeTimestamp();
            const now = notificationManager.getSimulatedTime(); // Use simulated time if debug is active, else Date.now() via Manager
            // Wait, NotificationManager.instance is a singleton but here we use the exported 'notificationManager'.
            // Actually, NotificationManager.getSimulatedTime() wraps Date.now() + offset.

            const diffMs = targetMs - now;
            const isSnoozed = notificationManager.isSnoozed();

            // Format
            let timeStr = "00:00";
            let icon = '$(clock)';
            let backgroundColor = undefined;

            if (diffMs <= 0) {
                // Expired
                timeStr = "00:00";
                icon = '$(error)';
                backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (diffMs < 60000) {
                // Critical (< 1 min) -> Show Seconds "00:SS"
                const s = Math.floor((diffMs / 1000) % 60);
                timeStr = `00:${s.toString().padStart(2, '0')}`;
                icon = '$(alert)';
                backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                // Normal (> 1 min) -> HH:MM
                const h = Math.floor(diffMs / 3600000);
                const m = Math.floor((diffMs % 3600000) / 60000);
                timeStr = `${Math.floor(diffMs / 60000) >= 60 ? h + ':' : ''}${m.toString().padStart(2, '0')}`;
                // Actually logic for HH:MM: if > 60m, show H:MM. If < 60m, just MM?
                // Original was HH:MM.
                // Let's do Standard HH:MM
                timeStr = `${h}:${m.toString().padStart(2, '0')}`;

                if (isSnoozed || diffMs < 30 * 60000) {
                    icon = '$(alert)';
                    backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                }
            }

            statusBarItem.text = `${icon} [${timeStr}]`;
            statusBarItem.tooltip = "Viber Time: Click to open Dashboard";
            statusBarItem.backgroundColor = backgroundColor;
        }, 1000);

        // Command: Show Dashboard
        context.subscriptions.push(
            vscode.commands.registerCommand('vibertime.showDashboard', () => {
                DashboardPanel.render(context.extensionUri);
            })
        );


        // Debug Commands (Development Mode Only)
        if (context.extensionMode === vscode.ExtensionMode.Development) {
            // Debug Command 1: Open Dashboard
            context.subscriptions.push(
                vscode.commands.registerCommand('vibertime.debug.openDashboard', () => {
                    Logger.info('Debug: Opening Dashboard');
                    DashboardPanel.render(context.extensionUri);
                    vscode.window.showInformationMessage('Debug: Dashboard Opened');
                })
            );

            // Debug Command 2: Trigger Midnight (Hard Stop)
            context.subscriptions.push(
                vscode.commands.registerCommand('vibertime.debug.triggerMidnight', () => {
                    Logger.info('Debug: Triggering Midnight Protocol');
                    notificationManager.triggerHardStop();
                })
            );

            // Debug Command 3: Populate Dummy Data
            context.subscriptions.push(
                vscode.commands.registerCommand('vibertime.debug.populateDummyData', () => {
                    Logger.info('Debug: Populating Dummy Data');
                    activityTracker.activeSeconds = 3723; // 1h 2m 3s
                    MetricsEngine.instance.populateDummyData();
                    vscode.window.showInformationMessage('Debug: Dummy data populated');
                })
            );

            // Debug Command 4: Open Debug Tools (inject fake time/stats for testing)
            context.subscriptions.push(
                vscode.commands.registerCommand('vibertime.debug.openDebugTools', async () => {
                    Logger.info('Debug: Opening Debug Tools');
                    const action = await vscode.window.showQuickPick([
                        { label: '$(clock) Set Fake Time', description: 'Simulate time near bedtime' },
                        { label: '$(beaker) Populate Dummy Stats', description: 'Fill dashboard with test data' },
                        { label: '$(warning) Trigger Midnight', description: 'Force Hard Stop notification' },
                        { label: '$(refresh) Reset All Data', description: 'Clear all saved stats' },
                        { label: '$(eye) Show Current Stats', description: 'Log current state to Output' }
                    ], { placeHolder: 'Select Debug Action' });

                    if (!action) return;

                    if (action.label.includes('Set Fake Time')) {
                        // Simulate being 5 minutes before bedtime
                        vscode.window.showInformationMessage('Debug: Time simulation not yet implemented (use Trigger Midnight)');
                    } else if (action.label.includes('Populate Dummy Stats')) {
                        activityTracker.populateDummyData();
                        MetricsEngine.instance.populateDummyData();
                        DashboardPanel.render(context.extensionUri);
                        vscode.window.showInformationMessage('Debug: Stats populated, Dashboard opened');
                    } else if (action.label.includes('Trigger Midnight')) {
                        notificationManager.triggerHardStop();
                    } else if (action.label.includes('Reset All Data')) {
                        activityTracker.activeSeconds = 0;
                        MetricsEngine.instance.reset();
                        notificationManager.reset();
                        vscode.window.showInformationMessage('Debug: All data reset');
                    } else if (action.label.includes('Show Current Stats')) {
                        const stats = MetricsEngine.instance.stats;
                        // Calculate ratio explicitly or use MetricsEngine getter if exposed
                        const ratio = MetricsEngine.instance.cyborgRatio.toFixed(1);
                        Logger.info(`Current Stats:
      Active Time: ${activityTracker.activeSeconds}s
      Human Chars: ${stats.humanChars}
      AI Chars: ${stats.aiChars}
      Refactor Chars: ${stats.refactorChars}
      Cyborg Ratio: ${ratio}%`);
                        Logger.show();
                    }
                })
            );
        }

        // Cleanup
        context.subscriptions.push({ dispose: () => activityTracker.dispose() });
        context.subscriptions.push({ dispose: () => MetricsEngine.instance.dispose() });
        context.subscriptions.push({ dispose: () => notificationManager.dispose() });
        context.subscriptions.push({ dispose: () => Logger.dispose() });

        Logger.info('Viber Time: Startup Complete. Status Bar visible.');
    } catch (e) {
        Logger.error('FATAL ERROR during activation', e);
        vscode.window.showErrorMessage(`Viber Time Failed to Activate: ${e}`);
    }
}

export function deactivate() {
    Logger.info('Viber Time: Deactivating...');
}
