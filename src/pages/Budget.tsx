import { useMemo, useState, useEffect } from 'react';
import { useCategories, useMerchantOverrides, useBudgets, useCategoryTrailingAverages, useConsolidatedRecurringMerchants, useLastMonthActualSpend, useTransactionCount } from '../hooks/queries';
import { api } from '../api';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  TableRow,
  TableCell,
  TableBody,
  Switch,
  Tooltip,
  Alert,
  Collapse,
  IconButton,
  TextField,
  InputAdornment,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import { usd, usdCents } from '../lib';
import { type ConsolidatedMerchant } from '../budgets';
import { useBudgetStore } from '../budgetStore';
import { useFilters } from '../store';
import PageLoader from '../components/PageLoader';
import DataTable from '../components/DataTable';
import type { Budget as BudgetType, Category } from '../types';
import { useDeferredRender } from '../hooks/useDeferredRender';

export default function Budget() {
  const demoMode = useFilters((s) => s.demoMode);
  const { data: categories = [], isLoading: isCatLoading } = useCategories();
  const { data: overrides = [], isLoading: isOverridesLoading } = useMerchantOverrides();
  const { data: budgets = [], isLoading: isBudgetsLoading } = useBudgets();
  const { data: trailingAverages = [], isLoading: isTrailingLoading } = useCategoryTrailingAverages();
  const { data: consolidatedMerchants = [], isLoading: isConsolidatedLoading } = useConsolidatedRecurringMerchants();
  const { data: lastMonth = 0, isLoading: isLastMonthLoading } = useLastMonthActualSpend();
  const { data: dbTxnCount = 0, isLoading: isCountLoading } = useTransactionCount();

  const isDataLoading = isCatLoading || isOverridesLoading || isBudgetsLoading || isTrailingLoading || isConsolidatedLoading || isLastMonthLoading || isCountLoading;

  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);
  const toggleMerchant = useBudgetStore((s) => s.toggleMerchant);
  const toggleBudgetCategory = useBudgetStore((s) => s.toggleBudgetCategory);
  const reset = useBudgetStore((s) => s.reset);

  const spendCategories = useMemo(
    () => (categories || []).filter((c) => c.type === 'spend'),
    [categories]
  );

  const trailingAvgByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of trailingAverages) {
      map.set(item.category, item.average);
    }
    return map;
  }, [trailingAverages]);

  // Auto-seed budgets for any category with trailing spend but no budget row yet.
  useEffect(() => {
    if (!budgets || !categories || trailingAvgByCategory.size === 0) return;
    const existing = new Set(budgets.map((b) => b.category));
    const toAdd: BudgetType[] = [];
    for (const [cat, avg] of trailingAvgByCategory) {
      if (existing.has(cat)) continue;
      toAdd.push({
        category: cat,
        monthlyAmount: Math.round(avg * 100) / 100,
        userSet: false,
      });
    }
    if (toAdd.length > 0) {
      api.bulkPutBudgets(toAdd);
    }
  }, [budgets, categories, trailingAvgByCategory]);

  const isLoading = isDataLoading || !categories || !overrides || !budgets;
  const recurringCategoryNames = useMemo(() => new Set(
    spendCategories.filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
  ), [spendCategories]);


  const merchantsByCategory = useMemo(() => {
    const map = new Map<string, ConsolidatedMerchant[]>();
    for (const m of consolidatedMerchants) {
      const arr = map.get(m.category) || [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return map;
  }, [consolidatedMerchants]);

  const recurringCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const [cat, arr] of merchantsByCategory) {
      const total = arr.filter((m) => !excludedMerchants.has(m.merchantKey)).reduce((s, m) => s + m.monthlyAverage, 0);
      map.set(cat, total);
    }
    return map;
  }, [merchantsByCategory, excludedMerchants]);

  const shouldRender = useDeferredRender();

  if (isLoading || !shouldRender) {
    return <PageLoader isLoading={true}><Box /></PageLoader>;
  }

  if (dbTxnCount === 0) {
    return (
      <PageLoader isLoading={isLoading}>
        <Stack spacing={2}>
          <Typography variant="h5">Budget</Typography>
          <Alert severity="info">
            No transactions yet. Import a CSV from the Import tab first.
          </Alert>
        </Stack>
      </PageLoader>
    );
  }



  const recurringBudgets = (budgets || []).filter((b) => recurringCategoryNames.has(b.category));
  const oneTimeBudgets = (budgets || []).filter((b) => !recurringCategoryNames.has(b.category));

  const recurringProjected = Array.from(recurringCategoryNames)
    .filter((cat) => !excludedBudgetCategories.has(cat))
    .reduce((s, cat) => s + (recurringCategoryTotals.get(cat) || 0), 0);
  const budgetProjected = oneTimeBudgets
    .filter((b) => !excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const projected = recurringProjected + budgetProjected;

  const recurringExcludedSavings = consolidatedMerchants
    .filter((m) => excludedMerchants.has(m.merchantKey) && !excludedBudgetCategories.has(m.category))
    .reduce((s, m) => s + m.monthlyAverage, 0);
  const budgetExcludedSavings = oneTimeBudgets
    .filter((b) => excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const savings = recurringExcludedSavings + budgetExcludedSavings;

  const totalExclusions = excludedBudgetCategories.size + excludedMerchants.size;

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h5">Budget next month</Typography>
          {totalExclusions > 0 && (
            <Button onClick={reset} size="small">
              Reset toggles
            </Button>
          )}
        </Stack>

        <Paper sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={4}
            alignItems="baseline"
          >
            <Box>
              <Typography variant="overline" color="text.secondary">
                Projected next month
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {usd.format(projected)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Recurring {usd.format(recurringProjected)} + Budgets{' '}
                {usd.format(budgetProjected)} · Last month actual:{' '}
                {usd.format(lastMonth)}
              </Typography>
            </Box>
            {savings > 0 && (
              <Box>
                <Typography variant="overline" color="success.main">
                  Cuts save
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ fontWeight: 700, color: 'success.main' }}
                >
                  {usd.format(savings)}
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 0.5 }}
                  >
                    /mo
                  </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ≈ {usd.format(savings * 12)} / year
                </Typography>
              </Box>
            )}
            <Box sx={{ ml: { md: 'auto' }, textAlign: { md: 'right' } }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {recurringBudgets.length} recurring categor{recurringBudgets.length === 1 ? 'y' : 'ies'}
                · {oneTimeBudgets.length} variable categor{oneTimeBudgets.length === 1 ? 'y' : 'ies'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {totalExclusions} excluded
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <RecurringBudgetCard
          categories={spendCategories}
          recurringCategoryNames={recurringCategoryNames}
          merchantsByCategory={merchantsByCategory}
          categoryTotals={recurringCategoryTotals}
          excludedCategories={excludedBudgetCategories}
          excludedMerchants={excludedMerchants}
          onToggleCategory={toggleBudgetCategory}
          onToggleMerchant={toggleMerchant}
        />
        <BudgetCard
          title="Variable Spend / One-Time"
          subtitle="Set what you want to spend per category next month. Initial values auto-seeded from your trailing 3-month actuals."
          emptyMessage="No one-time spend in the last 90 days."
          budgets={oneTimeBudgets}
          categories={spendCategories}
          trailingAvgByCategory={trailingAvgByCategory}
          excluded={excludedBudgetCategories}
          onToggle={toggleBudgetCategory}
        />
      </Stack>
    </PageLoader>
  );
}

// ----- Budget amount editor with local state (new) -----

function BudgetAmountInput({
  category,
  initialAmount,
  disabled,
}: {
  category: string;
  initialAmount: number;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(() => initialAmount.toFixed(2));

  useEffect(() => {
    setValue(initialAmount.toFixed(2));
  }, [initialAmount]);

  const saveToDb = async (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const amount = Number(cleaned) || 0;
    await api.putBudget({ category, monthlyAmount: amount, userSet: true });
    setValue(amount.toFixed(2));
  };

  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => saveToDb(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          saveToDb(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">$</InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">/mo</InputAdornment>
          ),
          inputMode: 'decimal',
        },
      }}
      disabled={disabled}
    />
  );
}

// ----- Budget card (new) -----

function BudgetCard({
  title,
  subtitle,
  emptyMessage,
  budgets,
  categories,
  trailingAvgByCategory,
  excluded,
  onToggle,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  budgets: BudgetType[];
  categories: Category[];
  trailingAvgByCategory: Map<string, number>;
  excluded: Set<string>;
  onToggle: (category: string) => void;
}) {
  const subtotal = budgets
    .filter((b) => !excluded.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  const sorted = useMemo(
    () => budgets.slice().sort((a, b) => b.monthlyAmount - a.monthlyAmount),
    [budgets]
  );

  const onResetRow = async (category: string) => {
    const avg = trailingAvgByCategory.get(category) || 0;
    await api.putBudget({
      category,
      monthlyAmount: Math.round(avg * 100) / 100,
      userSet: false,
    });
  };

  const onResetAll = async () => {
    if (!confirm('Reset all budgets to your trailing 3-month actuals?')) return;
    const next: BudgetType[] = budgets.map((b) => ({
      category: b.category,
      monthlyAmount:
        Math.round((trailingAvgByCategory.get(b.category) || 0) * 100) / 100,
      userSet: false,
    }));
    await api.clearBudgets();
    if (next.length > 0) {
      await api.bulkPutBudgets(next);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button size="small" onClick={onResetAll} startIcon={<RestartAltIcon />}>
            Reset all to actuals
          </Button>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="overline" color="text.secondary">
              Subtotal
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {usd.format(subtotal)}
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ ml: 0.5 }}
              >
                /mo
              </Typography>
            </Typography>
          </Box>
        </Stack>
      </Stack>

      {sorted.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          {emptyMessage}
        </Box>
      ) : (
        <DataTable component={Box} containerSx={{ border: 'none', borderRadius: 0 }} size="small">
          <TableBody>
            {sorted.map((b) => {
              const isExcluded = excluded.has(b.category);
              const avg = trailingAvgByCategory.get(b.category) || 0;
              const diff = b.monthlyAmount - avg;
              const diffPct = avg > 0 ? Math.abs(diff / avg) * 100 : 0;
              const color = categoryColor(b.category);
              return (
                <TableRow
                  key={b.category}
                  hover
                  sx={{
                    opacity: isExcluded ? 0.4 : 1,
                    '& td': { borderBottom: '1px solid rgba(0,0,0,0.06)' },
                  }}
                >
                  <TableCell sx={{ width: 240 }}>
                     <Stack direction="row" spacing={1} alignItems="center">
                       <Box
                         sx={{
                           width: 10,
                           height: 10,
                           borderRadius: '50%',
                           bgcolor: color,
                         }}
                       />
                       <Typography
                         variant="body2"
                         sx={{
                           fontWeight: 600,
                           textDecoration: isExcluded ? 'line-through' : 'none',
                         }}
                       >
                         {b.category}
                       </Typography>
                       {b.userSet && (
                         <Typography
                           variant="caption"
                           color="primary.main"
                           sx={{ fontWeight: 600 }}
                         >
                           edited
                         </Typography>
                       )}
                     </Stack>
                   </TableCell>
                  <TableCell sx={{ width: 200 }}>
                    <BudgetAmountInput
                      category={b.category}
                      initialAmount={b.monthlyAmount}
                      disabled={isExcluded}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Trailing 3-mo avg: {usdCents.format(avg)}
                      </Typography>
                      {b.userSet && avg > 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            color: diff < 0 ? 'success.main' : 'warning.main',
                          }}
                        >
                          {diff < 0 ? '↓' : '↑'} {usdCents.format(Math.abs(diff))}{' '}
                          ({diffPct.toFixed(0)}%)
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 80 }}>
                    {b.userSet && (
                      <Tooltip title="Reset to trailing avg">
                        <IconButton
                          size="small"
                          onClick={() => onResetRow(b.category)}
                        >
                          <RestartAltIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ width: 60 }}>
                    <Switch
                      size="small"
                      checked={!isExcluded}
                      onChange={() => onToggle(b.category)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}
    </Paper>
  );
}


// ----- Recurring Budget Card -----
function RecurringBudgetCard({
  categories,
  recurringCategoryNames,
  merchantsByCategory,
  categoryTotals,
  excludedCategories,
  excludedMerchants,
  onToggleCategory,
  onToggleMerchant,
}: {
  categories: Category[];
  recurringCategoryNames: Set<string>;
  merchantsByCategory: Map<string, ConsolidatedMerchant[]>;
  categoryTotals: Map<string, number>;
  excludedCategories: Set<string>;
  excludedMerchants: Set<string>;
  onToggleCategory: (category: string) => void;
  onToggleMerchant: (merchantKey: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (category: string) => {
    const next = new Set(expanded);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setExpanded(next);
  };

  const sortedCategories = Array.from(recurringCategoryNames).sort((a, b) => {
    return (categoryTotals.get(b) || 0) - (categoryTotals.get(a) || 0);
  });

  const subtotal = sortedCategories
    .filter((cat) => !excludedCategories.has(cat))
    .reduce((s, cat) => s + (categoryTotals.get(cat) || 0), 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Recurring Categories
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Consolidated underlying charges from the previous 2 months. Turn them off and on to adjust the budget.
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="overline" color="text.secondary">
            Subtotal
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {usd.format(subtotal)}
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ ml: 0.5 }}
            >
              /mo
            </Typography>
          </Typography>
        </Box>
      </Stack>

      {sortedCategories.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          No recurring categories found.
        </Box>
      ) : (
        <Stack spacing={1}>
          {sortedCategories.map((cat) => {
            const isExcluded = excludedCategories.has(cat);
            const total = categoryTotals.get(cat) || 0;
            const merchants = merchantsByCategory.get(cat) || [];
            const isExpanded = expanded.has(cat);
            const color = categoryColor(cat);

            return (
              <Box
                key={cat}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: isExcluded ? 'action.hover' : 'background.paper',
                  overflow: 'hidden',
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  onClick={() => toggleExpand(cat)}
                  sx={{
                    p: 1.5,
                    cursor: merchants.length > 0 ? 'pointer' : 'default',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    sx={{ p: 0.5 }}
                    disabled={merchants.length === 0}
                  >
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                  
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: color,
                    }}
                  />

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 600,
                      flex: 1,
                      textDecoration: isExcluded ? 'line-through' : 'none',
                      opacity: isExcluded ? 0.5 : 1,
                    }}
                  >
                    {cat}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.75 }}
                    >
                      {merchants.length} merchant{merchants.length === 1 ? '' : 's'}
                    </Typography>
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      textDecoration: isExcluded ? 'line-through' : 'none',
                      opacity: isExcluded ? 0.5 : 1,
                    }}
                  >
                    {usd.format(total)}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.5 }}
                    >
                      /mo
                    </Typography>
                  </Typography>

                  <Switch
                    size="small"
                    checked={!isExcluded}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleCategory(cat);
                    }}
                  />
                </Stack>
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <DataTable component={Box} containerSx={{ border: 'none', borderRadius: 0, borderTop: '1px solid rgba(0,0,0,0.06)' }} size="small">
                    <TableBody>
                      {merchants.map((item) => {
                        const mExcluded = excludedMerchants.has(item.merchantKey);
                        return (
                          <TableRow
                            key={item.merchantKey}
                            hover
                            sx={{
                              opacity: mExcluded ? 0.4 : 1,
                              '& td': {
                                textDecoration: mExcluded
                                  ? 'line-through'
                                  : 'none',
                                borderBottom: 'none',
                              },
                            }}
                          >
                            <TableCell
                              sx={{
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                pl: 6,
                              }}
                            >
                              <Typography variant="body2">
                                {item.merchantKey}
                              </Typography>
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 600,
                              }}
                            >
                              {usd.format(item.monthlyAverage)}
                            </TableCell>
                            <TableCell align="center" width={60}>
                              <Switch
                                size="small"
                                checked={!mExcluded}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => onToggleMerchant(item.merchantKey)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </DataTable>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
