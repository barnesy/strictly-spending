import { createTheme } from '@mui/material/styles';

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
  components: {
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
