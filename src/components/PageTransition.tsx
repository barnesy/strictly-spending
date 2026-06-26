import React from 'react';
import { Box, keyframes } from '@mui/material';

interface PageTransitionProps {
  children: React.ReactNode;
  transitionKey?: string;
}

const pageEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export function PageTransition({ children, transitionKey }: PageTransitionProps) {
  return (
    <Box
      key={transitionKey}
      sx={{
        animation: `${pageEnter} var(--transition-duration) var(--transition-easing) forwards`,
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
