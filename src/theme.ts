import { createTheme } from '@mui/material/styles';

export const ANIMATION_TIMING = {
  duration: 220, // milliseconds
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // easeOutQuint
};

export const ACCOUNT_COLORS = [
  '#1976d2',
  '#ef6c00',
  '#388e3c',
  '#7b1fa2',
  '#c62828',
  '#00897b',
  '#5d4037',
  '#455a64',
];

export function getAppTheme(mode: 'light' | 'dark', primaryColor: string, secondaryColor: string) {
  return createTheme({
    palette: {
      mode,
      primary: { main: primaryColor },
      secondary: { main: secondaryColor },
      background: {
        default: mode === 'dark' ? '#0f172a' : '#f5f7fa',
        paper: mode === 'dark' ? '#1e293b' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#f8fafc' : '#1e293b',
        secondary: mode === 'dark' ? '#94a3b8' : '#64748b',
      },
      divider: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    transitions: {
      duration: {
        shortest: 120,
        shorter: 160,
        short: 180,
        standard: ANIMATION_TIMING.duration,
        complex: 280,
        enteringScreen: ANIMATION_TIMING.duration,
        leavingScreen: Math.max(100, ANIMATION_TIMING.duration - 40),
      },
      easing: {
        easeInOut: ANIMATION_TIMING.easing,
        easeOut: ANIMATION_TIMING.easing,
        easeIn: 'cubic-bezier(0.55, 0, 1, 0.45)',
        sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: `
          :root {
            --transition-duration: ${ANIMATION_TIMING.duration}ms;
            --transition-easing: ${ANIMATION_TIMING.easing};
          }
          .transitioning-panels [data-panel] {
            transition: flex-grow var(--transition-duration) var(--transition-easing),
                        flex-basis var(--transition-duration) var(--transition-easing),
                        width var(--transition-duration) var(--transition-easing) !important;
          }
        `,
      },
      MuiDialog: {
        defaultProps: {
          transitionDuration: ANIMATION_TIMING.duration,
        },
      },
      MuiMenu: {
        defaultProps: {
          transitionDuration: ANIMATION_TIMING.duration,
        },
      },
      MuiPopover: {
        defaultProps: {
          transitionDuration: ANIMATION_TIMING.duration,
        },
      },
      MuiDrawer: {
        defaultProps: {
          transitionDuration: ANIMATION_TIMING.duration,
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 8,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            paddingLeft: 14,
            paddingRight: 14,
            fontWeight: 500,
          },
        },
      },
    },
  });
}
