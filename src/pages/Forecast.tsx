import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  Table,
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
import { db } from '../db';
import { usd, usdCents } from '../lib';
import { buildRecurrenceMap, recurrenceLabel, isRecurring } from '../recurrence';
import {
  buildForecast,
  lastMonthActualSpend,
  type MerchantForecast,
} from '../forecast';
import { categoryTrailingAvg } from '../budgets';
import { useForecastStore } from '../forecastStore';
import { useFilters } from '../store';
import BulkRecategorizeDialog from '../components/BulkRecategorizeDialog';
import type { Budget, Category } from '../types';

export default function Forecast() {
  const demoMode = useFilters((s) => s.demoMode);
  const allTxnsAll = useLiveQuery(() => db.transactions.toArray(), []);
  const allTxns = useMemo(
    () =>
      allTxnsAll && demoMode
        ? allTxnsAll.filter((t) => t.source === 'demo')
        : allTxnsAll,
    [allTxnsAll, demoMode]
  );
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const overrides = useLiveQuery(() => db.merchantOverrides.toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const excludedMerchants = useForecastStore((s) => s.excludedMerchants);
  const excludedBudgetCategories = useForecastStore(
    (s) => s.excludedBudgetCategories
  );
  const toggleMerchant = useForecastStore((s) => s.toggleMerchant);
  const setMerchantsExcluded = useForecastStore((s) => s.setMerchantsExcluded);
  const toggleBudgetCategory = useForecastStore((s) => s.toggleBudgetCategory);
  const reset = useForecastStore((s) => s.reset);

  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(allTxns || [], overrides || []),
    [allTxns, overrides]
  );

  const forecast = useMemo(
    () => buildForecast(allTxns || [], recurrenceMap, categories || []),
    [allTxns, recurrenceMap, categories]
  );

  const recurringMerchantKeys = useMemo(() => {
    const s = new Set<string>();
    for (const [k, info] of recurrenceMap) {
      if (isRecurring(info.kind)) s.add(k);
    }
    return s;
  }, [recurrenceMap]);

  const trailingAvgByCategory = useMemo(
    () =>
      categoryTrailingAvg(
        allTxns || [],
        categories || [],
        recurringMerchantKeys
      ),
    [allTxns, categories, recurringMerchantKeys]
  );

  const lastMonth = useMemo(
    () => lastMonthActualSpend(allTxns || [], categories || []),
    [allTxns, categories]
  );

  // Auto-seed budgets for any category with trailing spend but no budget row yet.
  useEffect(() => {
    if (!budgets || !categories) return;
    const existing = new Set(budgets.map((b) => b.category));
    const toAdd: Budget[] = [];
    for (const [cat, avg] of trailingAvgByCategory) {
      if (existing.has(cat)) continue;
      toAdd.push({
        category: cat,
        monthlyAmount: Math.round(avg * 100) / 100,
        userSet: false,
      });
    }
    if (toAdd.length > 0) {
      db.budgets.bulkPut(toAdd);
    }
  }, [budgets, categories, trailingAvgByCategory]);

  if (!allTxns || !categories || !overrides || !budgets) {
    return <Typography>Loading…</Typography>;
  }

  if (allTxns.length === 0) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5">Forecast</Typography>
        <Alert severity="info">
          No transactions yet. Import a CSV from the Import tab first.
        </Alert>
      </Stack>
    );
  }

  const recurring = forecast
    .filter((f) => f.kind === 'recurring')
    .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);

  const recurringProjected = recurring
    .filter((f) => !excludedMerchants.has(f.merchantKey))
    .reduce((s, f) => s + f.monthlyEstimate, 0);
  const budgetProjected = budgets
    .filter((b) => !excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const projected = recurringProjected + budgetProjected;

  const recurringExcludedSavings = recurring
    .filter((f) => excludedMerchants.has(f.merchantKey))
    .reduce((s, f) => s + f.monthlyEstimate, 0);
  const budgetExcludedSavings = budgets
    .filter((b) => excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const savings = recurringExcludedSavings + budgetExcludedSavings;

  const totalExclusions =
    excludedMerchants.size + excludedBudgetCategories.size;

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Typography variant="h5">Forecast next month</Typography>
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
              {recurring.length} recurring merchant
              {recurring.length === 1 ? '' : 's'} · {budgets.length} budget
              categor{budgets.length === 1 ? 'y' : 'ies'}
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

      <RecurringCard
        items={recurring}
        categories={categories}
        excluded={excludedMerchants}
        onToggle={toggleMerchant}
        onToggleGroup={setMerchantsExcluded}
      />
      <BudgetCard
        budgets={budgets}
        categories={categories}
        trailingAvgByCategory={trailingAvgByCategory}
        excluded={excludedBudgetCategories}
        onToggle={toggleBudgetCategory}
      />
    </Stack>
  );
}

// ----- Recurring (unchanged grouped + collapsible) -----

function RecurringCard({
  items,
  categories,
  excluded,
  onToggle,
  onToggleGroup,
}: {
  items: MerchantForecast[];
  categories: Category[];
  excluded: Set<string>;
  onToggle: (key: string) => void;
  onToggleGroup: (keys: string[], excluded: boolean) => void;
}) {
  const [verifyingMerchant, setVerifyingMerchant] = useState<string | null>(
    null
  );
  const subtotal = items
    .filter((i) => !excluded.has(i.merchantKey))
    .reduce((s, i) => s + i.monthlyEstimate, 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  const grouped = useMemo(() => {
    const map = new Map<string, MerchantForecast[]>();
    for (const item of items) {
      const list = map.get(item.category);
      if (list) list.push(item);
      else map.set(item.category, [item]);
    }
    return [...map.entries()]
      .map(([category, list]) => ({
        category,
        list: list.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate),
        total: list.reduce((s, i) => s + i.monthlyEstimate, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  const allCollapsed = grouped.length > 0 && collapsed.size === grouped.length;
  const collapseAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(grouped.map((g) => g.category)));

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
            Recurring
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Auto-detected from your real transactions (3+ charges at consistent
            intervals) · grouped by category
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            size="small"
            onClick={collapseAll}
            disabled={grouped.length === 0}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
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

      {items.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          No recurring charges detected yet. Needs at least 3 evenly-spaced
          charges from a merchant.
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {grouped.map((g) => {
            const allKeys = g.list.map((i) => i.merchantKey);
            const excludedCount = allKeys.filter((k) => excluded.has(k)).length;
            const groupExcluded = excludedCount === allKeys.length;
            const groupPartial = excludedCount > 0 && !groupExcluded;
            const groupSubtotal = g.list
              .filter((i) => !excluded.has(i.merchantKey))
              .reduce((s, i) => s + i.monthlyEstimate, 0);
            const color = categoryColor(g.category);
            const isCollapsed = collapsed.has(g.category);
            return (
              <Box key={g.category}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  onClick={() => toggleCollapsed(g.category)}
                  sx={{
                    p: 1,
                    bgcolor: color + '14',
                    borderRadius: 1,
                    borderLeft: `3px solid ${color}`,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: color + '22' },
                  }}
                >
                  <IconButton size="small" sx={{ p: 0.25 }}>
                    {isCollapsed ? (
                      <ExpandMoreIcon fontSize="small" />
                    ) : (
                      <ExpandLessIcon fontSize="small" />
                    )}
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
                      textDecoration: groupExcluded ? 'line-through' : 'none',
                      opacity: groupExcluded ? 0.5 : 1,
                    }}
                  >
                    {g.category}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.75 }}
                    >
                      {g.list.length} merchant{g.list.length === 1 ? '' : 's'}
                      {groupPartial && ` · ${allKeys.length - excludedCount} on`}
                    </Typography>
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      textDecoration: groupExcluded ? 'line-through' : 'none',
                      opacity: groupExcluded ? 0.5 : 1,
                    }}
                  >
                    {usd.format(groupSubtotal)}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.5 }}
                    >
                      /mo
                    </Typography>
                  </Typography>
                  <Tooltip
                    title={
                      groupExcluded
                        ? 'Include all in this category'
                        : 'Exclude all in this category'
                    }
                  >
                    <Switch
                      size="small"
                      checked={!groupExcluded}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleGroup(
                          allKeys,
                          groupPartial ? true : !groupExcluded
                        );
                      }}
                    />
                  </Tooltip>
                </Stack>
                <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                  <Table size="small">
                    <TableBody>
                      {g.list.map((item) => {
                        const isExcluded = excluded.has(item.merchantKey);
                        return (
                          <TableRow
                            key={item.merchantKey}
                            hover
                            onClick={() => setVerifyingMerchant(item.merchantKey)}
                            sx={{
                              cursor: 'pointer',
                              opacity: isExcluded ? 0.4 : 1,
                              '& td': {
                                textDecoration: isExcluded
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
                                pl: 3,
                              }}
                            >
                              <Typography variant="body2">
                                {item.merchantKey}
                              </Typography>
                              {item.cadenceLabel && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {recurrenceLabel(item.cadenceLabel as any)}
                                  {' · click to see transactions'}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 600,
                              }}
                            >
                              {usdCents.format(item.monthlyEstimate)}
                            </TableCell>
                            <TableCell align="center" width={60}>
                              <Switch
                                size="small"
                                checked={!isExcluded}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => onToggle(item.merchantKey)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
      {verifyingMerchant && (
        <BulkRecategorizeDialog
          merchantKey={verifyingMerchant}
          onClose={() => setVerifyingMerchant(null)}
        />
      )}
    </Paper>
  );
}

// ----- Budget card (new) -----

function BudgetCard({
  budgets,
  categories,
  trailingAvgByCategory,
  excluded,
  onToggle,
}: {
  budgets: Budget[];
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

  const onChangeAmount = (category: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const amount = Number(cleaned) || 0;
    db.budgets.put({ category, monthlyAmount: amount, userSet: true });
  };

  const onResetRow = (category: string) => {
    const avg = trailingAvgByCategory.get(category) || 0;
    db.budgets.put({
      category,
      monthlyAmount: Math.round(avg * 100) / 100,
      userSet: false,
    });
  };

  const onResetAll = async () => {
    if (!confirm('Reset all budgets to your trailing 3-month actuals?')) return;
    const next: Budget[] = budgets.map((b) => ({
      category: b.category,
      monthlyAmount:
        Math.round((trailingAvgByCategory.get(b.category) || 0) * 100) / 100,
      userSet: false,
    }));
    await db.budgets.bulkPut(next);
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
            Budgets (one-time / variable spend)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Set what you want to spend per category next month. Initial values
            auto-seeded from your trailing 3-month actuals. Edit to budget
            differently.
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
          No non-recurring spend in the last 90 days.
        </Box>
      ) : (
        <Table size="small">
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
                    <TextField
                      size="small"
                      value={b.monthlyAmount.toFixed(2)}
                      onChange={(e) => onChangeAmount(b.category, e.target.value)}
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
        </Table>
      )}
    </Paper>
  );
}
