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
  Chip,
  Tooltip,
  Divider,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useFilters, resolveDateRange, isBusinessAccount } from '../stores/store';
import BalanceSheetModal from './BalanceSheetModal';
import type { Account, Category, Transaction } from '../types';
import { usd, monthKey, monthsBetween } from '../lib';
import { useMemo, useState, useEffect } from 'react';
import { type RecurrenceInfo } from '../domain/recurrence';
import { useBudgets, useConsolidatedRecurringMerchants, useSpendChartData } from '../hooks/queries';
import { useBudgetStore } from '../stores/budgetStore';
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
  const [isBalanceSheetOpen, setIsBalanceSheetOpen] = useState(false);

  const [soloCategory, setSoloCategory] = useState<string | null>(null);
  const [prevDisabledCategories, setPrevDisabledCategories] = useState<string[] | null>(null);

  const [soloAccountId, setSoloAccountId] = useState<number | null>(null);
  const [prevEnabledAccountIds, setPrevEnabledAccountIds] = useState<number[] | null>(null);

  const handleToggleSoloCategory = (catName: string) => {
    if (soloCategory === catName) {
      filters.setDisabledCategories(prevDisabledCategories ?? []);
      setSoloCategory(null);
      setPrevDisabledCategories(null);
    } else {
      if (soloCategory === null) {
        setPrevDisabledCategories(filters.disabledCategories);
      }
      setSoloCategory(catName);
      const allOtherCatNames = categories
        .filter((c) => c.name !== catName)
        .map((c) => c.name);
      filters.setDisabledCategories(allOtherCatNames);
    }
  };

  const handleToggleSoloAccount = (accountId: number) => {
    if (soloAccountId === accountId) {
      const allAccountIds = accounts
        .map((a) => a.id!)
        .filter((id): id is number => typeof id === 'number');
      filters.setEnabledAccounts(prevEnabledAccountIds ?? allAccountIds);
      setSoloAccountId(null);
      setPrevEnabledAccountIds(null);
    } else {
      if (soloAccountId === null) {
        setPrevEnabledAccountIds(filters.enabledAccountIds);
      }
      setSoloAccountId(accountId);
      filters.setEnabledAccounts([accountId]);
    }
  };

  useEffect(() => {
    if (soloCategory !== null) {
      const isSoloActive =
        !filters.disabledCategories.includes(soloCategory) &&
        categories.every(
          (c) => c.name === soloCategory || filters.disabledCategories.includes(c.name)
        );
      if (!isSoloActive) {
        setSoloCategory(null);
        setPrevDisabledCategories(null);
      }
    }
  }, [filters.disabledCategories, soloCategory, categories]);

  useEffect(() => {
    if (soloAccountId !== null) {
      const isSoloActive =
        filters.enabledAccountIds.length === 1 &&
        filters.enabledAccountIds[0] === soloAccountId;
      if (!isSoloActive) {
        setSoloAccountId(null);
        setPrevEnabledAccountIds(null);
      }
    }
  }, [filters.enabledAccountIds, soloAccountId]);

  const accountGroups = useMemo(() => {
    const groups: {
      key: string;
      title: string;
      icon: React.ReactNode;
      accounts: Account[];
      subtotal: number;
    }[] = [
      {
        key: 'cash',
        title: 'Cash & Savings',
        icon: <SavingsIcon sx={{ fontSize: 16 }} color="action" />,
        accounts: [],
        subtotal: 0,
      },
      {
        key: 'credit',
        title: 'Credit Cards',
        icon: <CreditCardIcon sx={{ fontSize: 16 }} color="action" />,
        accounts: [],
        subtotal: 0,
      },
      {
        key: 'investment',
        title: 'Investments',
        icon: <TrendingUpIcon sx={{ fontSize: 16 }} color="primary" />,
        accounts: [],
        subtotal: 0,
      },
      {
        key: 'loan',
        title: 'Loans & Mortgages',
        icon: <DirectionsCarIcon sx={{ fontSize: 16 }} color="action" />,
        accounts: [],
        subtotal: 0,
      },
    ];

    for (const a of accounts) {
      if (a.type === 'checking' || a.type === 'savings') {
        groups[0].accounts.push(a);
        groups[0].subtotal += (a.currentBalance || 0);
      } else if (a.type === 'credit') {
        groups[1].accounts.push(a);
        groups[1].subtotal += (a.currentBalance || 0);
      } else if (a.type === 'investment') {
        groups[2].accounts.push(a);
        groups[2].subtotal += (a.currentBalance || 0);
      } else if (a.type === 'loan' || a.type === 'mortgage') {
        groups[3].accounts.push(a);
        groups[3].subtotal += (a.currentBalance || 0);
      } else {
        groups[0].accounts.push(a);
        groups[0].subtotal += (a.currentBalance || 0);
      }
    }

    return groups.filter((g) => g.accounts.length > 0);
  }, [accounts]);

  const toggleGroup = (groupAccounts: Account[]) => {
    if (soloAccountId !== null) {
      setSoloAccountId(null);
      setPrevEnabledAccountIds(null);
    }
    const groupIds = groupAccounts
      .map((a) => a.id!)
      .filter((id): id is number => typeof id === 'number');
    const allEnabled = groupIds.every((id) => filters.enabledAccountIds.includes(id));
    if (allEnabled) {
      filters.setEnabledAccounts(
        filters.enabledAccountIds.filter((id) => !groupIds.includes(id))
      );
    } else {
      const newIds = Array.from(new Set([...filters.enabledAccountIds, ...groupIds]));
      filters.setEnabledAccounts(newIds);
    }
  };

  const handleSelectAll = () => {
    setSoloAccountId(null);
    setPrevEnabledAccountIds(null);
    if (filters.profile === 'business') {
      filters.setEnabledAccounts(
        accounts
          .filter((a) => isBusinessAccount(a))
          .map((a) => a.id!)
          .filter((id): id is number => typeof id === 'number')
      );
    } else if (filters.profile === 'personal') {
      filters.setEnabledAccounts(
        accounts
          .filter((a) => !isBusinessAccount(a))
          .map((a) => a.id!)
          .filter((id): id is number => typeof id === 'number')
      );
    } else {
      filters.setEnabledAccounts(
        accounts.map((a) => a.id!).filter((id): id is number => typeof id === 'number')
      );
    }
  };

  useEffect(() => {
    if (filters.searchQuery !== searchInput) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <Paper
        elevation={2}
        sx={{
          p: 2,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: (theme) =>
            theme.palette.mode === 'dark'
              ? '0 4px 20px rgba(0, 0, 0, 0.5)'
              : '0 4px 14px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {filters.transactionType === 'income'
            ? 'Total income in range'
            : filters.transactionType === 'spend'
            ? 'Total spend in range'
            : 'Net flow in range'}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: filters.transactionType === 'income'
              ? 'success.main'
              : filters.transactionType === 'all' && netFlow > 0
              ? 'success.main'
              : 'text.primary',
          }}
        >
          {filters.transactionType === 'income'
            ? `+${usd.format(totalIncome)}`
            : filters.transactionType === 'spend'
            ? usd.format(totalSpend)
            : netFlow > 0
            ? `+${usd.format(netFlow)}`
            : usd.format(netFlow)}
        </Typography>

        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 0.75,
              px: 1,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) => filters.transactionType === 'income' ? alpha(theme.palette.success.main, 0.16) : 'action.hover',
              border: '1px solid',
              borderColor: (theme) => filters.transactionType === 'income' ? 'success.main' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.22),
              },
            }}
            onClick={() => {
              filters.setTransactionType('income');
              const nonSpendNames = categories
                .filter((c) => c.type !== 'spend')
                .map((c) => c.name);
              const cleaned = filters.disabledCategories.filter(
                (name) => !nonSpendNames.includes(name)
              );
              filters.setDisabledCategories(cleaned);
            }}
            title="Click to switch to Income view"
          >
            <Stack direction="row" spacing={0.75} alignItems="center">
              <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>
                Income
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
              +{usd.format(totalIncome)} →
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 0.75,
              px: 1,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) => filters.transactionType === 'spend' ? 'action.selected' : 'action.hover',
              border: '1px solid',
              borderColor: (theme) => filters.transactionType === 'spend' ? 'divider' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              '&:hover': { bgcolor: 'action.selected' },
            }}
            onClick={() => {
              filters.setTransactionType('spend');
            }}
            title="Click to switch to Expenses view"
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Expenses
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
              -{usd.format(totalSpend)} →
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            TRANSACTION TYPE
          </Typography>
          <FormControl size="small" fullWidth sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <Select
              variant="outlined"
              value={filters.transactionType}
              onChange={(e) => {
                const v = e.target.value as 'spend' | 'income' | 'all';
                filters.setTransactionType(v);
                if (v === 'income' || v === 'all') {
                  const nonSpendNames = categories
                    .filter((c) => c.type !== 'spend')
                    .map((c) => c.name);
                  const cleaned = filters.disabledCategories.filter(
                    (name) => !nonSpendNames.includes(name)
                  );
                  filters.setDisabledCategories(cleaned);
                }
              }}
              sx={{ height: 34, fontSize: '0.82rem', fontWeight: 600 }}
            >
              <MenuItem value="spend">Expenses Only</MenuItem>
              <MenuItem value="income">Income Only</MenuItem>
              <MenuItem value="all">All Transactions</MenuItem>
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={filters.transactionType}
            exclusive
            onChange={(_, v) => {
              if (v) {
                filters.setTransactionType(v);
                if (v === 'income' || v === 'all') {
                  const nonSpendNames = categories
                    .filter((c) => c.type !== 'spend')
                    .map((c) => c.name);
                  const cleaned = filters.disabledCategories.filter(
                    (name) => !nonSpendNames.includes(name)
                  );
                  filters.setDisabledCategories(cleaned);
                }
              }
            }}
            size="small"
            fullWidth
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 12,
                py: 0.5,
              },
            }}
          >
            <ToggleButton value="spend">Expenses</ToggleButton>
            <ToggleButton value="income" sx={{ color: filters.transactionType === 'income' ? 'success.main' : undefined }}>
              Income
            </ToggleButton>
            <ToggleButton value="all">All</ToggleButton>
          </ToggleButtonGroup>
        </Box>
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
          <FormControl size="small" fullWidth sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <Select
              variant="outlined"
              value={filters.recurrenceFilter}
              onChange={(e) => filters.setRecurrenceFilter(e.target.value as 'all' | 'recurring' | 'onetime')}
              sx={{ height: 34, fontSize: '0.82rem', fontWeight: 600 }}
            >
              <MenuItem value="all">All Frequencies</MenuItem>
              <MenuItem value="recurring">Recurring Bills Only</MenuItem>
              <MenuItem value="onetime">One-Time Spend Only</MenuItem>
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={filters.recurrenceFilter}
            exclusive
            onChange={(_, v) => v && filters.setRecurrenceFilter(v)}
            size="small"
            fullWidth
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}
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
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Accounts
            </Typography>
            {filters.profile !== 'all' && (
              <Chip
                label={filters.profile === 'business' ? 'WEBTIME LLC' : 'Personal'}
                size="small"
                color={filters.profile === 'business' ? 'primary' : 'default'}
                sx={{ height: 18, fontSize: 10, fontWeight: 600, mt: 0.25 }}
              />
            )}
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {soloAccountId !== null && (
              <Chip
                label="Solo active"
                size="small"
                color="primary"
                variant="outlined"
                onDelete={() => handleToggleSoloAccount(soloAccountId)}
                sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
              />
            )}
            <Button size="small" onClick={handleSelectAll}>
              All
            </Button>
            <Button
              size="small"
              onClick={() => {
                setSoloAccountId(null);
                setPrevEnabledAccountIds(null);
                filters.setEnabledAccounts([]);
              }}
            >
              None
            </Button>
          </Stack>
        </Stack>

        <Stack spacing={2}>
          {accountGroups.map((group) => {
            return (
              <Box key={group.key}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    pb: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => toggleGroup(group.accounts)}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    {group.icon}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}
                    >
                      {group.title} ({group.accounts.length})
                    </Typography>
                  </Stack>
                  <Tooltip title="Click group header to toggle all">
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: group.subtotal < 0 ? 'error.main' : 'text.secondary',
                      }}
                    >
                      {usd.format(group.subtotal)}
                    </Typography>
                  </Tooltip>
                </Stack>

                <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                  {group.accounts.map((a) => {
                    const total = accountTotals[a.id!] || 0;
                    const isBusiness = isBusinessAccount(a);
                    const isChecked = filters.enabledAccountIds.includes(a.id!);
                    const isSolo = soloAccountId === a.id;
                    return (
                      <Box
                        key={a.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          px: 0.5,
                          py: 0.2,
                          borderRadius: 1,
                          transition: 'background-color 0.15s ease',
                          bgcolor: isSolo ? (theme) => alpha(theme.palette.primary.main, 0.12) : 'transparent',
                          '&:hover': {
                            bgcolor: (theme) =>
                              isSolo
                                ? alpha(theme.palette.primary.main, 0.18)
                                : alpha(theme.palette.action.hover, 0.06),
                            '& .solo-eye-btn': {
                              opacity: 0.85,
                            },
                          },
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          onChange={() => {
                            if (soloAccountId !== null) {
                              setSoloAccountId(null);
                              setPrevEnabledAccountIds(null);
                            }
                            filters.toggleAccount(a.id!);
                          }}
                          sx={{ p: 0.5 }}
                        />
                        <Tooltip
                          title={isSolo ? 'Clear solo (restore accounts)' : `Show only ${cleanAccountLabel(a.name)}`}
                          arrow
                          placement="top"
                        >
                          <IconButton
                            size="small"
                            className="solo-eye-btn"
                            aria-label={isSolo ? 'Clear solo' : `Show only ${cleanAccountLabel(a.name)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSoloAccount(a.id!);
                            }}
                            sx={{
                              p: 0.25,
                              mr: 0.75,
                              opacity: isSolo ? 1 : 0.35,
                              color: isSolo ? 'primary.main' : 'text.secondary',
                              transition: 'opacity 0.15s, color 0.15s, transform 0.1s',
                              '&:hover': {
                                opacity: 1,
                                color: 'primary.main',
                                transform: 'scale(1.15)',
                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                              },
                            }}
                          >
                            {isSolo ? (
                              <VisibilityIcon sx={{ fontSize: 16 }} />
                            ) : (
                              <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          onClick={() => {
                            if (soloAccountId !== null) {
                              setSoloAccountId(null);
                              setPrevEnabledAccountIds(null);
                            }
                            filters.toggleAccount(a.id!);
                          }}
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            cursor: 'pointer',
                            userSelect: 'none',
                            py: 0.25,
                          }}
                        >
                          <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            {getAccountTypeIcon(a.type)}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography
                                variant="body2"
                                sx={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  fontWeight: isSolo ? 700 : 400,
                                  color: isSolo ? 'primary.main' : 'text.primary',
                                }}
                              >
                                {cleanAccountLabel(a.name)}
                              </Typography>
                              {isSolo && (
                                <Chip
                                  label="ONLY"
                                  size="small"
                                  color="primary"
                                  sx={{
                                    height: 14,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    borderRadius: 0.5,
                                  }}
                                />
                              )}
                            </Stack>
                            {isBusiness && (
                              <Chip
                                label="WEBTIME"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{
                                  height: 14,
                                  fontSize: 8,
                                  mt: 0.1,
                                  borderRadius: (theme) =>
                                    `${Math.max(2, Math.round(Number(theme.shape.borderRadius || 8) * 0.5))}px`,
                                }}
                              />
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Tooltip
                              title={
                                total !== 0
                                  ? `Current account balance: ${usd.format(a.currentBalance ?? 0)} • Activity in selected date range: ${usd.format(total)}`
                                  : `Current account balance: ${usd.format(a.currentBalance ?? 0)}`
                              }
                              arrow
                              placement="left"
                            >
                              <Typography
                                variant="caption"
                                color={
                                  isSolo
                                    ? 'primary.main'
                                    : (a.currentBalance ?? 0) < 0
                                    ? 'error.main'
                                    : 'text.primary'
                                }
                                sx={{
                                  display: 'block',
                                  fontWeight: isSolo ? 700 : 600,
                                  fontVariantNumeric: 'tabular-nums',
                                  lineHeight: 1.2,
                                }}
                              >
                                {usd.format(a.currentBalance ?? 0)}
                              </Typography>
                            </Tooltip>
                            {total !== 0 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: 'block',
                                  fontSize: '0.64rem',
                                  fontVariantNumeric: 'tabular-nums',
                                  lineHeight: 1.15,
                                }}
                              >
                                Range: {usd.format(total)}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Button
          fullWidth
          variant="outlined"
          size="small"
          onClick={() => setIsBalanceSheetOpen(true)}
          startIcon={<AccountBalanceWalletOutlinedIcon fontSize="small" />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderColor: 'divider',
            color: 'text.primary',
            justifyContent: 'space-between',
            px: 1.5,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <span>Balance Sheet & Net Worth</span>
          <Chip
            label="View"
            size="small"
            color="primary"
            variant="outlined"
            sx={{
              height: 20,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          />
        </Button>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2">Categories</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {soloCategory !== null && (
              <Chip
                label="Solo active"
                size="small"
                color="primary"
                variant="outlined"
                onDelete={() => handleToggleSoloCategory(soloCategory)}
                sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
              />
            )}
            <Button
              size="small"
              onClick={() => {
                setSoloCategory(null);
                setPrevDisabledCategories(null);
                filters.setDisabledCategories([]);
              }}
            >
              All
            </Button>
            <Button
              size="small"
              onClick={() => {
                setSoloCategory(null);
                setPrevDisabledCategories(null);
                filters.setDisabledCategories(categories.map((c) => c.name));
              }}
            >
              None
            </Button>
          </Stack>
        </Stack>
        <Stack spacing={0.25}>
          {categories
            .filter((c) => {
              if (filters.transactionType === 'income') return c.type === 'income' || c.name === 'Income';
              if (filters.transactionType === 'spend') return c.type === 'spend';
              return true;
            })
            .slice()
            .sort((a, b) => {
              const aChecked = !filters.disabledCategories.includes(a.name);
              const bChecked = !filters.disabledCategories.includes(b.name);
              if (aChecked !== bChecked) return aChecked ? -1 : 1;
              return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            })
            .map((c) => {
              const isChecked = !filters.disabledCategories.includes(c.name);
              const isSolo = soloCategory === c.name;
              return (
                <Box
                  key={c.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    px: 0.5,
                    py: 0.2,
                    borderRadius: 1,
                    transition: 'background-color 0.15s ease',
                    bgcolor: isSolo ? (theme) => alpha(theme.palette.primary.main, 0.12) : 'transparent',
                    '&:hover': {
                      bgcolor: (theme) =>
                        isSolo
                          ? alpha(theme.palette.primary.main, 0.18)
                          : alpha(theme.palette.action.hover, 0.06),
                      '& .solo-eye-btn': {
                        opacity: 0.85,
                      },
                    },
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={isChecked}
                    onChange={() => {
                      if (soloCategory !== null) {
                        setSoloCategory(null);
                        setPrevDisabledCategories(null);
                      }
                      filters.toggleCategory(c.name);
                    }}
                    sx={{ p: 0.5 }}
                  />
                  <Tooltip
                    title={isSolo ? 'Clear solo (restore categories)' : `Show only ${c.name}`}
                    arrow
                    placement="top"
                  >
                    <IconButton
                      size="small"
                      className="solo-eye-btn"
                      aria-label={isSolo ? 'Clear solo' : `Show only ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSoloCategory(c.name);
                      }}
                      sx={{
                        p: 0.25,
                        mr: 0.75,
                        opacity: isSolo ? 1 : 0.35,
                        color: isSolo ? 'primary.main' : 'text.secondary',
                        transition: 'opacity 0.15s, color 0.15s, transform 0.1s',
                        '&:hover': {
                          opacity: 1,
                          color: 'primary.main',
                          transform: 'scale(1.15)',
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        },
                      }}
                    >
                      {isSolo ? (
                        <VisibilityIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    onClick={() => {
                      if (soloCategory !== null) {
                        setSoloCategory(null);
                        setPrevDisabledCategories(null);
                      }
                      filters.toggleCategory(c.name);
                    }}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      cursor: 'pointer',
                      userSelect: 'none',
                      py: 0.25,
                    }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: c.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                        fontWeight: isSolo ? 700 : 400,
                        color: isSolo ? 'primary.main' : 'text.primary',
                      }}
                    >
                      {c.name}
                    </Typography>
                    {isSolo && (
                      <Chip
                        label="ONLY"
                        size="small"
                        color="primary"
                        sx={{
                          height: 16,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          borderRadius: 0.5,
                          mr: 0.5,
                        }}
                      />
                    )}
                  </Stack>
                </Box>
              );
            })}
        </Stack>
      </Paper>

      <BalanceSheetModal
        open={isBalanceSheetOpen}
        onClose={() => setIsBalanceSheetOpen(false)}
        defaultProfile={filters.profile}
      />
    </Stack>
  );
}

function getAccountTypeIcon(type?: string) {
  switch (type) {
    case 'savings':
      return <SavingsIcon sx={{ fontSize: 16 }} color="action" />;
    case 'credit':
      return <CreditCardIcon sx={{ fontSize: 16 }} color="action" />;
    case 'investment':
      return <TrendingUpIcon sx={{ fontSize: 16 }} color="primary" />;
    case 'loan':
      return <DirectionsCarIcon sx={{ fontSize: 16 }} color="action" />;
    case 'mortgage':
      return <HomeIcon sx={{ fontSize: 16 }} color="action" />;
    case 'checking':
    default:
      return <AccountBalanceIcon sx={{ fontSize: 16 }} color="action" />;
  }
}

function cleanAccountLabel(name: string): string {
  return name
    .replace('Bank of America', 'BoA')
    .replace('Business Adv Customized Cash Rewards', 'Business Adv')
    .replace('CORP Account - Business Adv', 'WEBTIME CORP')
    .replace('Customized Cash Rewards', 'Customized Cash')
    .replace('Adv Plus Banking-', 'Adv Plus');
}
