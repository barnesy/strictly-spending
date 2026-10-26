import { useState, useEffect, useRef } from 'react';
import { Box, Paper, Typography, Stack, Divider, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { usd, usdCents } from '../../lib';
import type { Loan } from '../../types';

export const DEFAULT_HOUSE_CONFIG: Omit<Loan, 'id' | 'createdAt'> = {
  name: 'Primary Residence',
  type: 'house',
  principal: 450000,
  rate: 6.5,
  termYears: 30,
  startDate: '2024-01-15',
  category: 'Mortgage',
  monthlyPayment: undefined,
  propertyValue: 500000,
  downPayment: 50000,
  extraMonthlyPayment: undefined,
  extraOneTimePayment: undefined,
  extraOneTimeMonth: undefined,
};

export const DEFAULT_STUDENT_CONFIG: Omit<Loan, 'id' | 'createdAt'> = {
  name: 'Student Loan',
  type: 'student',
  principal: 30000,
  rate: 5.5,
  termYears: 10,
  startDate: '2024-01-01',
  category: 'Student Loans',
  monthlyPayment: undefined,
  propertyValue: undefined,
  downPayment: undefined,
  extraMonthlyPayment: undefined,
  extraOneTimePayment: undefined,
  extraOneTimeMonth: undefined,
};

export const DEFAULT_CAR_CONFIG: Omit<Loan, 'id' | 'createdAt'> = {
  name: 'Car Loan',
  type: 'car',
  principal: 35000,
  rate: 5.5,
  termYears: 5,
  startDate: '2024-06-15',
  category: 'Auto Loan',
  monthlyPayment: 389,
  propertyValue: 40000,
  downPayment: 5000,
  extraMonthlyPayment: undefined,
  extraOneTimePayment: undefined,
  extraOneTimeMonth: undefined,
};

export interface PaymentRow {
  paymentNumber: number;
  date: string;
  yearMonth?: string;
  scheduledPayment: number;
  scheduledInterest: number;
  scheduledPrincipal: number;
  scheduledBalance: number;
  actualPayment: number;
  actualInterest: number;
  actualPrincipal: number;
  actualBalance: number;
  startingBalance?: number;
  extraPayment: number;
  hasOneTimeExtra?: boolean;
  isToday?: boolean;
  isMatched: boolean;
  isAssumed: boolean;
  isFuture: boolean;
  isPast: boolean;
  transactions: any[];
  cumulativeScheduledInterest: number;
  cumulativeActualInterest: number;
  cumulativeActualPrincipal: number;
  cumulativeActualPayment: number;
}

export function formatMonthsSaved(months: number): string {
  if (months <= 0) return 'On standard schedule';
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  if (yrs > 0 && mos > 0) return `${yrs} yr${yrs > 1 ? 's' : ''} ${mos} mo${mos > 1 ? 's' : ''} early`;
  if (yrs > 0) return `${yrs} yr${yrs > 1 ? 's' : ''} early`;
  return `${mos} mo${mos > 1 ? 's' : ''} early`;
}

export function LoanChart({
  rows,
  originalPrincipal,
  interestSaved = 0,
  monthsSaved = 0,
  payoffDate,
}: {
  rows: PaymentRow[];
  originalPrincipal: number;
  interestSaved?: number;
  monthsSaved?: number;
  payoffDate?: string;
}) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [chartMode, setChartMode] = useState<'balance' | 'cost'>('balance');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(100, Math.floor(rect.width || el.clientWidth)),
        height: Math.max(100, Math.floor(rect.height || el.clientHeight)),
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointsCount = rows.length;
  if (pointsCount === 0) return null;

  const width = size.width || 600;
  const height = size.height || 260;
  const padding = { top: 24, right: 20, bottom: 32, left: 76 };

  const usableWidth = Math.max(50, width - padding.left - padding.right);
  const usableHeight = Math.max(50, height - padding.top - padding.bottom);

  const lastRow = rows[rows.length - 1];
  const maxCumulativeInterest = Math.max(
    lastRow?.cumulativeScheduledInterest || 0,
    lastRow?.cumulativeActualInterest || 0
  );
  const maxCumulativePayment = Math.max(
    (originalPrincipal || 0) + maxCumulativeInterest,
    lastRow?.cumulativeActualPayment || 0
  );

  // In 'balance' mode, scale Y-axis to max(originalPrincipal, maxCumulativeInterest) so balance curves aren't squished by total payments
  const maxVal =
    chartMode === 'balance'
      ? Math.max(originalPrincipal || 1, maxCumulativeInterest * 1.05, 1)
      : Math.max(originalPrincipal || 1, maxCumulativePayment, 1);

  const divisor = pointsCount > 1 ? pointsCount - 1 : 1;
  const getX = (i: number) => padding.left + (i / divisor) * usableWidth;
  const getY = (val: number) => {
    const safe = !isNaN(val) ? Math.max(0, Math.min(maxVal, val)) : 0;
    return padding.top + usableHeight - (safe / maxVal) * usableHeight;
  };

  // Detect whether there is a meaningful difference between scheduled and actual trajectories
  const hasAcceleration = rows.some(
    (r) => Math.abs((r.scheduledBalance || 0) - (r.actualBalance || 0)) > 5
  );

  // Coordinate arrays
  const schedBalCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.scheduledBalance) }));
  const actualBalCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.actualBalance) }));
  const prinCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.cumulativeActualPrincipal) }));
  const schedIntCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.cumulativeScheduledInterest) }));
  const actualIntCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.cumulativeActualInterest) }));
  const totalPmtCoords = rows.map((r, i) => ({ x: getX(i), y: getY(r.cumulativeActualPayment) }));

  const toPath = (coords: { x: number; y: number }[]) =>
    `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`;

  const schedBalPath = toPath(schedBalCoords);
  const actualBalPath = toPath(actualBalCoords);
  const prPath = toPath(prinCoords);
  const schedIntPath = toPath(schedIntCoords);
  const intPath = toPath(actualIntCoords);
  const pmPath = toPath(totalPmtCoords);

  // Area polygon between Scheduled Balance and Actual Balance (shows debt shaved off)
  const balanceSavingsAreaPath = hasAcceleration
    ? `${schedBalPath} L ${actualBalCoords
        .slice()
        .reverse()
        .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(' L ')} Z`
    : '';

  // Area polygon between Scheduled Cumulative Interest and Actual Cumulative Interest (shows interest saved)
  const interestSavingsAreaPath = hasAcceleration
    ? `${schedIntPath} L ${actualIntCoords
        .slice()
        .reverse()
        .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(' L ')} Z`
    : '';

  // Find Today index, One-Time Extra indices, and Early Payoff index
  const todayIndex = rows.findIndex((r) => r.isToday);
  const oneTimeIndices = rows
    .map((r, idx) => (r.hasOneTimeExtra && r.actualPayment > 0 ? idx : -1))
    .filter((idx) => idx >= 0);

  const actualPayoffIndex = rows.findIndex((r, idx) => idx > 0 && r.actualBalance <= 0.01);
  const scheduledPayoffIndex = rows.findIndex((r, idx) => idx > 0 && r.scheduledBalance <= 0.01);
  const showEarlyPayoffPin =
    actualPayoffIndex > 0 &&
    (scheduledPayoffIndex === -1 || actualPayoffIndex < scheduledPayoffIndex);

  // Grid lines
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const y = padding.top + ratio * usableHeight;
    const val = maxVal * (1 - ratio);
    gridLines.push({ y, val });
  }

  // Monthly ticks (approx 5 ticks)
  const ticks = [];
  const step = Math.max(1, Math.floor(pointsCount / 5));
  for (let i = 0; i < pointsCount; i += step) {
    const x = getX(i);
    ticks.push({ x, label: rows[i].date });
  }
  if ((pointsCount - 1) % step !== 0) {
    ticks.push({ x: padding.left + usableWidth, label: rows[pointsCount - 1].date });
  }

  // Mouse / Touch handlers for interactivity
  const updateHoverFromClientX = (clientX: number, rect: DOMRect) => {
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    const relativeX = svgX - padding.left;

    const index = Math.min(
      rows.length - 1,
      Math.max(0, Math.round((relativeX / usableWidth) * (rows.length - 1)))
    );

    const percentX = ((padding.left + (index / divisor) * usableWidth) / width) * 100;
    setHoverIndex(index);
    setHoverPos({ x: percentX, y: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    updateHoverFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches[0]) return;
    updateHoverFromClientX(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
  };

  const hoveredRow = hoverIndex !== null ? rows[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? getX(hoverIndex) : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Chart Controls & Legend Bar */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1, flexShrink: 0 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {chartMode === 'balance' ? (
            <>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'primary.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {hasAcceleration ? 'Accelerated Balance' : 'Remaining Balance'}
                </Typography>
              </Stack>
              {hasAcceleration && (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{
                      width: 16,
                      height: 0,
                      borderBottom: '3px dashed',
                      borderColor: 'text.secondary',
                      opacity: 0.7,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Original Schedule
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'success.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Principal Paid
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'warning.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Interest Paid
                </Typography>
              </Stack>
            </>
          ) : (
            <>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'warning.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Projected Interest
                </Typography>
              </Stack>
              {hasAcceleration && (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{
                      width: 16,
                      height: 0,
                      borderBottom: '3px dashed',
                      borderColor: 'warning.main',
                      opacity: 0.7,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Scheduled Interest
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'secondary.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Total Cumulative Paid
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 16, height: 4.5, bgcolor: 'primary.main', borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Remaining Balance
                </Typography>
              </Stack>
            </>
          )}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {(interestSaved > 1 || monthsSaved > 0) && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`⚡ ${usd.format(Math.round(interestSaved))} saved · ${formatMonthsSaved(monthsSaved)}`}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 700, fontSize: '0.72rem', height: 24 }}
            />
          )}
          <ToggleButtonGroup
            size="small"
            value={chartMode}
            exclusive
            onChange={(_, val) => val && setChartMode(val)}
            sx={{ height: 28, flexShrink: 0 }}
          >
            <ToggleButton
              value="balance"
              sx={{ textTransform: 'none', px: 1.25, py: 0, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Balance &amp; Payoff
            </ToggleButton>
            <ToggleButton
              value="cost"
              sx={{ textTransform: 'none', px: 1.25, py: 0, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Interest &amp; Total Cost
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>

      {/* SVG Canvas */}
      <Box
        ref={containerRef}
        sx={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', height: '100%' }}
        onMouseLeave={() => {
          setHoverIndex(null);
          setHoverPos(null);
        }}
        onTouchEnd={() => {
          setHoverIndex(null);
          setHoverPos(null);
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="100%"
          style={{ overflow: 'visible', width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
        >
          {/* Background horizontal grid */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={line.y}
                x2={width - padding.right}
                y2={line.y}
                stroke={theme.palette.divider}
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={line.y + 4}
                textAnchor="end"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fill: theme.palette.text.secondary,
                  fontFamily: 'monospace',
                }}
              >
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(line.val)}
              </text>
            </g>
          ))}

          {/* X axis ticks */}
          {ticks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={tick.x}
                y1={height - padding.bottom}
                x2={tick.x}
                y2={height - padding.bottom + 4}
                stroke={theme.palette.divider}
              />
              <text
                x={tick.x}
                y={height - padding.bottom + 18}
                textAnchor="middle"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fill: theme.palette.text.secondary,
                }}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* TODAY Vertical Marker */}
          {todayIndex > 0 && todayIndex < rows.length - 1 && (
            <g>
              <line
                x1={getX(todayIndex)}
                y1={padding.top}
                x2={getX(todayIndex)}
                y2={height - padding.bottom}
                stroke={theme.palette.info.main}
                strokeDasharray="3 3"
                strokeWidth="1.5"
                opacity={0.75}
              />
              <text
                x={getX(todayIndex)}
                y={padding.top - 7}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fill: theme.palette.info.main,
                  letterSpacing: 0.5,
                }}
              >
                TODAY
              </text>
            </g>
          )}

          {/* Early Payoff Milestone Marker */}
          {showEarlyPayoffPin && (
            <g>
              <line
                x1={getX(actualPayoffIndex)}
                y1={padding.top}
                x2={getX(actualPayoffIndex)}
                y2={height - padding.bottom}
                stroke={theme.palette.success.main}
                strokeDasharray="4 3"
                strokeWidth="2"
              />
              <circle
                cx={getX(actualPayoffIndex)}
                cy={getY(0)}
                r={6}
                fill={theme.palette.success.main}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
              />
              <text
                x={Math.min(width - padding.right - 60, Math.max(padding.left + 60, getX(actualPayoffIndex)))}
                y={padding.top + 12}
                textAnchor="middle"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fill: theme.palette.success.main,
                }}
              >
                {`Paid Off ${payoffDate || rows[actualPayoffIndex].date}`}
              </text>
            </g>
          )}

          {chartMode === 'balance' ? (
            <>
              {/* Shaded Savings Wedge between Scheduled Balance & Accelerated Balance */}
              {hasAcceleration && balanceSavingsAreaPath && (
                <path
                  d={balanceSavingsAreaPath}
                  fill={theme.palette.primary.main}
                  fillOpacity={theme.palette.mode === 'dark' ? 0.16 : 0.11}
                />
              )}

              {/* Scheduled Balance Baseline (Dashed) */}
              {hasAcceleration && (
                <path
                  d={schedBalPath}
                  fill="none"
                  stroke={theme.palette.text.secondary}
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.65}
                />
              )}

              {/* Principal Paid Line */}
              <path
                d={prPath}
                fill="none"
                stroke={theme.palette.success.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interest Paid Line */}
              <path
                d={intPath}
                fill="none"
                stroke={theme.palette.warning.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Remaining Balance Line (Primary Focus) */}
              <path
                d={actualBalPath}
                fill="none"
                stroke={theme.palette.primary.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              {/* Shaded Interest Saved Wedge */}
              {hasAcceleration && interestSavingsAreaPath && (
                <path
                  d={interestSavingsAreaPath}
                  fill={theme.palette.success.main}
                  fillOpacity={theme.palette.mode === 'dark' ? 0.18 : 0.12}
                />
              )}

              {/* Scheduled Cumulative Interest (Dashed) */}
              {hasAcceleration && (
                <path
                  d={schedIntPath}
                  fill="none"
                  stroke={theme.palette.warning.main}
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.65}
                />
              )}

              {/* Total Cumulative Payments */}
              <path
                d={pmPath}
                fill="none"
                stroke={theme.palette.secondary.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Remaining Balance */}
              <path
                d={actualBalPath}
                fill="none"
                stroke={theme.palette.primary.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Projected Cumulative Interest */}
              <path
                d={intPath}
                fill="none"
                stroke={theme.palette.warning.main}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* One-Time Lump Sum Payment Callout Dots */}
          {oneTimeIndices.map((idx) => (
            <g key={`onetime-${idx}`}>
              <circle
                cx={getX(idx)}
                cy={getY(rows[idx].actualBalance)}
                r={6.5}
                fill={theme.palette.success.main}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
              />
            </g>
          ))}

          {/* Interactive Guideline and Dots */}
          {hoverIndex !== null && hoveredRow && (
            <g>
              <line
                x1={hoverX}
                y1={padding.top}
                x2={hoverX}
                y2={height - padding.bottom}
                stroke={theme.palette.text.secondary}
                strokeDasharray="3 3"
                strokeWidth="1.5"
              />

              {/* Balance Dot */}
              <circle
                cx={hoverX}
                cy={getY(hoveredRow.actualBalance)}
                r={5.5}
                fill={theme.palette.primary.main}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
              />

              {/* Scheduled Balance Dot (if accelerated) */}
              {hasAcceleration && chartMode === 'balance' && (
                <circle
                  cx={hoverX}
                  cy={getY(hoveredRow.scheduledBalance)}
                  r={4.5}
                  fill={theme.palette.text.secondary}
                  stroke={theme.palette.background.paper}
                  strokeWidth={1.5}
                />
              )}

              {chartMode === 'balance' ? (
                <circle
                  cx={hoverX}
                  cy={getY(hoveredRow.cumulativeActualPrincipal)}
                  r={5.5}
                  fill={theme.palette.success.main}
                  stroke={theme.palette.background.paper}
                  strokeWidth={2}
                />
              ) : (
                <circle
                  cx={hoverX}
                  cy={getY(hoveredRow.cumulativeActualPayment)}
                  r={5.5}
                  fill={theme.palette.secondary.main}
                  stroke={theme.palette.background.paper}
                  strokeWidth={2}
                />
              )}

              {/* Interest Dot */}
              <circle
                cx={hoverX}
                cy={getY(hoveredRow.cumulativeActualInterest)}
                r={5.5}
                fill={theme.palette.warning.main}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* HTML Interactive Tooltip Overlay */}
        {hoverIndex !== null && hoverPos && hoveredRow && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              left: hoverPos.x > 52 ? `calc(${hoverPos.x}% - 290px)` : `calc(${hoverPos.x}% + 16px)`,
              top: '6px',
              p: 1.5,
              width: 275,
              zIndex: 10,
              pointerEvents: 'none',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              boxShadow: (theme) => theme.shadows[4],
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {hoveredRow.date} (#{hoveredRow.paymentNumber})
              </Typography>
              <Chip
                size="small"
                label={
                  hoveredRow.actualBalance <= 0.01 && hoveredRow.actualPayment === 0
                    ? 'Paid Off 🎉'
                    : hoveredRow.isMatched
                    ? 'Matched'
                    : hoveredRow.isToday
                    ? 'Today'
                    : hoveredRow.isFuture
                    ? 'Projected'
                    : 'Assumed'
                }
                color={
                  hoveredRow.actualBalance <= 0.01 && hoveredRow.actualPayment === 0
                    ? 'success'
                    : hoveredRow.isMatched
                    ? 'success'
                    : hoveredRow.isToday
                    ? 'info'
                    : 'default'
                }
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
              />
            </Stack>

            <Stack spacing={0.5}>
              {hoveredRow.isToday && !hoveredRow.isMatched && hoveredRow.startingBalance !== undefined && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    Current Balance:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    {usdCents.format(hoveredRow.startingBalance)}
                  </Typography>
                </Stack>
              )}

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {hoveredRow.isToday && !hoveredRow.isMatched ? 'Balance After Pmt:' : 'Remaining Balance:'}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>
                  {usdCents.format(hoveredRow.actualBalance)}
                </Typography>
              </Stack>

              {hasAcceleration && Math.abs(hoveredRow.scheduledBalance - hoveredRow.actualBalance) > 1 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    ↳ Original Schedule:
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {usdCents.format(hoveredRow.scheduledBalance)} ({usd.format(Math.round(hoveredRow.scheduledBalance - hoveredRow.actualBalance))} ahead)
                  </Typography>
                </Stack>
              )}

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Principal Paid:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                  {usdCents.format(hoveredRow.cumulativeActualPrincipal)}
                </Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Cumulative Interest:</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', fontVariantNumeric: 'tabular-nums' }}>
                  {usdCents.format(hoveredRow.cumulativeActualInterest)}
                </Typography>
              </Stack>

              {hoveredRow.cumulativeScheduledInterest - hoveredRow.cumulativeActualInterest > 1 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>↳ Interest Saved So Far:</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                    +{usdCents.format(hoveredRow.cumulativeScheduledInterest - hoveredRow.cumulativeActualInterest)}
                  </Typography>
                </Stack>
              )}

              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary', fontSize: '0.68rem' }}>
                {hoveredRow.actualPayment > 0 ? 'THIS MONTH PAYMENT' : 'LOAN PAID IN FULL'}
              </Typography>

              {hoveredRow.actualPayment > 0 ? (
                <>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Total Payment:</Typography>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {usdCents.format(hoveredRow.actualPayment)}
                    </Typography>
                  </Stack>
                  {hoveredRow.extraPayment > 0.01 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                        ↳ Extra Principal {hoveredRow.hasOneTimeExtra ? '(incl. lump sum)' : ''}:
                      </Typography>
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'success.main', fontWeight: 700 }}>
                        +{usdCents.format(hoveredRow.extraPayment)}
                      </Typography>
                    </Stack>
                  )}
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">↳ Principal portion:</Typography>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'success.main', fontWeight: 600 }}>
                      {usdCents.format(hoveredRow.actualPrincipal)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">↳ Interest portion:</Typography>
                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'warning.main', fontWeight: 600 }}>
                      {usdCents.format(hoveredRow.actualInterest)}
                    </Typography>
                  </Stack>

                  <Box sx={{ mt: 0.75, width: '100%' }}>
                    <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'divider' }}>
                      <Box
                        sx={{
                          width: `${(hoveredRow.actualPrincipal / hoveredRow.actualPayment) * 100}%`,
                          bgcolor: 'success.main',
                        }}
                      />
                      <Box
                        sx={{
                          width: `${(hoveredRow.actualInterest / hoveredRow.actualPayment) * 100}%`,
                          bgcolor: 'warning.main',
                        }}
                      />
                    </Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
                        {((hoveredRow.actualPrincipal / hoveredRow.actualPayment) * 100).toFixed(0)}% Principal
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
                        {((hoveredRow.actualInterest / hoveredRow.actualPayment) * 100).toFixed(0)}% Interest
                      </Typography>
                    </Stack>
                  </Box>
                </>
              ) : (
                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: 1,
                    bgcolor: (t) => alpha(t.palette.success.main, 0.1),
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, display: 'block' }}>
                    $0.00 due — freed up {usdCents.format(hoveredRow.scheduledPayment)}/mo in cashflow!
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
