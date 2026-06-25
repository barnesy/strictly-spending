import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Subtle scrollbar styling — thin, semi-transparent thumb that brightens
 * on hover. Works on Webkit (Chrome/Safari/Edge) and Firefox. Avoids the
 * "display:none" hack so users still get a visual indicator that there's
 * more content, and scrollbars remain accessible.
 *
 * Apply to any container with overflow: auto / scroll.
 */
export const subtleScrollSx: SxProps<Theme> = (theme) => ({
  scrollbarWidth: 'thin',
  scrollbarColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15) transparent' : 'rgba(0,0,0,0.15) transparent',
});
