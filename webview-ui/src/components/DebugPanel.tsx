import React, { useState } from 'react';
import { vscode } from '../utils/vscode';

interface DebugPanelProps {
    stats: any;
    onExit: () => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ stats, onExit }) => {
    // Default to true because if it's mounted, the user likely wants to see it.
    // However, if we want to support "minimize to bubble" separately from "close completely", we can keep isExpanded.
    // User requirement: "Ghost Protocol: Hide on Close". This implies "X" -> onExit().
    // We can keep isExpanded for "Minimize", but maybe just removing it is cleaner per spec?
    // Let's assume the component is only rendered when active.
    // IF we want "minimize", we can keep logic. But spec says "Closing Debug Panel hides the toggle button".
    // So "X" = onExit.
    // Actually, let's keep it simple: Render full panel.
    const [showJson, setShowJson] = useState(false);

    const triggerSoftWarning = () => {
        vscode.postMessage({ type: 'triggerSoftWarning' });
    };

    const triggerHardStop = () => {
        vscode.postMessage({ type: 'triggerHardStop' });
    };

    const populateDummyData = () => {
        // Request extension to populate dummy data
        vscode.postMessage({ type: 'refresh' });
    };



    return (
        <div className="fixed bottom-4 right-4 bg-gray-900 border-2 border-red-600 rounded-lg p-4 shadow-2xl z-50 w-80 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                <span className="text-red-400 font-bold text-sm uppercase tracking-wider">🐛 Debug Panel</span>
                <button
                    onClick={onExit}
                    className="text-gray-500 hover:text-white text-lg leading-none"
                >
                    ×
                </button>
            </div>

            {/* Time Travel */}
            <div className="mb-4 pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <input
                        type="time"
                        step="1"
                        id="debug-time-input"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                        defaultValue="23:55:00"
                    />
                    <button
                        onClick={() => {
                            const val = (document.getElementById('debug-time-input') as HTMLInputElement).value;
                            vscode.postMessage({ type: 'debugSetTime', payload: { time: val } });
                        }}
                        className="bg-red-900 border border-red-700 hover:bg-red-800 text-white text-[10px] font-bold px-2 py-1 rounded"
                    >
                        SET TIME
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddSpecificLines', payload: { type: 'typed', amount: 100 } })}
                        className="py-1 px-2 bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-bold rounded border border-cyan-500 shadow-sm"
                    >
                        +100 TYPED
                    </button>
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddSpecificLines', payload: { type: 'refactored', amount: 100 } })}
                        className="py-1 px-2 bg-blue-700 hover:bg-blue-600 text-white text-[10px] font-bold rounded border border-blue-500 shadow-sm"
                    >
                        +100 REFACT
                    </button>
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddSpecificLines', payload: { type: 'generated', amount: 100 } })}
                        className="py-1 px-2 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold rounded border border-green-500 shadow-sm"
                    >
                        +100 GEN
                    </button>
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddSpecificLines', payload: { type: 'edited', amount: 100 } })}
                        className="py-1 px-2 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold rounded border border-emerald-500 shadow-sm"
                    >
                        +100 EDIT
                    </button>
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddMinutes', payload: { typingMins: 10, reviewingMins: 0 } })}
                        className="py-1 px-2 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold rounded border border-purple-500 shadow-sm"
                    >
                        +10m TYPE
                    </button>
                    <button
                        onClick={() => vscode.postMessage({ type: 'debugAddMinutes', payload: { typingMins: 0, reviewingMins: 10 } })}
                        className="py-1 px-2 bg-orange-700 hover:bg-orange-600 text-white text-[10px] font-bold rounded border border-orange-500 shadow-sm"
                    >
                        +10m REV
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
                    <button
                        onClick={() => vscode.postMessage({
                            type: 'saveSlotState',
                            payload: {
                                runsRemaining: 1,
                                currentEnergy: 3,
                                currentScore: 0,
                                dailyHighScore: 0,
                                bestAnalysis: null
                            }
                        })}
                        className="py-1 px-2 bg-red-800 hover:bg-red-700 text-white text-[10px] font-bold rounded border border-red-600 shadow-sm"
                    >
                        RESET SLOT
                    </button>
                    <button
                        onClick={() => vscode.postMessage({
                            type: 'saveSlotState',
                            payload: {
                                runsRemaining: 0,
                                currentEnergy: 0,
                                currentScore: 5000,
                                dailyHighScore: 5000,
                                bestAnalysis: null // Let FE generate authentic analysis
                            }
                        })}
                        className="py-1 px-2 bg-purple-800 hover:bg-purple-700 text-white text-[10px] font-bold rounded border border-purple-600 shadow-sm"
                    >
                        FORCE DONE
                    </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-800">
                    <button
                        onClick={triggerSoftWarning}
                        className="w-full py-1.5 px-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold text-xs rounded transition-colors"
                    >
                        Manual Soft Nudge
                    </button>
                    <button
                        onClick={triggerHardStop}
                        className="w-full py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded transition-colors"
                    >
                        Manual Hard Stop
                    </button>
                </div>

                <button
                    onClick={populateDummyData}
                    className="w-full py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded border border-gray-700 flex items-center justify-center gap-2"
                >
                    <span>🔄</span> Refresh State
                </button>

                <div className="pt-2 border-t border-gray-800">
                    <button
                        onClick={() => setShowJson(!showJson)}
                        className="text-[10px] text-gray-500 hover:text-gray-300 w-full text-center mb-2"
                    >
                        {showJson ? 'Hide JSON' : 'Show RAW JSON'}
                    </button>
                    {showJson && (
                        <pre className="text-[9px] text-green-400 bg-black p-2 rounded overflow-x-auto font-mono leading-tight">
                            {JSON.stringify(stats, null, 2)}
                        </pre>
                    )}
                </div>
            </div>

            {/* Info */}
            <div className="mt-3 pt-2 border-t border-gray-700 text-xs text-gray-500 text-center">
                Dev Mode Only
            </div>
        </div >
    );
};
