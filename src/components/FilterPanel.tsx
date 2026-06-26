import {
  Box,
  Paper,
  Stack,
  Typography,
  Checkbox,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Button,
  IconButton,
  InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useFilters, resolveDateRange } from '../store';
import type { Account, Category, Transaction } from '../types';
import { usd, monthKey, monthsBetween } from '../lib';
import { useMemo, useState, useEffect } from 'react';
import { type RecurrenceInfo } from '../recurrence';
import { useBudgets, useConsolidatedRecurringMerchants, useSpendChartData } from '../hooks/queries';
import { useBudgetStore } from '../budgetStore';
import type { DashboardAggregates } from '../api';

export default function FilterPanel({
  accounts,
  categories,
  dashboardAggregates,
  allTxnCount,
  recurrenceMap,
}: {
  accounts: Account[];
  categories: Category[];
  dashboardAggregates: DashboardAggregates;
  allTxnCount: number;
  recurrenceMap?: Map<string, RecurrenceInfo>;
}) {
  const filters = useFilters();
  const totalSpend = Math.abs(dashboardAggregates.totalSpend);
  const totalIncome = dashboardAggregates.totalIncome;
  const netFlow = totalIncome - totalSpend;
  const { data: consolidatedMerchants = [] } = useConsolidatedRecurringMerchants();


  const [searchInput, setSearchInput] = useState(filters.searchQuery);

  useEffect(() => {
    if (filters.searchQuery !== searchInput) {
      setSearchInput(filters.searchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.searchQuery) {
        filters.setSearchQuery(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data: budgets } = useBudgets();
  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);



  const recurringProjected = useMemo(() => {
    const disabledSet = new Set(filters.disabledCategories);
    return consolidatedMerchants
      .filter((m) => !disabledSet.has(m.category) && !excludedBudgetCategories.has(m.category) && !excludedMerchants.has(m.merchantKey))
      .reduce((sum, m) => sum + m.monthlyAverage, 0);
  }, [consolidatedMerchants, filters.disabledCategories, excludedBudgetCategories, excludedMerchants]);

  const totalBudget = useMemo(() => {
    const recurringCategoryNames = new Set(
      (categories || []).filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
    );
    const activeBudgets = budgets
      ? budgets
          .filter((b) => !filters.disabledCategories.includes(b.category) && !excludedBudgetCategories.has(b.category) && !recurringCategoryNames.has(b.category))
          .reduce((sum, b) => sum + b.monthlyAmount, 0)
      : 0;
    return activeBudgets + recurringProjected;
  }, [budgets, filters.disabledCategories, excludedBudgetCategories, recurringProjected, categories]);

  const { cashBalance, creditDebt, startingCash } = useMemo(() => {
    if (!accounts) return { cashBalance: 0, creditDebt: 0, startingCash: 0 };
    const enabledSet = new Set(filters.enabledAccountIds);
    const cash = accounts
      .filter((a) => enabledSet.has(a.id!) && (a.type === 'checking' || a.type === 'savings'))
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    const debt = accounts
      .filter((a) => enabledSet.has(a.id!) && a.type === 'credit')
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    return {
      cashBalance: cash,
      creditDebt: debt,
      startingCash: Math.max(0, cash + debt),
    };
  }, [accounts, filters.enabledAccountIds]);

  const range = resolveDateRange(filters);
  const monthList = useMemo(() => monthsBetween(range.start, range.end), [range.start, range.end]);
  const lastMonthStr = monthList[monthList.length - 1];

  const { data: spendChartData = [] } = useSpendChartData();

  const currentMonthSpend = useMemo(() => {
    if (!spendChartData || !lastMonthStr) return 0;
    return spendChartData
      .filter((d) => d.month === lastMonthStr)
      .reduce((sum, d) => sum + Math.abs(d.total), 0);
  }, [spendChartData, lastMonthStr]);

  const remainingCurrentMonthBudget = Math.max(0, totalBudget - currentMonthSpend);
  const runwayMonths = totalBudget > 0 ? startingCash / totalBudget : 0;
  const accountTotals = dashboardAggregates.accountTotals;


  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, position: 'relative' }}>
        <Typography variant="overline" color="text.secondary">
          {filters.spendOnly ? 'Total spend in range' : 'Net flow in range'}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {filters.spendOnly
            ? usd.format(totalSpend)
            : netFlow > 0
            ? `+${usd.format(netFlow)}`
            : usd.format(netFlow)}
        </Typography>
        {!filters.spendOnly && (totalIncome > 0 || totalSpend > 0) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Income: +{usd.format(totalIncome)} · Spend: -{usd.format(totalSpend)}
          </Typography>
        )}
        <FormControlLabel
          sx={{ mt: 1, display: 'flex' }}
          control={
            <Checkbox
              checked={filters.spendOnly}
              onChange={(e) => {
                const checked = e.target.checked;
                filters.setSpendOnly(checked);
                if (!checked) {
                  const nonSpendNames = categories
                    .filter((c) => c.type !== 'spend')
                    .map((c) => c.name);
                  const cleaned = filters.disabledCategories.filter(
                    (name) => !nonSpendNames.includes(name)
                  );
                  filters.setDisabledCategories(cleaned);
                }
              }}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Spend only
            </Typography>
          }
        />
        <FormControlLabel
          sx={{ mt: 1, display: 'flex' }}
          control={
            <Checkbox
              checked={filters.showRunway || false}
              onChange={(e) => filters.setShowRunway(e.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Project runway
            </Typography>
          }
        />
        {filters.showRunway && (
          <Box sx={{ ml: 3, mb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              • Cash Balance: <strong>{usd.format(cashBalance)}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              • Credit CC Debt: <strong>{usd.format(Math.abs(creditDebt))}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              • Net Cash: <strong>{usd.format(startingCash)}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              • Monthly Outflow: <strong>{usd.format(totalBudget)}/mo</strong>
            </Typography>
            {remainingCurrentMonthBudget > 0 && (
              <Typography variant="caption" color="text.secondary">
                • Current month remaining: <strong>{usd.format(remainingCurrentMonthBudget)}</strong>
              </Typography>
            )}
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600, mt: 0.5 }}>
              Runway: {runwayMonths.toFixed(1)} months
            </Typography>
          </Box>
        )}
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Recurrence
          </Typography>
          <ToggleButtonGroup
            value={filters.recurrenceFilter}
            exclusive
            onChange={(_, v) => v && filters.setRecurrenceFilter(v)}
            size="small"
            fullWidth
            sx={{ '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="recurring">Recurring</ToggleButton>
            <ToggleButton value="onetime">One-Time</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search merchants..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            slotProps={{
              input: {
                endAdornment: searchInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchInput('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        </Box>
        
        {/* Price Range Filter */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Price Range ($)
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              placeholder="Min"
              type="number"
              value={filters.minPrice !== undefined ? filters.minPrice : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                filters.setMinPrice(val);
              }}
              slotProps={{
                htmlInput: { min: 0 },
                input: {
                  endAdornment: filters.minPrice !== undefined ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => filters.setMinPrice(undefined)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
              sx={{ flex: 1 }}
            />
            <Typography variant="caption" color="text.secondary">-</Typography>
            <TextField
              size="small"
              placeholder="Max"
              type="number"
              value={filters.maxPrice !== undefined ? filters.maxPrice : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                filters.setMaxPrice(val);
              }}
              slotProps={{
                htmlInput: { min: 0 },
                input: {
                  endAdornment: filters.maxPrice !== undefined ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => filters.setMaxPrice(undefined)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2">Accounts</Typography>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              onClick={() =>
                filters.setEnabledAccounts(accounts.map((a) => a.id!))
              }
            >
              All
            </Button>
            <Button size="small" onClick={() => filters.setEnabledAccounts([])}>
              None
            </Button>
          </Stack>
        </Stack>
        <Stack spacing={0.5}>
          {accounts.map((a) => {
            const total = accountTotals[a.id!] || 0;
            return (
              <FormControlLabel
                key={a.id}
                sx={{ ml: 0, width: '100%', '& .MuiFormControlLabel-label': { width: '100%', minWidth: 0, overflow: 'hidden' } }}
                control={
                  <Checkbox
                    size="small"
                    checked={filters.enabledAccountIds.includes(a.id!)}
                    onChange={() => filters.toggleAccount(a.id!)}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {a.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {usd.format(total)}
                    </Typography>
                  </Stack>
                }
              />
            );
          })}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2">Categories</Typography>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              onClick={() => filters.setDisabledCategories([])}
            >
              All
            </Button>
            <Button
              size="small"
              onClick={() =>
                filters.setDisabledCategories(categories.map((c) => c.name))
              }
            >
              None
            </Button>
          </Stack>
        </Stack>
        <Stack spacing={0.25}>
          {categories
            .filter((c) => !filters.spendOnly || c.type === 'spend')
            .map((c) => (
              <FormControlLabel
                key={c.id}
                sx={{ ml: 0, width: '100%', '& .MuiFormControlLabel-label': { width: '100%', minWidth: 0, overflow: 'hidden' } }}
                control={
                  <Checkbox
                    size="small"
                    checked={!filters.disabledCategories.includes(c.name)}
                    onChange={() => filters.toggleCategory(c.name)}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: c.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.name}</Typography>
                  </Stack>
                }
              />
            ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
