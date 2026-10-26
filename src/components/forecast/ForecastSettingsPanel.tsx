import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Button,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Stack,
  Switch,
  FormControlLabel,
  Tooltip,
  Chip,
  InputAdornment,
  Card,
  CardContent,
  Alert,
  Collapse,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AddIcon from '@mui/icons-material/Add';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { usd, monthLabel } from '../../lib';
import { useForecastStore, computeTotalStreamInvested, type IncomeStream } from '../../stores/forecastStore';
import { getStreamPaycheckSchedule } from '../../domain/forecastSpending';

function getUpcomingBonusPaycheckMonths(stream: IncomeStream): string[] {
  if (stream.frequency !== 'biweekly' && stream.frequency !== 'weekly') return [];
  if (!stream.recentPayments || stream.recentPayments.length === 0) return [];

  const bonusMonths: string[] = [];
  const now = new Date();
  const minCount = stream.frequency === 'weekly' ? 5 : 3;

  for (let offset = 0; offset < 12; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sched = getStreamPaycheckSchedule(stream, mk);
    if (sched.expectedCount >= minCount) {
      bonusMonths.push(monthLabel(mk));
    }
  }
  return bonusMonths;
}

export interface ForecastSettingsPanelProps {
  effectiveNetIncome: number;
  taxesDeducted: number;
  lastPointHomeEquity: number;
  monthLabels: string[];
  onToggleSettings: () => void;
  onOpenAddIncomeStreamDialog: () => void;
  onSaveScenarioArtifact: () => void;
}

export function ForecastSettingsPanel({
  effectiveNetIncome,
  taxesDeducted,
  lastPointHomeEquity,
  monthLabels,
  onToggleSettings,
  onOpenAddIncomeStreamDialog,
  onSaveScenarioArtifact,
}: ForecastSettingsPanelProps) {
  const {
    startingBalance,
    setStartingBalance,
    isStartingBalanceOverridden,
    realBaseline,
    resetFieldToReal,
    incomeStreams,
    isIncomeOverridden,
    updateIncomeStream,
    removeIncomeStream,
    taxRate,
    setTaxRate,
    recurringBudget,
    setRecurringBudget,
    isRecurringOverridden,
    variableBudget,
    setVariableBudget,
    isVariableOverridden,
    extraLoanPayment,
    setExtraLoanPayment,
    divertExtraToSavings,
    setDivertExtraToSavings,
    loanStrategy,
    setLoanStrategy,
    includeHomeEquity,
    setIncludeHomeEquity,
    homePropertyValue,
    setHomePropertyValue,
    isHomeValueOverridden,
    homeAppreciationRate,
    setHomeAppreciationRate,
    realMortgageBalance,
    months,
    setMonths,
    windfalls,
    addWindfall,
    removeWindfall,
    incomeGaps,
    toggleIncomeGap,
    clearIncomeGaps,
    useExactPaycheckCalendar,
    setUseExactPaycheckCalendar,
  } = useForecastStore();

  const [windfallName, setWindfallName] = useState('');
  const [windfallAmount, setWindfallAmount] = useState('');
  const [windfallMonthIndex, setWindfallMonthIndex] = useState<number>(1);
  const [gapMonthToSelect, setGapMonthToSelect] = useState<number>(1);
  const [streamsSectionCollapsed, setStreamsSectionCollapsed] = useState<boolean>(false);
  const [expandedStreamIds, setExpandedStreamIds] = useState<Set<string>>(() => new Set());

  const totalStreamInvested = useMemo(
    () => computeTotalStreamInvested(incomeStreams),
    [incomeStreams]
  );

  const toggleStreamExpanded = (id: string) => {
    setExpandedStreamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAllStreams = () => {
    if (expandedStreamIds.size > 0) {
      setExpandedStreamIds(new Set());
    } else {
      setExpandedStreamIds(new Set(incomeStreams.map((s) => s.id)));
    }
  };

  const bonusMonthsByStreamId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of incomeStreams) {
      map.set(s.id, getUpcomingBonusPaycheckMonths(s));
    }
    return map;
  }, [incomeStreams]);

  const hasBiweeklyOrWeeklyStreams = useMemo(
    () => incomeStreams.some((s) => s.enabled && (s.frequency === 'biweekly' || s.frequency === 'weekly')),
    [incomeStreams]
  );

  const handleAddWindfall = () => {
    const amt = Number(windfallAmount);
    if (!amt || amt <= 0) return;
    addWindfall({
      name: windfallName.trim() || 'Bonus / Windfall',
      amount: Math.round(amt),
      monthIndex: Math.min(months, Math.max(1, windfallMonthIndex)),
    });
    setWindfallName('');
    setWindfallAmount('');
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Paper
        sx={{
          minWidth: { xs: 0, sm: 340 },
          minHeight: '100%',
          p: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          boxShadow: 'none',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SettingsIcon color="primary" fontSize="small" />
            <Typography variant="h6" fontWeight="700">
              Baseline &amp; Overrides
            </Typography>
          </Stack>
          <Tooltip title="Collapse Settings">
            <IconButton size="small" onClick={onToggleSettings} aria-label="Collapse Settings">
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Typography variant="body2" color="text.secondary" mb={3}>
          Grounded in your actual account balances and spending history. Adjust sliders to simulate alternative futures.
        </Typography>

        {/* 1. Operating Cash Starting Balance */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight="600">
              Operating Cash Buffer
            </Typography>
            {isStartingBalanceOverridden && (
              <Tooltip title="Reset to actual checking accounts total">
                <IconButton size="small" onClick={() => resetFieldToReal('startingBalance')}>
                  <RestartAltIcon fontSize="inherit" color="action" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" color="success.main" fontWeight="700">
              {usd.format(startingBalance)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Actual: {usd.format(realBaseline.startingCash)}
            </Typography>
          </Stack>
          <Slider
            value={startingBalance}
            min={0}
            max={Math.max(50000, realBaseline.startingCash * 2)}
            step={500}
            onChange={(_, val) => setStartingBalance(val as number)}
          />
          <Typography variant="caption" color="text.secondary">
            Liquid cash in checking accounts. Savings and investment destination balances are configured separately.
          </Typography>
        </Box>

        {/* 2. Income Streams & Multi-Account Support */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              onClick={() => setStreamsSectionCollapsed((c) => !c)}
              sx={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <MonetizationOnIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight="700">
                Income Streams ({incomeStreams.filter((s) => s.enabled).length})
              </Typography>
              <Tooltip title={streamsSectionCollapsed ? 'Expand Income Streams list' : 'Collapse Income Streams list'}>
                <IconButton size="small" sx={{ p: 0.25 }}>
                  {streamsSectionCollapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {!streamsSectionCollapsed && incomeStreams.length > 0 && (
                <Button
                  size="small"
                  variant="text"
                  onClick={handleToggleAllStreams}
                  sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, px: 0.75, minWidth: 0, color: 'text.secondary' }}
                >
                  {expandedStreamIds.size > 0 ? 'Collapse All' : 'Edit Details'}
                </Button>
              )}
              {isIncomeOverridden && (
                <Tooltip title="Reset to detected paychecks from bank accounts">
                  <IconButton size="small" onClick={() => resetFieldToReal('income')}>
                    <RestartAltIcon fontSize="inherit" color="action" />
                  </IconButton>
                </Tooltip>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon fontSize="small" />}
                onClick={onOpenAddIncomeStreamDialog}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  py: 0.25,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              >
                Add
              </Button>
            </Stack>
          </Stack>

          {/* Total Net Monthly Cashflow Banner */}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              mb: streamsSectionCollapsed ? 0 : 1.5,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
              borderColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight="600">
                  Total Net Monthly Income
                </Typography>
                <Typography variant="h5" fontWeight="700" color="success.main">
                  {usd.format(effectiveNetIncome)}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Chip
                  label="Post-Tax Take-Home"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                />
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                  {usd.format(effectiveNetIncome * 12)}/yr
                </Typography>
              </Box>
            </Stack>

            {totalStreamInvested > 0 && (
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mt: 1, pt: 0.75, borderTop: '1px dashed', borderColor: 'rgba(16, 185, 129, 0.3)' }}
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TrendingUpIcon sx={{ fontSize: '0.95rem', color: 'secondary.main' }} />
                  <Typography variant="caption" fontWeight={700} color="secondary.main">
                    Allocated to Invest: {usd.format(totalStreamInvested)}/mo
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((totalStreamInvested / Math.max(1, effectiveNetIncome)) * 100)}% of income
                </Typography>
              </Stack>
            )}

            {hasBiweeklyOrWeeklyStreams && (
              <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      color="success"
                      checked={useExactPaycheckCalendar}
                      onChange={(e) => setUseExactPaycheckCalendar(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption" fontWeight={600} color="text.primary">
                      {useExactPaycheckCalendar
                        ? 'Exact Paycheck Calendar (2×/mo + 3-Paycheck Bonus Spikes)'
                        : 'Smoothed Monthly Average (26/12 paychecks every month)'}
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              </Box>
            )}
          </Paper>

          {/* Individual Income Stream Cards (Collapsible Section) */}
          <Collapse in={!streamsSectionCollapsed} timeout="auto">
            <Stack spacing={1}>
              {incomeStreams.map((stream) => {
                const isCustom = stream.accountId === undefined;
                const bonusMonths = bonusMonthsByStreamId.get(stream.id) || [];
                const isExpanded = expandedStreamIds.has(stream.id);

                const freqLabel =
                  stream.frequency === 'biweekly'
                    ? 'Bi-weekly'
                    : stream.frequency === 'semimonthly'
                    ? '2×/mo'
                    : stream.frequency === 'weekly'
                    ? 'Weekly'
                    : 'Monthly';

                return (
                  <Card
                    key={stream.id}
                    variant="outlined"
                    sx={{
                      borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                      borderColor: stream.enabled ? 'divider' : 'action.disabledBackground',
                      opacity: stream.enabled ? 1 : 0.6,
                      transition: 'border-color 0.2s, opacity 0.2s',
                    }}
                  >
                    <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                      {/* Compact Header Row: Clickable to expand/collapse details */}
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box
                          sx={{ minWidth: 0, pr: 1, flex: 1, cursor: 'pointer' }}
                          onClick={() => toggleStreamExpanded(stream.id)}
                        >
                          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" gap={0.5}>
                            <Typography variant="subtitle2" fontWeight="700" noWrap title={stream.name}>
                              {stream.name}
                            </Typography>
                            {stream.isFormerEmployer && (
                              <Chip
                                label="Former Employer"
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600 }}
                              />
                            )}
                            {!stream.enabled && (
                              <Chip
                                label="Excluded"
                                size="small"
                                color="default"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600 }}
                              />
                            )}
                            {stream.isOverridden && (
                              <Chip
                                label="Overridden"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600 }}
                              />
                            )}
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
                            <Typography
                              variant="body2"
                              fontWeight="800"
                              color={stream.enabled ? 'success.main' : 'text.secondary'}
                              sx={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {usd.format(stream.monthlyAmount)}/mo
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              • {freqLabel}
                              {stream.accountName ? ` • ${stream.accountName}` : ''}
                            </Typography>
                          </Stack>
                        </Box>

                        <Stack direction="row" spacing={0.25} alignItems="center">
                          <Tooltip
                            title={
                              stream.enabled
                                ? 'Exclude this stream from forecasting'
                                : 'Include this stream in forecasting'
                            }
                          >
                            <Switch
                              size="small"
                              checked={stream.enabled}
                              onChange={(e) => updateIncomeStream(stream.id, { enabled: e.target.checked })}
                            />
                          </Tooltip>
                          <Tooltip title={isExpanded ? 'Hide paycheck & baseline details' : 'Edit paycheck, frequency & baseline'}>
                            <IconButton size="small" onClick={() => toggleStreamExpanded(stream.id)}>
                              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>

                      {/* Collapsible Detailed Stream Settings */}
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ mt: 1.5, pt: 1.25, borderTop: '1px dashed', borderColor: 'divider' }}>
                          {/* Former Employer / Excluded Notification Banner */}
                          {stream.isFormerEmployer && !stream.enabled && (
                            <Alert
                              severity="warning"
                              variant="outlined"
                              sx={{
                                py: 0.25,
                                px: 1,
                                mb: 1.25,
                                fontSize: '0.72rem',
                                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                '& .MuiAlert-icon': { fontSize: '1rem', mr: 0.75 },
                              }}
                            >
                              Excluded from forecast: No paychecks detected in the last 60 days (last payment was{' '}
                              {stream.lastPaymentDate || 'over 2 months ago'}). Toggle the switch above if you still
                              receive income from this stream.
                            </Alert>
                          )}
                          {!stream.isFormerEmployer && !stream.enabled && (
                            <Alert
                              severity="info"
                              variant="outlined"
                              sx={{
                                py: 0.25,
                                px: 1,
                                mb: 1.25,
                                fontSize: '0.72rem',
                                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                '& .MuiAlert-icon': { fontSize: '1rem', mr: 0.75 },
                              }}
                            >
                              Excluded from forecast. Turn switch on to factor this stream into monthly projections.
                            </Alert>
                          )}

                          {/* Baseline Payment Selector (if recent transactions available) */}
                          {stream.recentPayments && stream.recentPayments.length > 0 && (
                            <Box sx={{ mb: 1.25 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.25 }}
                              >
                                Recurring Baseline Payment
                              </Typography>
                              <FormControl fullWidth size="small">
                                <Select
                                  value={
                                    stream.selectedPaymentId !== undefined ? String(stream.selectedPaymentId) : 'custom'
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateIncomeStream(stream.id, { selectedPaymentId: val });
                                  }}
                                  sx={{ fontSize: '0.82rem' }}
                                >
                                  {stream.recentPayments.map((p, idx) => (
                                    <MenuItem key={String(p.id)} value={String(p.id)} sx={{ fontSize: '0.82rem' }}>
                                      {idx === 0 ? 'Latest: ' : ''}
                                      {p.date} — {usd.format(p.amount)}
                                    </MenuItem>
                                  ))}
                                  <MenuItem value="custom" sx={{ fontSize: '0.82rem' }}>
                                    Custom / Manual Override
                                  </MenuItem>
                                </Select>
                              </FormControl>

                              {stream.recentPayments.length >= 2 &&
                                stream.recentPayments[0].amount > stream.recentPayments[1].amount * 1.25 &&
                                stream.selectedPaymentId === stream.recentPayments[0].id && (
                                  <Alert
                                    severity="info"
                                    variant="outlined"
                                    sx={{
                                      py: 0.25,
                                      px: 1,
                                      mt: 0.75,
                                      fontSize: '0.72rem',
                                      borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                      '& .MuiAlert-icon': { fontSize: '1rem', mr: 0.75 },
                                    }}
                                  >
                                    Latest payment ({usd.format(stream.recentPayments[0].amount)}) was higher than
                                    previous ({usd.format(stream.recentPayments[1].amount)}). Select a prior payment or
                                    enter an override if this included a bonus.
                                  </Alert>
                                )}
                            </Box>
                          )}

                          {/* Paycheck Amount and Frequency */}
                          <Grid container spacing={1} alignItems="flex-start" mb={1}>
                            <Grid size={{ xs: 6 }}>
                              <Typography variant="caption" color="text.secondary">
                                {stream.frequency === 'biweekly'
                                  ? 'Paycheck (Every 2 Wks)'
                                  : stream.frequency === 'weekly'
                                  ? 'Paycheck (Weekly)'
                                  : stream.frequency === 'semimonthly'
                                  ? 'Paycheck (2x/mo)'
                                  : 'Per Payment'}
                              </Typography>
                              <TextField
                                size="small"
                                type="number"
                                value={stream.paycheckAmount ?? stream.monthlyAmount}
                                onChange={(e) =>
                                  updateIncomeStream(stream.id, {
                                    paycheckAmount: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                InputProps={{
                                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                }}
                                fullWidth
                                sx={{ mt: 0.25 }}
                              />
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                              <Typography variant="caption" color="text.secondary">
                                Frequency
                              </Typography>
                              <FormControl fullWidth size="small" sx={{ mt: 0.25 }}>
                                <Select
                                  value={stream.frequency || 'monthly'}
                                  onChange={(e) => {
                                    const freq = e.target.value as IncomeStream['frequency'];
                                    updateIncomeStream(stream.id, { frequency: freq });
                                  }}
                                >
                                  <MenuItem value="biweekly">Bi-weekly (26/yr)</MenuItem>
                                  <MenuItem value="semimonthly">Semi-monthly (2x/mo)</MenuItem>
                                  <MenuItem value="monthly">Monthly (12/yr)</MenuItem>
                                  <MenuItem value="weekly">Weekly (52/yr)</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                          </Grid>

                          {/* Projected Monthly Summary Box */}
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1,
                              mb: 1,
                              bgcolor: 'action.hover',
                              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Projected Monthly Total
                                </Typography>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {usd.format(stream.monthlyAmount)}
                                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                    / month{!stream.isTaxed ? ' gross' : ''}
                                  </Typography>
                                </Typography>
                                {!stream.isTaxed && (
                                  <Typography variant="caption" color="warning.main" fontWeight={600} display="block">
                                    After {stream.taxRate ?? 25}% tax reserve:{' '}
                                    {usd.format(Math.round(stream.monthlyAmount * (1 - (stream.taxRate ?? 25) / 100)))}/mo net
                                  </Typography>
                                )}
                              </Box>
                              {stream.paycheckAmount &&
                                (stream.frequency === 'biweekly' || stream.frequency === 'semimonthly') && (
                                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
                                    {stream.frequency === 'biweekly' ? '26 paychecks/yr' : '2x/month'}
                                    <br />~{usd.format(stream.monthlyAmount * 12)}/yr
                                  </Typography>
                                )}
                            </Stack>
                            {bonusMonths.length > 0 && (
                              <Typography
                                variant="caption"
                                sx={{ display: 'block', mt: 0.5, color: 'success.main', fontWeight: 600 }}
                              >
                                🎉 {stream.frequency === 'weekly' ? '5-Paycheck' : '3-Paycheck'} months ahead:{' '}
                                {bonusMonths.join(', ')}
                              </Typography>
                            )}
                          </Paper>

                          {/* Tax Status Toggle, 1099 Reserve % & Delete */}
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={stream.isTaxed}
                                  onChange={(e) => updateIncomeStream(stream.id, { isTaxed: e.target.checked })}
                                />
                              }
                              label={
                                <Typography
                                  variant="caption"
                                  color={stream.isTaxed ? 'success.main' : 'warning.main'}
                                  fontWeight={600}
                                >
                                  {stream.isTaxed ? 'Already Taxed (Take-Home)' : 'Pre-Tax (1099 / Gross)'}
                                </Typography>
                              }
                            />
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              {!stream.isTaxed && (
                                <TextField
                                  size="small"
                                  label="Tax %"
                                  type="number"
                                  value={stream.taxRate ?? 25}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                                    updateIncomeStream(stream.id, { taxRate: val });
                                  }}
                                  sx={{ width: 84 }}
                                  inputProps={{ min: 0, max: 60, step: 1 }}
                                />
                              )}
                              {isCustom && (
                                <IconButton size="small" color="error" onClick={() => removeIncomeStream(stream.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Stack>
                          </Stack>
                        </Box>
                      </Collapse>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Collapse>
        </Box>

        {/* 2b. One-Time Windfalls & Planned Income Gaps */}
        <Box sx={{ mb: 3 }}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              borderColor: windfalls.length > 0 || incomeGaps.length > 0 ? 'primary.main' : 'divider',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <CardGiftcardIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight="700">
                  Windfalls &amp; Income Gaps
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                Schedule one-time bonuses, tax refunds, or planned unpaid leave months.
              </Typography>

              {/* Add Windfall Row */}
              <Grid container spacing={1} alignItems="center" mb={1}>
                <Grid size={{ xs: 5 }}>
                  <TextField
                    size="small"
                    placeholder="Label (e.g. Bonus)"
                    value={windfallName}
                    onChange={(e) => setWindfallName(e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    size="small"
                    type="number"
                    placeholder="Amount"
                    value={windfallAmount}
                    onChange={(e) => setWindfallAmount(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <FormControl fullWidth size="small">
                    <Select
                      value={Math.min(months, windfallMonthIndex)}
                      onChange={(e) => setWindfallMonthIndex(Number(e.target.value))}
                      sx={{ fontSize: '0.78rem' }}
                    >
                      {Array.from({ length: months }, (_, idx) => idx + 1).map((mIdx) => (
                        <MenuItem key={mIdx} value={mIdx} sx={{ fontSize: '0.78rem' }}>
                          {monthLabels[mIdx - 1] || `Mo ${mIdx}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Button
                size="small"
                variant="outlined"
                fullWidth
                startIcon={<AddIcon fontSize="small" />}
                onClick={handleAddWindfall}
                disabled={!windfallAmount || Number(windfallAmount) <= 0}
                sx={{ textTransform: 'none', mb: windfalls.length > 0 ? 1.25 : 1.5 }}
              >
                Add One-Time Windfall
              </Button>

              {windfalls.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={1.5}>
                  {windfalls.map((w) => (
                    <Chip
                      key={w.id}
                      size="small"
                      color="success"
                      variant="outlined"
                      label={`${w.name}: +${usd.format(w.amount)} (${monthLabels[w.monthIndex - 1] || `Mo ${w.monthIndex}`})`}
                      onDelete={() => removeWindfall(w.id)}
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  ))}
                </Stack>
              )}

              {/* Planned Income Gaps */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <EventBusyIcon fontSize="inherit" color="action" />
                  <Typography variant="caption" fontWeight="600" color="text.secondary">
                    Planned Income Gap Months ($0 income)
                  </Typography>
                </Stack>
                {incomeGaps.length > 0 && (
                  <Button size="small" onClick={clearIncomeGaps} sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0 }}>
                    Clear ({incomeGaps.length})
                  </Button>
                )}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select
                    value={Math.min(months, gapMonthToSelect)}
                    onChange={(e) => setGapMonthToSelect(Number(e.target.value))}
                    sx={{ fontSize: '0.78rem' }}
                  >
                    {Array.from({ length: months }, (_, idx) => idx + 1).map((mIdx) => (
                      <MenuItem key={mIdx} value={mIdx} sx={{ fontSize: '0.78rem' }}>
                        {monthLabels[mIdx - 1] || `Month ${mIdx}`}
                        {incomeGaps.includes(mIdx) ? ' (Gap active)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="small"
                  variant="outlined"
                  color={incomeGaps.includes(gapMonthToSelect) ? 'warning' : 'inherit'}
                  onClick={() => toggleIncomeGap(gapMonthToSelect)}
                  sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  {incomeGaps.includes(gapMonthToSelect) ? 'Remove Gap' : 'Toggle Gap'}
                </Button>
              </Stack>
              {incomeGaps.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={1}>
                  {incomeGaps.map((mIdx) => (
                    <Chip
                      key={mIdx}
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`No Income: ${monthLabels[mIdx - 1] || `Mo ${mIdx}`}`}
                      onDelete={() => toggleIncomeGap(mIdx)}
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* 3. Tax Percentage */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="subtitle2" fontWeight="600">
              Estimated Tax Percentage
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {taxesDeducted > 0 ? `-${usd.format(taxesDeducted)}/mo deducted` : 'Applies to pre-tax streams'}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" fontWeight="700">
              {taxRate}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {taxesDeducted > 0 ? `${usd.format(taxesDeducted * 12)}/yr taxes` : '$0 (Actuals are already taxed)'}
            </Typography>
          </Stack>
          <Slider
            value={taxRate}
            min={0}
            max={50}
            step={1}
            marks={[
              { value: 0, label: '0%' },
              { value: 15, label: '15%' },
              { value: 25, label: '25%' },
              { value: 35, label: '35%' },
            ]}
            onChange={(_, val) => setTaxRate(val as number)}
          />
          <Typography variant="caption" color="text.secondary">
            Your actual bank deposits are already net take-home pay. Taxes are only deducted from streams marked as pre-tax.
          </Typography>
        </Box>

        {/* 4 & 5. Monthly Budget (Living & Debt) */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
            borderColor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight="600">
                Total Monthly Budget (Living &amp; Debt)
              </Typography>
              <Typography variant="h5" fontWeight="700" color="error.main">
                -{usd.format(recurringBudget + variableBudget)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" display="block" color="text.secondary">
                {usd.format(recurringBudget)} Fixed Bills
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary">
                + {usd.format(variableBudget)} Variable Living
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {/* 4. Monthly Recurring Budget */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight="600">
              Fixed Recurring Bills
            </Typography>
            {isRecurringOverridden && (
              <Tooltip title="Reset to actual recurring categories total">
                <IconButton size="small" onClick={() => resetFieldToReal('recurring')}>
                  <RestartAltIcon fontSize="inherit" color="action" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" fontWeight="700">
              {usd.format(recurringBudget)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Actual: {usd.format(realBaseline.recurring)}
            </Typography>
          </Stack>
          <Slider
            value={recurringBudget}
            min={0}
            max={Math.max(15000, realBaseline.recurring * 2)}
            step={100}
            onChange={(_, val) => setRecurringBudget(val as number)}
          />
          <Typography variant="caption" color="text.secondary">
            Includes scheduled Mortgage ($2,288), Auto Loan ($544), Insurance ($612), Utilities ($375), Student Loans ($197), Subscriptions ($54), Housing ($43).
          </Typography>
        </Box>

        {/* 5. Monthly Variable Budget */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight="600">
              Variable Living Expenses
            </Typography>
            {isVariableOverridden && (
              <Tooltip title="Reset to actual variable spending average">
                <IconButton size="small" onClick={() => resetFieldToReal('variable')}>
                  <RestartAltIcon fontSize="inherit" color="action" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" fontWeight="700">
              {usd.format(variableBudget)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Actual: {usd.format(realBaseline.variable)}
            </Typography>
          </Stack>
          <Slider
            value={variableBudget}
            min={0}
            max={Math.max(12000, realBaseline.variable * 2)}
            step={100}
            onChange={(_, val) => setVariableBudget(val as number)}
          />
          <Typography variant="caption" color="text.secondary">
            Includes Groceries ($600), Shopping ($245), Gas ($200), Transportation ($150), Taxes ($150), Travel ($111), Dining &amp; other living.
          </Typography>
        </Box>

        {/* 6. Extra Monthly Loan Payment */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight="600">
              Extra Monthly Loan Payment (Optional)
            </Typography>
            {extraLoanPayment > 0 && (
              <Tooltip title="Reset extra loan payment to $0">
                <IconButton size="small" onClick={() => setExtraLoanPayment(0)}>
                  <RestartAltIcon fontSize="inherit" color="action" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" color={extraLoanPayment > 0 ? 'primary.main' : 'text.primary'} fontWeight="700">
              {usd.format(extraLoanPayment)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Baseline: $0 (scheduled loans are in Fixed Bills)
            </Typography>
          </Stack>
          <Slider
            value={extraLoanPayment}
            min={0}
            max={5000}
            step={100}
            onChange={(_, val) => setExtraLoanPayment(val as number)}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={divertExtraToSavings}
                onChange={(e) => setDivertExtraToSavings(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Divert to savings once debt is paid off
              </Typography>
            }
            sx={{ mb: 1 }}
          />
        </Box>

        {/* 7. Loan Strategy */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight="600" gutterBottom>
            Loan Payoff Strategy
          </Typography>
          <ToggleButtonGroup
            color="primary"
            value={loanStrategy}
            exclusive
            fullWidth
            size="small"
            onChange={(_, val) => val && setLoanStrategy(val)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="avalanche" sx={{ textTransform: 'none' }}>
              Avalanche
            </ToggleButton>
            <ToggleButton value="snowball" sx={{ textTransform: 'none' }}>
              Snowball
            </ToggleButton>
            <ToggleButton value="evenly" sx={{ textTransform: 'none' }}>
              Evenly
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* 8. Home Equity & Real Estate */}
        <Box sx={{ mb: 3 }}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              borderColor: includeHomeEquity ? 'primary.main' : 'divider',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? includeHomeEquity ? 'rgba(37, 99, 235, 0.05)' : 'rgba(255,255,255,0.02)'
                  : includeHomeEquity ? 'rgba(37, 99, 235, 0.02)' : 'background.paper',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <HomeOutlinedIcon color={includeHomeEquity ? 'primary' : 'disabled'} fontSize="small" />
                  <Typography variant="subtitle2" fontWeight="700">
                    Home Equity
                  </Typography>
                </Stack>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={includeHomeEquity}
                      onChange={(e) => setIncludeHomeEquity(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption" fontWeight="600" color="text.secondary">
                      {includeHomeEquity ? 'In Net Worth' : 'Excluded'}
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              </Stack>

              {includeHomeEquity && (
                <Box sx={{ mt: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight="600">
                      Estimated Property Value
                    </Typography>
                    {isHomeValueOverridden && (
                      <Tooltip title="Reset to baseline property value">
                        <IconButton size="small" onClick={() => resetFieldToReal('homeValue')}>
                          <RestartAltIcon fontSize="inherit" color="action" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    value={homePropertyValue}
                    onChange={(e) => setHomePropertyValue(Math.max(0, Number(e.target.value) || 0))}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                        sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` },
                      },
                    }}
                    sx={{ mb: 1.5 }}
                  />

                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight="600">
                      Annual Home Appreciation
                    </Typography>
                    <Typography variant="caption" fontWeight="700" color="primary.main">
                      {homeAppreciationRate.toFixed(1)}% / yr
                    </Typography>
                  </Stack>
                  <Slider
                    size="small"
                    value={homeAppreciationRate}
                    min={0}
                    max={6}
                    step={0.5}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 2, label: '2%' },
                      { value: 4, label: '4%' },
                      { value: 6, label: '6%' },
                    ]}
                    onChange={(_, val) => setHomeAppreciationRate(val as number)}
                    sx={{ mb: 1.5 }}
                  />

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                      bgcolor: (theme) =>
                        theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          Current Home Equity:
                        </Typography>
                        <Typography variant="caption" fontWeight="700" color="success.main">
                          {usd.format(Math.max(0, homePropertyValue - realMortgageBalance))}
                          {' '}({((Math.max(0, homePropertyValue - realMortgageBalance) / (homePropertyValue || 1)) * 100).toFixed(0)}%)
                        </Typography>
                      </Stack>
                      {realMortgageBalance > 0 && (
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">
                            Mortgage Balance:
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            -{usd.format(realMortgageBalance)}
                          </Typography>
                        </Stack>
                      )}
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          Projected Equity ({Math.round(months / 12)}Y):
                        </Typography>
                        <Typography variant="caption" fontWeight="700" color="primary.main">
                          {usd.format(lastPointHomeEquity)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* 9. Time Horizon */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle2" fontWeight="600" gutterBottom>
            Time Horizon
          </Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
            <Typography variant="h5" fontWeight="700">
              {months} Months
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {(months / 12).toFixed(1)} Years
            </Typography>
          </Stack>
          <Slider
            value={months}
            min={6}
            max={240}
            step={6}
            marks={[
              { value: 12, label: '1y' },
              { value: 36, label: '3y' },
              { value: 60, label: '5y' },
              { value: 120, label: '10y' },
              { value: 240, label: '20y' },
            ]}
            onChange={(_, val) => setMonths(val as number)}
          />
        </Box>

        <Button
          variant="contained"
          color="primary"
          fullWidth
          onClick={onSaveScenarioArtifact}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Save Scenario as Artifact
        </Button>
      </Paper>
    </Box>
  );
}
