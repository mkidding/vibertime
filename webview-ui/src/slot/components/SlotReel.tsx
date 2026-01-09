import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { SymbolType } from '../types';
import { getSymbolDef, SYMBOLS } from '../utils/gameLogic';
import { PixelSeven } from './SlotIcons';

interface SlotReelProps {
  symbols: SymbolType[]; // The TARGET symbols to land on
  isSpinning: boolean;
  startDelay: number;
  stopDelay: number;
  onStop: () => void;
  highlightedRowIndex?: number | null; // New prop: which row index (0,1,2) to blink, or null
}

const RANDOM_BUFFER_SIZE = 12; // Increased buffer for smoother faster spin illusion

export const SlotReel: React.FC<SlotReelProps> = ({
  symbols,
  isSpinning,
  startDelay,
  stopDelay,
  onStop,
  highlightedRowIndex
}) => {
  // "displaySymbols" is what is currently rendered on the DOM.
  const [displaySymbols, setDisplaySymbols] = useState<SymbolType[]>(symbols);
  // We use a ref to track displaySymbols inside the animation loop to avoid stale closures
  const displaySymbolsRef = useRef<SymbolType[]>(symbols);

  const [offset, setOffset] = useState(0);
  const [blur, setBlur] = useState(0);

  const [cellHeight, setCellHeight] = useState(80);

  const requestRef = useRef<number>(0);
  const velocityRef = useRef(0);
  const positionRef = useRef(0);
  const stateRef = useRef<'IDLE' | 'START_DELAY' | 'ACCELERATING' | 'CONSTANT' | 'STOP_DELAY' | 'STOPPING'>('IDLE');
  const lastFrameTimeRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // NEW: Refs for rAF-based delays (replaces setTimeout)
  const delayStartTimeRef = useRef(0);
  const startDelayRef = useRef(startDelay);
  const stopDelayRef = useRef(stopDelay);
  const cellHeightRef = useRef(cellHeight);
  const onStopRef = useRef(onStop);

  // Keep track of the target symbols via ref
  const targetSymbolsRef = useRef<SymbolType[]>(symbols);

  // Sync refs with state/props
  useEffect(() => {
    targetSymbolsRef.current = symbols;
  }, [symbols]);

  useEffect(() => {
    displaySymbolsRef.current = displaySymbols;
  }, [displaySymbols]);

  useEffect(() => {
    startDelayRef.current = startDelay;
  }, [startDelay]);

  useEffect(() => {
    stopDelayRef.current = stopDelay;
  }, [stopDelay]);

  useEffect(() => {
    cellHeightRef.current = cellHeight;
  }, [cellHeight]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  // Dynamic sizing based on container HEIGHT (fluid scaling for aspect ratio)
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) {
          // Cell height = container height / 3 rows (pure division, no clamping)
          setCellHeight(h / 3);
        }
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // UNIFIED Animation Loop - handles ALL timing via rAF
  const animate = (time: number) => {
    const h = cellHeightRef.current;
    const dt = lastFrameTimeRef.current ? (time - lastFrameTimeRef.current) / 1000 : 0.016;
    lastFrameTimeRef.current = time;

    // Physics constants
    const ACCEL = h * 8;
    const MAX_SPEED = h * 20;

    const state = stateRef.current;

    // === STATE: START_DELAY ===
    // Wait for startDelay ms before accelerating (replaces setTimeout)
    if (state === 'START_DELAY') {
      if (!delayStartTimeRef.current) {
        delayStartTimeRef.current = time;
      }
      if (time - delayStartTimeRef.current >= startDelayRef.current) {
        stateRef.current = 'ACCELERATING';
        delayStartTimeRef.current = 0;
      }
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // === STATE: ACCELERATING ===
    if (state === 'ACCELERATING') {
      velocityRef.current += ACCEL * dt;
      if (velocityRef.current >= MAX_SPEED) {
        velocityRef.current = MAX_SPEED;
        stateRef.current = 'CONSTANT';
      }
    }

    // === STATE: CONSTANT / STOP_DELAY ===
    if (state === 'CONSTANT' || state === 'STOP_DELAY') {
      velocityRef.current = MAX_SPEED;
    }

    // === STATE: STOP_DELAY ===
    // Wait for stopDelay ms before transitioning to STOPPING (replaces setTimeout)
    if (state === 'STOP_DELAY') {
      if (!delayStartTimeRef.current) {
        delayStartTimeRef.current = time;
      }
      if (time - delayStartTimeRef.current >= stopDelayRef.current) {
        // Transition to STOPPING
        delayStartTimeRef.current = 0;
        stateRef.current = 'STOPPING';

        // "Jump and Slide" technique with visual continuity
        const currentSubCellOffset = positionRef.current % h;
        const currentIndex = Math.floor(positionRef.current / h) % Math.max(1, displaySymbolsRef.current.length - 3);

        const currentSyms = [
          displaySymbolsRef.current[currentIndex] || displaySymbolsRef.current[0],
          displaySymbolsRef.current[currentIndex + 1] || displaySymbolsRef.current[0],
          displaySymbolsRef.current[currentIndex + 2] || displaySymbolsRef.current[0]
        ];

        const landingStrip = [
          ...currentSyms,
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].type,
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].type,
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].type,
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].type,
          ...targetSymbolsRef.current
        ];

        setDisplaySymbols(landingStrip);
        displaySymbolsRef.current = landingStrip;

        // Start the stopping animation
        positionRef.current = currentSubCellOffset;
        setOffset(currentSubCellOffset);
        delayStartTimeRef.current = time; // Reuse for stop animation timing
      }
    }

    // === STATE: STOPPING ===
    // Animate slide to final position
    if (state === 'STOPPING') {
      const startT = delayStartTimeRef.current;
      const duration = 1500;
      const elapsed = time - startT;
      const progress = Math.min(elapsed / duration, 1);

      const startOffset = positionRef.current % h; // Initial sub-cell offset
      const targetOffset = 7 * h;
      const totalDistance = targetOffset - startOffset;

      // Ease Out Back: overshoot and settle
      const c1 = 1.2;
      const c3 = c1 + 1;
      const ease = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);

      const newOffset = startOffset + (totalDistance * ease);
      setOffset(newOffset);
      setBlur(Math.max(0, 4 * (1 - progress)));

      if (progress >= 1) {
        stateRef.current = 'IDLE';
        setDisplaySymbols(targetSymbolsRef.current);
        displaySymbolsRef.current = targetSymbolsRef.current;
        setOffset(0);
        onStopRef.current();
        return; // Animation complete
      }

      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // === SPINNING PHYSICS (ACCELERATING / CONSTANT) ===
    if (state !== 'IDLE') {
      positionRef.current += velocityRef.current * dt;

      const currentLength = displaySymbolsRef.current.length;
      const LOOP_HEIGHT = Math.max(1, (currentLength - 3) * h);

      if (positionRef.current >= LOOP_HEIGHT) {
        positionRef.current %= LOOP_HEIGHT;
      }

      setOffset(positionRef.current);

      const blurAmount = Math.max(0, (velocityRef.current - (h * 10)) / (h * 8));
      setBlur(Math.min(blurAmount, 4));

      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isSpinning) {
      const initialStrip = [...displaySymbols.slice(0, 3)];
      const buffer = Array.from({ length: RANDOM_BUFFER_SIZE }, () =>
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].type
      );

      const newSymbols = [...initialStrip, ...buffer];
      setDisplaySymbols(newSymbols);
      displaySymbolsRef.current = newSymbols;

      setOffset(0);
      positionRef.current = 0;
      velocityRef.current = 0;
      delayStartTimeRef.current = 0;
      lastFrameTimeRef.current = 0;

      stateRef.current = 'START_DELAY';
      requestRef.current = requestAnimationFrame(animate);

    } else {
      // STOP SIGNAL RECEIVED
      if (stateRef.current === 'CONSTANT' || stateRef.current === 'ACCELERATING') {
        stateRef.current = 'STOP_DELAY';
        delayStartTimeRef.current = 0; // Reset for stopDelay tracking
        requestRef.current = requestAnimationFrame(animate);
      }
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning]);

  // Height is now controlled by CSS flex, cellHeight is used for icon sizing and animation calculations

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full bg-retro-panel overflow-hidden shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] flex flex-col items-center"
    >
      <div
        className="absolute w-full flex flex-col items-center will-change-transform"
        style={{
          transform: `translateY(-${offset}px)`,
          filter: `blur(${blur}px)`,
        }}
      >
        {displaySymbols.map((sym, i) => {
          const def = getSymbolDef(sym);
          const Icon = def.icon;

          const isHighlighted = !isSpinning && stateRef.current === 'IDLE' && i === highlightedRowIndex;

          return (
            <div
              key={i}
              style={{ height: `${cellHeight}px` }}
              className={`w-full flex items-center justify-center bg-retro-panel border-b border-gray-900/50 relative 
                    ${def.color} 
                    ${isHighlighted ? 'animate-pulse-fast bg-white/10 z-20' : ''}
                 `}
            >
              {isHighlighted && (
                <div className="absolute inset-0 border-4 border-neon-green shadow-[inset_0_0_15px_rgba(57,255,20,0.5)] animate-pulse"></div>
              )}

              {sym === SymbolType.SEVEN ? (
                <PixelSeven
                  size={cellHeight * 0.7}
                  // No stroke needed, inherits text color (neon-green) via fill="currentColor"
                  className=""
                />
              ) : (
                <Icon
                  size={cellHeight * 0.6}
                  className="stroke-[2px] drop-shadow-md"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none"></div>
            </div>
          )
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70 pointer-events-none z-10 shadow-[inset_0_0_15px_rgba(0,0,0,1)]"></div>
    </div>
  );
};