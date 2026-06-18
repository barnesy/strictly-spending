import { createTheme } from '@mui/material/styles';

export const CONTROL_HEIGHT = 38;
export const CONTROL_BORDER_RADIUS = 8;

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

export interface ThemeConfig {
  mode: 'light' | 'dark';
  primaryColor: string;
  secondaryColor: string;
  backgroundColor?: string;
  paperColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  fontSize?: number;
}

// Function to compute luminance and decide on text color if not provided
function getContrast(hex: string): string {
  // Convert hex to RGB
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  // Compute luminance
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? 'rgba(0, 0, 0, 0.87)' : '#ffffff';
}

export function getAppTheme(config: ThemeConfig) {
  const {
    mode,
    primaryColor,
    secondaryColor,
    backgroundColor,
    paperColor,
    textColor,
    borderRadius = CONTROL_BORDER_RADIUS,
    fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    fontSize = 14,
  } = config;

  const bgDefault = backgroundColor || (mode === 'dark' ? '#0f172a' : '#f5f7fa');
  const bgPaper = paperColor || (mode === 'dark' ? '#1e293b' : '#ffffff');
  
  const isCustomBg = !!backgroundColor;
  const computedTextPrimary = isCustomBg ? getContrast(bgPaper) : (mode === 'dark' ? '#f8fafc' : '#1e293b');
  const textPrimary = textColor || computedTextPrimary;
  
  const isLightText = textPrimary === '#ffffff' || textPrimary.toLowerCase().includes('255, 255, 255');
  const textSecondary = textColor ? textColor + 'b3' : (isLightText ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)');
  const dividerColor = textColor ? textColor + '1a' : (isLightText ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)');

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryColor, contrastText: getContrast(primaryColor) },
      secondary: { main: secondaryColor, contrastText: getContrast(secondaryColor) },
      background: {
        default: bgDefault,
        paper: bgPaper,
      },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
      },
      divider: dividerColor,
    },
    typography: {
      fontFamily,
      fontSize,
      h1: { fontWeight: 600 },
      h2: { fontWeight: 600 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
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
    shape: {
      borderRadius,
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
            border: `1px solid ${dividerColor}`,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            height: CONTROL_HEIGHT,
            textTransform: 'none',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            paddingLeft: 14,
            paddingRight: 14,
            fontWeight: 500,
            height: CONTROL_HEIGHT,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'standard',
        },
      },
      MuiSelect: {
        defaultProps: {
          variant: 'standard',
        },
      },
      MuiFormControl: {
        defaultProps: {
          variant: 'standard',
        },
      },
      MuiInput: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            height: ownerState.multiline ? 'auto' : CONTROL_HEIGHT,
          }),
          underline: {
            '&:before': {
              borderBottomColor: dividerColor,
            },
            '&:hover:not(.Mui-disabled):before': {
              borderBottomColor: dividerColor,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            height: ownerState.multiline ? 'auto' : CONTROL_HEIGHT,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: dividerColor,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: dividerColor,
            },
          }),
        },
      },
    },
  });
}
