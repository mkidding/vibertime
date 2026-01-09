import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { vscode } from './utils/vscode';
import './index.css';

// Export removed - child components should import from utils directly
// export { vscode };

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
}

interface DashboardData {
  activeSeconds: number;
  typingSeconds: number;
  reviewingSeconds: number;
  timeRatio: number;
  cyborgRatio: number;

  // Granular Metrics
  humanTypedLines: number;
  humanRefactoredLines: number;
  aiGeneratedLines: number;
  aiEditedLines: number;

  humanChars: number;
  aiChars: number;
  refactorChars: number;
  bedtime: string;
  dayStartHour: number;
  idleTimeoutSeconds: number;
  timeUntilBedtime: number;
  targetBedtimeMs: number;

  slotState: SlotState; // Now required/guaranteed by backend init
  currentSimulatedTime?: number;
  isSnoozed?: boolean;
}

function App() {
  const [data, setData] = useState<DashboardData>({
    activeSeconds: 0,
    typingSeconds: 0,
    reviewingSeconds: 0,
    timeRatio: 50,
    cyborgRatio: 0,
    humanTypedLines: 0,
    humanRefactoredLines: 0,
    aiGeneratedLines: 0,
    aiEditedLines: 0,
    humanChars: 0,
    aiChars: 0,
    refactorChars: 0,
    bedtime: "00:00",
    dayStartHour: 4,
    idleTimeoutSeconds: 30,
    timeUntilBedtime: 0,
    targetBedtimeMs: 0,
    slotState: {
      runsRemaining: 1,
      currentEnergy: 3,
      currentScore: 0,
      dailyHighScore: 0,
      bestAnalysis: null
    },
    currentSimulatedTime: Date.now(),
    isSnoozed: false
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          // Force new object references for nested properties if any exist (though currently flat)
          // Spreading the payload itself ensures the top-level object is new.
          setData({ ...message.payload });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    if (vscode) vscode.postMessage({ type: 'refresh' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSnooze = (minutes: number) => {
    vscode.postMessage({ type: 'snooze', minutes });
  };

  return (
    <Dashboard
      activeSeconds={data.activeSeconds}
      typingSeconds={data.typingSeconds}
      reviewingSeconds={data.reviewingSeconds}
      timeRatio={data.timeRatio}
      cyborgRatio={data.cyborgRatio}
      humanTypedLines={data.humanTypedLines}
      humanRefactoredLines={data.humanRefactoredLines}
      aiGeneratedLines={data.aiGeneratedLines}
      aiEditedLines={data.aiEditedLines}
      humanChars={data.humanChars}
      aiChars={data.aiChars}
      refactorChars={data.refactorChars}
      bedtime={data.bedtime}
      dayStartHour={data.dayStartHour}
      idleTimeoutSeconds={data.idleTimeoutSeconds}
      timeUntilBedtime={data.timeUntilBedtime}
      targetBedtimeMs={data.targetBedtimeMs}
      slotState={data.slotState}
      currentSimulatedTime={data.currentSimulatedTime}
      isSnoozed={data.isSnoozed}
      onSnooze={handleSnooze}
    />
  );
}

export default App;
