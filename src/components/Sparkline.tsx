import React, { useId } from 'react';
import { Box, Tooltip, Typography, Stack, useTheme } from '@mui/material';
import { usd } from '../lib';

export interface SparklinePoint {
  month: string;
  label: string;
  amount: number;
}

export interface SparklineProps {
  data: SparklinePoint[];
  color?: string;
  width?: number;
  height?: number;
  title?: string;
  average?: number;
  showTooltip?: boolean;
}

export function computeSparklinePaths(
  data: SparklinePoint[],
  width = 60,
  height = 18,
  padX = 3,
  padY = 3
) {
  if (!data || data.length === 0) {
    return { pts: [], linePath: '', areaPath: '', lastPt: null, maxVal: 0 };
  }

  const amounts = data.map((d) => d.amount);
  const maxVal = Math.max(...amounts, 1);
  const minVal = 0;

  const pts = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : padX + (i / (data.length - 1)) * (width - 2 * padX);
    const y = height - padY - ((d.amount - minVal) / (maxVal - minVal)) * (height - 2 * padY);
    return { ...d, x, y };
  });

  const linePath = pts.reduce(
    (acc, p, i) => acc + (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    ''
  );

  const lastPt = pts[pts.length - 1];
  const areaPath =
    pts.length > 1
      ? `${linePath} L ${lastPt.x.toFixed(1)} ${(height - padY).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
      : '';

  return { pts, linePath, areaPath, lastPt, maxVal };
}

export default function Sparkline({
  data,
  color,
  width = 60,
  height = 18,
  title,
  average,
  showTooltip = true,
}: SparklineProps) {
  const theme = useTheme();
  const rawId = useId();
  const gradientId = `sparkline-grad-${rawId.replace(/:/g, '')}`;
  const strokeColor = color || theme?.palette?.primary?.main || '#1976d2';

  if (!data || data.length === 0) {
    return null;
  }

  const { linePath, areaPath, lastPt } = computeSparklinePaths(data, width, height);
  if (!lastPt) return null;

  const svgContent = (
    <Box
      component="span"
      tabIndex={0}
      aria-label={title || 'Historical spend trend'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        cursor: showTooltip ? 'help' : 'default',
        lineHeight: 1,
        p: '2px',
        borderRadius: 0.5,
        '&:focus-visible': {
          outline: `2px solid ${strokeColor}`,
        },
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <circle
          cx={lastPt.x}
          cy={lastPt.y}
          r={2.25}
          fill={strokeColor}
          stroke={theme.palette.background.paper}
          strokeWidth={1}
        />
      </svg>
    </Box>
  );

  if (!showTooltip) {
    return svgContent;
  }

  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={50}
      leaveDelay={200}
      title={
        <Box sx={{ p: 0.5, minWidth: 160, maxWidth: 260 }}>
          {title && (
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
              {title}
            </Typography>
          )}
          <Stack spacing={0.25} sx={{ mb: average !== undefined ? 0.75 : 0 }}>
            {data.map((pt) => (
              <Stack key={pt.month} direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.85 }}>
                  {pt.label}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {usd.format(pt.amount)}
                </Typography>
              </Stack>
            ))}
          </Stack>
          {average !== undefined && (
            <Box
              sx={{
                pt: 0.5,
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                Trailing Avg:
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {usd.format(average)}/mo
              </Typography>
            </Box>
          )}
        </Box>
      }
    >
      {svgContent}
    </Tooltip>
  );
}
