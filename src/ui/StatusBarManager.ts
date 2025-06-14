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

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private trackingStatusItem: vscode.StatusBarItem;

    constructor() {
        // Create status bar items using stable API
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100
        );
        
        this.trackingStatusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            99
        );

        // Set up basic properties
        this.statusBarItem.command = 'humanai-tracker.showDashboard';
        this.trackingStatusItem.command = 'humanai-tracker.toggleTracking';
        
        this.updateStatus(true);
    }

    updateTime(humanTime: number, aiTime: number) {
        const humanMinutes = Math.floor(humanTime / 60);
        const aiMinutes = Math.floor(aiTime / 60);
        const totalMinutes = humanMinutes + aiMinutes;
        const humanPercentage = totalMinutes > 0 ? Math.round((humanMinutes / totalMinutes) * 100) : 0;
        
        this.statusBarItem.text = `$(clock) ${humanMinutes}m Human | ${aiMinutes}m AI (${humanPercentage}% human)`;
        this.statusBarItem.tooltip = `HumanAI Tracker - Today's coding time\nHuman: ${humanMinutes} minutes\nAI: ${aiMinutes} minutes\nHuman percentage: ${humanPercentage}%\nClick to view dashboard`;
    }

    updateStatus(isTracking: boolean, currentMode?: 'human' | 'ai' | 'idle') {
        if (isTracking) {
            const modeIcon = currentMode === 'human' ? '👨‍💻' : currentMode === 'ai' ? '🤖' : '⏸️';
            const modeText = currentMode === 'human' ? 'Human' : currentMode === 'ai' ? 'AI' : 'Idle';
            
            this.trackingStatusItem.text = `$(record) ${modeIcon} ${modeText}`;
            this.trackingStatusItem.tooltip = `HumanAI Tracker is active\nCurrent mode: ${modeText}\nClick to pause`;
            this.trackingStatusItem.backgroundColor = undefined;
        } else {
            this.trackingStatusItem.text = '$(debug-pause) Paused';
            this.trackingStatusItem.tooltip = 'HumanAI Tracker is paused - Click to resume';
            this.trackingStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    show() {
        this.statusBarItem.show();
        this.trackingStatusItem.show();
    }

    hide() {
        this.statusBarItem.hide();
        this.trackingStatusItem.hide();
    }

    dispose() {
        this.statusBarItem.dispose();
        this.trackingStatusItem.dispose();
    }
}