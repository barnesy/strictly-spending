import { Box, Portal } from '@mui/material';
import AnimatedLogo from './AnimatedLogo';
import { useState, useEffect, useRef } from 'react';

interface PageLoaderProps {
  isLoading: boolean;
  children: React.ReactNode;
}

export default function PageLoader({ isLoading, children }: PageLoaderProps) {
  const [internalLoading, setInternalLoading] = useState(isLoading);
  const loadingStartTime = useRef(isLoading ? Date.now() : 0);

  useEffect(() => {
    if (isLoading) {
      setInternalLoading(true);
      loadingStartTime.current = Date.now();
    } else {
      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = Math.max(0, 500 - elapsed);
      
      const timer = setTimeout(() => {
        setInternalLoading(false);
      }, remaining);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Loading Spinner overlay */}
      <Portal>
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            opacity: internalLoading ? 1 : 0,
            visibility: internalLoading ? 'visible' : 'hidden',
            pointerEvents: 'none', // Never block clicks
            transform: internalLoading ? 'scale(1)' : 'scale(0.8)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {internalLoading && (
            <Box sx={{ transform: 'scale(1)' }}>
              <AnimatedLogo scale={4.5} spinSpeed={0.08} sx={{ pointerEvents: 'none' }} />
            </Box>
          )}
        </Box>
      </Portal>

      {/* Main Content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          opacity: internalLoading ? 0 : 1,
          transform: internalLoading ? 'translateY(10px)' : 'translateY(0)',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transitionDelay: internalLoading ? '0s' : '0.1s', // Wait for logo to start dropping before fading in
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
