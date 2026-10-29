import type { AvatarDefinition } from '@bible-strong/avatar-core';

export const montageDefinition: AvatarDefinition = {
  schema: 'bible-strong/avatar-definition',
  schemaVersion: 1,
  name: 'Montage',
  body: {
    primary: {
      type: 'sphere',
      width: 100,
      height: 94,
      depth: 100,
      roundness: 0.95,
    },
    nodes: [],
  },
  colors: {
    body: '#0e121b',
    eyes: '#00f5ff',
  },
  expressions: {
    neutral: {
      head: { x: 0, y: 0, z: 0 },
      eyes: {
        left: { width: 14, height: 26, x: -3, y: 0, angle: -4 },
        right: { width: 14, height: 26, x: 3, y: 0, angle: 4 },
        spacing: 22,
      },
      perspective: 1,
      motion: {
        eyes: 'microSaccades',
        body: 'slowDrift',
      },
    },
    idle: {
      head: { x: 0, y: -2, z: 0 },
      eyes: {
        left: { width: 14, height: 24, x: -2, y: -1, angle: -2 },
        right: { width: 14, height: 24, x: 2, y: -1, angle: 2 },
        spacing: 22,
      },
      perspective: 1,
      motion: {
        eyes: 'microSaccades',
        body: 'slowDrift',
      },
    },
    excited: {
      head: { x: 0, y: -6, z: 2 },
      eyes: {
        left: { width: 17, height: 32, x: 0, y: -4, angle: -8 },
        right: { width: 17, height: 32, x: 0, y: -4, angle: 8 },
        spacing: 24,
      },
      perspective: 1.1,
      motion: {
        eyes: 'shake',
        body: 'slowDrift',
      },
      colors: {
        eyes: '#00ffff',
      },
    },
    working: {
      head: { x: 2, y: 4, z: 0 },
      eyes: {
        left: { width: 13, height: 20, x: 2, y: 3, angle: 2 },
        right: { width: 13, height: 20, x: 4, y: 3, angle: -2 },
        spacing: 20,
      },
      perspective: 1,
      motion: {
        eyes: 'microSaccades',
        body: 'none',
      },
    },
    thinking: {
      head: { x: -4, y: -4, z: 1 },
      eyes: {
        left: { width: 12, height: 22, x: -4, y: -5, angle: 6 },
        right: { width: 12, height: 22, x: -2, y: -5, angle: 6 },
        spacing: 20,
      },
      perspective: 1,
      motion: {
        eyes: 'none',
        body: 'slowDrift',
      },
    },
    waking: {
      head: { x: 0, y: 6, z: 0 },
      eyes: {
        left: { width: 14, height: 10, x: 0, y: 4, angle: 0 },
        right: { width: 14, height: 10, x: 0, y: 4, angle: 0 },
        spacing: 22,
      },
      perspective: 1,
      motion: {
        eyes: 'none',
        body: 'slowDrift',
      },
    },
    sleeping: {
      head: { x: 0, y: 8, z: -1 },
      eyes: {
        left: { width: 16, height: 4, x: 0, y: 6, angle: 0 },
        right: { width: 16, height: 4, x: 0, y: 6, angle: 0 },
        spacing: 22,
      },
      perspective: 0.95,
      motion: {
        eyes: 'none',
        body: 'slowDrift',
      },
      colors: {
        eyes: '#1e3a5f',
      },
    },
    celebrate: {
      head: { x: 0, y: -10, z: 3 },
      eyes: {
        left: { width: 18, height: 34, x: -2, y: -6, angle: -10 },
        right: { width: 18, height: 34, x: 2, y: -6, angle: 10 },
        spacing: 26,
      },
      perspective: 1.15,
      motion: {
        eyes: 'shake',
        body: 'shake',
      },
      colors: {
        eyes: '#a855f7',
      },
    },
    confused: {
      head: { x: 6, y: -2, z: 2 },
      eyes: {
        left: { width: 12, height: 18, x: -1, y: 2, angle: 8 },
        right: { width: 16, height: 28, x: 3, y: -3, angle: -4 },
        spacing: 24,
      },
      perspective: 1.05,
      motion: {
        eyes: 'microSaccades',
        body: 'none',
      },
    },
    laughing: {
      head: { x: 0, y: -4, z: 1 },
      eyes: {
        left: { width: 16, height: 14, x: -1, y: -2, angle: -8 },
        right: { width: 16, height: 14, x: 1, y: -2, angle: 8 },
        spacing: 24,
      },
      perspective: 1.05,
      motion: {
        eyes: 'shake',
        body: 'shake',
      },
    },
  },
  expressionOrder: [
    'neutral',
    'idle',
    'excited',
    'working',
    'thinking',
    'waking',
    'sleeping',
    'celebrate',
    'confused',
    'laughing',
  ],
  animations: {
    idle: {
      playbackMode: 'loop',
      steps: [
        { expression: 'neutral', holdMs: 2000, transitionMs: 400, transition: 'smooth' },
        { expression: 'idle', holdMs: 2500, transitionMs: 400, transition: 'smooth' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 1200,
        minIntervalMs: 2500,
        maxIntervalMs: 6000,
        durationMs: 160,
      },
      metadata: {
        label: 'Idle Guard',
        description: 'Subtle calm breathing and alert scanning',
      },
    },
    waking: {
      playbackMode: 'once',
      steps: [
        { expression: 'sleeping', holdMs: 300, transitionMs: 200, transition: 'smooth' },
        { expression: 'waking', holdMs: 600, transitionMs: 400, transition: 'spring' },
        { expression: 'neutral', holdMs: 800, transitionMs: 300, transition: 'snappy' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 400,
        minIntervalMs: 1000,
        maxIntervalMs: 3000,
        durationMs: 140,
      },
      metadata: {
        label: 'Waking Up',
        description: 'Opens eyes and boots up system',
      },
    },
    excited: {
      playbackMode: 'loop',
      steps: [
        { expression: 'excited', holdMs: 700, transitionMs: 200, transition: 'spring' },
        { expression: 'neutral', holdMs: 400, transitionMs: 200, transition: 'snappy' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 800,
        minIntervalMs: 1500,
        maxIntervalMs: 3500,
        durationMs: 120,
      },
      metadata: {
        label: 'Excited',
        description: 'Joyful reaction upon connection or license validation',
      },
    },
    working: {
      playbackMode: 'loop',
      steps: [
        { expression: 'working', holdMs: 1200, transitionMs: 300, transition: 'smooth' },
        { expression: 'thinking', holdMs: 1200, transitionMs: 300, transition: 'smooth' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 1000,
        minIntervalMs: 2000,
        maxIntervalMs: 4500,
        durationMs: 140,
      },
      metadata: {
        label: 'Working',
        description: 'Processing telemetry and pushing updates',
      },
    },
    sleeping: {
      playbackMode: 'loop',
      steps: [
        { expression: 'sleeping', holdMs: 4000, transitionMs: 600, transition: 'smooth' },
      ],
      blink: {
        enabled: false,
        initialDelayMs: 0,
        minIntervalMs: 250,
        maxIntervalMs: 250,
        durationMs: 50,
      },
      metadata: {
        label: 'Sleeping',
        description: 'Low power mode after inactivity',
      },
    },
    celebrate: {
      playbackMode: 'loop',
      steps: [
        { expression: 'celebrate', holdMs: 600, transitionMs: 200, transition: 'spring' },
        { expression: 'excited', holdMs: 600, transitionMs: 200, transition: 'snappy' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 500,
        minIntervalMs: 1200,
        maxIntervalMs: 3000,
        durationMs: 130,
      },
      metadata: {
        label: 'Celebrate',
        description: 'High energy victory celebration',
      },
    },
    confused: {
      playbackMode: 'once',
      steps: [
        { expression: 'confused', holdMs: 1500, transitionMs: 300, transition: 'snappy' },
        { expression: 'neutral', holdMs: 500, transitionMs: 300, transition: 'smooth' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 500,
        minIntervalMs: 1000,
        maxIntervalMs: 3000,
        durationMs: 150,
      },
      metadata: {
        label: 'Confused',
        description: 'Puzzled reaction on error',
      },
    },
    laughing: {
      playbackMode: 'once',
      steps: [
        { expression: 'laughing', holdMs: 1200, transitionMs: 200, transition: 'spring' },
        { expression: 'neutral', holdMs: 500, transitionMs: 300, transition: 'smooth' },
      ],
      blink: {
        enabled: true,
        initialDelayMs: 400,
        minIntervalMs: 1000,
        maxIntervalMs: 2500,
        durationMs: 130,
      },
      metadata: {
        label: 'Laughing',
        description: 'Playful reaction when tapped or clicked',
      },
    },
  },
  animationOrder: [
    'idle',
    'waking',
    'excited',
    'working',
    'sleeping',
    'celebrate',
    'confused',
    'laughing',
  ],
};

export default montageDefinition;
