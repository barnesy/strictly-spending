import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  LinearProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import { usd, usdCents } from '../../lib';
import type { Loan, Account } from '../../types';
import { formatMonthsSaved } from './LoanChart';

export interface LoanSummaryScheduleMetrics {
  amountPaidUpToToday: number;
  paymentsCountUpToToday: number;
  totalScheduledPayments: number;
  scheduledMonthlyPayment: number;
  monthsRemaining: number;
  payoffDate?: string;
  interestSaved: number;
  monthsSaved: number;
  totalActualInterest: number;
  totalScheduledInterest: number;
  matchedPaymentsCount: number;
}

export function LoanSummaryCards({
  cardWidth,
  connectedAccount,
  connectedLiveBalance,
  displayedBalance,
  displayedPercentPaid,
  loanPrincipal,
  effectiveConfig,
  activeTab,
  scheduleData,
}: {
  cardWidth: number;
  connectedAccount: Account | null;
  connectedLiveBalance: number | null;
  displayedBalance: number;
  displayedPercentPaid: number;
  loanPrincipal: number;
  effectiveConfig: Loan;
  activeTab: 'house' | 'car' | 'student';
  scheduleData: LoanSummaryScheduleMetrics;
}) {
  const hasEquityCard = Boolean(effectiveConfig.propertyValue);

  return (
    <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 2.5 } }}>
      {/* Card 1: Remaining Balance */}
      <Grid size={{ xs: 6, sm: 6, md: cardWidth }}>
        <Card
          elevation={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            border: '1px solid',
            borderColor: connectedAccount ? 'success.main' : 'divider',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.02) 100%)'
                : 'linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(25, 118, 210, 0.01) 100%)',
          }}
        >
          <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" fontWeight="700" noWrap sx={{ letterSpacing: { xs: 0.4, sm: 1 }, fontSize: { xs: '0.62rem', sm: '0.72rem' }, lineHeight: 1.2 }}>
                  REMAINING BALANCE
                </Typography>
                {connectedAccount && (
                  <Chip
                    size="small"
                    icon={<CloudDoneIcon sx={{ fontSize: '11px !important' }} />}
                    label="Live"
                    color="success"
                    variant="outlined"
                    sx={{ display: { xs: 'none', sm: 'inline-flex' }, height: 17, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                  />
                )}
              </Stack>
              <Tooltip title={`Exact: ${usdCents.format(displayedBalance)}`} arrow placement="top">
                <Typography
                  variant="h5"
                  fontWeight="800"
                  sx={{
                    my: 0.5,
                    fontSize: { xs: '1.2rem', sm: '1.65rem' },
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                  }}
                >
                  {usd.format(Math.round(displayedBalance))}
                </Typography>
              </Tooltip>
              {connectedAccount && connectedLiveBalance !== null && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.75rem', lineHeight: 1.25 }}>
                  {connectedAccount.institution} {connectedAccount.last4 ? `(••${connectedAccount.last4})` : ''}
                </Typography>
              )}
            </Box>
            <Box sx={{ mt: 0.75 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  {displayedPercentPaid.toFixed(1)}% paid
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  Start {usd.format(Math.round(loanPrincipal))}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={displayedPercentPaid}
                color={connectedAccount ? 'success' : 'primary'}
                sx={{ height: 5, borderRadius: 2.5 }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Card 2: Equity (rendered dynamically when Property Value is available) */}
      {hasEquityCard && (
        <Grid size={{ xs: 6, sm: 6, md: cardWidth }}>
          <Card
            elevation={0}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              border: '1px solid',
              borderColor: 'divider',
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(156, 39, 176, 0.02) 100%)'
                  : 'linear-gradient(135deg, rgba(156, 39, 176, 0.05) 0%, rgba(156, 39, 176, 0.01) 100%)',
            }}
          >
            <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="overline" color="text.secondary" fontWeight="700" noWrap sx={{ display: 'block', letterSpacing: { xs: 0.4, sm: 1 }, fontSize: { xs: '0.62rem', sm: '0.72rem' }, lineHeight: 1.2 }}>
                  {activeTab === 'house' ? 'EST. HOME EQUITY' : 'EST. VEHICLE EQUITY'}
                </Typography>
                <Tooltip title={`Exact: ${usdCents.format(Math.max(0, effectiveConfig.propertyValue! - displayedBalance))}`} arrow placement="top">
                  <Typography
                    variant="h5"
                    fontWeight="800"
                    color="secondary.main"
                    sx={{
                      my: 0.5,
                      fontSize: { xs: '1.2rem', sm: '1.65rem' },
                      lineHeight: 1.15,
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                      cursor: 'default',
                    }}
                  >
                    {usd.format(Math.round(Math.max(0, effectiveConfig.propertyValue! - displayedBalance)))}
                  </Typography>
                </Tooltip>
              </Box>
              <Box sx={{ mt: 0.75 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                    {effectiveConfig.propertyValue! > 0
                      ? `${((Math.max(0, effectiveConfig.propertyValue! - displayedBalance) / effectiveConfig.propertyValue!) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                    Val {usd.format(Math.round(effectiveConfig.propertyValue || 0))}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (Math.max(0, effectiveConfig.propertyValue! - displayedBalance) / (effectiveConfig.propertyValue || 1)) * 100)}
                  color="secondary"
                  sx={{ height: 5, borderRadius: 2.5, mb: { xs: 0, sm: effectiveConfig.downPayment && effectiveConfig.downPayment > 0 ? 0.5 : 0 } }}
                />
                {effectiveConfig.downPayment !== undefined && effectiveConfig.downPayment > 0 && (
                  <Stack direction="row" justifyContent="space-between" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      Down Pmt
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                      {usd.format(Math.round(effectiveConfig.downPayment))}
                    </Typography>
                  </Stack>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      )}

      {/* Card 3: Amount Paid / Payments (Progress to Date) */}
      <Grid size={{ xs: 6, sm: 6, md: cardWidth }}>
        <Card
          elevation={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight="700" noWrap sx={{ display: 'block', letterSpacing: { xs: 0.4, sm: 1 }, fontSize: { xs: '0.62rem', sm: '0.72rem' }, lineHeight: 1.2 }}>
                PAYMENTS TO DATE
              </Typography>
              <Tooltip title={`Exact: ${usdCents.format(scheduleData.amountPaidUpToToday)}`} arrow placement="top">
                <Typography
                  variant="h5"
                  fontWeight="800"
                  sx={{
                    my: 0.5,
                    fontSize: { xs: '1.2rem', sm: '1.65rem' },
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                  }}
                >
                  {usd.format(Math.round(scheduleData.amountPaidUpToToday))}
                </Typography>
              </Tooltip>
            </Box>
            <Box sx={{ mt: 0.75 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  {((scheduleData.paymentsCountUpToToday / Math.max(1, scheduleData.totalScheduledPayments)) * 100).toFixed(1)}%
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  {scheduleData.paymentsCountUpToToday}/{scheduleData.totalScheduledPayments} pmts
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (scheduleData.paymentsCountUpToToday / Math.max(1, scheduleData.totalScheduledPayments)) * 100)}
                color="info"
                sx={{ height: 5, borderRadius: 2.5, mb: { xs: 0, sm: effectiveConfig.downPayment && effectiveConfig.downPayment > 0 ? 0.5 : 0 } }}
              />
              {effectiveConfig.downPayment !== undefined && effectiveConfig.downPayment > 0 && (
                <Stack direction="row" justifyContent="space-between" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    Down Pmt
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                    {usd.format(Math.round(effectiveConfig.downPayment))}
                  </Typography>
                </Stack>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Card 4: Monthly Payment Details */}
      <Grid size={{ xs: 6, sm: 6, md: cardWidth }}>
        <Card
          elevation={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" fontWeight="700" noWrap sx={{ letterSpacing: { xs: 0.4, sm: 1 }, fontSize: { xs: '0.62rem', sm: '0.72rem' }, lineHeight: 1.2 }}>
                  MONTHLY PAYMENT
                </Typography>
                {(effectiveConfig.extraMonthlyPayment || 0) > 0 && (
                  <Chip
                    size="small"
                    label={`+${usd.format(Math.round(effectiveConfig.extraMonthlyPayment!))}/mo`}
                    color="success"
                    sx={{ display: { xs: 'none', sm: 'inline-flex' }, height: 17, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                  />
                )}
              </Stack>
              <Tooltip
                title={
                  (effectiveConfig.extraMonthlyPayment || 0) > 0
                    ? `Base: ${usdCents.format(scheduleData.scheduledMonthlyPayment)} + Extra: ${usdCents.format(effectiveConfig.extraMonthlyPayment!)} = ${usdCents.format(scheduleData.scheduledMonthlyPayment + effectiveConfig.extraMonthlyPayment!)}/mo`
                    : `Exact: ${usdCents.format(scheduleData.scheduledMonthlyPayment)}`
                }
                arrow
                placement="top"
              >
                <Typography
                  variant="h5"
                  fontWeight="800"
                  sx={{
                    my: 0.5,
                    fontSize: { xs: '1.2rem', sm: '1.65rem' },
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                  }}
                >
                  {usd.format(Math.round(scheduleData.scheduledMonthlyPayment + (effectiveConfig.extraMonthlyPayment || 0)))}
                </Typography>
              </Tooltip>
            </Box>
            <Box sx={{ mt: 0.75 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CalendarMonthIcon sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' }, lineHeight: 1.25 }}>
                  <strong>{scheduleData.monthsRemaining}</strong> left
                  {scheduleData.payoffDate ? ` · ${scheduleData.payoffDate}` : ''}
                </Typography>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Card 5: Interest Saved & Matching */}
      <Grid size={{ xs: hasEquityCard ? 12 : 6, sm: 6, md: cardWidth }}>
        <Card
          elevation={0}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            border: '1px solid',
            borderColor: scheduleData.interestSaved > 0.5 ? 'success.main' : 'divider',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.02) 100%)'
                : 'linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(76, 175, 80, 0.01) 100%)',
          }}
        >
          <CardContent sx={{ p: { xs: 1.25, sm: 2 }, '&:last-child': { pb: { xs: 1.25, sm: 2 } }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" fontWeight="700" noWrap sx={{ letterSpacing: { xs: 0.4, sm: 1 }, fontSize: { xs: '0.62rem', sm: '0.72rem' }, lineHeight: 1.2 }}>
                  INTEREST SAVED
                </Typography>
                {scheduleData.monthsSaved > 0 && (
                  <Chip
                    size="small"
                    label={`${formatMonthsSaved(scheduleData.monthsSaved)}`}
                    color="success"
                    variant="outlined"
                    sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                  />
                )}
              </Stack>
              <Tooltip
                title={`Total Interest: ${usdCents.format(scheduleData.totalActualInterest)} vs. Original Schedule: ${usdCents.format(scheduleData.totalScheduledInterest)}`}
                arrow
                placement="top"
              >
                <Typography
                  variant="h5"
                  fontWeight="800"
                  color="success.main"
                  sx={{
                    my: 0.5,
                    fontSize: { xs: '1.2rem', sm: '1.65rem' },
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                  }}
                >
                  {usd.format(Math.round(scheduleData.interestSaved))}
                </Typography>
              </Tooltip>
            </Box>
            <Box sx={{ mt: 0.5 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CheckCircleOutlineIcon sx={{ fontSize: 13, color: 'success.main', flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' }, lineHeight: 1.25 }}>
                  <strong>{scheduleData.matchedPaymentsCount}</strong> matched · Int: {usd.format(Math.round(scheduleData.totalActualInterest))}
                </Typography>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
