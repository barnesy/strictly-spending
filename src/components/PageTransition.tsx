import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';

interface PageTransitionProps {
  children: React.ReactNode;
  transitionKey?: string;
}

export function PageTransition({ children, transitionKey }: PageTransitionProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Reset active state to re-trigger the transition
    setActive(false);
    
    // Request a double rAF to ensure the browser paints the inactive state first
    let rAFId2: number;
    const rAFId = requestAnimationFrame(() => {
      rAFId2 = requestAnimationFrame(() => {
        setActive(true);
      });
    });
    
    return () => {
      cancelAnimationFrame(rAFId);
      if (rAFId2) cancelAnimationFrame(rAFId2);
      setActive(false);
    };
  }, [transitionKey]);

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
