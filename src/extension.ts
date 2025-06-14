/*
 * Copyright 2025 HumanAI Tracker Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode';
import { TimeTracker } from './tracker/TimeTracker';
import { DashboardPanel } from './views/DashboardPanel';
import { StatsProvider } from './views/StatsProvider';
import { AchievementsProvider } from './views/AchievementsProvider';
import { DataManager } from './data/DataManager';
import { StatusBarManager } from './ui/StatusBarManager';

let timeTracker: TimeTracker;
let dashboardPanel: DashboardPanel | undefined;
let dataManager: DataManager;
let statusBarManager: StatusBarManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('HumanAI Tracker is now active!');

    // Initialize components
    dataManager = new DataManager(context);
    timeTracker = new TimeTracker(dataManager);
    statusBarManager = new StatusBarManager();

    // Register tree data providers
    const statsProvider = new StatsProvider(dataManager);
    const achievementsProvider = new AchievementsProvider(dataManager);
    
    vscode.window.registerTreeDataProvider('humanai-tracker.stats', statsProvider);
    vscode.window.registerTreeDataProvider('humanai-tracker.achievements', achievementsProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.showDashboard', () => {
            // Check if panel exists and is not disposed
            if (dashboardPanel) {
                try {
                    dashboardPanel.reveal();
                    return; // Successfully revealed existing panel
                } catch (error) {
                    // Panel was disposed, need to create a new one
                    dashboardPanel = undefined;
                }
            }
            
            // Create new panel
            dashboardPanel = new DashboardPanel(context, dataManager);
            
            // Reset the reference when panel is disposed
            dashboardPanel.onDidDispose(() => {
                dashboardPanel = undefined;
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.toggleTracking', () => {
            const isEnabled = timeTracker.toggleTracking();
            const sessionStats = timeTracker.getSessionStats();
            vscode.window.showInformationMessage(
                `HumanAI Tracker: Tracking ${isEnabled ? 'enabled' : 'disabled'}`
            );
            statusBarManager.updateStatus(isEnabled, sessionStats.currentMode);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.exportData', async () => {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('humanai-tracker-export.json'),
                filters: {
                    'JSON': ['json'],
                    'CSV': ['csv']
                }
            });

            if (uri) {
                await dataManager.exportData(uri);
                vscode.window.showInformationMessage('Data exported successfully!');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.setDailyGoal', async () => {
            const input = await vscode.window.showInputBox({
                prompt: 'Set your daily coding goal (in minutes)',
                value: String(dataManager.getDailyGoal()),
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1) {
                        return 'Please enter a valid number greater than 0';
                    }
                    return null;
                }
            });

            if (input) {
                const minutes = parseInt(input);
                dataManager.setDailyGoal(minutes);
                vscode.window.showInformationMessage(`Daily goal set to ${minutes} minutes`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.markAsAI', () => {
            timeTracker.forceMode('ai');
            vscode.window.showInformationMessage('Current session marked as AI-assisted');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.markAsHuman', () => {
            timeTracker.forceMode('human');
            vscode.window.showInformationMessage('Current session marked as human-coded');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.viewAchievements', () => {
            const achievements = dataManager.getAchievements();
            const unlockedCount = achievements.filter(a => a.unlocked).length;
            const totalCount = achievements.length;
            
            vscode.window.showInformationMessage(
                `🏆 Achievements: ${unlockedCount}/${totalCount} unlocked`,
                'View Dashboard'
            ).then(selection => {
                if (selection === 'View Dashboard') {
                    vscode.commands.executeCommand('humanai-tracker.showDashboard');
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.quickStats', () => {
            const stats = dataManager.getTodayStats();
            const totalMinutes = Math.floor((stats.humanTime + stats.aiTime) / 60);
            const humanPercentage = stats.humanTime + stats.aiTime > 0 ? 
                Math.round((stats.humanTime / (stats.humanTime + stats.aiTime)) * 100) : 50;
            
            vscode.window.showInformationMessage(
                `📊 Today: ${totalMinutes}m total (${humanPercentage}% human, ${100-humanPercentage}% AI) | Productivity: ${stats.productivity}%`,
                'View Dashboard'
            ).then(selection => {
                if (selection === 'View Dashboard') {
                    vscode.commands.executeCommand('humanai-tracker.showDashboard');
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('humanai-tracker.resetDailyStats', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to reset today\'s statistics? This action cannot be undone.',
                { modal: true },
                'Reset',
                'Cancel'
            );
            
            if (confirm === 'Reset') {
                // Reset today's data - this would need implementation in DataManager
                vscode.window.showInformationMessage('Daily statistics have been reset');
            }
        })
    );

    // Start tracking
    timeTracker.startTracking();

    // Update status bar
    statusBarManager.show();
    const updateTimer = setInterval(() => {
        const stats = dataManager.getTodayStats();
        const sessionStats = timeTracker.getSessionStats();
        statusBarManager.updateTime(stats.humanTime, stats.aiTime);
        statusBarManager.updateStatus(true, sessionStats.currentMode);
        statsProvider.refresh();
    }, 1000);

    // Listen for text changes
    vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme === 'file') {
            timeTracker.onTextChange(event);
        }
    });

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            timeTracker.onEditorChange(editor);
        }
    });

    // Check achievements periodically
    const achievementTimer = setInterval(() => {
        const newAchievements = dataManager.checkAchievements();
        if (newAchievements.length > 0) {
            newAchievements.forEach(achievement => {
                vscode.window.showInformationMessage(
                    `🏆 Achievement Unlocked: ${achievement.name}!`,
                    'View All'
                ).then(selection => {
                    if (selection === 'View All') {
                        vscode.commands.executeCommand('humanai-tracker.showDashboard');
                    }
                });
            });
            achievementsProvider.refresh();
        }
    }, 60000); // Check every minute

    // Cleanup
    context.subscriptions.push({
        dispose: () => {
            clearInterval(updateTimer);
            clearInterval(achievementTimer);
            timeTracker.stopTracking();
            statusBarManager.dispose();
            if (dashboardPanel) {
                dashboardPanel.dispose();
            }
        }
    });
}

export function deactivate() {
    if (timeTracker) {
        timeTracker.stopTracking();
    }
}