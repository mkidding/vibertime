import React from 'react';

export const SymbolType = {
  SEVEN: 'SEVEN',
  BUG: 'BUG',
  TERMINAL: 'TERMINAL',
  COFFEE: 'COFFEE',
  BRACKETS: 'BRACKETS',
  DATABASE: 'DATABASE',
  FIRE: 'FIRE',
  LOCK: 'LOCK'
} as const;
export type SymbolType = typeof SymbolType[keyof typeof SymbolType];

export interface SlotSymbol {
  id: string;
  type: SymbolType;
  value: number; // Base score value
  weight: number; // Likelihood of appearing (higher = more common)
  icon: React.FC<any>;
  color: string;
}

export interface WinDetail {
  lineIndex: number;
  matchCount: number;
  symbol: SymbolType;
  startIndex: number; // Index in the payline where the match sequence starts
  score: number; // The specific score earned from this win
}

export interface SpinResult {
  grid: SymbolType[][]; // 3 rows x 5 cols
  paylinesWon: number[];
  winDetails: WinDetail[]; // Added for detailed animation
  score: number;
  isWin: boolean;
}

export interface AdviceResult {
  title: string;
  message: string;
  color: string;
  borderColor: string;
}

export interface GameState {
  shotsLeft: number;
  totalScore: number;
  spinHistory: SpinResult[];
  isSpinning: boolean;
  gameOver: boolean;
  vibePercentage: number;
  advice: AdviceResult | null;
}

export type Quadrant = 'TERRIBLE' | 'POOR' | 'DECENT' | 'EXCELLENT';