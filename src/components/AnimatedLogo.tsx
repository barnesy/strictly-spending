import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';

interface AnimatedLogoProps {
  scale?: number;
  spinSpeed?: number;
  sx?: any;
}

export default function AnimatedLogo({ scale = 1, spinSpeed = 0.02, sx = {} }: AnimatedLogoProps = {}) {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(12);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartRot, setDragStartRot] = useState({ x: 12, y: 0 });

  // Slow auto-spin animation when not dragging
  useEffect(() => {
    if (isDragging) return;
    let frame: number;
    let lastTime = performance.now();
    const update = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      setRotY((prev) => (prev + delta * spinSpeed) % 360);
      setRotX(() => 2 + 10 * Math.sin(time * 0.0004));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isDragging]);

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX, y: clientY });
    setDragStartRot({ x: rotX, y: rotY });
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;
    setRotY(dragStartRot.y + dx * 0.7);
    setRotX(Math.max(-45, Math.min(45, dragStartRot.x - dy * 0.7)));
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const layers = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  return (
    <Box
      sx={{
        width: 36 * scale,
        height: 36 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: `${150 * scale}px`,
        overflow: 'visible',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        ...sx,
      }}
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }}
      onTouchEnd={handleEnd}
    >
      <Box
        sx={{
          width: 32 * scale,
          height: 32 * scale,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: isDragging ? 'none' : 'transform 150ms ease-out',
        }}
      >
        {layers.map((z) => {
          const isFace = z === 4 || z === -4;
          return (
            <Typography
              key={z}
              sx={{
                position: 'absolute',
                fontSize: `${28 * scale}px`,
                fontWeight: 950,
                fontFamily: '"Impact", "Arial Black", system-ui, sans-serif',
                lineHeight: 1,
                userSelect: 'none',
                transform: `translateZ(${z * scale}px)`,
                color: isFace ? '#CCFF00' : '#1A1A1A',
                WebkitTextStroke: `${1.5 * scale}px #000000`,
                textShadow: isFace ? 'none' : `${0.5 * scale}px ${0.5 * scale}px 0 #000`,
              }}
            >
              S
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
}
