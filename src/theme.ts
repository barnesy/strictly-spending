import { createTheme } from '@mui/material/styles';

export const ANIMATION_TIMING = {
  duration: 220, // milliseconds
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // easeOutQuint
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#5c6bc0' },
    background: { default: '#f5f7fa' },
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
          border: '1px solid rgba(0,0,0,0.08)',
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
          // Render labels as written (no uppercasing) so title-case strings stay
          // title-case across all ToggleButtonGroups.
          textTransform: 'none',
          // Extra horizontal breathing room — defaults are tight when labels are
          // multi-word like "Recurring vs One-Time" or "Last Month".
          paddingLeft: 14,
          paddingRight: 14,
          fontWeight: 500,
        },
      },
    },
  },
});

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
