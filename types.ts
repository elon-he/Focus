
export enum TimerMode {
  SINGLE = 'SINGLE',
  CHAIN = 'CHAIN'
}

export interface TaskStep {
  id: string;
  label: string;
  duration: number; // in minutes
}

export interface ChainPreset {
  id: string;
  name: string;
  steps: TaskStep[];
}

export interface TimerState {
  timeLeft: number; // seconds
  isRunning: boolean;
  currentMode: TimerMode;
  activeStepIndex: number;
}
