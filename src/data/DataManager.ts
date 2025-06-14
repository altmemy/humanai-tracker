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
import * as fs from 'fs';
import * as path from 'path';

interface SessionRecord {
    date: Date;
    humanTime: number;
    aiTime: number;
    totalTime: number;
    languages: Array<{ language: string; time: number }>;
    productivity: number;
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: Date;
}

export class DataManager {
    private dataPath: string;
    private sessions: SessionRecord[] = [];
    private achievements: Achievement[] = [];
    private dailyGoal: number = 120; // minutes

    constructor(private context: vscode.ExtensionContext) {
        this.dataPath = path.join(context.globalStorageUri.fsPath, 'data.json');
        this.loadData();
        this.initializeAchievements();
    }

    saveSession(session: SessionRecord) {
        this.sessions.push(session);
        this.saveData();
    }

    getTodayStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaySessions = this.sessions.filter(s => {
            const sessionDate = new Date(s.date);
            sessionDate.setHours(0, 0, 0, 0);
            return sessionDate.getTime() === today.getTime();
        });

        return {
            humanTime: todaySessions.reduce((sum, s) => sum + s.humanTime, 0),
            aiTime: todaySessions.reduce((sum, s) => sum + s.aiTime, 0),
            totalTime: todaySessions.reduce((sum, s) => sum + s.totalTime, 0),
            productivity: todaySessions.length > 0 ? 
                Math.round(todaySessions.reduce((sum, s) => sum + s.productivity, 0) / todaySessions.length) : 0
        };
    }

    getWeeklyStats() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const weekSessions = this.sessions.filter(s => {
            const sessionDate = new Date(s.date);
            return sessionDate >= startOfWeek;
        });

        return {
            humanTime: weekSessions.reduce((sum, s) => sum + s.humanTime, 0),
            aiTime: weekSessions.reduce((sum, s) => sum + s.aiTime, 0),
            totalTime: weekSessions.reduce((sum, s) => sum + s.totalTime, 0),
            productivity: weekSessions.length > 0 ? 
                Math.round(weekSessions.reduce((sum, s) => sum + s.productivity, 0) / weekSessions.length) : 0
        };
    }

    getMonthlyStats() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const monthSessions = this.sessions.filter(s => {
            const sessionDate = new Date(s.date);
            return sessionDate >= startOfMonth;
        });

        return {
            humanTime: monthSessions.reduce((sum, s) => sum + s.humanTime, 0),
            aiTime: monthSessions.reduce((sum, s) => sum + s.aiTime, 0),
            totalTime: monthSessions.reduce((sum, s) => sum + s.totalTime, 0),
            productivity: monthSessions.length > 0 ? 
                Math.round(monthSessions.reduce((sum, s) => sum + s.productivity, 0) / monthSessions.length) : 0
        };
    }

    getDailyGoal(): number {
        return this.dailyGoal;
    }

    setDailyGoal(minutes: number) {
        this.dailyGoal = minutes;
        this.saveData();
    }

    checkAchievements(): Achievement[] {
        const newAchievements: Achievement[] = [];
        const stats = this.getTodayStats();
        
        // Check various achievements
        this.achievements.forEach(achievement => {
            if (!achievement.unlocked) {
                let shouldUnlock = false;
                
                switch (achievement.id) {
                    case 'first-hour':
                        shouldUnlock = (stats.humanTime + stats.aiTime) >= 3600;
                        break;
                    case 'pure-human':
                        shouldUnlock = stats.humanTime >= 1800 && stats.aiTime === 0;
                        break;
                }
                
                if (shouldUnlock) {
                    achievement.unlocked = true;
                    achievement.unlockedAt = new Date();
                    newAchievements.push(achievement);
                }
            }
        });
        
        if (newAchievements.length > 0) {
            this.saveData();
        }
        
        return newAchievements;
    }

    getAchievements(): Achievement[] {
        return this.achievements;
    }

    async exportData(uri: vscode.Uri) {
        const data = {
            sessions: this.sessions,
            achievements: this.achievements,
            dailyGoal: this.dailyGoal,
            exportDate: new Date()
        };
        
        const content = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    }

    private loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
                this.sessions = data.sessions || [];
                this.achievements = data.achievements || [];
                this.dailyGoal = data.dailyGoal || 120;
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    private saveData() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const data = {
                sessions: this.sessions,
                achievements: this.achievements,
                dailyGoal: this.dailyGoal
            };
            
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    private initializeAchievements() {
        if (this.achievements.length === 0) {
            this.achievements = [
                {
                    id: 'first-hour',
                    name: 'First Hour',
                    description: 'Code for your first hour',
                    icon: '⏰',
                    unlocked: false
                },
                {
                    id: 'pure-human',
                    name: 'Pure Human',
                    description: 'Code for 30 minutes without AI assistance',
                    icon: '🧠',
                    unlocked: false
                }
            ];
        }
    }

    resetDailyStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Remove all sessions from today
        this.sessions = this.sessions.filter(s => {
            const sessionDate = new Date(s.date);
            sessionDate.setHours(0, 0, 0, 0);
            return sessionDate.getTime() !== today.getTime();
        });
        
        this.saveData();
    }
}