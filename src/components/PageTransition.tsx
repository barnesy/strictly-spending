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
    
    // Use a small timeout to guarantee execution even if the browser tab goes idle or sleeps
    const timer = setTimeout(() => {
      setActive(true);
    }, 35);
    
    return () => {
      clearTimeout(timer);
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
