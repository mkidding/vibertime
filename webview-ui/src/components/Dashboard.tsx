import React, { useState } from 'react';
import { Machine } from '../slot/components/Machine';
import { ResultOverlay } from '../slot/components/ResultOverlay';
import { DebugPanel } from './DebugPanel';
import { calculateVibePercentage } from '../slot/utils/gameLogic';
import type { GameState, SpinResult, AdviceResult } from '../slot/types';
import { vscode } from '../utils/vscode';

export interface DashboardProps {
    activeSeconds: number;
    typingSeconds: number;
    reviewingSeconds: number;
    timeRatio: number;
    cyborgRatio: number;
    humanChars: number;
    aiChars: number;
    refactorChars?: number;
    humanTypedLines?: number;
    humanRefactoredLines?: number;
    aiGeneratedLines?: number;
    aiEditedLines?: number;
    bedtime: string;
    dayStartHour: number;
    idleTimeoutSeconds: number;
    timeUntilBedtime: number;
    targetBedtimeMs: number;
    onSnooze: (minutes: number) => void;
    currentSimulatedTime?: number;
    isSnoozed?: boolean;
    slotState?: SlotState;
}

interface SlotState {
    runsRemaining: number;
    currentEnergy: number;
    currentScore: number;
    dailyHighScore: number;
    bestAnalysis: {
        category: string;
        percentage: number;
        text: string;
    } | null;
    spinHistory?: any[];
}

const INITIAL_GAME_STATE: GameState = {
    shotsLeft: 3,
    totalScore: 0,
    spinHistory: [],
    isSpinning: false,
    gameOver: false,
    vibePercentage: 0,
    advice: null,
};

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
};

const useCountdown = (targetMs: number, simulatedTime?: number) => {
    const [display, setDisplay] = useState("--:--:--");

    React.useEffect(() => {
        const offset = simulatedTime ? simulatedTime - Date.now() : 0;

        const tick = () => {
            const now = Date.now() + offset;
            let diff = targetMs - now;

            if (diff <= 0) {
                // Hard Stop / Expired State (handled by parent logic for text, but here we can stick to 00:00:00 or negative?)
                // If snoozed, we show negative countdown?
                // Actually Timer Audit says:
                // "State C (Hard Stop): Now > (Bedtime + Snooze). UI: '00:00:00' (Static)."
                // "State B (Snoozed): Bedtime < Now < (Bedtime + Snooze). UI: Countdown (Orange)."
                // Since targetMs INCLUDES snooze, diff > 0 means we are in State A or B.
                // If diff <= 0, we are in State C.
                setDisplay("00:00:00");
                return;
            }

            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            setDisplay(
                `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            );
        };

        const timer = setInterval(tick, 1000);
        tick();

        return () => clearInterval(timer);
    }, [targetMs, simulatedTime]);

    return display;
};

const GearIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const SettingsOverlay: React.FC<{
    bedtime: string;
    dayStartHour: number;
    idleTimeoutSeconds: number;
    onClose: () => void;
    onUnlockDebug: () => void;
}> = ({ bedtime, dayStartHour, idleTimeoutSeconds, onClose, onUnlockDebug }) => {
    const [bedtimeValue, setBedtimeValue] = useState(bedtime);
    const [startHour, setStartHour] = useState(dayStartHour);
    const [timeoutVal, setTimeoutVal] = useState(idleTimeoutSeconds);
    const [titleClicks, setTitleClicks] = useState(0);

    const handleTitleClick = () => {
        const newCount = titleClicks + 1;
        setTitleClicks(newCount);
        if (newCount === 5) {
            onUnlockDebug();
        }
    };

    const handleSave = () => {
        vscode.postMessage({
            type: 'saveSettings',
            payload: {
                bedtime: bedtimeValue,
                dayStartHour: startHour,
                idleTimeoutSeconds: timeoutVal
            }
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg border-2 border-purple-500 w-96">
                <h2
                    className="text-xl font-bold text-purple-400 mb-4 uppercase select-none cursor-pointer hover:text-purple-300 transition-colors"
                    onClick={handleTitleClick}
                >
                    Settings {titleClicks > 0 && titleClicks < 5 && <span className="text-xs text-gray-600">({5 - titleClicks})</span>}
                </h2>
                <div className="space-y-4">
                    <div className="border-b border-gray-700 pb-4 mb-4">
                        <label className="block text-xs uppercase text-gray-500 mb-2 font-bold tracking-wider">Mission Goals</label>
                        <div className="mb-3">
                            <label className="block text-sm text-gray-400 mb-1">Target Bedtime</label>
                            <input type="time" value={bedtimeValue} onChange={(e) => setBedtimeValue(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white font-mono" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-500 mb-2 font-bold tracking-wider">System Config</label>
                        <div className="mb-3">
                            <label className="block text-sm text-gray-400 mb-1">Day Start Hour (0-23)</label>
                            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white">
                                {[0, 1, 2, 3, 4, 5, 6].map(h => (
                                    <option key={h} value={h}>{h}:00 AM</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-500 mt-1">Metrics reset at this time.</p>
                        </div>
                        <div className="mb-3">
                            <label className="block text-sm text-gray-400 mb-1">Idle Timeout (Seconds)</label>
                            <input type="number" value={timeoutVal} onChange={(e) => setTimeoutVal(Number(e.target.value))} min={5} max={300} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white" />
                        </div>
                        <div className="pt-2 border-t border-gray-700">
                            <button
                                onClick={() => {
                                    vscode.postMessage({ type: 'checkUpdates' });
                                    // Visual Feedback only (fire and forget)
                                    const btn = document.getElementById('btn-check-updates');
                                    if (btn) {
                                        btn.innerText = "CHECKING...";
                                        btn.classList.add('opacity-50', 'cursor-not-allowed');
                                        setTimeout(() => {
                                            btn.innerText = "Check for Updates";
                                            btn.classList.remove('opacity-50', 'cursor-not-allowed');
                                        }, 2000);
                                    }
                                }}
                                id="btn-check-updates"
                                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-mono text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="text-purple-400">⚡</span> Check for Updates
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-6">
                        <button onClick={onClose} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-bold">Cancel</button>
                        <button onClick={handleSave} className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold">Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = (props) => {
    const [showSettings, setShowSettings] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [isDebugEnabled, setIsDebugEnabled] = useState(false);

    // Initialize Game State from Props (Persistence)
    const [gameState, setGameState] = useState<GameState>(() => {
        const s = props.slotState;
        if (s) {
            // Logic: If runsRemaining > 0, we are ACTIVE (even if energy < 3, we RESUME).
            // If runsRemaining == 0, we are GAME OVER (show results).
            const isGameOver = s.runsRemaining <= 0;

            return {
                ...INITIAL_GAME_STATE,
                shotsLeft: s.currentEnergy, // Resume from saved energy
                totalScore: s.currentScore, // Resume from saved score
                gameOver: isGameOver,
                vibePercentage: isGameOver && s.dailyHighScore >= 0 ? calculateVibePercentage(s.dailyHighScore) : 0,
                // Only load advice if game is over
                advice: isGameOver && s.bestAnalysis ? {
                    title: 'RETRIEVED VIBE ANALYSIS',
                    message: s.bestAnalysis.text,
                    color: 'text-purple-400',
                    borderColor: 'border-purple-500'
                } : null,
                spinHistory: s.spinHistory || []
            };
        }
        return INITIAL_GAME_STATE;
    });

    const countdownDisplay = useCountdown(props.targetBedtimeMs, props.currentSimulatedTime);

    // Format Bedtime for Header (11:00 PM)
    const formattedBedtime = React.useMemo(() => {
        const effectiveDate = new Date(props.targetBedtimeMs);
        return effectiveDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }, [props.targetBedtimeMs]);
    const [debugClicks, setDebugClicks] = useState(0);

    const handleDebugTrigger = () => {
        const newCount = debugClicks + 1;
        setDebugClicks(newCount);
        if (newCount >= 5) {
            vscode.postMessage({ type: 'triggerSoftWarning' }); // Just for feedback or we can open debug panel
            vscode.postMessage({ type: 'debugAddLines' }); // No... we want to open debug.
            // Actually the command is 'vibertime.debug.openDebugTools' in extension.ts but we can't trigger command from webview easily unless specific message.
            // But we have "DebugPanel.tsx" INSIDE the webview?
            // "Internal Debug Panel" (The 5 clicks) was shown via setShowSettings(true) or similar in previous version?
            // Ah, checking stored code... DebugPanel is a component rendered conditionally?
            // We do render <DebugPanel stats={...} onExit={() => setShowDebug(false)} /> if showDebug is true.
            // We do render <DebugPanel stats={...} onExit={() => setIsDebugEnabled(false)} /> if isDebugEnabled is true.
            setIsDebugEnabled(true);
            setDebugClicks(0);
        }
    };

    // Reactive State Sync: Update local GameState when props change (e.g. Debug Force Done or Reset)
    // This ensures button updates correcty (Red/Compile vs Purple/Analysis) immediately without page reload.
    // We DO NOT auto-open modal here (User Logic: only open on manual finish).
    React.useEffect(() => {
        if (props.slotState?.runsRemaining !== undefined) {
            const runs = props.slotState.runsRemaining;
            const energy = props.slotState.currentEnergy;
            const score = props.slotState.currentScore;

            if (runs <= 0) {
                // CASE: Force Done / Game Over
                setGameState(prev => {
                    if (!prev.gameOver) {
                        return {
                            ...prev,
                            gameOver: true,
                            shotsLeft: energy,
                            totalScore: score,
                            // Ensure percentage is calculated even if score is 0
                            vibePercentage: calculateVibePercentage(score)
                        };
                    }
                    return prev;
                });
            } else {
                // CASE: Resurrection (Reset Slot)
                setGameState(prev => {
                    // If we were Game Over but now have runs, we must revive.
                    if (prev.gameOver) {
                        return {
                            ...prev,
                            gameOver: false,
                            shotsLeft: energy, // Should be 3 from reset
                            totalScore: score, // Should be 0 from reset
                            vibePercentage: 0,
                            advice: null,
                            spinHistory: [] // Clear history on reset
                        };
                    }
                    return prev;
                });
            }
        }
    }, [props.slotState?.runsRemaining, props.slotState?.currentEnergy, props.slotState?.currentScore]);

    const handleSpinComplete = (result: SpinResult) => {
        setGameState(prev => {
            const newScore = prev.totalScore + result.score;
            const newShots = prev.shotsLeft - 1;
            const newHistory = [...prev.spinHistory, result];
            const isGameOver = newShots === 0;
            const vibePercentage = calculateVibePercentage(newScore);

            const newState = {
                ...prev,
                shotsLeft: newShots,
                totalScore: newScore,
                spinHistory: newHistory,
                gameOver: isGameOver,
                vibePercentage: isGameOver ? vibePercentage : 0
            };

            // If Game Over (Energy used up), Persist "Run Consumed"
            // Note: We decrement runsRemaining ONLY when energy hits 0.

            const runsRemaining = isGameOver ? (props.slotState?.runsRemaining !== undefined ? props.slotState.runsRemaining - 1 : 0) : (props.slotState?.runsRemaining ?? 1);
            const finalScore = isGameOver ? newScore : (props.slotState?.dailyHighScore || 0);

            // Persist Partial State
            vscode.postMessage({
                type: 'saveSlotState',
                payload: {
                    runsRemaining: runsRemaining,
                    currentEnergy: newShots,
                    currentScore: newScore,
                    dailyHighScore: finalScore,
                    // If game over, we wait for advice to fill bestAnalysis. 
                    // But we should probably preserve existing if merely resuming?
                    // actually if it's a NEW run completion, bestAnalysis is pending.
                    bestAnalysis: props.slotState?.bestAnalysis || null,
                    spinHistory: newHistory
                }
            });

            return newState;
        });
    };

    // Show result modal ONLY when Machine signals round is complete (after all animations)
    // This fixes the "early trigger" bug - result now waits for score animation to finish
    const handleRoundFinished = () => {
        // Only show modal if game is actually over (all 3 spins used)
        if (gameState.shotsLeft === 0 || gameState.gameOver) {
            setShowResultModal(true);
        }
    };

    // Keyboard navigation: Backspace/Escape to dismiss result modal
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' || e.key === 'Escape') {
                if (showResultModal) {
                    setShowResultModal(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showResultModal]);

    const handleSaveAdvice = (advice: AdviceResult) => {
        setGameState(prev => {
            const newState = { ...prev, advice };

            const previousBest = props.slotState?.bestAnalysis;
            const currentPct = newState.vibePercentage;
            const bestPct = previousBest?.percentage || 0;

            const shouldUpdate = currentPct >= bestPct;

            // Persist Update with Analysis
            vscode.postMessage({
                type: 'saveSlotState',
                payload: {
                    // Update the Analysis part ONLY if better or equal
                    bestAnalysis: shouldUpdate ? {
                        category: 'MANUAL', // We could map vibe pct to category
                        percentage: newState.vibePercentage,
                        text: advice.message
                    } : previousBest, // Keep old best
                    dailyHighScore: Math.max(newState.totalScore, props.slotState?.dailyHighScore || 0)
                }
            });

            return newState;
        });
    };

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // Calculate sub-percentages for details view
    const humanTotal = (props.humanTypedLines || 0) + (props.humanRefactoredLines || 0);
    const aiTotal = (props.aiGeneratedLines || 0) + (props.aiEditedLines || 0);

    // Avoid division by zero
    const typePct = humanTotal > 0 ? ((props.humanTypedLines || 0) / humanTotal) * 100 : 0;
    const refactorPct = humanTotal > 0 ? ((props.humanRefactoredLines || 0) / humanTotal) * 100 : 0;

    const genPct = aiTotal > 0 ? ((props.aiGeneratedLines || 0) / aiTotal) * 100 : 0;
    const editPct = aiTotal > 0 ? ((props.aiEditedLines || 0) / aiTotal) * 100 : 0;

    return (
        <div className="flex flex-col h-screen bg-black text-white overflow-x-auto scanlines mesh-bg select-none min-w-[400px]">
            {showSettings && <SettingsOverlay bedtime={props.bedtime} dayStartHour={props.dayStartHour} idleTimeoutSeconds={props.idleTimeoutSeconds} onClose={() => setShowSettings(false)} onUnlockDebug={() => setIsDebugEnabled(true)} />}
            {showResultModal && (
                <ResultOverlay
                    state={gameState}
                    onReset={() => setShowResultModal(false)}
                    onSaveAdvice={handleSaveAdvice}
                />
            )}

            {/* DEBUG PANEL (Internal only - Hidden by default) */}
            {isDebugEnabled && <DebugPanel stats={props} onExit={() => setIsDebugEnabled(false)} />}

            {/* HEADER - Cyberdeck Style */}
            <header className="bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 border-b border-purple-900/50 px-6 py-4 relative z-20 shadow-lg flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-purple-600 blur opacity-40 group-hover:opacity-60 transition-opacity rounded"></div>
                            <div className="w-10 h-10 bg-gray-900 border border-purple-500/50 rounded flex items-center justify-center relative z-10">
                                <span className="text-2xl drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">⏳</span>
                            </div>
                        </div>
                        <div>
                            <h1 className="text-4xl font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 drop-shadow-[0_0_10px_rgba(192,38,211,0.5)]">
                                VIBER TIME
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right bg-black/40 px-4 py-2 rounded border border-gray-800 flex items-center justify-end gap-3 min-h-[3rem]">
                            <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">Target Bedtime</span>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-bold text-purple-400 tabular-nums font-mono drop-shadow-[0_0_8px_rgba(168,85,247,0.3)] whitespace-nowrap">
                                    {formattedBedtime}
                                </p>
                                {props.isSnoozed && (
                                    <span className="text-[9px] text-orange-400 font-bold bg-orange-900/30 px-1.5 py-0.5 rounded border border-orange-500/30 animate-pulse whitespace-nowrap">
                                        EXTENDED
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* BODY - Responsive Layout (Stack below 800px) */}
            <main className="flex-1 min-[800px]:grid min-[800px]:grid-cols-2 relative z-10 overflow-y-auto flex flex-col">
                {/* LEFT: Stats Panel */}
                <div className="p-6 border-b min-[800px]:border-b-0 min-[800px]:border-r border-gray-800 flex flex-col items-center panel-connector bg-gray-950/30 backdrop-blur-sm">
                    <div className="w-full max-w-xl flex flex-col justify-start gap-6 h-full">

                        {/* TOP GROUP: Active Time + Sync Status */}
                        <div className="space-y-4">
                            {/* 1. Active Time (Scoreboard) */}
                            <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-5 shadow-xl transition-all hover:bg-gray-900">
                                <h2 className="text-[10px] text-gray-400 font-mono uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <span className="text-purple-500">◆</span> TODAY'S ACTIVENESS
                                </h2>
                                <p className="hero-stat-green tabular-nums">{formatTime(props.activeSeconds)}</p>
                            </div>

                            {/* 2. Sync Status (Merged Code + Time Ratios) */}
                            <div
                                className="bg-gray-900/80 border border-gray-800 rounded-lg p-5 shadow-xl transition-all hover:bg-gray-900 cursor-pointer group"
                                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                            >
                                <h2 className="text-[10px] text-gray-400 font-mono uppercase tracking-wider mb-4 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-purple-500">◆</span> STATS FOR TODAY
                                    </div>
                                    <span className={`transform transition-transform duration-300 ${isDetailsOpen ? 'rotate-180' : ''} text-gray-600 group-hover:text-gray-400`}>
                                        ▼
                                    </span>
                                </h2>

                                {/* Code Ratio Bar (Cyan = Human, Green = AI) */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono mb-2">
                                        <span className="flex items-center gap-1 uppercase">👤 Biological</span>
                                        <span className="flex items-center gap-1 uppercase">🤖 Synthetic</span>
                                    </div>
                                    <div className="w-full bg-gray-950 h-3 rounded-full overflow-hidden flex border border-gray-800 p-[1px]">
                                        <div className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000 border-r border-white/20" style={{ width: `${100 - props.cyborgRatio}%` }}></div>
                                        <div className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-all duration-1000" style={{ width: `${props.cyborgRatio}%` }}></div>
                                    </div>
                                </div>

                                {/* Accordion: Detailed Breakdown */}
                                <div className={`grid transition-all duration-500 ease-in-out ${isDetailsOpen ? 'grid-rows-[1fr] opacity-100 mb-6' : 'grid-rows-[0fr] opacity-0'}`}>
                                    <div className="overflow-hidden min-h-0">
                                        <div className="grid grid-cols-2 gap-4 p-3 bg-black/20 rounded border border-gray-800/50">

                                            {/* Human Detail */}
                                            <div>
                                                <div className="text-[9px] text-cyan-500/80 uppercase mb-1 flex justify-between">
                                                    <span>Input</span>
                                                    <span>Refactor</span>
                                                </div>
                                                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-900">
                                                    <div className="bg-cyan-600 transition-all duration-500" style={{ width: `${typePct}%` }} title={`Typed: ${props.humanTypedLines} lines`}></div>
                                                    <div className="bg-cyan-900 transition-all duration-500" style={{ width: `${refactorPct}%` }} title={`Refactored: ${props.humanRefactoredLines} lines`}></div>
                                                </div>
                                            </div>

                                            {/* AI Detail */}
                                            <div>
                                                <div className="text-[9px] text-green-500/80 uppercase mb-1 flex justify-between">
                                                    <span>Gen</span>
                                                    <span>Edit</span>
                                                </div>
                                                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-900">
                                                    <div className="bg-green-600 transition-all duration-500" style={{ width: `${genPct}%` }} title={`Generated: ${props.aiGeneratedLines} lines`}></div>
                                                    <div className="bg-green-900 transition-all duration-500" style={{ width: `${editPct}%` }} title={`Edited: ${props.aiEditedLines} lines`}></div>
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                </div>

                                {/* Time Ratio Bar (Purple = Typing, Orange = Reviewing) */}
                                <div>
                                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono mb-2">
                                        <span className="flex items-center gap-1 uppercase">⌨️ Interaction</span>
                                        <span className="flex items-center gap-1 uppercase">👀 Observation</span>
                                    </div>
                                    <div className="w-full bg-gray-950 h-3 rounded-full overflow-hidden flex border border-gray-800 p-[1px]">
                                        <div className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000" style={{ width: `${props.timeRatio}%` }}></div>
                                        <div className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-all duration-1000" style={{ width: `${100 - props.timeRatio}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM: Mission Timer (Bedtime) - Anchored */}
                        <div className={`bg-gray-900/80 border rounded-lg p-5 shadow-2xl transition-all ${props.isSnoozed ? 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.2)] bg-orange-950/10' : (props.targetBedtimeMs - (props.currentSimulatedTime || Date.now())) <= 0 ? 'border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.2)] bg-red-950/10' : 'border-gray-800'}`}>
                            <h2 className="text-[10px] text-gray-400 font-mono uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className={(props.targetBedtimeMs - (props.currentSimulatedTime || Date.now())) <= 0 ? 'text-red-500 animate-pulse' : props.isSnoozed ? 'text-orange-500 animate-pulse' : 'text-purple-500'}>◆</span> RUNTIME LIMIT
                            </h2>
                            <div className="flex items-center justify-between">
                                <p className={`text-4xl font-bold tabular-nums ${(props.targetBedtimeMs - (props.currentSimulatedTime || Date.now())) <= 0 && !props.isSnoozed ? 'text-red-500' : props.isSnoozed ? 'text-orange-500' : 'text-amber-500'}`}>
                                    {(props.targetBedtimeMs - (props.currentSimulatedTime || Date.now())) <= 0 && !props.isSnoozed ? 'EXPIRED' : countdownDisplay}
                                    {props.isSnoozed && <span className="text-sm font-normal ml-2 tracking-normal">(Extended)</span>}
                                </p>
                                <div className="flex flex-col items-end">
                                    {props.isSnoozed && <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest mb-0.5">EXPIRED</span>}
                                    <span className="text-[10px] text-gray-600 font-mono uppercase">Remaining</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Slot Machine Panel - Flex-grow to fill vertical space */}
                <div className="p-6 flex flex-col flex-1 min-h-0 items-center justify-start gap-6">
                    <div className="w-full flex-col min-h-0">
                        <Machine
                            shotsLeft={gameState.shotsLeft}
                            totalScore={gameState.totalScore}
                            onSpinComplete={handleSpinComplete}
                            onRoundComplete={handleRoundFinished}
                            gameActive={!gameState.gameOver}
                            onShowAnalysis={() => setShowResultModal(true)}
                            initialGrid={gameState.spinHistory.length > 0 ? gameState.spinHistory[gameState.spinHistory.length - 1].grid : undefined}
                        />
                    </div>


                </div>
            </main>

            {/* FOOTER - Full Width */}
            <footer className="bg-gray-900 border-t-2 border-purple-500 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
                            <GearIcon /><span>Settings</span>
                        </button>
                        {(props.timeUntilBedtime < 30 || props.isSnoozed) && (
                            <div className="flex items-center gap-2 ml-2 border-l border-gray-700 pl-4">
                                <button onClick={() => props.onSnooze(30)} className="px-3 py-1.5 border border-orange-500/50 text-orange-500 hover:bg-orange-500/10 rounded text-xs font-mono transition-colors">
                                    +30m
                                </button>
                                <button onClick={() => props.onSnooze(60)} className="px-3 py-1.5 border border-orange-500/50 text-orange-500 hover:bg-orange-500/10 rounded text-xs font-mono transition-colors">
                                    +1h
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <span onClick={handleDebugTrigger} className="text-xs text-gray-600 font-mono cursor-pointer select-none hover:text-purple-500 transition-colors">v0.2.10</span>
                    </div>
                </div>
            </footer >
        </div >
    );
};
