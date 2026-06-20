import { useMemo, useEffect, useState, useDeferredValue } from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  Tooltip,
  Alert,
  Collapse,
} from '@mui/material';
import PageLoader from '../components/PageLoader';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { db } from '../db';
import {
  useFilters,
  resolveDateRange,
} from '../store';
import { usd, usdCents, monthsBetween } from '../lib';
import SpendChart from '../components/SpendChart';
import BulkRecategorizeDialog from '../components/BulkRecategorizeDialog';
import FilterPanel from '../components/FilterPanel';
import RangePicker from '../components/RangePicker';
import RecategorizeDialog from '../components/RecategorizeDialog';
import { subtleScrollSx } from '../styles';
import {
  buildRecurrenceMap,
  isRecurring,
  recurrenceLabel,
} from '../recurrence';
import type { Transaction } from '../types';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode = location.pathname === '/transactions' ? 'table' : 'chart';

  const setViewMode = (mode: 'chart' | 'table') => {
    navigate(mode === 'table' ? '/transactions' : '/', { replace: true });
  };

  const [filterVisible, setFilterVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('dashboard:filterVisible') !== 'false';
  });
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('dashboard:sidebarVisible') !== 'false';
  });

  const [isTransitioning, setIsTransitioning] = useState(false);

  const toggleFilters = () => {
    setIsTransitioning(true);
    setFilterVisible((prev) => !prev);
    setTimeout(() => {
      setIsTransitioning(false);
    }, 220);
  };

  const toggleSidebar = () => {
    setIsTransitioning(true);
    setSidebarVisible((prev) => !prev);
    setTimeout(() => {
      setIsTransitioning(false);
    }, 220);
  };

  useEffect(() => {
    localStorage.setItem('dashboard:filterVisible', String(filterVisible));
  }, [filterVisible]);
  useEffect(() => {
    localStorage.setItem('dashboard:sidebarVisible', String(sidebarVisible));
  }, [sidebarVisible]);

  const preset = useFilters((s) => s.preset);
  const customStart = useFilters((s) => s.customStart);
  const customEnd = useFilters((s) => s.customEnd);
  const earliestTransactionDate = useFilters((s) => s.earliestTransactionDate);
  const latestTransactionDate = useFilters((s) => s.latestTransactionDate);

  const enabledAccountIds = useFilters((s) => s.enabledAccountIds);
  const disabledCategories = useFilters((s) => s.disabledCategories);
  const spendOnly = useFilters((s) => s.spendOnly);
  const recurrenceFilter = useFilters((s) => s.recurrenceFilter);
  const searchQuery = useFilters((s) => s.searchQuery);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const minPrice = useFilters((s) => s.minPrice);
  const deferredMinPrice = useDeferredValue(minPrice);
  const maxPrice = useFilters((s) => s.maxPrice);
  const deferredMaxPrice = useDeferredValue(maxPrice);
  const demoMode = useFilters((s) => s.demoMode);

  const setEnabledAccounts = useFilters((s) => s.setEnabledAccounts);
  const setGroupBy = useFilters((s) => s.setGroupBy);
  const drillToMonth = useFilters((s) => s.drillToMonth);
  const groupBy = useFilters((s) => s.groupBy);

  const hasActiveFilters = useFilters((s) => {
    return (
      s.preset !== 'ytd' ||
      s.disabledCategories.length > 0 ||
      !s.spendOnly ||
      s.recurrenceFilter !== 'all' ||
      s.searchQuery !== '' ||
      s.minPrice !== undefined ||
      s.maxPrice !== undefined ||
      s.drill !== null
    );
  });

  const accountsAll = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const dbTxnCount = useLiveQuery(() => db.transactions.count(), []);
  const dbAcctCount = useLiveQuery(() => db.accounts.count(), []);

  const range = useMemo(() => {
    return resolveDateRange({
      preset,
      customStart,
      customEnd,
      earliestTransactionDate,
      latestTransactionDate,
    } as any);
  }, [preset, customStart, customEnd, earliestTransactionDate, latestTransactionDate]);

  const startISO = useMemo(() => range.start.toISOString().slice(0, 10), [range.start]);
  const endISO = useMemo(() => range.end.toISOString().slice(0, 10), [range.end]);

  const allTxnsAll = useLiveQuery(
    () => db.transactions.where('date').between(startISO, endISO, true, true).toArray(),
    [startISO, endISO]
  );
  const deferredAllTxnsAll = useDeferredValue(allTxnsAll);

  const forecastTxnsAll = useLiveQuery(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    return db.transactions.where('date').aboveOrEqual(cutoffISO).toArray();
  }, []);
  const deferredForecastTxnsAll = useDeferredValue(forecastTxnsAll);

  const merchantOverrides = useLiveQuery(
    () => db.merchantOverrides.toArray(),
    []
  );

  // Demo-mode filter: hide real accounts/transactions.
  const accounts = useMemo(
    () =>
      accountsAll && demoMode
        ? accountsAll.filter((a) => a.source === 'demo')
        : accountsAll?.filter((a) => a.source !== 'demo'),
    [accountsAll, demoMode]
  );
  const allTxns = useMemo(
    () =>
      deferredAllTxnsAll && demoMode
        ? deferredAllTxnsAll.filter((t) => t.source === 'demo')
        : deferredAllTxnsAll?.filter((t) => t.source !== 'demo'),
    [deferredAllTxnsAll, demoMode]
  );
  const forecastTxns = useMemo(
    () =>
      deferredForecastTxnsAll && demoMode
        ? deferredForecastTxnsAll.filter((t) => t.source === 'demo')
        : deferredForecastTxnsAll?.filter((t) => t.source !== 'demo'),
    [deferredForecastTxnsAll, demoMode]
  );
  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(forecastTxns || [], merchantOverrides || []),
    [forecastTxns, merchantOverrides]
  );

  const seenAccountIds = useFilters((s) => s.seenAccountIds);
  const setSeenAccounts = useFilters((s) => s.setSeenAccounts);

  // Default-enable any newly-discovered accounts safely.
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const accountIdSet = new Set(accounts.map((a) => a.id!));

    const cleanedEnabled = enabledAccountIds.filter((id) => accountIdSet.has(id));
    const cleanedSeen = seenAccountIds.filter((id) => accountIdSet.has(id));

    const seenSet = new Set(cleanedSeen);
    const newOnes = accounts.filter((a) => !seenSet.has(a.id!)).map((a) => a.id!);

    if (newOnes.length > 0 || cleanedEnabled.length !== enabledAccountIds.length || cleanedSeen.length !== seenAccountIds.length) {
      setEnabledAccounts([...cleanedEnabled, ...newOnes]);
      setSeenAccounts([...cleanedSeen, ...newOnes]);
    }
  }, [accounts, enabledAccountIds, setEnabledAccounts, seenAccountIds, setSeenAccounts]);

  // Filter transactions globally
  const visibleTxns = useMemo(() => {
    if (!allTxns) return [];
    const enabledSet = new Set(enabledAccountIds);
    const disabledCatSet = new Set(disabledCategories);
    const transferIncomeNames = new Set(
      (categories || [])
        .filter((c) => c.type !== 'spend')
        .map((c) => c.name)
    );
    return allTxns.filter((t) => {
      if (!enabledSet.has(t.accountId)) return false;
      if (disabledCatSet.has(t.category)) return false;
      if (t.date < startISO || t.date > endISO) return false;
      if (spendOnly && transferIncomeNames.has(t.category)) return false;
      if (recurrenceFilter !== 'all') {
        const isRec = t.recurrence === 'recurring';
        if (recurrenceFilter === 'recurring' && !isRec) return false;
        if (recurrenceFilter === 'onetime' && isRec) return false;
      }
      if (deferredSearchQuery) {
        const q = deferredSearchQuery.toLowerCase();
        if (
          !t.description.toLowerCase().includes(q) &&
          !t.merchantKey.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (deferredMinPrice !== undefined) {
        const amt = Math.abs(t.amount);
        if (amt < deferredMinPrice) return false;
      }
      if (deferredMaxPrice !== undefined) {
        const amt = Math.abs(t.amount);
        if (amt > deferredMaxPrice) return false;
      }
      return true;
    });
  }, [
    allTxns,
    enabledAccountIds,
    disabledCategories,
    spendOnly,
    recurrenceFilter,
    startISO,
    endISO,
    categories,
    recurrenceMap,
    deferredSearchQuery,
    deferredMinPrice,
    deferredMaxPrice,
  ]);

  const monthList = useMemo(
    () => monthsBetween(range.start, range.end),
    [range.start, range.end]
  );

  // Table pagination & edit states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);

  const pageRows = useMemo(() => {
    return visibleTxns.slice(page * pageSize, page * pageSize + pageSize);
  }, [visibleTxns, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [visibleTxns.length]);

  const accountName = (id: number) =>
    accounts?.find((a) => a.id === id)?.name || '–';
  const categoryColor = (name: string) =>
    categories?.find((c) => c.name === name)?.color || '#bdbdbd';

  // Persist resizable panel layout sizes.
  const panelIds = [
    ...(filterVisible ? ['filter'] : []),
    'chart',
    ...(sidebarVisible ? ['merchants'] : []),
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `unified-top-row-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const isLoading = !accounts || !categories || !allTxns || dbTxnCount === undefined || dbAcctCount === undefined;

  if (dbTxnCount === 0) {
    return (
      <PageLoader isLoading={isLoading}>
        <Stack spacing={3} alignItems="flex-start" sx={{ width: '100%' }}>
          <Typography variant="h5">Dashboard</Typography>
          <Alert severity="info" sx={{ width: '100%' }}>
            No transactions yet. Import a CSV to get started.
          </Alert>
          <Button component={RouterLink} to="/import" variant="contained" size="large">
            Import CSVs
          </Button>
        </Stack>
      </PageLoader>
    );
  }

  const mainTable = (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <TableContainer sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, bgcolor: 'background.paper', flex: 1, minHeight: 0, overflow: 'auto', ...subtleScrollSx }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Account</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell width={40}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.date}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="caption" color="text.secondary">
                    {accountName(t.accountId)}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    maxWidth: 380,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={t.description}
                >
                  {(() => {
                    if (t.recurrence !== 'recurring') return null;
                    const info = recurrenceMap.get(t.merchantKey);
                    const label = info ? recurrenceLabel(info.kind) : 'Recurring';
                    const estimate = info ? info.estMonthlyCost : Math.abs(t.amount);
                    return (
                      <Tooltip
                        title={`${label} · ~${usdCents.format(estimate)}/mo`}
                      >
                        <Box
                          component="span"
                          sx={{
                            color: 'primary.main',
                            fontSize: 14,
                            mr: 0.5,
                            cursor: 'help',
                          }}
                        >
                          &#x21bb;
                        </Box>
                      </Tooltip>
                    );
                  })()}
                  {t.description}
                </TableCell>
                <TableCell>
                  <Chip
                    label={t.category}
                    size="small"
                    sx={{
                      bgcolor: categoryColor(t.category) + '22',
                      color: categoryColor(t.category),
                      fontWeight: 500,
                      border: t.userOverridden ? '1px solid' : 'none',
                      borderColor: t.userOverridden
                        ? categoryColor(t.category)
                        : 'transparent',
                    }}
                  />
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color: t.amount < 0 ? 'inherit' : 'success.main',
                    fontWeight: 500,
                  }}
                >
                  {usdCents.format(t.amount)}
                </TableCell>
                <TableCell>
                  <Tooltip title="Recategorize">
                    <IconButton
                      size="small"
                      onClick={() => setEditTxn(t)}
                      aria-label={`Recategorize ${t.description.slice(0, 40)}`}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                    No transactions match.
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={visibleTxns.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 250]}
        />
      </TableContainer>
    </Stack>
  );

  const middleSectionContent = (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Middle Section Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 2, flexShrink: 0 }}
      >
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
        >
          <ToggleButton value="chart" sx={{ textTransform: 'none', minWidth: 80, fontWeight: 600 }}>
            Chart
          </ToggleButton>
          <ToggleButton value="table" sx={{ textTransform: 'none', minWidth: 80, fontWeight: 600 }}>
            Table
          </ToggleButton>
        </ToggleButtonGroup>

        {viewMode === 'chart' && (
          <ToggleButtonGroup
            value={groupBy}
            exclusive
            onChange={(_, v) => v && setGroupBy(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': { whiteSpace: 'nowrap' },
              overflowX: 'auto',
              ...subtleScrollSx,
            }}
          >
            <ToggleButton value="category">By Category</ToggleButton>
            <ToggleButton value="account">By Account</ToggleButton>
            <ToggleButton value="recurring">Recurring vs One-Time</ToggleButton>
            <ToggleButton value="none">Totals</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {/* Content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', ...subtleScrollSx }}>
        {(allTxns?.length || 0) === 0 || visibleTxns.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 300,
              p: 3,
              textAlign: 'center',
              gap: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              No transactions match current filters
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
              Your database has {dbTxnCount} total transactions, but none match the selected date range ({startISO} to {endISO}) or active accounts.
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                const filterState = useFilters.getState();
                filterState.reset();
                filterState.setPreset('allTime');
              }}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Reset Filters & Show All Time
            </Button>
          </Box>
        ) : viewMode === 'chart' ? (
          <Box sx={{ height: '100%', minHeight: 400 }}>
            <SpendChart
              monthList={monthList}
              transactions={visibleTxns}
              accounts={accounts || []}
              categories={categories || []}
              groupBy={groupBy}
              recurrenceMap={recurrenceMap}
              onMonthClick={(monthKey) => drillToMonth(monthKey)}
              allTxns={forecastTxns || []}
            />
          </Box>
        ) : (
          mainTable
        )}
      </Box>
    </Paper>
  );

  const filterPanel = (
    <FilterPanel
      accounts={accounts || []}
      categories={categories || []}
      allTxns={forecastTxns || []}
      visibleTxns={visibleTxns}
      recurrenceMap={recurrenceMap}
    />
  );

  const merchantsCard = (
    <TopMerchantsCard
      visibleTxns={visibleTxns}
      recurrenceMap={recurrenceMap}
    />
  );

  return (
    <PageLoader isLoading={isLoading}>
      <Box className={isTransitioning ? 'transitioning-panels' : ''} sx={{ height: isDesktop ? '100%' : 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <DemoModeBanner />
        {/* Combined Unified Toolbar */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          sx={{ width: '100%' }}
        >
          {/* Left Side: Filters button */}
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent={{ xs: 'space-between', md: 'flex-start' }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <ToggleButtonGroup size="small">
                <ToggleButton
                  value="filters"
                  selected={filterVisible}
                  onClick={toggleFilters}
                  sx={{ gap: 0.75, textTransform: 'none', px: 1.5, fontWeight: 600 }}
                  title="Toggle Filters Panel"
                >
                  <FilterListIcon fontSize="small" />
                  Filters
                </ToggleButton>
              </ToggleButtonGroup>
              {hasActiveFilters && (
                <Button
                  onClick={() => useFilters.getState().reset()}
                  variant="outlined"
                  color="primary"
                  size="small"
                  startIcon={<RestartAltIcon />}
                  sx={{
                    textTransform: 'none',
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    fontWeight: 600,
                  }}
                >
                  Reset Filters
                </Button>
              )}
            </Stack>

            {/* On mobile, show Merchants toggle on the far right of this first row */}
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              <ToggleButtonGroup size="small">
                <ToggleButton
                  value="merchants"
                  selected={sidebarVisible}
                  onClick={toggleSidebar}
                  sx={{ gap: 0.75, textTransform: 'none', px: 1.5, fontWeight: 600 }}
                  title="Toggle Top Merchants Panel"
                >
                  <StorefrontIcon fontSize="small" />
                  Merchants
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>

          {/* Center: RangePicker */}
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ flexGrow: 1 }}
          >
            <RangePicker />
          </Stack>

          {/* Right Side: Merchants button (desktop only) */}
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <ToggleButtonGroup size="small">
              <ToggleButton
                value="merchants"
                selected={sidebarVisible}
                onClick={toggleSidebar}
                sx={{ gap: 0.75, textTransform: 'none', px: 1.5, fontWeight: 600 }}
                title="Toggle Top Merchants Panel"
              >
                <StorefrontIcon fontSize="small" />
                Merchants
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>

        {/* Resizable content panel */}
        {!isDesktop ? (
          <Stack spacing={2}>
            <Collapse in={filterVisible} timeout={220} mountOnEnter unmountOnExit>
              {filterPanel}
            </Collapse>
            {middleSectionContent}
            <Collapse in={sidebarVisible} timeout={220} mountOnEnter unmountOnExit>
              {merchantsCard}
            </Collapse>
          </Stack>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
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
                <Panel id="filter" defaultSize={18} minSize={15}>
                  <PanelScroll>{filterPanel}</PanelScroll>
                </Panel>
              )}
              {filterVisible && <StyledResizeHandle ariaLabel="Resize filters / content" />}

              <Panel id="chart" defaultSize={40} minSize={25}>
                {middleSectionContent}
              </Panel>

              {sidebarVisible && <StyledResizeHandle ariaLabel="Resize content / top merchants" />}
              {sidebarVisible && (
                <Panel id="merchants" defaultSize={20} minSize={15}>
                  <PanelScroll>{merchantsCard}</PanelScroll>
                </Panel>
              )}
            </PanelGroup>
          </Box>
        )}



        {editTxn && (
          <RecategorizeDialog
            txn={editTxn}
            onClose={() => setEditTxn(null)}
          />
        )}
      </Box>
    </PageLoader>
  );
}

// ----- Subcomponents & Helpers -----

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle aria-label={ariaLabel} style={{ width: 16, position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          margin: '0 auto',
          width: 2,
          bgcolor: 'divider',
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
    <Box sx={{ height: '100%', overflow: 'auto', ...subtleScrollSx }}>
      {children}
    </Box>
  );
}





function TopMerchantsCard({
  visibleTxns,
  recurrenceMap,
}: {
  visibleTxns: Transaction[];
  recurrenceMap: ReturnType<typeof buildRecurrenceMap>;
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
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5, flexShrink: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Top merchants
        </Typography>
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
                        sx={{ fontSize: 12, color: 'primary.main', lineHeight: 1 }}
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



function DemoModeBanner() {
  const demoMode = useFilters((s) => s.demoMode);
  const setDemoMode = useFilters((s) => s.setDemoMode);

  if (!demoMode) return null;

  return (
    <Alert
      severity="warning"
      action={
        <Button
          size="small"
          variant="contained"
          color="warning"
          onClick={() => setDemoMode(false)}
          sx={{ textTransform: 'none', mr: 1 }}
        >
          Switch to Real Data
        </Button>
      }
      sx={{ alignItems: 'center' }}
    >
      <strong>Demo Mode is active.</strong> Your real accounts and transactions are hidden.
    </Alert>
  );
}

