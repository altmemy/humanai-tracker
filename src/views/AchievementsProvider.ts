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

export class AchievementsProvider implements vscode.TreeDataProvider<AchievementItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AchievementItem | undefined | null | void> = new vscode.EventEmitter<AchievementItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AchievementItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private dataManager: DataManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AchievementItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AchievementItem): Thenable<AchievementItem[]> {
        if (!element) {
            const achievements = this.dataManager.getAchievements();
            return Promise.resolve(achievements.map(achievement => 
                new AchievementItem(achievement.name, achievement.description, achievement.unlocked, achievement.icon)
            ));
        }
        return Promise.resolve([]);
    }
}

class AchievementItem extends vscode.TreeItem {
    public tooltip: string;
    
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly unlocked: boolean,
        public readonly icon: string
    ) {
        super(`${icon} ${label}`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.description;
        this.description = unlocked ? 'Unlocked' : 'Locked';
    }
}