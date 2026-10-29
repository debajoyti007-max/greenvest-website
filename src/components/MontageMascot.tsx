import { useRef, useEffect, useState, useCallback } from 'react';
import { Avatar, type AvatarController } from '@bible-strong/avatar-react';
import '@bible-strong/avatar-react/styles.css';
import montageDefinition from '../montage.avatar';

export interface MontageTriggerEventDetail {
  animation?: 'idle' | 'waking' | 'excited' | 'working' | 'sleeping' | 'celebrate' | 'confused' | 'laughing';
  tip?: string;
  durationMs?: number;
}

const DEFAULT_TIPS = [
  'Montage online. Telemetry shield active! 🛡️',
  'All systems running smooth.',
  'Need help? Tap me anytime!',
  'Ready to stream like a pro.',
  'Watching your connection parameters.',
];

export default function MontageMascot() {
  const avatarRef = useRef<AvatarController>(null);
  const [tip, setTip] = useState<string>('Montage online! 🛡️');
  const [showTip, setShowTip] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isAsleep, setIsAsleep] = useState<boolean>(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const tipTimeoutRef = useRef<number | null>(null);

  const displayTip = useCallback((text: string, durationMs = 4000) => {
    setTip(text);
    setShowTip(true);
    if (tipTimeoutRef.current) {
      window.clearTimeout(tipTimeoutRef.current);
    }
    tipTimeoutRef.current = window.setTimeout(() => {
      setShowTip(false);
    }, durationMs);
  }, []);

  // Handle external trigger events: window.dispatchEvent(new CustomEvent('montage:trigger', { detail: ... }))
  useEffect(() => {
    const handleTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<MontageTriggerEventDetail>;
      const { animation, tip: customTip, durationMs } = customEvent.detail || {};

      if (animation && avatarRef.current) {
        avatarRef.current.play(animation);
        if (animation === 'sleeping') {
          setIsAsleep(true);
        } else {
          setIsAsleep(false);
        }
      }

      if (customTip) {
        displayTip(customTip, durationMs ?? 4000);
      }
    };

    window.addEventListener('montage:trigger', handleTrigger);
    return () => {
      window.removeEventListener('montage:trigger', handleTrigger);
    };
  }, [displayTip]);

  // Initial wake up sequence
  useEffect(() => {
    // Show tip initially
    const timer = window.setTimeout(() => {
      setShowTip(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, []);

  // Inactivity detection (30s) -> Sleeping
  useEffect(() => {
    const resetInactivity = () => {
      if (isAsleep && avatarRef.current) {
        setIsAsleep(false);
        avatarRef.current.play('waking');
        displayTip("I'm awake! System active.", 2500);
      }

      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }

      inactivityTimerRef.current = window.setTimeout(() => {
        if (!isMinimized && avatarRef.current) {
          setIsAsleep(true);
          avatarRef.current.play('sleeping');
          displayTip('Entering standby...', 2500);
        }
      }, 30000); // 30 seconds
    };

    window.addEventListener('mousemove', resetInactivity, { passive: true });
    window.addEventListener('keydown', resetInactivity, { passive: true });
    window.addEventListener('touchstart', resetInactivity, { passive: true });

    // Start initial timer
    inactivityTimerRef.current = window.setTimeout(() => {
      if (!isMinimized && avatarRef.current) {
        setIsAsleep(true);
        avatarRef.current.play('sleeping');
      }
    }, 30000);

    return () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      window.removeEventListener('mousemove', resetInactivity);
      window.removeEventListener('keydown', resetInactivity);
      window.removeEventListener('touchstart', resetInactivity);
    };
  }, [isAsleep, isMinimized, displayTip]);

  // Click handler: play laughing / cycle tip
  const handleClick = () => {
    if (avatarRef.current) {
      if (isAsleep) {
        setIsAsleep(false);
        avatarRef.current.play('waking');
        displayTip('Back online!', 2500);
      } else {
        avatarRef.current.play('laughing');
        const randomTip = DEFAULT_TIPS[Math.floor(Math.random() * DEFAULT_TIPS.length)];
        displayTip(randomTip, 3500);
      }
    }
  };

  // Animation end callback
  const handleAnimationEnd = (animationName: string) => {
    if (animationName === 'waking' || animationName === 'laughing' || animationName === 'confused') {
      if (avatarRef.current) {
        avatarRef.current.play('idle');
      }
    }
  };

  if (isMinimized) {
    return (
      <div
        onClick={() => {
          setIsMinimized(false);
          displayTip('Montage active!', 2000);
        }}
        title="Open Montage Mascot"
        style={{
          position: 'fixed',
          bottom: '18px',
          right: '18px',
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          backgroundColor: '#0e121b',
          border: '1px solid rgba(0, 245, 255, 0.4)',
          boxShadow: '0 0 15px rgba(0, 245, 255, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 9999,
          color: '#00f5ff',
          fontSize: '18px',
          userSelect: 'none',
          transition: 'transform 0.2s ease',
        }}
      >
        🛡️
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        zIndex: 9999,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Speech Bubble */}
      {showTip && (
        <div
          style={{
            marginBottom: '8px',
            marginRight: '8px',
            backgroundColor: '#0e121b',
            color: '#e2e8f0',
            border: '1px solid rgba(0, 245, 255, 0.35)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 245, 255, 0.15)',
            borderRadius: '12px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 500,
            maxWidth: '190px',
            lineHeight: 1.35,
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease',
            position: 'relative',
          }}
        >
          {tip}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: '-5px',
              right: '28px',
              width: '8px',
              height: '8px',
              backgroundColor: '#0e121b',
              borderRight: '1px solid rgba(0, 245, 255, 0.35)',
              borderBottom: '1px solid rgba(0, 245, 255, 0.35)',
              transform: 'rotate(45deg)',
            }}
          />
        </div>
      )}

      {/* Mascot Container */}
      <div
        style={{
          position: 'relative',
          pointerEvents: 'auto',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={handleClick}
        title="Montage Mascot (Click to interact, double click to minimize)"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsMinimized(true);
        }}
      >
        {/* Glow halo */}
        <div
          style={{
            position: 'absolute',
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 245, 255, 0.2) 0%, rgba(168, 85, 247, 0.15) 50%, transparent 70%)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
          }}
        />

        {/* Bible Strong Avatar Renderer */}
        <Avatar
          ref={avatarRef}
          definition={montageDefinition}
          defaultAnimation="waking"
          size={110}
          onAnimationEnd={handleAnimationEnd}
          ariaLabel="Montage Animated Mascot"
        />

        {/* Minimize Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(true);
          }}
          title="Minimize Montage"
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: 'rgba(14, 18, 27, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#94a3b8',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
