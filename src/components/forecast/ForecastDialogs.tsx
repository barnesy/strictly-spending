import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Grid,
  TextField,
  Button,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Stack,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Chip,
  LinearProgress,
  Tabs,
  Tab,
  InputAdornment,
  Card,
  CardContent,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SavingsIcon from '@mui/icons-material/Savings';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { usd } from '../../lib';
import type { Goal, DestinationAccount, IncomeStream } from '../../api/scenarios';
import type { Account } from '../../types';
import {
  getCheckingSourceKey,
  getLegacyCheckingSourceKey,
  getOperatingCashAccounts,
  getSingleAccountSavingsAllocation,
} from '../../domain/accountCashflow';

export interface MoneyFlowGoalsPanelProps {
  destinations: DestinationAccount[];
  goals: Goal[];
  incomeStreams?: IncomeStream[];
  availableAccounts?: Account[];
  totalStreamInvested?: number;
  netIncome?: number;
  totalLivingAndDebt?: number;
  availableToAllocate: number;
  totalDestinationFlow: number;
  totalGoalFlow: number;
  monthlySafeRemainder: number;
  onToggleDestinations: () => void;
  onOpenAddDestDialog: () => void;
  updateDestination: (id: string, updates: Partial<DestinationAccount>) => void;
  setDestinations: (destinations: DestinationAccount[]) => void;
  addDestination?: (dest: DestinationAccount) => void;
  removeDestination: (id: string) => void;
  setGoals: (goals: Goal[]) => void;
}

interface CheckingSourceSummary {
  key: string;
  legacyKey: 'truist' | 'boa' | null;
  account?: Account;
  label: string;
  fullAccountName: string;
  streamNames: string[];
  monthlyInflow: number;
}

function formatShortCheckingLabel(acc: Account): string {
  const name = acc.name || '';
  const last4 = acc.last4 || name.match(/\b(\d{4})\b/)?.[1];
  if (/bank\s*of\s*america|\bboa\b|bofa/i.test(name)) {
    return `BoA Checking${last4 ? ` (${last4})` : ''}`;
  }
  if (/money\s*rate/i.test(name)) {
    return `Truist Money Rate${last4 ? ` (${last4})` : ''}`;
  }
  if (/truist/i.test(name)) {
    return `Truist Checking${last4 ? ` (${last4})` : ''}`;
  }
  const cleaned = name
    .replace(/(\b\d{4})\s*\(\1\)/g, '($1)')
    .replace(/\s+/g, ' ')
    .trim();
  if (last4 && !cleaned.includes(last4)) {
    return `${cleaned} (${last4})`;
  }
  return cleaned || 'Checking Account';
}

/**
 * Resolves the monthly transfer map `{ [sourceKey]: amount }` for a destination account
 * across all individual checking accounts.
 */
function getDestinationSourceMap(
  dest: DestinationAccount,
  checkingSources: CheckingSourceSummary[]
): Record<string, number> {
  const result: Record<string, number> = {};
  let sum = 0;

  for (const src of checkingSources) {
    let val = 0;
    if (src.account) {
      val = Math.round(getSingleAccountSavingsAllocation(dest, src.account));
    } else if (dest.sourceAllocations?.[src.key] !== undefined) {
      val = Math.max(0, Math.round(Number(dest.sourceAllocations[src.key] || 0)));
    } else if (src.legacyKey && dest.sourceAllocations?.[src.legacyKey] !== undefined) {
      val = Math.max(0, Math.round(Number(dest.sourceAllocations[src.legacyKey] || 0)));
    }
    result[src.key] = val;
    sum += val;
  }

  const total = Math.max(0, Math.round(dest.monthlyAllocation || 0));
  if (sum > 0 || total === 0 || (dest.sourceAllocations && Object.keys(dest.sourceAllocations).length > 0)) {
    return result;
  }

  // Fallback for legacy unsplit destinations with a nonzero monthlyAllocation
  const truistSrc = checkingSources.find((s) => s.legacyKey === 'truist');
  const boaSrc = checkingSources.find((s) => s.legacyKey === 'boa');
  if (dest.accountType === 'savings' && /truist/i.test(dest.name) && total === 5000 && truistSrc && boaSrc) {
    result[truistSrc.key] = 2000;
    result[boaSrc.key] = (result[boaSrc.key] || 0) + 3000;
    return result;
  }

  // Proportional distribution across income-receiving checking accounts (or 100% to first account)
  const activeInflowSources = checkingSources.filter((s) => s.monthlyInflow > 0);
  const totalInflow = activeInflowSources.reduce((acc, s) => acc + s.monthlyInflow, 0);
  if (activeInflowSources.length > 1 && totalInflow > 0) {
    let allocated = 0;
    activeInflowSources.forEach((src, idx) => {
      if (idx === activeInflowSources.length - 1) {
        result[src.key] = Math.max(0, total - allocated);
      } else {
        const share = Math.round((total * src.monthlyInflow) / totalInflow);
        result[src.key] = share;
        allocated += share;
      }
    });
  } else if (activeInflowSources.length === 1) {
    result[activeInflowSources[0].key] = total;
  } else if (checkingSources[0]) {
    result[checkingSources[0].key] = total;
  }
  return result;
}

export function MoneyFlowGoalsPanel({
  destinations,
  goals,
  incomeStreams = [],
  availableAccounts = [],
  netIncome,
  totalLivingAndDebt,
  availableToAllocate,
  totalDestinationFlow,
  totalGoalFlow,
  monthlySafeRemainder,
  onToggleDestinations,
  onOpenAddDestDialog,
  updateDestination,
  setDestinations,
  addDestination,
  removeDestination,
  setGoals,
}: MoneyFlowGoalsPanelProps) {
  const [rightPanelTab, setRightPanelTab] = useState<'destinations' | 'goals'>('destinations');

  // Build per-account checking sources from real enabled operating accounts (or dynamic income stream accounts)
  const checkingSources = useMemo<CheckingSourceSummary[]>(() => {
    const enabledChecking = getOperatingCashAccounts(availableAccounts, incomeStreams);

    if (enabledChecking.length > 0) {
      const inflows = new Array<number>(enabledChecking.length).fill(0);
      const streamLists: string[][] = enabledChecking.map(() => []);
      const legacyKeys = enabledChecking.map((acc) => getLegacyCheckingSourceKey(acc));

      for (const s of incomeStreams) {
        if (!s.enabled) continue;
        const inflow = Math.max(0, Math.round(s.monthlyAmount || 0));
        let idx = s.accountId !== undefined ? enabledChecking.findIndex((acc) => acc.id === s.accountId) : -1;
        if (idx === -1) {
          const accText = `${s.accountName || ''} ${s.name || ''}`;
          if (s.accountName) {
            idx = enabledChecking.findIndex((acc) => acc.name.toLowerCase() === s.accountName!.toLowerCase());
          }
          if (idx === -1 && /truist|vertex/i.test(accText)) {
            idx = legacyKeys.findIndex((k) => k === 'truist');
          }
          if (idx === -1 && /bank of america|\bboa\b|bofa|accelerant/i.test(accText)) {
            idx = legacyKeys.findIndex((k) => k === 'boa');
          }
          if (idx === -1) {
            idx = 0;
          }
        }
        if (idx >= 0 && idx < enabledChecking.length) {
          inflows[idx] += inflow;
          if (s.name && !streamLists[idx].includes(s.name)) {
            streamLists[idx].push(s.name);
          }
        }
      }

      return enabledChecking.map((acc, idx) => ({
        key: getCheckingSourceKey(acc) || String(acc.id ?? acc.name),
        legacyKey: legacyKeys[idx],
        account: acc,
        label: formatShortCheckingLabel(acc),
        fullAccountName: acc.name,
        streamNames: streamLists[idx],
        monthlyInflow: inflows[idx],
      }));
    }

    // Dynamic fallback when no accounts are connected yet: group by income stream account or single Primary Checking
    const streamSourceMap = new Map<string, CheckingSourceSummary>();
    for (const s of incomeStreams) {
      if (!s.enabled) continue;
      const inflow = Math.max(0, Math.round(s.monthlyAmount || 0));
      const key = s.accountId !== undefined ? String(s.accountId) : (s.accountName || 'primary');
      const label = s.accountName || 'Primary Checking';
      if (!streamSourceMap.has(key)) {
        streamSourceMap.set(key, {
          key,
          legacyKey: /truist/i.test(label) ? 'truist' : /bank of america|\bboa\b|bofa/i.test(label) ? 'boa' : null,
          label,
          fullAccountName: label,
          streamNames: [],
          monthlyInflow: 0,
        });
      }
      const entry = streamSourceMap.get(key)!;
      entry.monthlyInflow += inflow;
      if (s.name && !entry.streamNames.includes(s.name)) entry.streamNames.push(s.name);
    }

    if (streamSourceMap.size > 0) {
      return Array.from(streamSourceMap.values());
    }

    return [
      {
        key: 'primary',
        legacyKey: null,
        label: 'Primary Checking',
        fullAccountName: 'Primary Checking',
        streamNames: [],
        monthlyInflow: 0,
      },
    ];
  }, [incomeStreams, availableAccounts]);

  const enabledDestinations = destinations.filter((d) => d.enabled);

  // Sum how much is moving out of each individual checking account across all enabled destinations
  const totalMovedOutBySourceKey = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const src of checkingSources) {
      totals[src.key] = 0;
    }
    for (const dest of enabledDestinations) {
      const split = getDestinationSourceMap(dest, checkingSources);
      for (const src of checkingSources) {
        totals[src.key] = (totals[src.key] || 0) + (split[src.key] || 0);
      }
    }
    return totals;
  }, [enabledDestinations, checkingSources]);

  const handleSourceAmountChange = (dest: DestinationAccount, sourceKey: string, rawValue: number) => {
    const cleanVal = Math.max(0, Math.round(Number(rawValue) || 0));
    const currentMap = getDestinationSourceMap(dest, checkingSources);
    const nextMap: Record<string, number> = {
      ...(dest.sourceAllocations || {}),
      ...currentMap,
      [sourceKey]: cleanVal,
    };
    // Remove migrated legacy alias keys ('truist' / 'boa') if real account ID keys are present
    for (const src of checkingSources) {
      if (src.legacyKey && src.legacyKey !== src.key && nextMap[src.legacyKey] !== undefined) {
        delete nextMap[src.legacyKey];
      }
    }
    const nextTotal = Object.values(nextMap).reduce(
      (sum, v) => sum + (typeof v === 'number' && !Number.isNaN(v) ? v : 0),
      0
    );
    updateDestination(dest.id, {
      sourceAllocations: nextMap,
      monthlyAllocation: nextTotal,
      enabled: nextTotal > 0 ? true : dest.enabled,
    });
  };

  const handleQuickAddAccount = (preset: {
    name: string;
    accountType: 'savings' | 'investment';
    isRothIra?: boolean;
    annualGrowthRate: number;
    currentBalance?: number;
  }) => {
    const newDest: DestinationAccount = {
      id: `custom-${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: preset.name,
      accountType: preset.accountType,
      isRothIra: preset.isRothIra,
      currentBalance: preset.currentBalance ?? 0,
      monthlyAllocation: 0,
      sourceAllocations: {},
      annualGrowthRate: preset.annualGrowthRate,
      enabled: true,
      isOverridden: true,
    };
    if (addDestination) {
      addDestination(newDest);
    } else {
      setDestinations([...destinations, newDest]);
    }
  };

  const hasRobinhood = destinations.some((d) => /robinhood/i.test(d.name));
  const has401k = destinations.some((d) => /401\s*\(?k\)?/i.test(d.name));
  const hasRothIra = destinations.some((d) => d.isRothIra || /roth/i.test(d.name));

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Paper
        sx={{
          minWidth: { xs: 0, sm: 360 },
          minHeight: '100%',
          p: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          boxShadow: 'none',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SavingsIcon color="primary" fontSize="small" />
            <Typography variant="h6" fontWeight="700">
              Money Flow &amp; Goals
            </Typography>
          </Stack>
          <Tooltip title="Collapse Panel">
            <IconButton size="small" onClick={onToggleDestinations} aria-label="Collapse Destinations">
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Top Summary: Checking Accounts (Truist & BoA) -> Budget -> Transfers -> Safe Remainder */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.75,
            mb: 2,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            borderColor: monthlySafeRemainder < 0 ? 'error.main' : 'divider',
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <AccountBalanceIcon sx={{ fontSize: '0.95rem', color: 'primary.main' }} />
              <Typography variant="caption" color="text.secondary" fontWeight="700" sx={{ letterSpacing: 0.4 }}>
                CHECKING ACCOUNTS (INCOME SOURCES)
              </Typography>
            </Stack>
          </Stack>

          <Grid container spacing={1} sx={{ mb: 1.25 }}>
            {checkingSources.map((src) => {
              const movedOut = totalMovedOutBySourceKey[src.key] || 0;
              return (
                <Grid size={{ xs: 6 }} key={src.key}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1,
                      borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                      bgcolor: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.8)',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="caption" fontWeight="700" display="block" noWrap title={src.fullAccountName}>
                      {src.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.68rem' }}>
                      Income: <strong>{usd.format(src.monthlyInflow)}/mo</strong>
                    </Typography>
                    <Typography
                      variant="caption"
                      fontWeight="700"
                      color={movedOut > 0 ? 'secondary.main' : 'text.secondary'}
                      display="block"
                      sx={{ fontSize: '0.7rem', mt: 0.25, fontVariantNumeric: 'tabular-nums' }}
                    >
                      Moving Out: {movedOut > 0 ? `-${usd.format(movedOut)}/mo` : '$0/mo'}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          {(() => {
            const totalInflow =
              netIncome ?? checkingSources.reduce((sum, s) => sum + s.monthlyInflow, 0);
            const budgetTotal =
              totalLivingAndDebt ?? Math.max(0, totalInflow - availableToAllocate);
            return (
              <Stack
                spacing={0.5}
                sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    1. Total Checking Income
                  </Typography>
                  <Typography variant="caption" fontWeight="700" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    +{usd.format(totalInflow)}/mo
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    2. Living &amp; Debt (Monthly Budget)
                  </Typography>
                  <Typography variant="caption" fontWeight="700" color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    -{usd.format(budgetTotal)}/mo
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    3. Available After Budget
                  </Typography>
                  <Typography variant="caption" fontWeight="700" color="primary.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {usd.format(availableToAllocate)}/mo
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    4. Moving to Accounts{totalGoalFlow > 0 ? ' & Goals' : ''}
                  </Typography>
                  <Typography variant="caption" fontWeight="700" color="secondary.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    -{usd.format(totalDestinationFlow + totalGoalFlow)}/mo
                  </Typography>
                </Stack>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ pt: 0.5, mt: 0.25, borderTop: '1px dashed', borderColor: 'divider' }}
                >
                  <Typography variant="caption" fontWeight="700" color="text.primary">
                    5. Safe Remainder (Stays in Checking)
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight="800"
                    color={monthlySafeRemainder >= 0 ? 'success.main' : 'error.main'}
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {usd.format(monthlySafeRemainder)}/mo
                  </Typography>
                </Stack>
              </Stack>
            );
          })()}
        </Paper>

        <Tabs
          value={rightPanelTab}
          onChange={(_, val) => setRightPanelTab(val)}
          variant="fullWidth"
          sx={{ mb: 2, minHeight: 36 }}
        >
          <Tab
            value="destinations"
            label={`Accounts (${destinations.length})`}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
          />
          <Tab
            value="goals"
            label={`Goals (${goals.length})`}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
          />
        </Tabs>

        {rightPanelTab === 'destinations' ? (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25}>
              <Typography variant="caption" color="text.secondary" fontWeight="700" sx={{ letterSpacing: 0.4 }}>
                SAVINGS &amp; INVESTMENT DESTINATIONS
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon fontSize="small" />}
                onClick={onOpenAddDestDialog}
                sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.25, flexShrink: 0 }}
              >
                Add Account
              </Button>
            </Stack>

            {/* Destination Account Cards */}
            {destinations.map((dest) => {
              const isRoth = Boolean(dest.isRothIra || /roth/i.test(dest.name));
              const is401k = /401\s*\(?k\)?/i.test(dest.name);
              const isSavings = dest.accountType === 'savings';
              const isTruistSavings = isSavings && /truist/i.test(dest.name);
              const splitMap = getDestinationSourceMap(dest, checkingSources);
              const totalMonthly = Object.values(splitMap).reduce((sum, v) => sum + (v || 0), 0);
              const rothLimitMonthly = 583; // $7,000 / 12
              const truist5463Src = checkingSources.find((s) => s.legacyKey === 'truist');
              const boa6669Src = checkingSources.find((s) => s.legacyKey === 'boa');

              const badgeLabel = isRoth
                ? 'ROTH IRA'
                : is401k
                ? '401(K)'
                : isSavings
                ? 'SAVINGS'
                : 'INVESTMENT';

              return (
                <Card
                  key={dest.id}
                  variant="outlined"
                  sx={{
                    mb: 1.75,
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    borderColor: dest.enabled && totalMonthly > 0 ? 'primary.main' : 'divider',
                    opacity: dest.enabled ? 1 : 0.65,
                    transition: 'border-color 0.2s, opacity 0.2s',
                  }}
                >
                  <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                    {/* Header: Badge, Account Name, Monthly Total, Enable Switch */}
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.25} spacing={1}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        <Chip
                          label={badgeLabel}
                          size="small"
                          color={isRoth ? 'secondary' : isSavings ? 'success' : 'primary'}
                          sx={{ fontWeight: 700, fontSize: '0.62rem', height: 20 }}
                        />
                        <Typography variant="subtitle2" fontWeight="700" noWrap title={dest.name}>
                          {dest.name}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Chip
                          size="small"
                          label={`${usd.format(dest.enabled ? totalMonthly : 0)}/mo`}
                          color={dest.enabled && totalMonthly > 0 ? 'primary' : 'default'}
                          variant={dest.enabled && totalMonthly > 0 ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 700, fontSize: '0.68rem', height: 22, fontVariantNumeric: 'tabular-nums' }}
                        />
                        <Switch
                          size="small"
                          checked={dest.enabled}
                          onChange={(e) => updateDestination(dest.id, { enabled: e.target.checked })}
                        />
                        {dest.accountId === undefined && (
                          <Tooltip title="Remove account">
                            <IconButton size="small" color="error" onClick={() => removeDestination(dest.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>

                    {/* Row 1: Current Balance & Annual Return (%) */}
                    <Grid container spacing={1.25} sx={{ mb: 1.25 }}>
                      <Grid size={{ xs: 7 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="600" display="block" sx={{ mb: 0.35 }}>
                          Current Balance
                        </Typography>
                        <TextField
                          size="small"
                          type="number"
                          value={Math.round(dest.currentBalance || 0)}
                          onChange={(e) =>
                            updateDestination(dest.id, { currentBalance: Math.max(0, Number(e.target.value) || 0) })
                          }
                          InputProps={{
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          }}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 5 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="600" display="block" sx={{ mb: 0.35 }}>
                          {isSavings ? 'APY (%)' : 'Return (%)'}
                        </Typography>
                        <TextField
                          size="small"
                          type="number"
                          value={dest.annualGrowthRate}
                          onChange={(e) =>
                            updateDestination(dest.id, { annualGrowthRate: Number(e.target.value) || 0 })
                          }
                          InputProps={{
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                          }}
                          fullWidth
                        />
                      </Grid>
                    </Grid>

                    {/* Row 2: Monthly Transfer Inputs From Individual Checking Accounts */}
                    <Box
                      sx={{
                        p: 1.25,
                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        bgcolor: (t) =>
                          t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight="700"
                        display="block"
                        sx={{ fontSize: '0.66rem', mb: 0.75, letterSpacing: 0.3 }}
                      >
                        MONTHLY TRANSFER FROM CHECKING
                      </Typography>
                      <Grid container spacing={1.25}>
                        {checkingSources.map((src) => (
                          <Grid size={{ xs: 6 }} key={src.key}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                              noWrap
                              title={`From ${src.fullAccountName}`}
                              sx={{ mb: 0.35, fontWeight: 600 }}
                            >
                              From {src.label}
                            </Typography>
                            <TextField
                              size="small"
                              type="number"
                              value={splitMap[src.key] || 0}
                              onChange={(e) => handleSourceAmountChange(dest, src.key, Number(e.target.value))}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                endAdornment: <InputAdornment position="end">/mo</InputAdornment>,
                              }}
                              fullWidth
                            />
                          </Grid>
                        ))}
                      </Grid>

                      {/* Helpful 1-click presets */}
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        {isTruistSavings &&
                          truist5463Src &&
                          boa6669Src &&
                          (splitMap[truist5463Src.key] !== 2000 || splitMap[boa6669Src.key] !== 3000) && (
                            <Chip
                              size="small"
                              color="success"
                              variant="outlined"
                              label="Set $2k Truist (5463) + $3k BoA (6669) ($5,000/mo)"
                              onClick={() =>
                                updateDestination(dest.id, {
                                  enabled: true,
                                  sourceAllocations: {
                                    [truist5463Src.key]: 2000,
                                    [boa6669Src.key]: 3000,
                                  },
                                  monthlyAllocation: 5000,
                                })
                              }
                              sx={{ fontSize: '0.66rem', height: 21, fontWeight: 600, cursor: 'pointer' }}
                            />
                          )}
                        {isRoth && totalMonthly !== rothLimitMonthly && checkingSources.length > 0 && (
                          <Chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            label="IRS Max ($583/mo)"
                            onClick={() => {
                              let rothSourceAllocations: Record<string, number> = {};
                              if (truist5463Src && boa6669Src) {
                                rothSourceAllocations = {
                                  [truist5463Src.key]: 283,
                                  [boa6669Src.key]: 300,
                                };
                              } else {
                                const primarySrc =
                                  [...checkingSources].sort((a, b) => b.monthlyInflow - a.monthlyInflow)[0] ||
                                  checkingSources[0];
                                rothSourceAllocations = { [primarySrc.key]: rothLimitMonthly };
                              }
                              updateDestination(dest.id, {
                                enabled: true,
                                sourceAllocations: rothSourceAllocations,
                                monthlyAllocation: rothLimitMonthly,
                              });
                            }}
                            sx={{ fontSize: '0.66rem', height: 21, fontWeight: 600, cursor: 'pointer' }}
                          />
                        )}
                        {totalMonthly > 0 && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label="Clear ($0)"
                            onClick={() =>
                              updateDestination(dest.id, {
                                sourceAllocations: {},
                                monthlyAllocation: 0,
                              })
                            }
                            sx={{ fontSize: '0.66rem', height: 21, cursor: 'pointer' }}
                          />
                        )}
                      </Stack>
                    </Box>

                    {isRoth && (
                      <Box sx={{ mt: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.25}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            Roth IRA Annual Limit: $7,000/yr ($583/mo)
                          </Typography>
                          <Typography variant="caption" fontWeight="600" color="secondary.main" sx={{ fontSize: '0.65rem' }}>
                            {Math.min(100, Math.round((totalMonthly / rothLimitMonthly) * 100))}%
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, (totalMonthly / rothLimitMonthly) * 100)}
                          color="secondary"
                          sx={{ height: 4, borderRadius: 2 }}
                        />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Quick-Add Future Investment Accounts (Robinhood, 401k, Roth IRA) */}
            {(!hasRobinhood || !has401k || !hasRothIra) && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  mt: 1,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  borderStyle: 'dashed',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight="700"
                  display="block"
                  sx={{ mb: 0.75, fontSize: '0.66rem', letterSpacing: 0.3 }}
                >
                  QUICK-ADD FUTURE INVESTMENT ACCOUNTS
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {!hasRobinhood && (
                    <Chip
                      size="small"
                      icon={<AddIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label="Robinhood"
                      variant="outlined"
                      color="primary"
                      onClick={() =>
                        handleQuickAddAccount({
                          name: 'Robinhood',
                          accountType: 'investment',
                          annualGrowthRate: 8.0,
                        })
                      }
                      sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
                    />
                  )}
                  {!has401k && (
                    <Chip
                      size="small"
                      icon={<AddIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label="401(k)"
                      variant="outlined"
                      color="primary"
                      onClick={() =>
                        handleQuickAddAccount({
                          name: '401(k)',
                          accountType: 'investment',
                          annualGrowthRate: 8.0,
                        })
                      }
                      sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
                    />
                  )}
                  {!hasRothIra && (
                    <Chip
                      size="small"
                      icon={<AddIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label="Roth IRA"
                      variant="outlined"
                      color="secondary"
                      onClick={() =>
                        handleQuickAddAccount({
                          name: 'Roth IRA',
                          accountType: 'investment',
                          isRothIra: true,
                          annualGrowthRate: 7.5,
                        })
                      }
                      sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
                    />
                  )}
                </Stack>
              </Paper>
            )}
          </Box>
        ) : (
          /* Custom Goals Tab */
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Dedicate monthly cashflow from your {usd.format(Math.max(0, availableToAllocate))} available pool toward specific milestone goals.
            </Typography>

            {goals.map((g, idx) => (
              <Card
                key={g.id}
                variant="outlined"
                sx={{
                  mb: 2.5,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  borderColor: 'divider',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                    <TextField
                      size="small"
                      label="Goal Name"
                      value={g.name}
                      fullWidth
                      onChange={(e) => {
                        const newGoals = [...goals];
                        newGoals[idx] = { ...newGoals[idx], name: e.target.value };
                        setGoals(newGoals);
                      }}
                    />
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setGoals(goals.filter((x) => x.id !== g.id))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Grid container spacing={1.5} mb={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        size="small"
                        label="Target ($)"
                        type="number"
                        value={g.amount}
                        fullWidth
                        onChange={(e) => {
                          const newGoals = [...goals];
                          const amt = Math.max(0, Number(e.target.value) || 0);
                          const targetMonths = Math.max(1, newGoals[idx].targetMonths || 1);
                          newGoals[idx] = {
                            ...newGoals[idx],
                            amount: amt,
                            monthlyContribution: Math.round((amt / targetMonths) * 100) / 100,
                          };
                          setGoals(newGoals);
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        size="small"
                        label="Monthly ($)"
                        type="number"
                        value={Math.round(g.monthlyContribution)}
                        fullWidth
                        onChange={(e) => {
                          const newGoals = [...goals];
                          const m = Math.max(0, Number(e.target.value) || 0);
                          newGoals[idx] = {
                            ...newGoals[idx],
                            monthlyContribution: m,
                            targetMonths: m > 0 ? Math.max(1, Math.ceil(newGoals[idx].amount / m)) : newGoals[idx].targetMonths,
                          };
                          setGoals(newGoals);
                        }}
                      />
                    </Grid>
                  </Grid>

                  <Box sx={{ px: 0.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" fontWeight="600">
                        Target: {g.targetMonths} Months ({usd.format(g.monthlyContribution)}/mo)
                      </Typography>
                      {monthlySafeRemainder >= 1 && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`+ Remainder (+${usd.format(Math.round(monthlySafeRemainder))}/mo)`}
                          onClick={() => {
                            const newGoals = [...goals];
                            const m = Math.round((newGoals[idx].monthlyContribution || 0) + monthlySafeRemainder);
                            newGoals[idx] = {
                              ...newGoals[idx],
                              monthlyContribution: m,
                              targetMonths: m > 0 ? Math.max(1, Math.ceil(newGoals[idx].amount / m)) : 1,
                            };
                            setGoals(newGoals);
                          }}
                          sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20, cursor: 'pointer' }}
                        />
                      )}
                    </Stack>
                    <Slider
                      size="small"
                      value={g.targetMonths}
                      min={1}
                      max={120}
                      step={1}
                      onChange={(_, val) => {
                        const newGoals = [...goals];
                        const t = Math.max(1, val as number);
                        newGoals[idx] = {
                          ...newGoals[idx],
                          targetMonths: t,
                          monthlyContribution: Math.round((newGoals[idx].amount / t) * 100) / 100,
                        };
                        setGoals(newGoals);
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outlined"
              fullWidth
              startIcon={<AddIcon />}
              onClick={() =>
                setGoals([
                  ...goals,
                  {
                    id: Math.random().toString(),
                    name: 'New Milestone',
                    amount: 5000,
                    targetMonths: 12,
                    monthlyContribution: 416,
                  },
                ])
              }
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
            >
              Add Milestone Goal
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export interface AddDestinationDialogProps {
  open: boolean;
  onClose: () => void;
  onAddDestination: (dest: DestinationAccount) => void;
}

export function AddDestinationDialog({
  open,
  onClose,
  onAddDestination,
}: AddDestinationDialogProps) {
  const [newDestName, setNewDestName] = useState('');
  const [newDestType, setNewDestType] = useState<'savings' | 'investment' | 'checking' | 'other'>('investment');
  const [newDestBalance, setNewDestBalance] = useState<number>(0);
  const [newDestAllocation, setNewDestAllocation] = useState<number>(250);
  const [newDestGrowthRate, setNewDestGrowthRate] = useState<number>(7.0);

  const handleAdd = () => {
    if (!newDestName.trim()) return;
    const isRoth = newDestName.toUpperCase().includes('ROTH') || newDestName.toUpperCase().includes('IRA');
    onAddDestination({
      id: `custom-${Date.now()}`,
      name: newDestName.trim(),
      accountType: newDestType,
      isRothIra: isRoth,
      currentBalance: Number(newDestBalance) || 0,
      monthlyAllocation: Number(newDestAllocation) || 0,
      annualGrowthRate: Number(newDestGrowthRate) || (isRoth ? 7.5 : 5.0),
      enabled: true,
      isOverridden: true,
    });
    setNewDestName('');
    setNewDestBalance(0);
    setNewDestAllocation(250);
    setNewDestGrowthRate(7.0);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
    >
      <DialogTitle>Add Destination Account</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Account Name"
            placeholder="e.g. Vanguard Roth IRA, HYSA, 529 College"
            value={newDestName}
            onChange={(e) => setNewDestName(e.target.value)}
            fullWidth
            autoFocus
          />

          <FormControl fullWidth size="small">
            <Select
              value={newDestType}
              onChange={(e) => setNewDestType(e.target.value as any)}
            >
              <MenuItem value="investment">Investment / Retirement (Roth IRA, Brokerage)</MenuItem>
              <MenuItem value="savings">High-Yield Savings / Money Market</MenuItem>
              <MenuItem value="checking">Checking / Cash Reserve</MenuItem>
              <MenuItem value="other">Other Goal Vehicle</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Current Balance ($)"
            type="number"
            value={newDestBalance}
            onChange={(e) => setNewDestBalance(Number(e.target.value))}
            fullWidth
          />

          <TextField
            label="Target Monthly Flow ($/mo)"
            type="number"
            value={newDestAllocation}
            onChange={(e) => setNewDestAllocation(Number(e.target.value))}
            fullWidth
          />

          <TextField
            label="Annual Expected Return (%)"
            type="number"
            value={newDestGrowthRate}
            onChange={(e) => setNewDestGrowthRate(Number(e.target.value))}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          disabled={!newDestName.trim()}
          variant="contained"
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Add Destination
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface AddIncomeStreamDialogProps {
  open: boolean;
  onClose: () => void;
  availableAccounts: Account[];
  onAddIncomeStream: (stream: IncomeStream) => void;
}

export function AddIncomeStreamDialog({
  open,
  onClose,
  availableAccounts,
  onAddIncomeStream,
}: AddIncomeStreamDialogProps) {
  const [newStreamName, setNewStreamName] = useState('');
  const [newStreamAccountId, setNewStreamAccountId] = useState<number | undefined>(undefined);
  const [newStreamMonthlyAmount, setNewStreamMonthlyAmount] = useState<number>(3000);
  const [newStreamFrequency, setNewStreamFrequency] = useState<'monthly' | 'biweekly' | 'semimonthly' | 'weekly'>('biweekly');
  const [newStreamIsTaxed, setNewStreamIsTaxed] = useState(true);
  const [newStreamTaxRate, setNewStreamTaxRate] = useState<number>(25);

  const handleAdd = () => {
    if (!newStreamName.trim() || newStreamMonthlyAmount <= 0) return;
    const acc = availableAccounts.find((a) => a.id === newStreamAccountId);
    let monthly = newStreamMonthlyAmount;
    if (newStreamFrequency === 'biweekly') {
      monthly = Math.round((newStreamMonthlyAmount * 26) / 12);
    } else if (newStreamFrequency === 'semimonthly') {
      monthly = Math.round(newStreamMonthlyAmount * 2);
    } else if (newStreamFrequency === 'weekly') {
      monthly = Math.round((newStreamMonthlyAmount * 52) / 12);
    }

    onAddIncomeStream({
      id: `custom-stream-${Date.now()}`,
      name: newStreamName.trim(),
      accountId: newStreamAccountId,
      accountName: acc?.name,
      monthlyAmount: monthly,
      paycheckAmount: newStreamMonthlyAmount,
      frequency: newStreamFrequency,
      isTaxed: newStreamIsTaxed,
      taxRate: newStreamIsTaxed ? undefined : Math.max(0, Math.min(60, newStreamTaxRate)),
      enabled: true,
      isOverridden: true,
    });
    setNewStreamName('');
    setNewStreamAccountId(undefined);
    setNewStreamMonthlyAmount(3000);
    setNewStreamFrequency('biweekly');
    setNewStreamIsTaxed(true);
    setNewStreamTaxRate(25);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
    >
      <DialogTitle>Add Income Stream</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Stream Name"
            placeholder="e.g. Consulting, Second Job, Rental Income"
            value={newStreamName}
            onChange={(e) => setNewStreamName(e.target.value)}
            fullWidth
            autoFocus
          />

          <FormControl fullWidth size="small">
            <Select
              value={newStreamAccountId ?? ''}
              displayEmpty
              onChange={(e) => setNewStreamAccountId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <MenuItem value="">
                <em>No linked account (Custom)</em>
              </MenuItem>
              {availableAccounts
                .filter((a) => a.type === 'checking' || a.type === 'savings')
                .map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Recurring Amount ($)"
                type="number"
                value={newStreamMonthlyAmount}
                onChange={(e) => setNewStreamMonthlyAmount(Number(e.target.value))}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <Select
                  value={newStreamFrequency}
                  onChange={(e) => setNewStreamFrequency(e.target.value as any)}
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="biweekly">Bi-weekly (26/yr)</MenuItem>
                  <MenuItem value="semimonthly">Semi-monthly (2x/mo)</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <FormControlLabel
            control={
              <Switch
                checked={newStreamIsTaxed}
                onChange={(e) => setNewStreamIsTaxed(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                {newStreamIsTaxed ? 'Already Taxed (Take-Home Pay)' : 'Pre-Tax (1099 / Self-Employed Gross)'}
              </Typography>
            }
          />

          {!newStreamIsTaxed && (
            <TextField
              size="small"
              label="Estimated Tax Reserve (%)"
              type="number"
              value={newStreamTaxRate}
              onChange={(e) => setNewStreamTaxRate(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
              helperText="Automatically reserves this % for taxes when projecting net cash flow"
              fullWidth
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          disabled={!newStreamName.trim() || newStreamMonthlyAmount <= 0}
          variant="contained"
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Add Stream
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface SaveScenarioDialogProps {
  open: boolean;
  onClose: () => void;
  scenarioName: string;
  setScenarioName: (name: string) => void;
  onSaveScenario: (name: string) => void;
}

export function SaveScenarioDialog({
  open,
  onClose,
  scenarioName,
  setScenarioName,
  onSaveScenario,
}: SaveScenarioDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
    >
      <DialogTitle>Save Scenario</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Scenario Name"
          type="text"
          fullWidth
          variant="standard"
          value={scenarioName}
          onChange={(e) => setScenarioName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && scenarioName) {
              onSaveScenario(scenarioName);
              onClose();
            }
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onSaveScenario(scenarioName);
            onClose();
          }}
          disabled={!scenarioName}
          variant="contained"
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
