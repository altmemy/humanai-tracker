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
import { DataManager } from '../data/DataManager';

export class DashboardPanel {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private updateInterval: NodeJS.Timeout | undefined;
    private isVisible: boolean = true;
    private lastUpdateTime: number = 0;
    private animationFrame: number | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private dataManager: DataManager
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'humanai-tracker.dashboard',
            '🤖✨ HumanAI Tracker Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png'),
            dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png')
        };

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'getData':
                        this.sendDataToWebview();
                        break;
                    case 'setGoal':
                        this.dataManager.setDailyGoal(message.value);
                        this.sendDataToWebview();
                        vscode.window.showInformationMessage(`Daily goal updated to ${message.value} minutes`);
                        break;
                    case 'exportData':
                        vscode.commands.executeCommand('humanai-tracker.exportData');
                        break;
                    case 'markAsAI':
                        vscode.commands.executeCommand('humanai-tracker.markAsAI');
                        break;
                    case 'markAsHuman':
                        vscode.commands.executeCommand('humanai-tracker.markAsHuman');
                        break;
                    case 'toggleTracking':
                        vscode.commands.executeCommand('humanai-tracker.toggleTracking');
                        break;
                    case 'resetStats':
                        this.resetDailyStats();
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'humanai-tracker');
                        break;
                }
            },
            null,
            this.disposables
        );

        // Update data every 2 seconds for real-time feel, but only when visible
        this.updateInterval = setInterval(() => {
            if (this.isVisible) {
                this.sendDataToWebview();
            }
        }, 2000);

        // Handle visibility changes for performance optimization
        this.panel.onDidChangeViewState(() => {
            this.isVisible = this.panel.visible;
            if (this.isVisible) {
                this.sendDataToWebview(); // Refresh data when panel becomes visible
            }
        });

        this.panel.onDidDispose(() => {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }
            this.disposables.forEach(d => d.dispose());
        });

        // Send initial data
        this.sendDataToWebview();
    }

    private async resetDailyStats() {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to reset today\'s statistics? This action cannot be undone.',
            { modal: true },
            'Reset',
            'Cancel'
        );
        
        if (confirm === 'Reset') {
            this.dataManager.resetDailyStats();
            vscode.window.showInformationMessage('Daily statistics have been reset');
            this.sendDataToWebview();
        }
    }

    private sendDataToWebview() {
        const now = Date.now();
        // Throttle updates to prevent excessive rendering
        if (now - this.lastUpdateTime < 1000) {
            return;
        }
        this.lastUpdateTime = now;

        try {
            const todayStats = this.dataManager.getTodayStats();
            const weeklyStats = this.dataManager.getWeeklyStats();
            const monthlyStats = this.dataManager.getMonthlyStats();
            const achievements = this.dataManager.getAchievements();
            const dailyGoal = this.dataManager.getDailyGoal();

            // Calculate additional metrics
            const totalTime = todayStats.humanTime + todayStats.aiTime;
            const humanPercentage = totalTime > 0 ? Math.round((todayStats.humanTime / totalTime) * 100) : 50;
            const aiPercentage = totalTime > 0 ? Math.round((todayStats.aiTime / totalTime) * 100) : 50;
            const goalProgress = Math.min(Math.round((totalTime / (dailyGoal * 60)) * 100), 100);
            
            // Calculate productivity trends
            const yesterdayTime = this.getYesterdayTotalTime();
            const productivityTrend = yesterdayTime > 0 ? 
                ((totalTime - yesterdayTime) / yesterdayTime * 100).toFixed(1) : '0';

            // Calculate focus score (longer sessions = better focus)
            const focusScore = this.calculateFocusScore(todayStats);

            this.panel.webview.postMessage({
                command: 'updateData',
                data: {
                    today: todayStats,
                    weekly: weeklyStats,
                    monthly: monthlyStats,
                    achievements: achievements,
                    dailyGoal: dailyGoal,
                    metrics: {
                        totalTime,
                        humanPercentage,
                        aiPercentage,
                        goalProgress,
                        productivityTrend,
                        focusScore
                    },
                    timestamp: now
                }
            });
        } catch (error) {
            console.error('Error sending data to webview:', error);
            vscode.window.showErrorMessage('Failed to update dashboard data');
        }
    }

    private getYesterdayTotalTime(): number {
        // Simplified calculation - in real implementation, this would query yesterday's data
        return 0;
    }

    private calculateFocusScore(stats: any): number {
        // Calculate focus score based on session length patterns
        // Longer uninterrupted sessions = higher focus score
        const totalTime = stats.humanTime + stats.aiTime;
        if (totalTime < 300) {return 0;} // Less than 5 minutes
        if (totalTime < 1800) {return 25;} // Less than 30 minutes
        if (totalTime < 3600) {return 50;} // Less than 1 hour
        if (totalTime < 7200) {return 75;} // Less than 2 hours
        return 100; // 2+ hours
    }

    reveal() {
        this.panel.reveal();
    }

    dispose() {
        this.panel.dispose();
    }

    onDidDispose(callback: () => void): vscode.Disposable {
        return this.panel.onDidDispose(callback);
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>HumanAI Tracker Dashboard</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body { 
                    font-family: var(--vscode-font-family), 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 24px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    line-height: 1.6;
                }
                
                .dashboard-header {
                    text-align: center;
                    margin-bottom: 32px;
                    padding: 24px;
                    background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
                    border-radius: 12px;
                    color: var(--vscode-button-foreground);
                }
                
                .dashboard-title {
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-bottom: 8px;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
                
                .dashboard-subtitle {
                    font-size: 1.1rem;
                    opacity: 0.9;
                    font-weight: 300;
                    margin-bottom: 20px;
                }
                
                .header-stats {
                    display: flex;
                    justify-content: center;
                    gap: 32px;
                    margin-top: 16px;
                    flex-wrap: wrap;
                }
                
                .header-stat {
                    text-align: center;
                    padding: 12px 16px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 8px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                
                .stat-label {
                    display: block;
                    font-size: 0.8rem;
                    opacity: 0.8;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .stat-value {
                    display: block;
                    font-size: 1.1rem;
                    font-weight: 600;
                    font-family: 'SF Mono', Monaco, monospace;
                }
                
                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 20px;
                    margin-bottom: 32px;
                }
                
                .quick-stats-bar {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    margin: 24px 0;
                    padding: 20px;
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    flex-wrap: wrap;
                }
                
                .quick-stat {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: var(--vscode-editor-background);
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                    transition: all 0.3s ease;
                    flex: 1;
                    min-width: 120px;
                }
                
                .quick-stat:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    border-color: var(--vscode-focusBorder);
                }
                
                .quick-stat-icon {
                    font-size: 1.5rem;
                    opacity: 0.8;
                }
                
                .quick-stat-value {
                    font-size: 1.4rem;
                    font-weight: 700;
                    font-family: 'SF Mono', Monaco, monospace;
                    color: var(--vscode-textLink-foreground);
                }
                
                .quick-stat-label {
                    font-size: 0.8rem;
                    opacity: 0.7;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .metric-card {
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    padding: 24px;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .metric-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    border-color: var(--vscode-focusBorder);
                }
                
                .metric-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: linear-gradient(90deg, var(--vscode-textLink-foreground), var(--vscode-button-background));
                }
                
                .metric-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 16px;
                }
                
                .metric-icon {
                    font-size: 2rem;
                    margin-right: 12px;
                }
                
                .metric-title {
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                }
                
                .metric-value {
                    font-size: 2.2rem;
                    font-weight: 700;
                    margin: 12px 0;
                    font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace;
                }
                
                .metric-subtitle {
                    font-size: 0.9rem;
                    opacity: 0.7;
                    margin-bottom: 16px;
                }
                
                .progress-bar {
                    height: 8px;
                    background: var(--vscode-progressBar-background);
                    border-radius: 4px;
                    overflow: hidden;
                    margin: 12px 0;
                }
                
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--vscode-gitDecoration-addedResourceForeground), var(--vscode-button-background));
                    border-radius: 4px;
                    transition: width 0.6s ease;
                    position: relative;
                }
                
                .progress-fill::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    animation: shimmer 2s infinite;
                }
                
                .ai-gradient {
                    background: linear-gradient(90deg, var(--vscode-gitDecoration-modifiedResourceForeground), var(--vscode-button-background)) !important;
                }
                
                .goal-gradient {
                    background: linear-gradient(90deg, var(--vscode-textLink-foreground), var(--vscode-button-background)) !important;
                }
                
                .focus-gradient {
                    background: linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1) !important;
                }
                
                .trend-indicator {
                    font-size: 0.8rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    margin-left: auto;
                }
                
                .trend-indicator.positive {
                    background: rgba(40, 167, 69, 0.2);
                    color: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .trend-indicator.negative {
                    background: rgba(220, 53, 69, 0.2);
                    color: var(--vscode-gitDecoration-deletedResourceForeground);
                }
                
                .badge {
                    font-size: 0.7rem;
                    padding: 2px 6px;
                    border-radius: 10px;
                    text-transform: uppercase;
                    font-weight: bold;
                    letter-spacing: 0.5px;
                }
                
                .badge.low {
                    background: rgba(108, 117, 125, 0.3);
                    color: #6c757d;
                }
                
                .badge.medium {
                    background: rgba(255, 193, 7, 0.3);
                    color: #ffc107;
                }
                
                .badge.high {
                    background: rgba(40, 167, 69, 0.3);
                    color: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .goal-status, .focus-level {
                    font-size: 0.8rem;
                    margin-left: auto;
                    font-weight: 500;
                }
                
                .goal-status.completed {
                    color: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .goal-status.in-progress {
                    color: var(--vscode-gitDecoration-modifiedResourceForeground);
                }
                
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                
                .human-color { color: var(--vscode-gitDecoration-addedResourceForeground); }
                .ai-color { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
                
                .charts-section {
                    margin: 32px 0;
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    padding: 24px;
                }
                
                .section-title {
                    font-size: 1.5rem;
                    font-weight: 600;
                    margin-bottom: 20px;
                    color: var(--vscode-textLink-foreground);
                    display: flex;
                    align-items: center;
                }
                
                .section-title::before {
                    content: '';
                    width: 4px;
                    height: 24px;
                    background: var(--vscode-textLink-foreground);
                    margin-right: 12px;
                    border-radius: 2px;
                }
                
                .chart-container {
                    position: relative;
                    height: 300px;
                    margin: 20px 0;
                }
                
                .controls-section {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin: 32px 0;
                }
                
                .control-group {
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                }
                
                .control-title {
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: var(--vscode-textLink-foreground);
                }
                
                .btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 0.9rem;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    margin: 4px;
                    min-width: 120px;
                }
                
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                
                .btn-secondary {
                    background: var(--vscode-editorWidget-background);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .btn-secondary:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                
                .btn-danger {
                    background: var(--vscode-gitDecoration-deletedResourceForeground);
                    color: white;
                }
                
                .achievement-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 16px;
                    margin-top: 20px;
                }
                
                .achievement-card {
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 16px;
                    transition: all 0.3s ease;
                    position: relative;
                }
                
                .achievement-card.unlocked {
                    border-left: 4px solid var(--vscode-gitDecoration-addedResourceForeground);
                    background: linear-gradient(135deg, var(--vscode-editorWidget-background) 0%, rgba(40, 167, 69, 0.1) 100%);
                }
                
                .achievement-card.locked {
                    opacity: 0.6;
                    border-left: 4px solid var(--vscode-gitDecoration-deletedResourceForeground);
                }
                
                .achievement-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .achievement-icon {
                    font-size: 1.5rem;
                    margin-right: 12px;
                }
                
                .achievement-name {
                    font-weight: 600;
                    font-size: 1.1rem;
                }
                
                .achievement-status {
                    margin-left: auto;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                
                .achievement-status.unlocked {
                    background: var(--vscode-gitDecoration-addedResourceForeground);
                    color: white;
                }
                
                .achievement-status.locked {
                    background: var(--vscode-gitDecoration-deletedResourceForeground);
                    color: white;
                }
                
                .achievement-description {
                    font-size: 0.9rem;
                    opacity: 0.8;
                    line-height: 1.4;
                }
                
                .achievements-header {
                    grid-column: 1 / -1;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 16px;
                }
                
                .achievement-progress {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 12px;
                }
                
                .achievement-progress-bar {
                    flex: 1;
                    height: 8px;
                    background: var(--vscode-progressBar-background);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .achievement-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #ffd700, #ffed4e);
                    border-radius: 4px;
                    transition: width 0.8s ease;
                    position: relative;
                }
                
                .achievement-progress-fill::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                    animation: shimmer 2s infinite;
                }
                
                .achievement-progress-text {
                    font-weight: 600;
                    font-family: 'SF Mono', Monaco, monospace;
                    color: var(--vscode-textLink-foreground);
                }
                
                .motivational-message {
                    font-style: italic;
                    color: var(--vscode-textLink-foreground);
                    text-align: center;
                    font-size: 1.1rem;
                }
                
                .achievement-unlock-date {
                    font-size: 0.8rem;
                    opacity: 0.6;
                    margin-top: 8px;
                    font-style: italic;
                }
                
                .achievement-card {
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                
                .achievement-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
                }
                
                .stats-tabs {
                    display: flex;
                    margin-bottom: 20px;
                    background: var(--vscode-editorGroupHeader-tabsBackground);
                    border-radius: 8px;
                    padding: 4px;
                }
                
                .tab-button {
                    flex: 1;
                    padding: 10px 16px;
                    background: transparent;
                    color: var(--vscode-tab-inactiveForeground);
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: inherit;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }
                
                .tab-button.active {
                    background: var(--vscode-tab-activeBackground);
                    color: var(--vscode-tab-activeForeground);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .tab-content {
                    display: none;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                .loading {
                    text-align: center;
                    padding: 40px;
                    opacity: 0.7;
                }
                
                .loading::after {
                    content: '⏳';
                    animation: spin 1s linear infinite;
                    font-size: 2rem;
                    display: block;
                    margin-top: 10px;
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .status-indicator {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-right: 8px;
                    animation: pulse 2s infinite;
                }
                
                .status-indicator.active {
                    background: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .status-indicator.inactive {
                    background: var(--vscode-gitDecoration-deletedResourceForeground);
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                /* Notification System */
                .notification-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .notification {
                    background: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 16px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    transform: translateX(100%);
                    animation: slideIn 0.3s ease forwards;
                    max-width: 350px;
                    position: relative;
                }
                
                .notification.success {
                    border-left: 4px solid var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .notification.info {
                    border-left: 4px solid var(--vscode-textLink-foreground);
                }
                
                .notification.warning {
                    border-left: 4px solid var(--vscode-gitDecoration-modifiedResourceForeground);
                }
                
                .notification-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .notification-icon {
                    font-size: 1.2rem;
                    margin-right: 8px;
                }
                
                .notification-title {
                    font-weight: 600;
                    flex: 1;
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    color: var(--vscode-editor-foreground);
                    cursor: pointer;
                    font-size: 1.2rem;
                    opacity: 0.7;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                }
                
                .notification-close:hover {
                    opacity: 1;
                }
                
                @keyframes slideIn {
                    to { transform: translateX(0); }
                }
                
                @keyframes slideOut {
                    to { transform: translateX(100%); }
                }
                
                /* Floating Action Button */
                .fab-container {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    z-index: 999;
                }
                
                .fab {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    transition: all 0.3s ease;
                }
                
                .fab:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 16px rgba(0,0,0,0.4);
                }
                
                .fab-menu {
                    position: absolute;
                    bottom: 70px;
                    right: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    opacity: 0;
                    transform: scale(0);
                    transition: all 0.3s ease;
                    transform-origin: bottom right;
                }
                
                .fab-menu.show {
                    opacity: 1;
                    transform: scale(1);
                }
                
                .fab-item {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: var(--vscode-editorWidget-background);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                
                .fab-item:hover {
                    background: var(--vscode-list-hoverBackground);
                    transform: scale(1.1);
                }
            </style>
        </head>
        <body>
            <div class="dashboard-header">
                <h1 class="dashboard-title">🤖✨ HumanAI Tracker</h1>
                <p class="dashboard-subtitle">Your intelligent coding companion tracking the perfect balance of human creativity and AI assistance</p>
                <div class="header-stats">
                    <div class="header-stat">
                        <span class="stat-label">Status</span>
                        <span class="stat-value" id="trackingStatus">
                            <span class="status-indicator active"></span>
                            Tracking Active
                        </span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-label">Session</span>
                        <span class="stat-value" id="sessionTime">0m</span>
                    </div>
                    <div class="header-stat">
                        <span class="stat-label">Focus Score</span>
                        <span class="stat-value" id="focusScore">0%</span>
                    </div>
                </div>
            </div>
            
            <div class="metrics-grid" id="metricsGrid">
                <div class="loading">Loading your coding insights...</div>
            </div>
            
            <!-- Quick Stats Bar -->
            <div class="quick-stats-bar">
                <div class="quick-stat">
                    <span class="quick-stat-icon">⚡</span>
                    <div>
                        <div class="quick-stat-value" id="streakCounter">0</div>
                        <div class="quick-stat-label">Day Streak</div>
                    </div>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-icon">🏆</span>
                    <div>
                        <div class="quick-stat-value" id="achievementCount">0/10</div>
                        <div class="quick-stat-label">Achievements</div>
                    </div>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-icon">📊</span>
                    <div>
                        <div class="quick-stat-value" id="weeklyTotal">0h</div>
                        <div class="quick-stat-label">This Week</div>
                    </div>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-icon">🎯</span>
                    <div>
                        <div class="quick-stat-value" id="efficiency">0%</div>
                        <div class="quick-stat-label">Efficiency</div>
                    </div>
                </div>
            </div>
            
            <div class="charts-section">
                <h2 class="section-title">📊 Analytics Overview</h2>
                <div class="stats-tabs">
                    <button class="tab-button active" onclick="switchTab('today')">Today</button>
                    <button class="tab-button" onclick="switchTab('week')">This Week</button>
                    <button class="tab-button" onclick="switchTab('month')">This Month</button>
                </div>
                <div id="today" class="tab-content active">
                    <div class="chart-container">
                        <canvas id="todayChart"></canvas>
                    </div>
                </div>
                <div id="week" class="tab-content">
                    <div class="chart-container">
                        <canvas id="weekChart"></canvas>
                    </div>
                </div>
                <div id="month" class="tab-content">
                    <div class="chart-container">
                        <canvas id="monthChart"></canvas>
                    </div>
                </div>
            </div>
            
            <div class="controls-section">
                <div class="control-group">
                    <h3 class="control-title">🎯 Quick Actions</h3>
                    <button class="btn" onclick="markAsHuman()">👨‍💻 Mark as Human</button>
                    <button class="btn" onclick="markAsAI()">🤖 Mark as AI</button>
                    <button class="btn btn-secondary" onclick="toggleTracking()">⏯️ Toggle Tracking</button>
                </div>
                
                <div class="control-group">
                    <h3 class="control-title">📁 Data Management</h3>
                    <button class="btn btn-secondary" onclick="exportData()">📤 Export Data</button>
                    <button class="btn btn-secondary" onclick="openSettings()">⚙️ Settings</button>
                    <button class="btn btn-danger" onclick="resetStats()">🔄 Reset Today</button>
                </div>
            </div>
            
            <div class="charts-section">
                <h2 class="section-title">🏆 Achievements</h2>
                <div class="achievement-grid" id="achievementsGrid">
                    <div class="loading">Loading achievements...</div>
                </div>
            </div>
            
            <!-- Notification System -->
            <div id="notificationContainer" class="notification-container"></div>
            
            <!-- Floating Action Button -->
            <div class="fab-container">
                <button class="fab" onclick="toggleQuickActions()" title="Quick Actions">
                    <span id="fabIcon">⚡</span>
                </button>
                <div class="fab-menu" id="fabMenu">
                    <button class="fab-item" onclick="markAsHuman()" title="Mark as Human">👨‍💻</button>
                    <button class="fab-item" onclick="markAsAI()" title="Mark as AI">🤖</button>
                    <button class="fab-item" onclick="exportData()" title="Export Data">📤</button>
                    <button class="fab-item" onclick="openSettings()" title="Settings">⚙️</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let charts = {};
                
                // Request initial data
                vscode.postMessage({ command: 'getData' });
                
                // Listen for data updates
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateData') {
                        updateDashboard(message.data);
                    }
                });
                
                function updateDashboard(data) {
                    updateMetrics(data);
                    updateQuickStats(data);
                    updateCharts(data);
                    updateAchievements(data.achievements);
                }
                
                function updateQuickStats(data) {
                    const { weekly, achievements } = data;
                    const weeklyHours = Math.floor((weekly.humanTime + weekly.aiTime) / 3600);
                    const unlockedAchievements = achievements.filter(a => a.unlocked).length;
                    const totalAchievements = achievements.length;
                    
                    // Calculate efficiency (human coding percentage)
                    const totalTime = data.today.humanTime + data.today.aiTime;
                    const efficiency = totalTime > 0 ? Math.round((data.today.humanTime / totalTime) * 100) : 0;
                    
                    document.getElementById('streakCounter').textContent = '1'; // Simplified - would be calculated from data
                    document.getElementById('achievementCount').textContent = \`\${unlockedAchievements}/\${totalAchievements}\`;
                    document.getElementById('weeklyTotal').textContent = \`\${weeklyHours}h\`;
                    document.getElementById('efficiency').textContent = \`\${efficiency}%\`;
                }
                
                function updateMetrics(data) {
                    const { today, metrics, dailyGoal } = data;
                    const totalMinutes = Math.floor((today.humanTime + today.aiTime) / 60);
                    const goalMinutes = dailyGoal;
                    
                    // Update header stats
                    document.getElementById('focusScore').textContent = \`\${metrics.focusScore || 0}%\`;
                    
                    // Update main metrics grid
                    document.getElementById('metricsGrid').innerHTML = \`
                        <div class="metric-card">
                            <div class="metric-header">
                                <span class="metric-icon">👨‍💻</span>
                                <div class="metric-title">Human Coding</div>
                                <div class="trend-indicator \${metrics.productivityTrend >= 0 ? 'positive' : 'negative'}">
                                    \${metrics.productivityTrend >= 0 ? '📈' : '📉'} \${Math.abs(metrics.productivityTrend)}%
                                </div>
                            </div>
                            <div class="metric-value human-color">\${formatTime(today.humanTime)}</div>
                            <div class="metric-subtitle">\${metrics.humanPercentage}% of total coding time</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: \${metrics.humanPercentage}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-header">
                                <span class="metric-icon">🤖</span>
                                <div class="metric-title">AI-Assisted</div>
                                <div class="ai-efficiency-badge">
                                    \${getEfficiencyBadge(metrics.aiPercentage)}
                                </div>
                            </div>
                            <div class="metric-value ai-color">\${formatTime(today.aiTime)}</div>
                            <div class="metric-subtitle">\${metrics.aiPercentage}% of total coding time</div>
                            <div class="progress-bar">
                                <div class="progress-fill ai-gradient" style="width: \${metrics.aiPercentage}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-header">
                                <span class="metric-icon">🎯</span>
                                <div class="metric-title">Daily Goal</div>
                                <div class="goal-status \${metrics.goalProgress >= 100 ? 'completed' : 'in-progress'}">
                                    \${metrics.goalProgress >= 100 ? '✅ Achieved!' : '⏳ In Progress'}
                                </div>
                            </div>
                            <div class="metric-value">\${totalMinutes}/\${goalMinutes}m</div>
                            <div class="metric-subtitle">\${metrics.goalProgress}% of daily goal achieved</div>
                            <div class="progress-bar">
                                <div class="progress-fill goal-gradient" style="width: \${Math.min(metrics.goalProgress, 100)}%"></div>
                            </div>
                        </div>
                        
                        <div class="metric-card">
                            <div class="metric-header">
                                <span class="metric-icon">🧠</span>
                                <div class="metric-title">Focus Score</div>
                                <div class="focus-level">
                                    \${getFocusLevel(metrics.focusScore || 0)}
                                </div>
                            </div>
                            <div class="metric-value">\${metrics.focusScore || 0}%</div>
                            <div class="metric-subtitle">\${getFocusDescription(metrics.focusScore || 0)}</div>
                            <div class="progress-bar">
                                <div class="progress-fill focus-gradient" style="width: \${metrics.focusScore || 0}%"></div>
                            </div>
                        </div>
                    \`;
                }
                
                function updateCharts(data) {
                    // Update today chart
                    updateChart('todayChart', 'Today\\'s Coding Time', {
                        human: data.today.humanTime / 60,
                        ai: data.today.aiTime / 60
                    });
                    
                    // Update weekly chart
                    updateChart('weekChart', 'This Week\\'s Coding Time', {
                        human: data.weekly.humanTime / 60,
                        ai: data.weekly.aiTime / 60
                    });
                    
                    // Update monthly chart
                    updateChart('monthChart', 'This Month\\'s Coding Time', {
                        human: data.monthly.humanTime / 60,
                        ai: data.monthly.aiTime / 60
                    });
                }
                
                function updateChart(canvasId, title, data) {
                    const ctx = document.getElementById(canvasId).getContext('2d');
                    
                    if (charts[canvasId]) {
                        charts[canvasId].destroy();
                    }
                    
                    charts[canvasId] = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['Human Coding', 'AI-Assisted'],
                            datasets: [{
                                data: [data.human, data.ai],
                                backgroundColor: [
                                    'rgba(40, 167, 69, 0.8)',
                                    'rgba(255, 193, 7, 0.8)'
                                ],
                                borderColor: [
                                    'rgba(40, 167, 69, 1)',
                                    'rgba(255, 193, 7, 1)'
                                ],
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {
                                    display: true,
                                    text: title,
                                    font: { size: 16, weight: 'bold' },
                                    color: 'var(--vscode-editor-foreground)'
                                },
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        color: 'var(--vscode-editor-foreground)',
                                        padding: 20,
                                        font: { size: 12 }
                                    }
                                }
                            }
                        }
                    });
                }
                
                function updateAchievements(achievements) {
                    const grid = document.getElementById('achievementsGrid');
                    const unlockedCount = achievements.filter(a => a.unlocked).length;
                    const totalCount = achievements.length;
                    
                    // Add motivational header
                    let motivationalMessage = getMotivationalMessage(unlockedCount, totalCount);
                    
                    grid.innerHTML = \`
                        <div class="achievements-header">
                            <div class="achievement-progress">
                                <div class="achievement-progress-bar">
                                    <div class="achievement-progress-fill" style="width: \${(unlockedCount/totalCount)*100}%"></div>
                                </div>
                                <span class="achievement-progress-text">\${unlockedCount}/\${totalCount} Unlocked</span>
                            </div>
                            <div class="motivational-message">\${motivationalMessage}</div>
                        </div>
                        \${achievements.map(achievement => \`
                            <div class="achievement-card \${achievement.unlocked ? 'unlocked' : 'locked'}" onclick="showAchievementDetails('\${achievement.id}')">
                                <div class="achievement-header">
                                    <span class="achievement-icon">\${achievement.icon}</span>
                                    <span class="achievement-name">\${achievement.name}</span>
                                    <span class="achievement-status \${achievement.unlocked ? 'unlocked' : 'locked'}">
                                        \${achievement.unlocked ? '✅ Unlocked' : '🔒 Locked'}
                                    </span>
                                </div>
                                <div class="achievement-description">\${achievement.description}</div>
                                \${achievement.unlocked ? '<div class="achievement-unlock-date">Unlocked: ' + (achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : 'Recently') + '</div>' : ''}
                            </div>
                        \`).join('')}
                    \`;
                }
                
                function getMotivationalMessage(unlocked, total) {
                    const percentage = (unlocked / total) * 100;
                    if (percentage === 100) return "🎉 Amazing! You've unlocked all achievements!";
                    if (percentage >= 80) return "🌟 You're almost there! Just a few more to go!";
                    if (percentage >= 60) return "🚀 Great progress! Keep up the excellent work!";
                    if (percentage >= 40) return "💪 You're doing well! More achievements await!";
                    if (percentage >= 20) return "🎯 Good start! Many exciting achievements ahead!";
                    return "🌱 Begin your journey and unlock amazing achievements!";
                }
                
                function showAchievementDetails(achievementId) {
                    // Placeholder for achievement details modal
                    console.log('Show details for achievement:', achievementId);
                }
                
                function formatTime(seconds) {
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    if (hours > 0) {
                        return \`\${hours}h \${minutes}m\`;
                    }
                    return \`\${minutes}m \${seconds % 60}s\`;
                }
                
                function getProductivityStatus(score) {
                    if (score >= 90) return 'Exceptional performance! 🌟';
                    if (score >= 75) return 'Great productivity! 🚀';
                    if (score >= 60) return 'Good progress 👍';
                    if (score >= 40) return 'Room for improvement 📈';
                    return 'Let\\'s boost your productivity! 💪';
                }
                
                function getEfficiencyBadge(aiPercentage) {
                    if (aiPercentage < 20) return '<span class="badge low">Low AI Usage</span>';
                    if (aiPercentage < 50) return '<span class="badge medium">Balanced Approach</span>';
                    return '<span class="badge high">AI-Powered</span>';
                }
                
                function getFocusLevel(score) {
                    if (score >= 80) return '🎯 Deep Focus';
                    if (score >= 60) return '🔍 Focused';
                    if (score >= 40) return '⚡ Active';
                    if (score >= 20) return '🔄 Building';
                    return '🌱 Starting';
                }
                
                function getFocusDescription(score) {
                    if (score >= 80) return 'Excellent sustained concentration';
                    if (score >= 60) return 'Good focus with minimal interruptions';
                    if (score >= 40) return 'Moderate focus, some breaks';
                    if (score >= 20) return 'Building focus momentum';
                    return 'Just getting started';
                }
                
                function switchTab(tabName) {
                    // Remove active class from all tabs and content
                    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                    
                    // Add active class to clicked tab and corresponding content
                    event.target.classList.add('active');
                    document.getElementById(tabName).classList.add('active');
                }
                
                // Control functions
                function markAsHuman() {
                    vscode.postMessage({ command: 'markAsHuman' });
                    showNotification('success', 'Session Updated', 'Current session marked as human-coded');
                }
                
                function markAsAI() {
                    vscode.postMessage({ command: 'markAsAI' });
                    showNotification('info', 'Session Updated', 'Current session marked as AI-assisted');
                }
                
                function exportData() {
                    vscode.postMessage({ command: 'exportData' });
                    showNotification('info', 'Export Started', 'Your coding data export has been initiated');
                }
                
                function toggleTracking() {
                    vscode.postMessage({ command: 'toggleTracking' });
                    showNotification('info', 'Tracking Toggled', 'Time tracking status has been changed');
                }
                
                function resetStats() {
                    vscode.postMessage({ command: 'resetStats' });
                }
                
                function openSettings() {
                    vscode.postMessage({ command: 'openSettings' });
                    showNotification('info', 'Settings Opened', 'Extension settings panel is now open');
                }
                
                // Notification System
                function showNotification(type, title, message, duration = 5000) {
                    const container = document.getElementById('notificationContainer');
                    const notification = document.createElement('div');
                    notification.className = \`notification \${type}\`;
                    
                    const iconMap = {
                        success: '✅',
                        info: 'ℹ️',
                        warning: '⚠️',
                        error: '❌'
                    };
                    
                    notification.innerHTML = \`
                        <div class="notification-header">
                            <span class="notification-icon">\${iconMap[type] || 'ℹ️'}</span>
                            <span class="notification-title">\${title}</span>
                            <button class="notification-close" onclick="closeNotification(this)">×</button>
                        </div>
                        <div class="notification-message">\${message}</div>
                    \`;
                    
                    container.appendChild(notification);
                    
                    // Auto-remove after duration
                    setTimeout(() => {
                        if (notification.parentNode) {
                            closeNotification(notification.querySelector('.notification-close'));
                        }
                    }, duration);
                }
                
                function closeNotification(button) {
                    const notification = button.closest('.notification');
                    notification.style.animation = 'slideOut 0.3s ease forwards';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }
                
                // Floating Action Button
                let fabMenuOpen = false;
                function toggleQuickActions() {
                    const menu = document.getElementById('fabMenu');
                    const icon = document.getElementById('fabIcon');
                    
                    fabMenuOpen = !fabMenuOpen;
                    
                    if (fabMenuOpen) {
                        menu.classList.add('show');
                        icon.textContent = '×';
                    } else {
                        menu.classList.remove('show');
                        icon.textContent = '⚡';
                    }
                }
                
                // Keyboard shortcuts
                document.addEventListener('keydown', function(e) {
                    if (e.ctrlKey || e.metaKey) {
                        switch(e.key) {
                            case 'h':
                                e.preventDefault();
                                markAsHuman();
                                break;
                            case 'm':
                                e.preventDefault();
                                markAsAI();
                                break;
                            case 'e':
                                e.preventDefault();
                                exportData();
                                break;
                            case 't':
                                e.preventDefault();
                                toggleTracking();
                                break;
                        }
                    }
                });
                
                // Initialize dashboard
                document.addEventListener('DOMContentLoaded', function() {
                    showNotification('success', 'Dashboard Ready', 'Your HumanAI Tracker dashboard is loaded and ready!');
                });
            </script>
        </body>
        </html>`;
    }
}
