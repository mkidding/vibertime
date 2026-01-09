import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { SlotReel } from './SlotReel';
import { generateGrid, calculateScore, COLS, PAYLINES } from '../utils/gameLogic';
import { SymbolType } from '../types';
import type { SpinResult, WinDetail } from '../types';
import { Zap } from 'lucide-react';

// =====================================================
// GAME PHASE STATE MACHINE (State Relay Pattern)
// All transitions via onAnimationEnd - NO setInterval/setTimeout
// =====================================================
type GamePhase =
  | 'IDLE'
  | 'SPINNING'
  | 'STOPPING'
  | 'EVALUATE'
  | 'SHOW_WINS'     // Currently showing win animations
  | 'ROUND_COMPLETE';

interface MachineProps {
  shotsLeft: number;
  totalScore: number;
  onSpinComplete: (result: SpinResult) => void;
  gameActive: boolean;
  onShowAnalysis?: () => void;
  onRoundComplete?: () => void;
  initialGrid?: SymbolType[][];
}

interface FloatingText {
  id: number;
  value: number;
  top: string;
  left: string;
}

// Use calc(var(--mw)) for robust scaling
const FONT_SCORE = 'calc(var(--mw) * 0.09)';
const FONT_LABEL = 'calc(var(--mw) * 0.025)';
const FONT_BTN = 'calc(var(--mw) * 0.04)';
const BTN_HEIGHT = 'calc(var(--mw) * 0.14)';
const PADDING_BEZEL = 'calc(var(--mw) * 0.02)';
const PADDING_PANEL = 'calc(var(--mw) * 0.02)';
const MARGIN_PANEL = 'calc(var(--mw) * 0.02)';
const ZAP_SIZE = 'calc(var(--mw) * 0.03)';
const GAP_PANEL = 'calc(var(--mw) * 0.03)';
const PADDING_STATS = 'calc(var(--mw) * 0.02)';
const HEIGHT_DIVIDER = 'calc(var(--mw) * 0.05)';

export const Machine: React.FC<MachineProps> = ({
  shotsLeft,
  totalScore,
  onSpinComplete,
  gameActive,
  onShowAnalysis,
  onRoundComplete,
  initialGrid
}) => {
  // Core game state
  const [grid, setGrid] = useState<SymbolType[][]>(initialGrid || generateGrid());
  const [phase, setPhase] = useState<GamePhase>('IDLE');

  // Score State
  const [displayScore, setDisplayScore] = useState(totalScore);
  const [roundTotalWin, setRoundTotalWin] = useState<number | null>(null);

  // ResizeObserver Requirement
  const containerRef = useRef<HTMLDivElement>(null);
  const [machineWidth, setMachineWidth] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMachineWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Win Animation State
  const [winDetails, setWinDetails] = useState<WinDetail[]>([]);
  const [activeWinIndex, setActiveWinIndex] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const MAX_CYCLES = 2;

  // Floating text state
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [processedWinIndices, setProcessedWinIndices] = useState<Set<number>>(new Set());

  // Reel tracking
  const [, setStoppedReelsCount] = useState(0);

  // Spin timer refs (rAF-based)
  const spinStartTimeRef = useRef(0);
  const spinFrameRef = useRef(0);
  const SPIN_DURATION = 2500;

  // Sync displayScore with prop
  useEffect(() => {
    setDisplayScore(totalScore);
  }, [totalScore]);

  // =========================
  // PHASE: EVALUATE
  // =========================
  useEffect(() => {
    if (phase === 'EVALUATE') {
      const { score, lines, winDetails: details } = calculateScore(grid);

      // Update score immediately
      setDisplayScore(prev => prev + score);

      // Show floating score animation
      setRoundTotalWin(score);

      // Store win details
      setWinDetails(details);
      setActiveWinIndex(0);
      setCycleCount(0);
      setProcessedWinIndices(new Set());

      // Report to parent
      onSpinComplete({
        grid,
        paylinesWon: lines,
        winDetails: details,
        score,
        isWin: score > 0
      });

      // Transition to next phase
      if (details.length > 0) {
        setPhase('SHOW_WINS');
      } else {
        // No wins - go straight to round complete
        setPhase('ROUND_COMPLETE');
      }
    }
  }, [phase, grid, onSpinComplete]);

  // =========================
  // PHASE: ROUND_COMPLETE
  // =========================
  useEffect(() => {
    if (phase === 'ROUND_COMPLETE') {
      if (onRoundComplete) {
        onRoundComplete();
      }
      // Reset to idle
      setPhase('IDLE');
    }
  }, [phase, onRoundComplete]);

  // =========================
  // WIN DISPLAY LOGIC
  // =========================
  useEffect(() => {
    if (phase !== 'SHOW_WINS') return;
    if (winDetails.length === 0) return;

    const currentWin = winDetails[activeWinIndex];
    if (!currentWin) return;

    // First cycle: show floating text for each win
    if (cycleCount === 0 && !processedWinIndices.has(activeWinIndex)) {
      setProcessedWinIndices(prev => new Set(prev).add(activeWinIndex));

      // Calculate float position
      const lineCoords = PAYLINES[currentWin.lineIndex];
      const matchCoords = lineCoords.slice(currentWin.startIndex, currentWin.startIndex + currentWin.matchCount);

      if (matchCoords.length > 0) {
        const avgRow = matchCoords.reduce((sum, c) => sum + c[0], 0) / matchCoords.length;
        const avgCol = matchCoords.reduce((sum, c) => sum + c[1], 0) / matchCoords.length;
        const topPct = (avgRow * 33.33) + 16.66;
        const leftPct = (avgCol * 20) + 10;

        const newFloat: FloatingText = {
          id: Date.now() + Math.random(),
          value: currentWin.score,
          top: `${topPct}%`,
          left: `${leftPct}%`
        };
        setFloatingTexts(prev => [...prev, newFloat]);
      }
    }
  }, [phase, winDetails, activeWinIndex, cycleCount, processedWinIndices]);

  // Advance to next win (called by CSS delay timer)
  const advanceWinDisplay = () => {
    if (phase !== 'SHOW_WINS') return;

    const nextIndex = activeWinIndex + 1;

    if (nextIndex >= winDetails.length) {
      // Finished showing all wins for this cycle
      const nextCycle = cycleCount + 1;

      if (nextCycle >= MAX_CYCLES) {
        // Done with all cycles
        setPhase('ROUND_COMPLETE');
      } else {
        // Start next cycle
        setCycleCount(nextCycle);
        setActiveWinIndex(0);
      }
    } else {
      // Show next win
      setActiveWinIndex(nextIndex);
    }
  };

  // =========================
  // SPIN HANDLER
  // =========================
  const handleSpin = () => {
    if (shotsLeft <= 0 || !gameActive) return;
    // Allow spin if IDLE or SHOW_WINS (skip animation)
    if (phase !== 'IDLE' && phase !== 'SHOW_WINS') return;

    // Reset state
    setPhase('SPINNING');
    setStoppedReelsCount(0);
    setWinDetails([]);
    setActiveWinIndex(0);
    setCycleCount(0);
    setFloatingTexts([]);
    setRoundTotalWin(null);
    setProcessedWinIndices(new Set());

    // Generate new grid
    const newGrid = generateGrid();
    setGrid(newGrid);

    // Start rAF-based spin timer
    spinStartTimeRef.current = performance.now();
    const spinTick = (time: number) => {
      if (time - spinStartTimeRef.current >= SPIN_DURATION) {
        setPhase('STOPPING');
        return;
      }
      spinFrameRef.current = requestAnimationFrame(spinTick);
    };
    spinFrameRef.current = requestAnimationFrame(spinTick);
  };

  // =========================
  // REEL STOP HANDLER
  // =========================
  const handleReelStop = useCallback(() => {
    setStoppedReelsCount(prev => {
      const newVal = prev + 1;
      if (newVal === COLS) {
        // All reels stopped - evaluate
        setPhase('EVALUATE');
        return 0;
      }
      return newVal;
    });
  }, []);

  // =========================
  // HELPER FUNCTIONS
  // =========================
  const getReelSymbols = (colIndex: number) => {
    return [grid[0][colIndex], grid[1][colIndex], grid[2][colIndex]];
  };

  const getLineStyle = (lineIndex: number) => {
    const isWin = winDetails.some(w => w.lineIndex === lineIndex);
    if (!isWin) {
      if (lineIndex === 1) return "stroke-red-600/30 stroke-[2px]";
      return "stroke-white/10 stroke-[1px]";
    }
    const isActive = phase === 'SHOW_WINS' && winDetails[activeWinIndex]?.lineIndex === lineIndex;
    if (isActive) {
      return "stroke-neon-green stroke-[4px] opacity-100 drop-shadow-[0_0_5px_rgba(57,255,20,0.8)]";
    }
    return "stroke-neon-green/30 stroke-[2px] opacity-50";
  };

  const getHighlightRowForColumn = (colIndex: number): number | null => {
    if (phase !== 'SHOW_WINS') return null;
    const currentWin = winDetails[activeWinIndex];
    if (!currentWin) return null;
    const lineCoords = PAYLINES[currentWin.lineIndex];
    const coordIndex = lineCoords.findIndex(([_, c]) => c === colIndex);
    if (coordIndex !== -1) {
      if (coordIndex >= currentWin.startIndex && coordIndex < currentWin.startIndex + currentWin.matchCount) {
        return lineCoords[coordIndex][0];
      }
    }
    return null;
  };

  const isFinished = shotsLeft === 0;
  const isSpinning = phase === 'SPINNING';
  const isStopping = phase === 'STOPPING';

  const handleMainButtonClick = () => {
    if (isFinished && onShowAnalysis) {
      onShowAnalysis();
    } else if (phase === 'SHOW_WINS') {
      // IF clicked during animation, skip straight to spinning again (or round complete)
      // Since score is already added in EVALUATE, we can just start a new spin
      handleSpin();
    } else {
      handleSpin();
    }
  };

  // Unblock button during SHOW_WINS to allow skipping
  const isButtonDisabled = phase !== 'IDLE' && phase !== 'ROUND_COMPLETE' && phase !== 'SHOW_WINS';

  return (

    <div
      ref={containerRef}
      className="flex flex-col w-full max-w-xl mx-auto"
      style={{ '--mw': `${machineWidth}px` } as React.CSSProperties}
    >

      {/* Compact Machine Bezel - Flex-grow to fill height */}
      <div className="relative bg-[#18181b] p-2 rounded-2xl border-b-8 border-r-8 border-[#0f0f11] shadow-2xl w-full flex-1 flex flex-col border-t border-l border-gray-700 min-h-0 overflow-hidden" style={{ padding: PADDING_BEZEL }}>

        {/* Model Number / Decoration */}
        <div className="flex justify-between w-full mb-2 px-1 flex-shrink-0">
          <div className="flex space-x-1">
            <div className="w-2 h-2 rounded-full bg-red-900 animate-pulse"></div>
            <div className="w-2 h-2 rounded-full bg-yellow-900"></div>
          </div>
          <span className="text-[10px] text-gray-600 font-tech tracking-widest uppercase">Series-3000 // Neural</span>
        </div>

        {/* Screen Container - Fixed 5:3 Aspect Ratio for Square Cells */}
        <div
          className="bg-[#050505] p-2 rounded-lg border-4 border-[#0a0a0f] shadow-[inset_0_0_20px_rgba(0,0,0,1)] w-full flex flex-col relative min-h-0 overflow-hidden"
          style={{ aspectRatio: '5/3', flex: 'none' }}
        >

          {/* Inner Screen - Flex-grow to fill screen container */}
          <div className="flex-1 flex justify-center bg-black/90 rounded border border-gray-800 relative overflow-hidden retro-border w-full min-h-0">

            {/* Reel Wrapper - Flex-grow to fill inner screen */}
            <div className="relative flex w-full h-full gap-0 justify-center bg-black z-10">

              {/* Reels */}
              {Array.from({ length: COLS }).map((_, colIndex) => (
                <div key={colIndex} className="relative flex-1 h-full">
                  <SlotReel
                    symbols={getReelSymbols(colIndex)}
                    isSpinning={isSpinning}
                    startDelay={colIndex * 100}
                    stopDelay={colIndex * 500}
                    onStop={handleReelStop}
                    highlightedRowIndex={getHighlightRowForColumn(colIndex)}
                  />
                  {colIndex < COLS - 1 && <div className="absolute right-0 top-0 h-full w-[1px] bg-gray-900/50"></div>}
                </div>
              ))}

              {/* Paylines Overlay - ViewBox uses grid coordinates for perfect cell-center alignment */}
              <div className="absolute inset-0 pointer-events-none z-20 w-full h-full">
                <svg className="w-full h-full" viewBox="0 0 5 3" preserveAspectRatio="none">
                  {/* 
                    Grid coords: 5 columns (0-5), 3 rows (0-3)
                    Column centers: 0.5, 1.5, 2.5, 3.5, 4.5
                    Row centers: 0.5, 1.5, 2.5
                  */}

                  {/* Horizontal paylines at row centers */}
                  <line x1="0.5" y1="0.5" x2="4.5" y2="0.5" vectorEffect="non-scaling-stroke" className={`transition-all duration-0 ${getLineStyle(0)}`} />
                  <line x1="0.5" y1="1.5" x2="4.5" y2="1.5" vectorEffect="non-scaling-stroke" className={`transition-all duration-0 ${getLineStyle(1)}`} />
                  <line x1="0.5" y1="2.5" x2="4.5" y2="2.5" vectorEffect="non-scaling-stroke" className={`transition-all duration-0 ${getLineStyle(2)}`} />

                  {/* V-shape payline (top-left to bottom-center to top-right) */}
                  <polyline
                    points="0.5,0.5 1.5,1.5 2.5,2.5 3.5,1.5 4.5,0.5"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    className={`transition-all duration-0 ${getLineStyle(3)}`}
                    strokeLinejoin="round"
                  />

                  {/* Inverted V payline (bottom-left to top-center to bottom-right) */}
                  <polyline
                    points="0.5,2.5 1.5,1.5 2.5,0.5 3.5,1.5 4.5,2.5"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    className={`transition-all duration-0 ${getLineStyle(4)}`}
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Floating Text Overlay */}
              <div className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-hidden">
                {floatingTexts.map(ft => (
                  <div
                    key={ft.id}
                    className="absolute text-neon-green font-arcade font-bold text-xl sm:text-3xl drop-shadow-[0_2px_0_rgba(0,0,0,1)] animate-float-score"
                    style={{ top: ft.top, left: ft.left, transform: 'translate(-50%, -50%)' }}
                    onAnimationEnd={() => setFloatingTexts(prev => prev.filter(f => f.id !== ft.id))}
                  >
                    +{ft.value}
                  </div>
                ))}
              </div>

              {/* CSS DELAY TIMER - Drives win cycling (State Relay Pattern) */}
              {phase === 'SHOW_WINS' && (
                <div
                  key={`win-timer-${activeWinIndex}-${cycleCount}`}
                  className="absolute opacity-0 delay-1500ms"
                  onAnimationEnd={advanceWinDisplay}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>

        {/* Control Panel - Natural Height (Tight Wrap) */}
        <div
          className="w-full bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg shadow-lg border-t border-gray-700 flex-none flex flex-col justify-center min-h-0 overflow-hidden"
          style={{ marginTop: MARGIN_PANEL, padding: PADDING_PANEL }}
        >
          <div className="bg-[#111] rounded flex flex-col border border-gray-950 shadow-inner" style={{ padding: PADDING_PANEL, gap: GAP_PANEL }}>

            {/* Stats Row */}
            <div className="flex justify-between items-center border-gray-800" style={{ borderBottomWidth: '1px', paddingBottom: PADDING_STATS }}>
              <div className="flex flex-col justify-center">
                <span className="text-gray-500 uppercase tracking-wider mb-1 font-mono" style={{ fontSize: FONT_LABEL }}>Energy</span>
                <div className="flex space-x-1">
                  {[...Array(3)].map((_, i) => (
                    <Zap key={i} className={`${i < shotsLeft ? 'fill-neon-green text-neon-green' : 'fill-gray-800 text-gray-800'}`} style={{ width: ZAP_SIZE, height: ZAP_SIZE }} />
                  ))}
                </div>
              </div>

              <div className="w-px bg-gray-800 mx-2" style={{ height: HEIGHT_DIVIDER }}></div>

              <div className="flex flex-col items-end justify-center">
                <span className="text-gray-500 uppercase tracking-wider mb-1 font-mono" style={{ fontSize: FONT_LABEL }}>Today's Vibe</span>
                <div className="relative">
                  <div className={`font-mono tabular-nums tracking-widest leading-none transition-colors duration-300 ${displayScore > 0 ? 'text-neon-amber text-shadow-glow' : 'text-gray-600'}`} style={{ fontSize: FONT_SCORE }}>
                    {displayScore > 99999 ? "$$$$$" : displayScore.toString().padStart(5, '0')}
                  </div>
                  {/* Floating Score Delta */}
                  {roundTotalWin !== null && (
                    <div
                      className={`absolute -top-4 right-0 w-full text-right font-mono font-bold text-lg animate-float-score pointer-events-none z-10 drop-shadow-md ${(roundTotalWin || 0) > 0 ? 'text-neon-green' : 'text-gray-500'}`}
                      onAnimationEnd={() => setRoundTotalWin(null)}
                    >
                      +{roundTotalWin}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Button Row */}
            <div className="flex justify-center pt-1">
              <button
                onClick={handleMainButtonClick}
                disabled={isButtonDisabled && !isFinished}
                className={`
                  w-full rounded font-bold uppercase tracking-[0.2em] font-mono transition-all duration-75
                  flex items-center justify-center border-b-4 relative overflow-hidden group
                  ${isButtonDisabled && !isFinished
                    ? 'bg-gray-800 text-gray-600 border-gray-900 cursor-not-allowed grayscale'
                    : isFinished
                      ? 'bg-neon-purple text-white border-purple-900 hover:bg-neon-purple/80 shadow-[0_0_15px_rgba(176,38,255,0.4)]'
                      : 'bg-red-700 text-white border-red-900 hover:bg-red-600 active:border-b-0 active:translate-y-1 shadow-[0_0_15px_rgba(220,38,38,0.3)]'}
                `}
                style={{
                  height: BTN_HEIGHT,
                  fontSize: FONT_BTN
                }}
              >
                {/* Logic: If Spinning/Stopping -> COMPILE (disabled). If Finished or Inactive -> SHOW ANALYSIS. Else -> COMPILE */}
                {(isSpinning || isStopping) ? 'COMPILE' : ((isFinished || !gameActive) ? 'SHOW ANALYSIS' : 'COMPILE')}

                {/* Shine */}
                <div className="absolute top-0 -left-full w-full h-full bg-white/10 -skew-x-12 group-hover:left-full transition-all duration-500 ease-in-out"></div>
              </button>
            </div>

            {/* Integrated Footer Text */}
            <div className="text-center">
              <p
                className="text-gray-500 font-tech uppercase tracking-[0.3em] animate-pulse"
                style={{
                  fontSize: 'calc(var(--mw) * 0.02)',
                  marginTop: 'calc(var(--mw) * 0.01)'
                }}
              >
                {shotsLeft === 0 ? "VIBE ESTABLISHED" : "RUN THREE TIMES & PREDICT TODAY'S VIBE"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};