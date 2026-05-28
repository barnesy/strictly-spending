import { useMemo, useEffect, useState } from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Fab from '@mui/material/Fab';
import FilterListIcon from '@mui/icons-material/FilterList';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { subtleScrollSx } from '../styles';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Grid,
  Paper,
  Stack,
  Typography,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  FormControlLabel,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
  TextField,
  Tooltip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Link as RouterLink } from 'react-router-dom';
import { db } from '../db';
import {
  useFilters,
  resolveDateRange,
  type DateRangePreset,
  type GroupBy,
  type FiltersStore,
} from '../store';
import { usd, monthKey, monthsBetween } from '../lib';
import SpendChart from '../components/SpendChart';
import BulkRecategorizeDialog from '../components/BulkRecategorizeDialog';
import RecurringBurnCard from '../components/RecurringBurnCard';
import {
  buildRecurrenceMap,
  isRecurring,
  recurrenceLabel,
} from '../recurrence';
import type { Account, Category, Transaction } from '../types';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'ytd', label: 'YTD' },
  { value: 'last30', label: 'Last 30D' },
  { value: 'last90', label: 'Last 90D' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'allTime', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

export default function Dashboard() {
  const filters = useFilters();
  const demoMode = filters.demoMode;
  const accountsAll = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const allTxnsAll = useLiveQuery(() => db.transactions.toArray(), []);
  const merchantOverrides = useLiveQuery(
    () => db.merchantOverrides.toArray(),
    []
  );
  // Demo-mode filter: hide real accounts/transactions from every downstream
  // computation. Real data is untouched on disk.
  const accounts = useMemo(
    () =>
      accountsAll && demoMode
        ? accountsAll.filter((a) => a.source === 'demo')
        : accountsAll,
    [accountsAll, demoMode]
  );
  const allTxns = useMemo(
    () =>
      allTxnsAll && demoMode
        ? allTxnsAll.filter((t) => t.source === 'demo')
        : allTxnsAll,
    [allTxnsAll, demoMode]
  );
  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(allTxns || [], merchantOverrides || []),
    [allTxns, merchantOverrides]
  );

  // Default-enable any newly-discovered accounts.
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const known = new Set(filters.enabledAccountIds);
    const newOnes = accounts.filter((a) => !known.has(a.id!)).map((a) => a.id!);
    if (newOnes.length > 0) {
      filters.setEnabledAccounts([...filters.enabledAccountIds, ...newOnes]);
    }
    // Drop ids for deleted accounts
    const accountIdSet = new Set(accounts.map((a) => a.id!));
    const cleaned = filters.enabledAccountIds.filter((id) => accountIdSet.has(id));
    if (cleaned.length !== filters.enabledAccountIds.length) {
      filters.setEnabledAccounts(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts?.length]);

  const range = resolveDateRange(filters);

  // Filter transactions
  const visibleTxns = useMemo(() => {
    if (!allTxns) return [];
    const enabledSet = new Set(filters.enabledAccountIds);
    const disabledCatSet = new Set(filters.disabledCategories);
    const startISO = range.start.toISOString().slice(0, 10);
    const endISO = range.end.toISOString().slice(0, 10);
    const transferIncomeNames = new Set(
      (categories || [])
        .filter((c) => c.type !== 'spend')
        .map((c) => c.name)
    );
    return allTxns.filter((t) => {
      if (!enabledSet.has(t.accountId)) return false;
      if (disabledCatSet.has(t.category)) return false;
      if (t.date < startISO || t.date > endISO) return false;
      if (filters.spendOnly && transferIncomeNames.has(t.category)) return false;
      if (filters.recurrenceFilter !== 'all') {
        const info = recurrenceMap.get(t.merchantKey);
        const isRec = info ? isRecurring(info.kind) : false;
        if (filters.recurrenceFilter === 'recurring' && !isRec) return false;
        if (filters.recurrenceFilter === 'onetime' && isRec) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allTxns,
    filters.enabledAccountIds,
    filters.disabledCategories,
    filters.spendOnly,
    filters.recurrenceFilter,
    range.start.getTime(),
    range.end.getTime(),
    categories,
    recurrenceMap,
  ]);

  const monthList = useMemo(
    () => monthsBetween(range.start, range.end),
    [range.start, range.end]
  );

  if (!accounts || !categories || !allTxns) {
    return <Typography>Loading…</Typography>;
  }

  if (allTxns.length === 0) {
    return (
      <Stack spacing={3} alignItems="flex-start">
        <Typography variant="h5">Dashboard</Typography>
        <Alert severity="info" sx={{ width: '100%' }}>
          No transactions yet. Import a CSV to get started.
        </Alert>
        <Button
          component={RouterLink}
          to="/import"
          variant="contained"
          size="large"
        >
          Import CSVs
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <UncategorizedBanner allTxns={allTxns} />
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Typography variant="h5">Dashboard</Typography>
        <RangePicker filters={filters} />
      </Stack>

      <ResizableTopRow
        accounts={accounts}
        categories={categories}
        filters={filters}
        allTxns={allTxns}
        visibleTxns={visibleTxns}
        monthList={monthList}
        recurrenceMap={recurrenceMap}
      />

      <Grid container spacing={2}>
        <Grid size={12}>
          <TopCategoriesCard
            visibleTxns={visibleTxns}
            categories={categories}
            monthList={monthList}
          />
        </Grid>
        <Grid size={12}>
          <RecurringBurnCard
            allTxns={allTxns}
            recurrenceMap={recurrenceMap}
            categories={categories}
          />
        </Grid>
        <Grid size={12}>
          <AccountSummary visibleTxns={visibleTxns} accounts={accounts} />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ----- Resizable top row (Figma-style: collapse hides panel + adds edge overlay) -----

function ResizableTopRow({
  accounts,
  categories,
  filters,
  allTxns,
  visibleTxns,
  monthList,
  recurrenceMap,
}: {
  accounts: Account[];
  categories: Category[];
  filters: FiltersStore;
  allTxns: Transaction[];
  visibleTxns: Transaction[];
  monthList: string[];
  recurrenceMap: ReturnType<typeof buildRecurrenceMap>;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Persist visibility across reloads so the user's last layout sticks.
  const [filterVisible, setFilterVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('dashboard:filterVisible') !== 'false';
  });
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('dashboard:sidebarVisible') !== 'false';
  });
  useEffect(() => {
    localStorage.setItem('dashboard:filterVisible', String(filterVisible));
  }, [filterVisible]);
  useEffect(() => {
    localStorage.setItem('dashboard:sidebarVisible', String(sidebarVisible));
  }, [sidebarVisible]);

  // Persist panel sizes too. The set of panelIds passed depends on which
  // panels are currently visible — that's how `useDefaultLayout` knows.
  const panelIds = [
    ...(filterVisible ? ['filter'] : []),
    'chart',
    ...(sidebarVisible ? ['merchants'] : []),
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `dashboard-top-row-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  const chartCard = (
    <ChartCard
      monthList={monthList}
      visibleTxns={visibleTxns}
      accounts={accounts}
      categories={categories}
      groupBy={filters.groupBy}
      setGroupBy={(g) => filters.setGroupBy(g)}
      recurrenceMap={recurrenceMap}
      onMonthClick={(monthKey) => filters.drillToMonth(monthKey)}
    />
  );
  const filterPanel = (
    <FilterPanel
      accounts={accounts}
      categories={categories}
      filters={filters}
      allTxns={allTxns}
      visibleTxns={visibleTxns}
      onCollapse={() => setFilterVisible(false)}
    />
  );
  const merchantsCard = (
    <TopMerchantsCard
      visibleTxns={visibleTxns}
      recurrenceMap={recurrenceMap}
      onCollapse={() => setSidebarVisible(false)}
    />
  );

  // Mobile: stack vertically, no resize, no collapse.
  if (!isDesktop) {
    return (
      <Stack spacing={2}>
        {filterPanel}
        {chartCard}
        {merchantsCard}
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        // Fill the viewport from below the page header (Dashboard title + range picker)
        // down to the bottom edge, with a small bottom margin so the bottom-row
        // sections show a peek and remain reachable by scroll.
        height: 'calc(100vh - 200px)',
        minHeight: 540,
        position: 'relative',
      }}
    >
      <PanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        style={{ height: '100%' }}
      >
        {filterVisible && (
          <Panel id="filter" defaultSize={22} minSize={15}>
            <PanelScroll>{filterPanel}</PanelScroll>
          </Panel>
        )}
        {filterVisible && <StyledResizeHandle ariaLabel="Resize filters / chart" />}
        <Panel id="chart" defaultSize={50} minSize={25}>
          <Box sx={{ height: '100%', overflow: 'auto', ...subtleScrollSx }}>
            {chartCard}
          </Box>
        </Panel>
        {sidebarVisible && (
          <StyledResizeHandle ariaLabel="Resize chart / top merchants" />
        )}
        {sidebarVisible && (
          <Panel id="merchants" defaultSize={28} minSize={15}>
            <PanelScroll>{merchantsCard}</PanelScroll>
          </Panel>
        )}
      </PanelGroup>

      {/* Edge overlays when a panel is collapsed */}
      {!filterVisible && (
        <PanelEdgeOverlay
          side="left"
          icon={<FilterListIcon fontSize="small" />}
          label="Show filters"
          onClick={() => setFilterVisible(true)}
        />
      )}
      {!sidebarVisible && (
        <PanelEdgeOverlay
          side="right"
          icon={<StorefrontIcon fontSize="small" />}
          label="Show top merchants"
          onClick={() => setSidebarVisible(true)}
        />
      )}
    </Box>
  );
}

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle
      aria-label={ariaLabel}
      style={{ width: 8, position: 'relative' }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          margin: '0 auto',
          width: 2,
          bgcolor: 'rgba(0,0,0,0.08)',
          borderRadius: 1,
          transition: 'background-color 120ms ease',
          '[data-resize-handle-active] &, &:hover': {
            bgcolor: 'primary.main',
            width: 3,
          },
        }}
      />
    </PanelResizeHandle>
  );
}

function PanelScroll({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        ...subtleScrollSx,
      }}
    >
      {children}
    </Box>
  );
}

/** Fixed overlay button anchored to the screen edge — shown when a side
 *  panel is collapsed. Click expands it back. */
function PanelEdgeOverlay({
  side,
  icon,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label} placement={side === 'left' ? 'right' : 'left'}>
      <Fab
        size="small"
        color="primary"
        onClick={onClick}
        aria-label={label}
        sx={{
          position: 'absolute',
          top: 16,
          [side]: 8,
          zIndex: 4,
          boxShadow: 2,
        }}
      >
        {icon}
      </Fab>
    </Tooltip>
  );
}

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

function RangePicker({ filters }: { filters: FiltersStore }) {
  const range = resolveDateRange(filters);
  const label = formatDateRange(range.start, range.end);
  return (
    <Stack spacing={0.5} alignItems="flex-end">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Tooltip title="Shift earlier">
          <IconButton
            size="small"
            onClick={() => filters.shiftRange(-1)}
            aria-label="Shift date range earlier"
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <ToggleButtonGroup
          value={filters.preset}
          exclusive
          onChange={(_, v) => v && filters.setPreset(v)}
          size="small"
        >
          {PRESETS.map((p) => (
            <ToggleButton key={p.value} value={p.value}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Tooltip title="Shift later">
          <IconButton
            size="small"
            onClick={() => filters.shiftRange(1)}
            aria-label="Shift date range later"
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {filters.preset === 'custom' && (
        <Stack direction="row" spacing={1}>
          <TextField
            type="date"
            size="small"
            value={filters.customStart || ''}
            onChange={(e) =>
              filters.setCustomRange(e.target.value, filters.customEnd)
            }
            label="Start"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            value={filters.customEnd || ''}
            onChange={(e) =>
              filters.setCustomRange(filters.customStart, e.target.value)
            }
            label="End"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      )}
    </Stack>
  );
}

function FilterPanel({
  accounts,
  categories,
  filters,
  allTxns,
  visibleTxns,
  onCollapse,
}: {
  accounts: Account[];
  categories: Category[];
  filters: FiltersStore;
  allTxns: Transaction[];
  visibleTxns: Transaction[];
  onCollapse?: () => void;
}) {
  const totalSpend = visibleTxns
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = visibleTxns
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, position: 'relative' }}>
        {onCollapse && (
          <Tooltip title="Hide filters panel">
            <IconButton
              size="small"
              onClick={onCollapse}
              aria-label="Hide filters panel"
              sx={{ position: 'absolute', top: 8, right: 8 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Typography variant="overline" color="text.secondary">
          Net spend in range
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {usd.format(totalSpend)}
        </Typography>
        {!filters.spendOnly && totalIncome > 0 && (
          <Typography variant="caption" color="success.main">
            + {usd.format(totalIncome)} in
          </Typography>
        )}
        <FormControlLabel
          sx={{ mt: 1, display: 'block' }}
          control={
            <Checkbox
              checked={filters.spendOnly}
              onChange={(e) => filters.setSpendOnly(e.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Spend only (exclude transfers & income)
            </Typography>
          }
        />
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
            const txCount = allTxns.filter((t) => t.accountId === a.id).length;
            return (
              <FormControlLabel
                key={a.id}
                control={
                  <Checkbox
                    size="small"
                    checked={filters.enabledAccountIds.includes(a.id!)}
                    onChange={() => filters.toggleAccount(a.id!)}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{a.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {txCount}
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
          {categories.map((c) => (
            <FormControlLabel
              key={c.id}
              control={
                <Checkbox
                  size="small"
                  checked={!filters.disabledCategories.includes(c.name)}
                  onChange={() => filters.toggleCategory(c.name)}
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: c.color,
                    }}
                  />
                  <Typography variant="body2">{c.name}</Typography>
                </Stack>
              }
            />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

function ChartCard({
  monthList,
  visibleTxns,
  accounts,
  categories,
  groupBy,
  setGroupBy,
  recurrenceMap,
  onMonthClick,
}: {
  monthList: string[];
  visibleTxns: Transaction[];
  accounts: Account[];
  categories: Category[];
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  recurrenceMap: ReturnType<typeof buildRecurrenceMap>;
  onMonthClick?: (monthKey: string) => void;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2, flexShrink: 0 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Spending over time
        </Typography>
        <ToggleButtonGroup
          value={groupBy}
          exclusive
          onChange={(_, v) => v && setGroupBy(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}
        >
          <ToggleButton value="category">By Category</ToggleButton>
          <ToggleButton value="account">By Account</ToggleButton>
          <ToggleButton value="recurring">Recurring vs One-Time</ToggleButton>
          <ToggleButton value="none">Totals</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>
      <SpendChart
        monthList={monthList}
        transactions={visibleTxns}
        accounts={accounts}
        categories={categories}
        groupBy={groupBy}
        recurrenceMap={recurrenceMap}
        onMonthClick={onMonthClick}
      />
      </Box>
    </Paper>
  );
}

function TopCategoriesCard({
  visibleTxns,
  categories,
  monthList,
}: {
  visibleTxns: Transaction[];
  categories: Category[];
  monthList: string[];
}) {
  const byCategory = visibleTxns.reduce<
    Record<string, { total: number; byMonth: Record<string, number> }>
  >((acc, t) => {
    if (t.amount >= 0) return acc;
    const k = t.category;
    if (!acc[k]) acc[k] = { total: 0, byMonth: {} };
    acc[k].total += Math.abs(t.amount);
    const m = monthKey(t.date);
    acc[k].byMonth[m] = (acc[k].byMonth[m] || 0) + Math.abs(t.amount);
    return acc;
  }, {});

  const last = monthList[monthList.length - 1];
  const prev = monthList[monthList.length - 2];

  const rows = Object.entries(byCategory)
    .map(([category, info]) => ({
      category,
      total: info.total,
      lastMonth: last ? info.byMonth[last] || 0 : 0,
      prevMonth: prev ? info.byMonth[prev] || 0 : 0,
      color: categories.find((c) => c.name === category)?.color || '#bdbdbd',
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Top categories
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Category</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">MoM</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const delta = r.lastMonth - r.prevMonth;
            const pct = r.prevMonth > 0 ? (delta / r.prevMonth) * 100 : 0;
            return (
              <TableRow key={r.category} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: r.color,
                      }}
                    />
                    <Typography variant="body2">{r.category}</Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">{usd.format(r.total)}</TableCell>
                <TableCell align="right">
                  {prev && r.prevMonth > 0 ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: delta > 0 ? 'error.main' : 'success.main',
                        fontWeight: 600,
                      }}
                    >
                      {delta > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      –
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                No spend in range.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}

function TopMerchantsCard({
  visibleTxns,
  recurrenceMap,
  onCollapse,
}: {
  visibleTxns: Transaction[];
  recurrenceMap: ReturnType<typeof buildRecurrenceMap>;
  onCollapse?: () => void;
}) {
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);

  const byMerchant = visibleTxns.reduce<
    Record<string, { total: number; count: number; category: string }>
  >((acc, t) => {
    if (t.amount >= 0) return acc;
    const k = t.merchantKey || t.description.slice(0, 30);
    if (!acc[k]) acc[k] = { total: 0, count: 0, category: t.category };
    acc[k].total += Math.abs(t.amount);
    acc[k].count += 1;
    return acc;
  }, {});
  const rows = Object.entries(byMerchant)
    .map(([merchant, info]) => ({
      merchant,
      ...info,
      recurrence: recurrenceMap.get(merchant),
    }))
    .sort((a, b) => b.total - a.total);
  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        sx={{ mb: 0.5, flexShrink: 0 }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center">
          {onCollapse && (
            <Tooltip title="Hide top merchants panel">
              <IconButton
                size="small"
                onClick={onCollapse}
                aria-label="Hide top merchants panel"
                sx={{ ml: -0.5 }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Top merchants
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {rows.length} merchant{rows.length === 1 ? '' : 's'}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Click a row to recategorize all of its transactions
      </Typography>
      <Box
        sx={{
          mt: 1,
          // Fill the remaining card height; the panel itself caps height.
          flex: 1,
          minHeight: 0,
          maxHeight: { xs: 480, md: 'none' },
          overflowY: 'auto',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 1,
          ...subtleScrollSx,
        }}
      >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Merchant</TableCell>
            <TableCell align="right">Visits</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.merchant}
              hover
              onClick={() => setEditingMerchant(r.merchant)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell
                sx={{
                  maxWidth: 240,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {r.recurrence && isRecurring(r.recurrence.kind) && (
                    <Box
                      component="span"
                      title={`${recurrenceLabel(r.recurrence.kind)} · ~$${r.recurrence.estMonthlyCost.toFixed(0)}/mo`}
                      sx={{
                        fontSize: 12,
                        color: 'primary.main',
                        lineHeight: 1,
                      }}
                    >
                      &#x21bb;
                    </Box>
                  )}
                  <Typography variant="body2">{r.merchant}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {r.category}
                  {r.recurrence && isRecurring(r.recurrence.kind) && (
                    <>
                      {' · '}
                      {recurrenceLabel(r.recurrence.kind)}
                    </>
                  )}
                </Typography>
              </TableCell>
              <TableCell align="right">{r.count}</TableCell>
              <TableCell align="right">{usd.format(r.total)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                No spend in range.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </Box>
      {editingMerchant && (
        <BulkRecategorizeDialog
          merchantKey={editingMerchant}
          onClose={() => setEditingMerchant(null)}
        />
      )}
    </Paper>
  );
}

function AccountSummary({
  visibleTxns,
  accounts,
}: {
  visibleTxns: Transaction[];
  accounts: Account[];
}) {
  const byAccount = visibleTxns.reduce<Record<number, { spend: number; income: number }>>(
    (acc, t) => {
      if (!acc[t.accountId]) acc[t.accountId] = { spend: 0, income: 0 };
      if (t.amount < 0) acc[t.accountId].spend += Math.abs(t.amount);
      else acc[t.accountId].income += t.amount;
      return acc;
    },
    {}
  );
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        By account
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {accounts.map((a) => {
          const info = byAccount[a.id!] || { spend: 0, income: 0 };
          return (
            <Box key={a.id} sx={{ minWidth: 180 }}>
              <Typography variant="caption" color="text.secondary">
                {a.name}
              </Typography>
              <Typography variant="h6">{usd.format(info.spend)}</Typography>
              {info.income > 0 && (
                <Chip
                  size="small"
                  label={`+${usd.format(info.income)} in`}
                  color="success"
                  sx={{ mt: 0.5 }}
                />
              )}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

const SORT_BANNER_DISMISS_KEY = 'spending-viz:sortBannerDismissed';
const SORT_BANNER_THRESHOLD = 20;

/**
 * Dismissable session-scoped banner that surfaces Uncategorized backlogs and
 * pushes the user to /sort. Hidden once dismissed for the rest of the tab
 * session (sessionStorage). Only renders when count exceeds the threshold.
 */
function UncategorizedBanner({ allTxns }: { allTxns: Transaction[] }) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SORT_BANNER_DISMISS_KEY) === '1'
  );
  const count = useMemo(
    () => allTxns.filter((t) => t.category === 'Uncategorized').length,
    [allTxns]
  );
  if (dismissed) return null;
  if (count < SORT_BANNER_THRESHOLD) return null;
  return (
    <Alert
      severity="warning"
      onClose={() => {
        sessionStorage.setItem(SORT_BANNER_DISMISS_KEY, '1');
        setDismissed(true);
      }}
      action={
        <Button
          component={RouterLink}
          to="/sort"
          size="small"
          variant="contained"
          color="warning"
          sx={{ textTransform: 'none', mr: 1 }}
        >
          Sort {count} →
        </Button>
      }
      sx={{ alignItems: 'center' }}
    >
      <strong>{count}</strong> uncategorized transactions are skewing your
      Dashboard totals. Triage them in the Sort view. Usually a couple of
      minutes.
    </Alert>
  );
}
