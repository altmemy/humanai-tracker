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

interface SessionData {
    startTime: Date;
    humanTime: number;
    aiTime: number;
    lastActivity: Date;
    currentMode: 'human' | 'ai' | 'idle';
    languageStats: Map<string, number>;
}

export class TimeTracker {
    private isTracking: boolean = true;
    private session: SessionData;
    private idleTimer: any;
    private tickTimer: any;
    private aiPatterns: string[];
    private idleTimeout: number;
    private lastContent: string = '';
    private aiSuggestionActive: boolean = false;
    private lastChangeTime: number = 0;
    private clipboardContent: string = '';
    private recentPasteDetected: boolean = false;
    private copilotExtensionActive: boolean = false;

    constructor(private dataManager: DataManager) {
        const config = vscode.workspace.getConfiguration('humanai-tracker');
        this.aiPatterns = config.get('aiPatterns', [
            'copilot', 'tabnine', 'kite', 'codewhisperer', 'chatgpt', 'claude', 
            'bard', 'github.copilot', 'ai-generated', 'auto-generated'
        ]);
        this.idleTimeout = config.get('idleTimeout', 300) * 1000; // Convert to ms

        this.session = {
            startTime: new Date(),
            humanTime: 0,
            aiTime: 0,
            lastActivity: new Date(),
            currentMode: 'idle',
            languageStats: new Map()
        };

        this.initializeClipboardMonitoring();
    }

    startTracking() {
        this.isTracking = true;
        this.tickTimer = setInterval(() => {
            this.updateTime();
        }, 1000);
        this.detectAISuggestions();
        this.detectCopilotExtension();
    }

    stopTracking() {
        this.isTracking = false;
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = undefined;
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.saveSession();
    }

    toggleTracking(): boolean {
        this.isTracking = !this.isTracking;
        if (this.isTracking) {
            this.startTracking();
        } else {
            this.stopTracking();
        }
        return this.isTracking;
    }

    onTextChange(event: vscode.TextDocumentChangeEvent) {
        if (!this.isTracking) {return;}

        const changes = event.contentChanges;
        if (changes.length === 0) {return;}

        // Reset idle timer
        this.resetIdleTimer();

        // Detect if change is from AI
        const isAIAssisted = this.detectAIAssistance(changes, event.document);
        
        // Update mode
        this.session.currentMode = isAIAssisted ? 'ai' : 'human';
        this.session.lastActivity = new Date();

        // Track language statistics
        const language = event.document.languageId;
        const currentTime = this.session.languageStats.get(language) || 0;
        this.session.languageStats.set(language, currentTime + 1);

        // Save incremental changes
        if (Date.now() - this.session.startTime.getTime() > 30000) { // Every 30 seconds
            this.saveSession();
        }
    }

    onEditorChange(editor: vscode.TextEditor) {
        if (!this.isTracking) {return;}
        this.resetIdleTimer();
    }

    private detectAIAssistance(changes: readonly vscode.TextDocumentContentChangeEvent[], document: vscode.TextDocument): boolean {
        const currentTime = Date.now();
        const config = vscode.workspace.getConfiguration('humanai-tracker');
        const minAiInsertionSize = config.get('minAiInsertionSize', 30);
        const detectLargePastes = config.get('detectLargePastes', true);
        
        // Check for large insertions (typical of AI completions)
        const hasLargeInsertion = changes.some(change => {
            const lines = change.text.split('\n');
            const textLength = change.text.length;
            
            // Large multi-line insertions are likely AI
            if (lines.length > 3 || textLength > minAiInsertionSize * 5) {
                return true;
            }
            
            // Complete function/class insertions
            if (textLength > minAiInsertionSize && (
                change.text.includes('function') || 
                change.text.includes('class') ||
                change.text.includes('def ') ||
                change.text.includes('public ') ||
                change.text.includes('private ') ||
                (change.text.includes('{') && change.text.includes('}'))
            )) {
                return true;
            }
            
            return false;
        });

        if (hasLargeInsertion) {
            return true;
        }

        // Check for rapid successive changes (typical of AI suggestions being accepted)
        if (currentTime - this.lastChangeTime < 100) { // Less than 100ms between changes
            const totalChangeSize = changes.reduce((sum, change) => sum + change.text.length, 0);
            if (totalChangeSize > minAiInsertionSize) { // Large changes in rapid succession
                return true;
            }
        }
        this.lastChangeTime = currentTime;

        // Check for paste operations from external sources
        if (this.recentPasteDetected && detectLargePastes) {
            this.recentPasteDetected = false;
            return true;
        }

        // Check if GitHub Copilot is active
        if (this.copilotExtensionActive && this.aiSuggestionActive) {
            return true;
        }

        // Check for AI patterns in the inserted text or document
        const insertedText = changes.map(c => c.text).join('');
        const hasAIComments = this.aiPatterns.some(pattern => 
            insertedText.toLowerCase().includes(pattern.toLowerCase()) ||
            document.getText().toLowerCase().includes(pattern.toLowerCase())
        );

        // Check for code that looks auto-generated (common AI patterns)
        const autoGeneratedPatterns = [
            /\/\*\s*(auto[\s-]?generated|generated\s*by|ai[\s-]?generated|copilot)/i,
            /\/\/\s*(auto[\s-]?generated|generated\s*by|ai[\s-]?generated|copilot|tabnine|kite)/i,
            /#\s*(auto[\s-]?generated|generated\s*by|ai[\s-]?generated|copilot)/i,
            /TODO:\s*(generated|auto|copilot|ai)/i,
            /FIXME:\s*(generated|auto|copilot|ai)/i,
            /NOTE:\s*(generated|auto|copilot|ai)/i,
            /\/\*\s*eslint-disable.*generated/i,
            /\/\*\s*@generated/i
        ];

        const hasAutoGeneratedPattern = autoGeneratedPatterns.some(pattern => 
            pattern.test(insertedText) || pattern.test(document.getText())
        );

        // Check for extremely fast typing (inhuman speed)
        const typingSpeed = insertedText.length / Math.max(currentTime - this.lastChangeTime, 1) * 1000; // chars per second
        const isInhumanSpeed = typingSpeed > 20; // More than 20 characters per second

        return hasAIComments || hasAutoGeneratedPattern || isInhumanSpeed;
    }

    private detectAISuggestions() {
        // Monitor for GitHub Copilot and other AI suggestions
        vscode.commands.getCommands().then(commands => {
            const aiCommands = commands.filter(cmd => 
                cmd.includes('github.copilot') || 
                cmd.includes('tabnine') ||
                cmd.includes('kite') ||
                cmd.includes('aws.codewhisperer') ||
                cmd.includes('copilot')
            );
            
            if (aiCommands.length > 0) {
                // Set up monitoring for AI suggestions
                const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
                    // Enhanced AI suggestion detection
                    if (e.contentChanges.length > 0) {
                        const change = e.contentChanges[0];
                        
                        // Detect multi-line completions (typical AI behavior)
                        const isMultiLineInsertion = change.text.includes('\n') && change.rangeLength === 0;
                        
                        // Detect large single insertions
                        const isLargeInsertion = change.text.length > 30 && change.rangeLength === 0;
                        
                        // Detect completions that replace a range (typical of AI)
                        const isReplacement = change.rangeLength > 0 && change.text.length > change.rangeLength;
                        
                        if (isMultiLineInsertion || isLargeInsertion || isReplacement) {
                            this.aiSuggestionActive = true;
                            // Keep the flag active for a short period
                            setTimeout(() => {
                                this.aiSuggestionActive = false;
                            }, 2000); // 2 seconds
                        }
                        
                        // Detect rapid typing followed by large insertion (AI completion)
                        const currentTime = Date.now();
                        if (currentTime - this.lastChangeTime < 500 && change.text.length > 10) {
                            this.aiSuggestionActive = true;
                            setTimeout(() => {
                                this.aiSuggestionActive = false;
                            }, 1500);
                        }
                    }
                });

                // Monitor for specific Copilot commands
                const copilotCommands = [
                    'github.copilot.generate',
                    'github.copilot.acceptInlineSuggestion',
                    'github.copilot.acceptPanelSuggestion',
                    'github.copilot.nextInlineSuggestion',
                    'github.copilot.previousInlineSuggestion'
                ];

                copilotCommands.forEach(cmd => {
                    const commandDisposable = vscode.commands.registerCommand(`track.${cmd}`, () => {
                        this.aiSuggestionActive = true;
                        setTimeout(() => {
                            this.aiSuggestionActive = false;
                        }, 3000);
                        // Execute the original command
                        vscode.commands.executeCommand(cmd);
                    });
                });

                // Listen for Copilot suggestion acceptance via keybindings
                const keybindingDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
                    // If a large amount of text is inserted at once, likely AI
                    if (e.contentChanges.some(change => 
                        change.text.length > 20 && 
                        change.rangeLength === 0 &&
                        this.copilotExtensionActive
                    )) {
                        this.aiSuggestionActive = true;
                        setTimeout(() => {
                            this.aiSuggestionActive = false;
                        }, 2000);
                    }
                });
            }
        });

        // Also monitor for selection changes that might indicate AI suggestion acceptance
        vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.selections.length === 1 && e.selections[0].isEmpty) {
                // Check if cursor moved significantly (might indicate AI completion)
                const selection = e.selections[0];
                if (this.copilotExtensionActive) {
                    // Brief activation when cursor moves (might be from AI completion)
                    this.aiSuggestionActive = true;
                    setTimeout(() => {
                        this.aiSuggestionActive = false;
                    }, 500);
                }
            }
        });
    }

    private resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => {
            this.session.currentMode = 'idle';
        }, this.idleTimeout);
    }

    private updateTime() {
        if (!this.isTracking || this.session.currentMode === 'idle') {return;}

        if (this.session.currentMode === 'human') {
            this.session.humanTime++;
        } else if (this.session.currentMode === 'ai') {
            this.session.aiTime++;
        }
    }

    private saveSession() {
        const sessionEnd = new Date();
        const totalTime = (sessionEnd.getTime() - this.session.startTime.getTime()) / 1000;

        this.dataManager.saveSession({
            date: this.session.startTime,
            humanTime: this.session.humanTime,
            aiTime: this.session.aiTime,
            totalTime: totalTime,
            languages: Array.from(this.session.languageStats.entries()).map(([lang, time]) => ({
                language: lang,
                time: time
            })),
            productivity: this.calculateProductivity()
        });

        // Reset session
        this.session = {
            startTime: new Date(),
            humanTime: 0,
            aiTime: 0,
            lastActivity: new Date(),
            currentMode: this.session.currentMode,
            languageStats: new Map()
        };
    }

    private calculateProductivity(): number {
        const totalCodingTime = this.session.humanTime + this.session.aiTime;
        if (totalCodingTime === 0) {return 0;}

        // Productivity score based on human coding ratio and consistency
        const humanRatio = this.session.humanTime / totalCodingTime;
        const consistencyScore = Math.min(totalCodingTime / 3600, 1); // Max 1 for 1 hour of coding
        
        return Math.round((humanRatio * 0.7 + consistencyScore * 0.3) * 100);
    }

    getSessionStats() {
        return {
            humanTime: this.session.humanTime,
            aiTime: this.session.aiTime,
            currentMode: this.session.currentMode,
            languages: Array.from(this.session.languageStats.entries())
        };
    }

    forceMode(mode: 'human' | 'ai' | 'idle') {
        this.session.currentMode = mode;
        this.session.lastActivity = new Date();
        this.resetIdleTimer();
    }

    private initializeClipboardMonitoring() {
        // Monitor clipboard changes to detect external code pasting
        let lastClipboard = '';
        
        const checkClipboard = async () => {
            try {
                const currentClipboard = await vscode.env.clipboard.readText();
                if (currentClipboard !== lastClipboard && currentClipboard.length > 50) {
                    // Detect if clipboard contains code-like content
                    const codePatterns = [
                        /function\s+\w+\s*\(/,
                        /class\s+\w+/,
                        /import\s+.+from/,
                        /const\s+\w+\s*=/,
                        /let\s+\w+\s*=/,
                        /var\s+\w+\s*=/,
                        /def\s+\w+\s*\(/,
                        /public\s+class/,
                        /private\s+\w+/,
                        /<\w+.*>/,
                        /\{\s*\n.*\n\s*\}/s
                    ];
                    
                    const looksLikeCode = codePatterns.some(pattern => pattern.test(currentClipboard));
                    if (looksLikeCode) {
                        this.clipboardContent = currentClipboard;
                        // Mark next paste as potentially AI-generated
                        setTimeout(() => {
                            this.recentPasteDetected = true;
                            setTimeout(() => {
                                this.recentPasteDetected = false;
                            }, 5000); // Clear flag after 5 seconds
                        }, 100);
                    }
                }
                lastClipboard = currentClipboard;
            } catch (error) {
                // Ignore clipboard access errors
            }
        };

        // Check clipboard every 2 seconds
        setInterval(checkClipboard, 2000);
    }

    private detectCopilotExtension() {
        // Detect if GitHub Copilot extension is installed and active
        const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
        if (copilotExtension) {
            this.copilotExtensionActive = copilotExtension.isActive;
        }

        // Also check for other AI extensions
        const aiExtensions = [
            'GitHub.copilot',
            'TabNine.tabnine-vscode',
            'kiteco.kite',
            'AmazonWebServices.aws-toolkit-vscode', // CodeWhisperer
            'ms-toolsai.jupyter', // Can include AI features
            'ms-python.python' // Can include AI features
        ];

        aiExtensions.forEach(extId => {
            const extension = vscode.extensions.getExtension(extId);
            if (extension && extension.isActive) {
                this.copilotExtensionActive = true;
            }
        });

        // Watch for extension activation changes
        vscode.extensions.onDidChange(() => {
            this.detectCopilotExtension();
        });
    }
}