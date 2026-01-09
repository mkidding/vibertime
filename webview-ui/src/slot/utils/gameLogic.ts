import { SymbolType } from '../types';
import type { SlotSymbol, WinDetail } from '../types';
import {
  Bug,
  Terminal,
  Coffee,
  Code2,
  Database,
  Flame,
  Lock
} from '../components/SlotIcons';

// Configuration
export const ROWS = 3;
export const COLS = 5;

// Symbol Definitions
export const SYMBOLS: SlotSymbol[] = [
  // SEVEN: Green for Good Vibes (Coder Vibe)
  { id: '1', type: SymbolType.SEVEN, value: 2000, weight: 40, icon: null as any, color: 'text-neon-green' },
  // FIRE: Orange/Red for "On Fire" streak
  { id: '2', type: SymbolType.FIRE, value: 1000, weight: 25, icon: Flame, color: 'text-orange-500' },
  // TERMINAL: Cyan/Blue for retro cool
  { id: '3', type: SymbolType.TERMINAL, value: 500, weight: 35, icon: Terminal, color: 'text-cyan-400' },
  // DATABASE: Indigo/Blue for storage
  { id: '4', type: SymbolType.DATABASE, value: 400, weight: 45, icon: Database, color: 'text-indigo-400' },
  // BRACKETS: Yellow for syntax highlighting
  { id: '5', type: SymbolType.BRACKETS, value: 300, weight: 55, icon: Code2, color: 'text-yellow-400' },
  // LOCK: Purple/Pink for security
  { id: '6', type: SymbolType.LOCK, value: 200, weight: 65, icon: Lock, color: 'text-fuchsia-500' },
  // COFFEE: Amber for the caffeine boost
  { id: '7', type: SymbolType.COFFEE, value: 100, weight: 80, icon: Coffee, color: 'text-amber-600' },
  // BUG: Red for "Error/Bug" - Bad Vibe (Boosted value slightly so it registers as a score)
  { id: '8', type: SymbolType.BUG, value: 50, weight: 100, icon: Bug, color: 'text-red-600' },
];

// Helper to get random symbol based on weight
const getRandomSymbol = (): SymbolType => {
  const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const symbol of SYMBOLS) {
    if (random < symbol.weight) return symbol.type;
    random -= symbol.weight;
  }
  return SymbolType.BUG;
};

// Generate a random 3x5 grid
export const generateGrid = (): SymbolType[][] => {
  const grid: SymbolType[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: SymbolType[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(getRandomSymbol());
    }
    grid.push(row);
  }
  return grid;
};

// Payline Definitions (Coordinates [row, col])
// 5 Classic Lines including Diagonals (ZigZags)
export const PAYLINES = [
  // Top Row (Index 0)
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  // Middle Row (Index 1)
  [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]],
  // Bottom Row (Index 2)
  [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
  // V Shape (Index 3): Top-Left -> Mid-Left -> Bot-Center -> Mid-Right -> Top-Right
  [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]],
  // Inverted V (Index 4): Bot-Left -> Mid-Left -> Top-Center -> Mid-Right -> Bot-Right
  [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]],
];

export const calculateScore = (grid: SymbolType[][]): { score: number, lines: number[], winDetails: WinDetail[] } => {
  let totalScore = 0;
  const winningLines: number[] = [];
  const winDetails: WinDetail[] = [];

  PAYLINES.forEach((line, index) => {
    // Get symbols for this line
    const symbols = line.map(([r, c]) => grid[r][c]);

    // Scan for ALL consecutive sequences of matches on the line
    let currentSymbol = symbols[0];
    let currentCount = 1;
    let currentStart = 0;

    const processRun = (sym: SymbolType, count: number, start: number) => {
      // Minimum match is 2
      if (count < 2) return;

      const symbolDef = SYMBOLS.find(s => s.type === sym);
      if (!symbolDef) return;

      let multiplier = 0;
      if (count === 2) multiplier = 1; // Small vibe check
      else if (count === 3) multiplier = 3; // Decent
      else if (count === 4) multiplier = 10; // Big
      else if (count === 5) multiplier = 100; // Jackpot

      const runScore = Math.ceil(symbolDef.value * multiplier);

      if (runScore > 0) {
        totalScore += runScore;
        if (!winningLines.includes(index)) {
          winningLines.push(index);
        }
        winDetails.push({
          lineIndex: index,
          matchCount: count,
          symbol: sym,
          startIndex: start,
          score: runScore // Added specific score
        });
      }
    };

    for (let i = 1; i < symbols.length; i++) {
      if (symbols[i] === currentSymbol) {
        currentCount++;
      } else {
        // Run ended, process it
        processRun(currentSymbol, currentCount, currentStart);

        // Reset for new run
        currentSymbol = symbols[i];
        currentCount = 1;
        currentStart = i;
      }
    }
    // Check final run
    processRun(currentSymbol, currentCount, currentStart);
  });

  return { score: totalScore, lines: winningLines, winDetails };
};

export const getSymbolDef = (type: SymbolType) => SYMBOLS.find(s => s.type === type) || SYMBOLS[SYMBOLS.length - 1];

export const calculateVibePercentage = (totalScore: number): number => {
  // New Formula: F(x) = 0.236 * x^(0.645)
  // x is the totalScore

  // Special exception: If the score is 3,000,000 (theoretical 3-spin max), we return 100%
  if (totalScore >= 3000000) {
    return 100.00;
  }

  const rawPercentage = 0.236 * Math.pow(totalScore, 0.645);

  // Constraint: If F(x) > 100%, we show 99.99% (unless it was the 3Mn case above)
  if (rawPercentage > 99.99) {
    return 99.99;
  }

  // Return number with 2 decimal places precision for accuracy
  // Math.max(0, ...) ensures we don't return negative if score is somehow negative (unlikely)
  return Number(Math.max(0, rawPercentage).toFixed(2));
};