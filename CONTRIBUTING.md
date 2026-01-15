# Contributing to Viber Time

Thank you for your interest in contributing to Viber Time! This guide will help you set up your development environment and understand the project architecture.

## Development Setup

### Prerequisites

- **Node.js** v18+ 
- **VS Code** (latest stable)
- **npm** (included with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/mkidding/vibertime.git
cd vibertime/plugin

# Install extension dependencies
npm install

# Install webview dependencies
cd webview-ui
npm install
cd ..
```

### Running the Extension

1. Open the `plugin` folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. In the new VS Code window, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Search for **"Viber Time: Show Dashboard"**

### Building

```bash
# Compile TypeScript (backend)
npm run compile

# Build webview (frontend)
cd webview-ui && npm run build

# Or build both
npm run compile && cd webview-ui && npm run build && cd ..
```

---

## Debug Panel (Internal Tools)

The Debug Panel provides developer tools for testing and simulating activity.

### How to Access

1. Open the Dashboard (`Cmd+Shift+P` → "Viber Time: Show Dashboard")
2. Click the **Activity Timer** (green clock) **5 times** rapidly
3. The Debug Panel will appear below the main dashboard

### Features

| Tool | Description |
|------|-------------|
| **Time Travel** | Set a fake system time to test bedtime notifications |
| **Metric Simulation** | Add simulated lines to Bio/Synth/Ghost buckets |
| **Time Buttons** | Add +10 minutes to Edit or Review time |
| **Reset New Day** | Clear all stats and reset slot machine state |
| **Force Done** | End current slot session and trigger analysis |
| **Show RAW JSON** | View live `DailyStats` object for debugging |
| **Copy JSON** | Copy current stats to clipboard |

### Simulation Buttons

| Button | Effect |
|--------|--------|
| `+100 BIO TYPE` | Add 100 lines of simulated human typing (new code) |
| `+100 BIO REFACT` | Add 100 lines of simulated human refactoring |
| `+100 SYNTH GEN` | Add 100 lines of simulated AI-generated code |
| `+100 SYNTH REFACT` | Add 100 lines of simulated AI refactoring |
| `+100 EXT.` | Add 100 lines of simulated external/ghost code |
| `+10m EDIT` | Add 10 minutes of Edit time |
| `+10m REVIEW` | Add 10 minutes of Review time |

---

## Architecture Overview

### The Trilogy Data Model

Viber Time classifies all code activity into three sources:

| Source | Icon | Description |
|--------|------|-------------|
| **BIO** (Biological) | 👤 | Human-typed code (slow, intentional input) |
| **SYNTH** (Synthetic) | 🤖 | AI-generated code (large bursts, autocomplete) |
| **EXT.** (External/Ghost) | 👻 | Code appearing while VS Code is unfocused |

Each source further breaks down by action:
- **TYPE/GEN** (Add) - New code insertion
- **REFACT** (Refactor) - Modifying existing code

### Key Files

| File | Purpose |
|------|---------|
| `src/core/ActivityTracker.ts` | Time tracking (Edit/Review), Smart Gap logic |
| `src/core/MetricsEngine.ts` | Code classification (Bio/Synth/Ghost) |
| `src/core/StorageManager.ts` | Persistence, schema hydration |
| `src/core/NotificationManager.ts` | Bedtime notifications, presence detection |
| `src/panels/DashboardPanel.ts` | Webview host, message handling |
| `webview-ui/src/components/Dashboard.tsx` | Main UI component |
| `webview-ui/src/components/DebugPanel.tsx` | Developer tools panel |

### Smart Gap Time Tracking

Time attribution uses retroactive gap analysis:

| Gap Duration | Attribution |
|-------------|-------------|
| < 60s | → Previous state (thinking bridge) |
| 60-120s | → Review (reading/researching) |
| > 120s | → 30s cap to Review, then IDLE |

---

## Code Style

- Use `Logger.info()` / `Logger.warn()` instead of `console.log()`
- Follow existing TypeScript patterns
- Test with Debug Panel before submitting PRs

---

## Questions?

Open an issue on GitHub or check `docs/SPRINT_LOG.md` for development history.
