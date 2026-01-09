import React, { useEffect, useState, useRef } from 'react';
import type { GameState, AdviceResult } from '../types';
import { getVibeAnalysis } from '../services/adviceService';
import { Terminal } from 'lucide-react';

interface ResultOverlayProps {
  state: GameState;
  onReset: () => void;
  onSaveAdvice: (advice: AdviceResult) => void;
}

type TypingPhase = 'LOADING' | 'TYPING_TITLE' | 'TYPING_MESSAGE' | 'COMPLETE';

export const ResultOverlay: React.FC<ResultOverlayProps> = ({ state, onReset, onSaveAdvice }) => {
  const [advice, setAdvice] = useState<AdviceResult | null>(null);

  // Typing Animation State
  const [phase, setPhase] = useState<TypingPhase>('LOADING');
  const [displayedTitle, setDisplayedTitle] = useState('');
  const [displayedMessage, setDisplayedMessage] = useState('');

  // rAF refs for animations
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);
  const charIndexRef = useRef(0);
  const lastCharTimeRef = useRef(0);

  // Store callback in ref to avoid dependency issues
  const onSaveAdviceRef = useRef(onSaveAdvice);
  onSaveAdviceRef.current = onSaveAdvice;

  // Store advice in ref for rAF access
  const adviceRef = useRef<AdviceResult | null>(null);
  useEffect(() => { adviceRef.current = advice; }, [advice]);

  // 1. DATA LOADING PHASE - rAF-based 3s delay
  useEffect(() => {
    // If advice already exists (persistence), load it but restart typing effect
    if (state.advice) {
      setAdvice(state.advice);
      setPhase('TYPING_TITLE');
      return;
    }

    // rAF-based 3 second loading delay (replaces setTimeout)
    const LOADING_DURATION = 3000;
    startTimeRef.current = 0;

    const loadingTick = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;

      if (time - startTimeRef.current >= LOADING_DURATION) {
        const result = getVibeAnalysis(state.vibePercentage);
        setAdvice(result);
        onSaveAdviceRef.current(result);
        setPhase('TYPING_TITLE');
        return;
      }
      rafRef.current = requestAnimationFrame(loadingTick);
    };

    rafRef.current = requestAnimationFrame(loadingTick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state.advice, state.vibePercentage]);

  // 2. TYPING LOGIC - rAF-based typewriter
  useEffect(() => {
    if (!advice) return;

    if (phase === 'TYPING_TITLE') {
      charIndexRef.current = 0;
      lastCharTimeRef.current = 0;
      const TITLE_CHAR_DELAY = 80;
      const TITLE_END_PAUSE = 300;

      const typeTitleTick = (time: number) => {
        if (!lastCharTimeRef.current) lastCharTimeRef.current = time;

        const elapsed = time - lastCharTimeRef.current;
        const charIdx = charIndexRef.current;

        // Still typing title
        if (charIdx < advice.title.length) {
          if (elapsed >= TITLE_CHAR_DELAY) {
            setDisplayedTitle(advice.title.slice(0, charIdx + 1));
            charIndexRef.current = charIdx + 1;
            lastCharTimeRef.current = time;
          }
          rafRef.current = requestAnimationFrame(typeTitleTick);
        } else {
          // Title done, wait then transition
          if (elapsed >= TITLE_END_PAUSE) {
            setPhase('TYPING_MESSAGE');
          } else {
            rafRef.current = requestAnimationFrame(typeTitleTick);
          }
        }
      };

      rafRef.current = requestAnimationFrame(typeTitleTick);
    }

    if (phase === 'TYPING_MESSAGE') {
      charIndexRef.current = 0;
      lastCharTimeRef.current = 0;
      const nextDelayRef = { current: Math.random() * 20 + 10 };

      const typeMessageTick = (time: number) => {
        if (!lastCharTimeRef.current) lastCharTimeRef.current = time;

        const elapsed = time - lastCharTimeRef.current;
        const charIdx = charIndexRef.current;
        const currentAdvice = adviceRef.current;

        if (!currentAdvice) return;

        if (charIdx < currentAdvice.message.length) {
          if (elapsed >= nextDelayRef.current) {
            setDisplayedMessage(currentAdvice.message.slice(0, charIdx + 1));
            charIndexRef.current = charIdx + 1;
            lastCharTimeRef.current = time;
            nextDelayRef.current = Math.random() * 20 + 10; // New random delay
          }
          rafRef.current = requestAnimationFrame(typeMessageTick);
        } else {
          setPhase('COMPLETE');
        }
      };

      rafRef.current = requestAnimationFrame(typeMessageTick);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, advice]);

  const loading = phase === 'LOADING';
  const displayColor = advice?.color || 'text-gray-400';
  const displayBorder = advice?.borderColor || 'border-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

      {/* Modal - Strictly Viewport Contained */}
      <div className={`relative bg-[#0a0a0f] border-2 ${displayBorder} p-1 w-[90vw] md:w-[50vw] max-w-xl h-auto min-h-[30vh] max-h-[85vh] rounded-none shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-[pulse-fast_0.5s_ease-out_1] flex flex-col`}>

        {/* Inner Frame - Fluid Padding */}
        <div className="border border-white/10 p-[clamp(1rem,3vw,1.5rem)] flex flex-col items-start text-left space-y-4 md:space-y-8 relative overflow-hidden h-full justify-between flex-grow">

          {/* Scanline overlay for modal */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%]"></div>

          {/* Top Section: Score */}
          <div className="z-10 w-full flex-none flex flex-col justify-center items-start">
            <div className="text-xs sm:text-sm text-gray-500 font-mono mb-2 uppercase tracking-[0.3em] animate-pulse">Vibe Analysis Complete</div>

            {loading ? (
              <div className="flex flex-col items-start justify-center space-y-4 py-4 w-full">
                <div className="w-12 h-12 border-4 border-t-neon-green border-r-transparent border-b-neon-green border-l-transparent rounded-full animate-spin"></div>
                <div className="text-neon-green font-mono text-lg animate-pulse flex flex-col gap-1">
                  <span>DECODING...</span>
                </div>
              </div>
            ) : (
              <>
                <h2 className={`font-mono font-bold ${displayColor} drop-shadow-[0_0_10px_currentColor] leading-none text-[clamp(2.5rem,6vw,4.5rem)]`}>
                  {state.vibePercentage.toFixed(2)}%
                </h2>
                {/* Typewriter Title - Updated to match percentage style */}
                <div className={`mt-2 font-mono font-bold tracking-widest uppercase ${displayColor} drop-shadow-[0_0_8px_currentColor] min-h-[1.5em] leading-tight text-[clamp(1rem,2.5vw,2rem)]`}>
                  {displayedTitle}
                  {phase === 'TYPING_TITLE' && <span className="animate-pulse bg-current inline-block w-3 h-8 ml-2 align-middle"></span>}
                </div>
              </>
            )}
          </div>

          {/* Middle Section: Advice Text */}
          <div className="z-10 w-full space-y-2 text-left">
            <div className={`flex items-center text-gray-400 font-mono text-[clamp(0.7rem,1.5vw,0.875rem)] uppercase tracking-wider`}>
              <Terminal className="w-4 h-4 mr-2" />
              <span>System Message</span>
            </div>
            <div className={`bg-[#050505] p-[clamp(0.75rem,2vw,1rem)] border-l-4 ${loading ? 'border-gray-700' : displayBorder} text-gray-300 font-mono text-[clamp(0.85rem,1.5vw,1rem)] leading-relaxed tracking-wide flex-grow overflow-y-auto shadow-inner flex items-start min-h-[10vh]`}>
              {loading ? (
                <div className="flex flex-col space-y-2 w-full">
                  <div className="h-2 bg-gray-800 rounded w-3/4 animate-pulse"></div>
                  <div className="h-2 bg-gray-800 rounded w-full animate-pulse delay-75"></div>
                  <div className="h-2 bg-gray-800 rounded w-5/6 animate-pulse delay-150"></div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">
                  {displayedMessage}
                  {/* Cursor appears during message typing AND stays after completion */}
                  {(phase === 'TYPING_MESSAGE' || phase === 'COMPLETE') && (
                    <span className={`animate-pulse font-bold ${displayColor}`}> _</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Bottom Section: Button */}
          <div className="z-10 w-full pt-4 mt-auto">
            <button
              onClick={onReset}
              disabled={loading} // Early Exit Allowed
              className={`w-full bg-white text-black font-bold font-mono py-[clamp(1rem,3vh,1.5rem)] hover:bg-gray-200 hover:scale-[1.01] transition-all duration-200 flex items-center justify-center uppercase tracking-widest text-[clamp(1rem,2.5vw,1.25rem)] group ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Reboot System"
            >
              <svg
                width="48"
                height="24"
                viewBox="0 0 48 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-black stroke-[4px] group-hover:-translate-x-2 transition-transform duration-300"
                style={{ strokeLinecap: 'square', strokeLinejoin: 'miter' }}
              >
                <path d="M46 12H2M2 12L14 2M2 12L14 22" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};