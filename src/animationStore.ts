import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AnimationConfig {
  duration: number; // in ms
  // Step 1: Start (0% / 100%)
  startX: number;
  startY: number;
  startZ: number;
  startRotationX: number;
  startRotationY: number;
  startRotationZ: number;
  startScale: number;

  // Step 2: Midpoint (midStepPct% / 100 - midStepPct%)
  midStepPct: number;
  exitXRight: number; // exit midpoint X right
  exitXLeft: number;  // exit midpoint X left
  exitY: number;      // exit midpoint Y
  exitZ: number;      // exit midpoint Z
  midRotationX: number;
  midRotationY: number;
  midRotationZ: number;
  midScale: number;

  // Step 3: End (100% / 0%)
  finalXRight: number;
  finalXLeft: number;
  finalY: number;
  finalZ: number;
  finalRotationX: number;
  finalRotationY: number;
  finalRotationZ: number;
  finalScale: number;

  // Layering & Easing
  zSplitPct: number;
  bezierX1: number;
  bezierY1: number;
  bezierX2: number;
  bezierY2: number;
}

interface AnimationActions {
  updateConfig: (updates: Partial<AnimationConfig>) => void;
  resetConfig: () => void;
}

export type AnimationStore = AnimationConfig & AnimationActions;

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  duration: 900,
  
  // Step 1: Start
  startX: 0,
  startY: 0,
  startZ: 0,
  startRotationX: 5,
  startRotationY: -5,
  startRotationZ: 0,
  startScale: 1.0,

  // Step 2: Midpoint
  midStepPct: 20,
  exitXRight: 280,
  exitXLeft: -200,
  exitY: -20,
  exitZ: -60,
  midRotationX: 90,
  midRotationY: 90,
  midRotationZ: 0,
  midScale: 0.8,

  // Step 3: End
  finalXRight: 140,
  finalXLeft: 80,
  finalY: 60,
  finalZ: -180,
  finalRotationX: 180,
  finalRotationY: 180,
  finalRotationZ: 0,
  finalScale: 0.6,

  // Layering & Easing
  zSplitPct: 50,
  bezierX1: 0.25,
  bezierY1: 1.0,
  bezierX2: 0.5,
  bezierY2: 1.0,
};

export const useAnimationStore = create<AnimationStore>()(
  persist(
    (set) => ({
      ...DEFAULT_ANIMATION_CONFIG,
      updateConfig: (updates) => set((state) => ({ ...state, ...updates })),
      resetConfig: () => set(() => ({ ...DEFAULT_ANIMATION_CONFIG })),
    }),
    {
      name: 'spending-viz:card-animation',
    }
  )
);
