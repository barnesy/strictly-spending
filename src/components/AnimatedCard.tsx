import { useState, useRef, useEffect } from 'react';
import { Paper } from '@mui/material';
import { useAnimationStore } from '../animationStore';

interface AnimatedCardProps {
  /** Color of the suggested category, drives the suggestion stripe. */
  suggestedColor?: string;
  /** Color of the chosen category when sorted. */
  chosenColor?: string;
  /** Position in the 3D stack (0 = top/active, 1 = next, etc.) */
  stackIndex: number;
  /** Direction to fly off: 'left' or 'right' */
  zipDirection?: 'left' | 'right';
  /** Manual overrides for static preview/inspection states in the playground */
  transformOverride?: string;
  animationOverride?: string;
  zIndexOverride?: number;
  isAnimatingOverride?: boolean;
  /** Card children content */
  children: React.ReactNode;
}

export default function AnimatedCard({
  suggestedColor,
  chosenColor,
  stackIndex,
  zipDirection = 'right',
  transformOverride,
  animationOverride,
  zIndexOverride,
  isAnimatingOverride,
  children,
}: AnimatedCardProps) {
  const config = useAnimationStore();
  const [localAnimating, setLocalAnimating] = useState(false);
  const prevStackIndexRef = useRef<number | undefined>(undefined);
  const activeAnimationRef = useRef('none');

  useEffect(() => {
    const prev = prevStackIndexRef.current;
    prevStackIndexRef.current = stackIndex;

    if (prev !== undefined && prev !== stackIndex) {
      if (
        (stackIndex === 0 && prev <= -1) || // Entering (undo or jump back)
        (stackIndex <= -1 && prev === 0)    // Leaving (sorted/skipped or jump forward)
      ) {
        setLocalAnimating(true);
      }
    }
  }, [stackIndex]);

  const isAnimating = isAnimatingOverride !== undefined
    ? isAnimatingOverride
    : (localAnimating ||
       (stackIndex === 0 && prevStackIndexRef.current !== undefined && prevStackIndexRef.current <= -1) ||
       (stackIndex <= -1 && prevStackIndexRef.current === 0));

  // Determine transform based on stack index and config settings
  let transform = 'none';
  if (transformOverride !== undefined) {
    transform = transformOverride;
  } else if (isAnimating) {
    transform = 'none';
  } else if (stackIndex === 0) {
    transform = `perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale})`;
  } else if (stackIndex === 1) {
    transform = 'perspective(1200px) translate3d(0, 16px, -45px) rotateX(7deg) rotateY(-7deg) rotateZ(-1.5deg) scale(0.96)';
  } else if (stackIndex === 2) {
    transform = 'perspective(1200px) translate3d(0, 32px, -90px) rotateX(9deg) rotateY(-9deg) rotateZ(-3deg) scale(0.92)';
  } else if (stackIndex <= -1) {
    transform = zipDirection === 'right'
      ? `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
      : `perspective(1200px) translate3d(${-config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(-${config.finalRotationZ}deg) scale(${config.finalScale})`;
  } else {
    transform = 'perspective(1200px) translate3d(0, 48px, -135px) rotateX(11deg) rotateY(-11deg) rotateZ(-4.5deg) scale(0.88)';
  }

  // Determine keyframe animation
  let animation = 'none';
  if (animationOverride !== undefined) {
    animation = animationOverride;
  } else if (stackIndex === 0 && prevStackIndexRef.current !== undefined && prevStackIndexRef.current <= -1) {
    animation = zipDirection === 'right'
      ? `entryFlipRight ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
      : `entryFlipLeft ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`;
    activeAnimationRef.current = animation;
  } else if (stackIndex <= -1 && prevStackIndexRef.current === 0) {
    animation = zipDirection === 'right'
      ? `exitFlipRight ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
      : `exitFlipLeft ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`;
    activeAnimationRef.current = animation;
  } else if (localAnimating) {
    animation = activeAnimationRef.current;
  }

  // Resolve z-index
  let zIndex = 9;
  if (zIndexOverride !== undefined) {
    zIndex = zIndexOverride;
  } else if (isAnimating) {
    zIndex = undefined as any; // Controlled by keyframe animation dynamically
  } else if (stackIndex <= -1) {
    zIndex = 0;
  } else {
    zIndex = 10 - stackIndex;
  }

  return (
    <Paper
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) {
          setLocalAnimating(false);
        }
      }}
      sx={(theme) => {
        const disableTransition = 
          isAnimating || 
          (stackIndex <= -1 && prevStackIndexRef.current !== undefined && prevStackIndexRef.current > 0) ||
          (stackIndex > 0 && prevStackIndexRef.current !== undefined && prevStackIndexRef.current <= -1);

        return {
          p: 3,
          borderRadius: `${theme.shape.borderRadius}px`,
          borderLeft: suggestedColor ? `5px solid ${suggestedColor}` : '5px solid transparent',
          transition: disableTransition
            ? 'none'
            : `transform ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}), opacity ${config.duration}ms ease`,
          transform,
        opacity: (isAnimating || (stackIndex >= 0 && stackIndex <= 2)) ? 1 : 0,
        boxShadow: stackIndex === 0 || chosenColor
          ? theme.palette.mode === 'dark'
            ? '0 1px 0 #2c2c2c, 0 2px 0 #242424, 0 3px 0 #1c1c1c, 0 4px 0 #141414, 0 30px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 1px 0 #e5e5e5, 0 2px 0 #dbdbdb, 0 3px 0 #d1d1d1, 0 4px 0 #c7c7c7, 0 30px 60px -15px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)'
          : stackIndex === 1
          ? theme.palette.mode === 'dark'
            ? '0 1px 0 #282828, 0 2px 0 #202020, 0 3px 0 #181818, 0 20px 40px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 1px 0 #e0e0e0, 0 2px 0 #d6d6d6, 0 3px 0 #cccccc, 0 20px 40px -10px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)'
          : theme.palette.mode === 'dark'
          ? '0 1px 0 #242424, 0 2px 0 #1c1c1c, 0 10px 20px -5px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 1px 0 #dbdbdb, 0 2px 0 #d1d1d1, 0 10px 20px -5px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)',
        bgcolor: chosenColor ? chosenColor + '22' : 'background.paper',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        minHeight: 540,
        zIndex,
        pointerEvents: stackIndex === 0 ? 'auto' : 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation,
        };
      }}
    >
      {children}
    </Paper>
  );
}
