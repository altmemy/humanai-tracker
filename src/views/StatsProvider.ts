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

export class StatsProvider implements vscode.TreeDataProvider<StatsItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatsItem | undefined | null | void> = new vscode.EventEmitter<StatsItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatsItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private dataManager: DataManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatsItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: StatsItem): Thenable<StatsItem[]> {
        if (!element) {
            const stats = this.dataManager.getTodayStats();
            const goal = this.dataManager.getDailyGoal();
            
            return Promise.resolve([
                new StatsItem('Human Time', `${Math.floor(stats.humanTime / 60)}m`, 'humanTime'),
                new StatsItem('AI Time', `${Math.floor(stats.aiTime / 60)}m`, 'aiTime'),
                new StatsItem('Total Time', `${Math.floor(stats.totalTime / 60)}m`, 'totalTime'),
                new StatsItem('Daily Goal', `${goal}m`, 'goal'),
                new StatsItem('Productivity', `${stats.productivity}%`, 'productivity')
            ]);
        }
        return Promise.resolve([]);
    }
}

class StatsItem extends vscode.TreeItem {
    public tooltip: string;
    
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly type: string
    ) {
        super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label}: ${this.value}`;
    }
}