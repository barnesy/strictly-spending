import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Request a frame timeout or double rAF to trigger transition classes after mount
    const rAFId = requestAnimationFrame(() => {
      setActive(true);
    });
    return () => {
      cancelAnimationFrame(rAFId);
      setActive(false);
    };
  }, []);

  return (
    <Box
      sx={{
        opacity: active ? 1 : 0,
        transform: active ? 'translateY(0)' : 'translateY(8px)',
        transition: 
          'opacity var(--transition-duration) var(--transition-easing), ' +
          'transform var(--transition-duration) var(--transition-easing)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </Box>
  );
}
