import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Subtle scrollbar styling — thin, semi-transparent thumb that brightens
 * on hover. Works on Webkit (Chrome/Safari/Edge) and Firefox. Avoids the
 * "display:none" hack so users still get a visual indicator that there's
 * more content, and scrollbars remain accessible.
 *
 * Apply to any container with overflow: auto / scroll.
 */
export const subtleScrollSx: SxProps<Theme> = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(0,0,0,0.15) transparent',
  '&::-webkit-scrollbar': {
    width: 8,
    height: 8,
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    background: 'rgba(0,0,0,0.12)',
    borderRadius: 4,
    border: '2px solid transparent',
    backgroundClip: 'padding-box',
    transition: 'background-color 120ms ease',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: 'rgba(0,0,0,0.3)',
    backgroundClip: 'padding-box',
  },
  '&::-webkit-scrollbar-corner': {
    background: 'transparent',
  },
};
