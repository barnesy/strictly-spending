import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useTheme, alpha } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTransactionsPaginated, useTransactionCount, useDashboardAggregates, useSpendChartData, useTopMerchants, useIncomeChartData, useAccounts, useCategories, usePriorYearSpendChartData, usePriorYearIncomeChartData } from '../hooks/queries';
import { useSpendingForecast } from '../hooks/useSpendingForecast';
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
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableFooter,
  TablePagination,
  Tooltip,
  Alert,
  MenuItem,
  Drawer,
  Divider,
  Collapse,
  Menu,
  TextField,
  InputAdornment,
  Select,
  FormControl,
} from '@mui/material';
import PageLoader from '../components/PageLoader';
import DataTable from '../components/DataTable';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HistoryIcon from '@mui/icons-material/History';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import TuneIcon from '@mui/icons-material/Tune';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { getPriorYearMonth } from '../domain/forecastSpending';
import { useForecastStore } from '../stores/forecastStore';
import { loadForecastBaselineData } from '../domain/incomeStreams';

import {
  useFilters,
  resolveDateRange,
} from '../stores/store';
import { seedDemoData } from '../demoData';
import { queryClient } from '../queryClient';
import { usd, usdCents, monthsBetween, monthLabel } from '../lib';
import SpendChart from '../components/SpendChart';
import MonthTimelineView from '../components/MonthTimelineView';
import FilterPanel from '../components/FilterPanel';
import RangePicker from '../components/RangePicker';
import { TopMerchantsCard, DemoModeBanner } from '../components/dashboard/DashboardComponents';
import RecategorizeDialog from '../components/RecategorizeDialog';
import FutureMonthBreakdownDialog from '../components/FutureMonthBreakdownDialog';
import { subtleScrollSx } from '../styles';
import { recurrenceLabel } from '../domain/recurrence';
import type { Transaction } from '../types';
import { useDeferredRender } from '../hooks/useDeferredRender';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [filterVisible, setFilterVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 900) return false;
    return localStorage.getItem('dashboard:filterVisible') !== 'false';
  });
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 900) return false;
    return localStorage.getItem('dashboard:sidebarVisible') !== 'false';
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterPanelRef = useRef<PanelImperativeHandle>(null);
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null);

  const startPanelTransition = useCallback(() => {
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
      transitionTimeoutRef.current = null;
    }, 280);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Sync initial collapsed state on mount if saved as hidden
  useEffect(() => {
    if (!filterVisible && filterPanelRef.current) {
      filterPanelRef.current.collapse();
    }
    if (!sidebarVisible && sidebarPanelRef.current) {
      sidebarPanelRef.current.collapse();
    }
  }, []);

  const toggleFilters = () => {
    const panel = filterPanelRef.current;
    startPanelTransition();
    if (filterVisible) {
      setFilterVisible(false);
      panel?.collapse();
    } else {
      setFilterVisible(true);
      if (panel?.isCollapsed()) {
        panel.expand();
      }
      if (panel && (panel.getSize().asPercentage === 0 || panel.getSize().inPixels === 0)) {
        panel.resize('18%' as any);
      }
    }
  };

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    startPanelTransition();
    if (sidebarVisible) {
      setSidebarVisible(false);
      panel?.collapse();
    } else {
      setSidebarVisible(true);
      if (panel?.isCollapsed()) {
        panel.expand();
      }
      if (panel && (panel.getSize().asPercentage === 0 || panel.getSize().inPixels === 0)) {
        panel.resize('20%' as any);
      }
    }
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

  const spendOnly = useFilters((s) => s.spendOnly);
  const transactionType = useFilters((s) => s.transactionType);
  const searchQuery = useFilters((s) => s.searchQuery);
  const setSearchQuery = useFilters((s) => s.setSearchQuery);
  const minPrice = useFilters((s) => s.minPrice);
  const maxPrice = useFilters((s) => s.maxPrice);
  const demoMode = useFilters((s) => s.demoMode);

  const setGroupBy = useFilters((s) => s.setGroupBy);
  const drillToMonth = useFilters((s) => s.drillToMonth);
  const groupBy = useFilters((s) => s.groupBy);
  const [comparisonMonth, setComparisonMonth] = useState<string | null>(null);
  const [compareAnchorEl, setCompareAnchorEl] = useState<null | HTMLElement>(null);
  const [forecastAnchorEl, setForecastAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOptionsAnchorEl, setMobileOptionsAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (groupBy !== 'category' && groupBy !== 'account') {
      setGroupBy('category');
    }
  }, [groupBy, setGroupBy]);

  const activeGroupBy = groupBy === 'account' ? 'account' : 'category';


  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);

  const { data: accountsAll = [] } = useAccounts();
  const { data: categories = [] } = useCategories();

  const { data: pageRows = [] } = useTransactionsPaginated(page, pageSize);
  const { data: dbTxnCount = 0 } = useTransactionCount();
  const { data: dashboardAggregates } = useDashboardAggregates();
  const { data: spendChartData = [] } = useSpendChartData();
  const { data: topMerchantsData = [] } = useTopMerchants();
  const { data: incomeChartData = [] } = useIncomeChartData();

  const forecastHorizon = useFilters((s) => s.forecastHorizon);
  const setForecastHorizon = useFilters((s) => s.setForecastHorizon);

  const [selectedFutureMonth, setSelectedFutureMonth] = useState<string | null>(null);
  
  const dbAcctCount = accountsAll.length;

  const range = useMemo(() => {
    return resolveDateRange({
      preset,
      customStart,
      customEnd,
      earliestTransactionDate,
      latestTransactionDate,
    } as any);
  }, [preset, customStart, customEnd, earliestTransactionDate, latestTransactionDate]);

  const monthList = useMemo(
    () => monthsBetween(range.start, range.end),
    [range.start, range.end]
  );

  const isSingleMonth = monthList.length === 1;
  const currentSingleMonth = isSingleMonth ? monthList[0] : null;
  const priorYearMonth = currentSingleMonth ? getPriorYearMonth(currentSingleMonth) : null;

  const recentAvgIncome = dashboardAggregates?.totalIncome && monthList.length > 0
    ? Math.round(dashboardAggregates.totalIncome / monthList.length)
    : 0;

  const {
    recurrenceMap,
    availableMonths: forecastAvailableMonths,
    currentCalMonth,
    currentMonthForecastSummary,
  } = useSpendingForecast({
    categories,
    recentAvgIncome,
  });

  const viewMode: 'chart' | 'table' | 'timeline' = 
    location.pathname === '/transactions' ? 'table' :
    (location.pathname === '/timeline' && isSingleMonth) ? 'timeline' : 
    'chart';

  const setViewMode = (mode: 'chart' | 'table' | 'timeline') => {
    if (mode === 'table') {
      navigate('/transactions', { replace: true });
    } else if (mode === 'timeline') {
      navigate('/timeline', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  useEffect(() => {
    if (location.pathname === '/timeline' && !isSingleMonth) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, isSingleMonth, navigate]);

  const availableDashboardMonths = useMemo(() => {
    const set = new Set<string>(forecastAvailableMonths);
    if (priorYearMonth) {
      set.add(priorYearMonth);
    }
    return Array.from(set).sort().reverse();
  }, [forecastAvailableMonths, priorYearMonth]);

  const { data: comparisonSpendChartData = [] } = usePriorYearSpendChartData(
    comparisonMonth,
    activeGroupBy,
    Boolean(isSingleMonth && comparisonMonth)
  );
  const { data: comparisonIncomeChartData = [] } = usePriorYearIncomeChartData(
    comparisonMonth,
    Boolean(isSingleMonth && comparisonMonth)
  );

  const effectiveMonthList = useMemo(() => {
    if (isSingleMonth && comparisonMonth) {
      return [comparisonMonth, currentSingleMonth].sort();
    }
    return monthList;
  }, [isSingleMonth, comparisonMonth, currentSingleMonth, monthList]);

  const effectiveSpendChartData = useMemo(() => {
    if (isSingleMonth && comparisonMonth && comparisonSpendChartData.length > 0) {
      return [...comparisonSpendChartData, ...spendChartData];
    }
    return spendChartData;
  }, [isSingleMonth, comparisonMonth, comparisonSpendChartData, spendChartData]);

  const effectiveIncomeChartData = useMemo(() => {
    if (isSingleMonth && comparisonMonth && comparisonIncomeChartData.length > 0) {
      return [...comparisonIncomeChartData, ...incomeChartData];
    }
    return incomeChartData;
  }, [isSingleMonth, comparisonMonth, comparisonIncomeChartData, incomeChartData]);

  const isBaselineLoaded = useForecastStore((s) => s.realBaseline.isLoaded);
  const setBaselineData = useForecastStore((s) => s.setBaselineData);

  useEffect(() => {
    if (!isBaselineLoaded) {
      loadForecastBaselineData()
        .then(({ baseline, destinations, incomeStreams }) => {
          setBaselineData(baseline, destinations, incomeStreams);
        })
        .catch((e) => console.warn('Could not auto-load forecast baseline on dashboard:', e));
    }
  }, [isBaselineLoaded, setBaselineData]);

  const isCurrentMonthInRange = useMemo(() => monthList.includes(currentCalMonth), [monthList, currentCalMonth]);

  const accounts = useMemo(
    () =>
      accountsAll && demoMode
        ? accountsAll.filter((a) => a.source === 'demo')
        : accountsAll?.filter((a) => a.source !== 'demo'),
    [accountsAll, demoMode]
  );

  // Account synchronization is handled globally in Layout.tsx
  const hasActiveFilters = useFilters((s) => {
    const accountFilterActive = accounts && accounts.length > 0 && s.enabledAccountIds.length < accounts.length;
    return (
      s.preset !== 'ytd' ||
      s.disabledCategories.length > 0 ||
      s.transactionType !== 'spend' ||
      !s.spendOnly ||
      s.recurrenceFilter !== 'all' ||
      s.searchQuery !== '' ||
      s.minPrice !== undefined ||
      s.maxPrice !== undefined ||
      s.drill !== null ||
      Boolean(accountFilterActive)
    );
  });


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [dbTxnCount]);

  const accountName = (id: number) =>
    accounts?.find((a) => a.id === id)?.name || '–';
  const categoryColor = (name: string) =>
    categories?.find((c) => c.name === name)?.color || '#bdbdbd';

  // Persist resizable panel layout sizes across the 3 unified panels.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'dashboard-unified-3panel-v1',
    panelIds: ['filter', 'chart', 'merchants'],
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const isLoading = !accounts || !categories || dbTxnCount === undefined || dbAcctCount === undefined || !dashboardAggregates;
  const shouldRender = useDeferredRender();

  if (isLoading || !shouldRender) {
    return <PageLoader isLoading={true}>{false}</PageLoader>;
  }

  if (dbAcctCount === 0) {
    return (
      <PageLoader isLoading={isLoading}>
        <Stack spacing={2.5} alignItems="flex-start" sx={{ width: '100%' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Dashboard</Typography>
          <Alert severity="info" sx={{ width: '100%' }}>
            No transactions yet. Import a CSV from your bank or explore the app immediately with sample household data.
          </Alert>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button component={RouterLink} to="/import" variant="contained" size="large" sx={{ textTransform: 'none', fontWeight: 600 }}>
              Import CSVs
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={async () => {
                await seedDemoData();
                useFilters.getState().setDemoMode(true);
                await queryClient.invalidateQueries();
                window.dispatchEvent(new Event('db-update'));
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Explore Sample Household Data
            </Button>
          </Stack>
        </Stack>
      </PageLoader>
    );
  }

  const pageTotal = pageRows.reduce((sum, t) => sum + t.amount, 0);

  const viewTotalSpend = dashboardAggregates?.totalSpend || 0;
  const viewTotalIncome = dashboardAggregates?.totalIncome || 0;
  const viewNet = viewTotalIncome - viewTotalSpend;

  const displayTotal =
    transactionType === 'spend'
      ? -viewTotalSpend
      : transactionType === 'income'
      ? viewTotalIncome
      : viewNet;

  const formattedDisplayTotal =
    displayTotal > 0
      ? `+${usdCents.format(displayTotal)}`
      : usdCents.format(displayTotal);

  const mainTable = (
    <Box sx={{ height: { xs: 'auto', md: '100%' }, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: { xs: 'visible', md: 'hidden' } }}>
      <Collapse in={transactionType === 'income'} timeout={220} unmountOnExit={false} sx={{ flexShrink: 0 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            px: 2,
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : 'rgba(46, 125, 50, 0.08)',
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.25)',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TrendingUpIcon color="success" />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'success.main' }}>
                Itemized Income & Deposits
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Showing all incoming paychecks, direct deposits, dividends, and credits
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontSize: 10, fontWeight: 700 }}>
                Total Income in View
              </Typography>
              <Typography variant="h6" color="success.main" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                +{usd.format(dashboardAggregates?.totalIncome || 0)}
              </Typography>
            </Box>
            <Chip
              label={`${dbTxnCount} ${dbTxnCount === 1 ? 'transaction' : 'transactions'}`}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
        </Paper>
      </Collapse>
      {!isDesktop ? (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <Stack divider={<Divider />}>
            {pageRows.map((t) => {
              const info = t.recurrence === 'recurring' ? recurrenceMap.get(t.merchantKey) : undefined;
              const recLabel = info ? recurrenceLabel(info.kind) : 'Recurring';
              return (
                <Box
                  key={t.id}
                  onClick={() => setEditTxn(t)}
                  sx={{
                    p: 1.25,
                    px: 1.5,
                    cursor: 'pointer',
                    transition: 'background-color 120ms ease',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:active': { bgcolor: 'action.selected' },
                  }}
                >
                  {/* Top Row: Description + Amount */}
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      {t.recurrence === 'recurring' && (
                        <Box
                          component="span"
                          title={recLabel}
                          sx={{ color: 'primary.main', fontSize: 13, mr: 0.5, fontWeight: 700 }}
                        >
                          &#x21bb;
                        </Box>
                      )}
                      {t.description}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        lineHeight: 1.3,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        color: t.amount > 0 ? 'success.main' : 'text.primary',
                      }}
                    >
                      {t.amount > 0 ? `+${usdCents.format(t.amount)}` : usdCents.format(t.amount)}
                    </Typography>
                  </Stack>

                  {/* Bottom Row: Date · Account + Category & Tax Chips */}
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={0.75}
                    sx={{ mt: 0.75 }}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: '0.72rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '48%',
                      }}
                    >
                      {t.date} · {accountName(t.accountId)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                      {t.isPending && (
                        <Tooltip title="Pending bank authorization — final amount may update when settled (e.g. after tip or gas fill-up)">
                          <Chip
                            label="⏳ Pending"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: '10px',
                              fontWeight: 700,
                              '& .MuiChip-label': { px: 0.65 },
                            }}
                          />
                        </Tooltip>
                      )}
                      <Chip
                        label={t.category}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTxn(t);
                        }}
                        sx={{
                          cursor: 'pointer',
                          height: 22,
                          maxWidth: 140,
                          fontSize: '11px',
                          '& .MuiChip-label': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            px: 0.75,
                          },
                          bgcolor: categoryColor(t.category) + '22',
                          color: categoryColor(t.category),
                          fontWeight: 600,
                          border: t.userOverridden ? '1px solid' : 'none',
                          borderColor: t.userOverridden ? categoryColor(t.category) : 'transparent',
                        }}
                      />
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            {pageRows.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                No transactions match.
              </Box>
            )}
          </Stack>

          {/* Mobile Table Summary & Pagination Footer */}
          <Box
            sx={{
              px: 1.5,
              py: 1.25,
              borderTop: '2px solid',
              borderColor: 'divider',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                Total ({dbTxnCount.toLocaleString()} {dbTxnCount === 1 ? 'txn' : 'txns'})
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  fontVariantNumeric: 'tabular-nums',
                  color: displayTotal > 0 ? 'success.main' : displayTotal < 0 ? 'inherit' : 'text.secondary',
                }}
              >
                {formattedDisplayTotal}
              </Typography>
            </Stack>
            {transactionType === 'all' && (
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 0.25 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Spend: <Box component="span" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{usdCents.format(-viewTotalSpend)}</Box>
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>•</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Income: <Box component="span" sx={{ color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>+{usdCents.format(viewTotalIncome)}</Box>
                </Typography>
              </Stack>
            )}
          </Box>
          <TablePagination
            component="div"
            count={dbTxnCount}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="Rows:"
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              '& .MuiTablePagination-toolbar': {
                px: 1,
                minHeight: 42,
              },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                fontSize: '0.75rem',
                m: 0,
              },
            }}
          />
        </Box>
      ) : (
        <DataTable
          containerSx={{
            flex: 1,
            minHeight: 0,
            border: '1px solid rgba(0,0,0,0.08)',
            bgcolor: 'background.paper',
            overflowX: 'hidden',
            ...subtleScrollSx,
          }}
          size="small"
          stickyHeader
          sx={{ tableLayout: 'fixed', width: '100%' }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 88, py: 1, px: 0.75 }}>Date</TableCell>
              <TableCell sx={{ width: 96, py: 1, px: 0.75 }}>Account</TableCell>
              <TableCell sx={{ py: 1, px: 0.75 }}>Description</TableCell>
              <TableCell sx={{ width: 106, py: 1, px: 0.75 }}>Category</TableCell>
              <TableCell align="right" sx={{ width: 84, py: 1, px: 0.75 }}>Amount</TableCell>
              <TableCell sx={{ width: 32, p: 0.25 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap', py: 0.75, px: 0.75, fontSize: '0.78rem' }}>{t.date}</TableCell>
                <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 0.75, px: 0.75 }} title={accountName(t.accountId)}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {accountName(t.accountId)}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    py: 0.75,
                    px: 0.75,
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
                  {t.isPending && (
                    <Tooltip title="Pending bank authorization — final amount may update when settled (e.g. after tip or gas fill-up)">
                      <Chip
                        label="⏳ Pending"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{
                          ml: 0.75,
                          height: 18,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          verticalAlign: 'middle',
                          '& .MuiChip-label': { px: 0.6 },
                        }}
                      />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell sx={{ py: 0.75, px: 1 }}>
                  <Tooltip title="Click to recategorize">
                    <Chip
                      label={t.category}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTxn(t);
                      }}
                      sx={{
                        cursor: 'pointer',
                        maxWidth: 130,
                        '& .MuiChip-label': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          px: 1,
                        },
                        bgcolor: categoryColor(t.category) + '22',
                        color: categoryColor(t.category),
                        fontWeight: 500,
                        border: t.userOverridden ? '1px solid' : 'none',
                        borderColor: t.userOverridden
                          ? categoryColor(t.category)
                          : 'transparent',
                      }}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    whiteSpace: 'nowrap',
                    py: 0.75,
                    px: 1,
                    color: t.amount > 0 ? 'success.main' : 'inherit',
                    fontWeight: t.amount > 0 ? 600 : 500,
                  }}
                >
                  {t.amount > 0 ? `+${usdCents.format(t.amount)}` : usdCents.format(t.amount)}
                </TableCell>
                <TableCell sx={{ width: 36, p: 0.5 }}>
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
          <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 2 }}>
            <TableRow
              sx={{
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              }}
            >
              <TableCell
                colSpan={4}
                sx={{
                  py: 1.25,
                  px: 1.5,
                  borderTop: '2px solid',
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
                    Total ({dbTxnCount.toLocaleString()} {dbTxnCount === 1 ? 'transaction' : 'transactions'})
                  </Typography>
                  {transactionType === 'all' && (
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Spend: <Box component="span" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{usdCents.format(-viewTotalSpend)}</Box>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>•</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Income: <Box component="span" sx={{ color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>+{usdCents.format(viewTotalIncome)}</Box>
                      </Typography>
                    </Stack>
                  )}
                  {dbTxnCount > pageRows.length && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      (Page: {pageTotal > 0 ? `+${usdCents.format(pageTotal)}` : usdCents.format(pageTotal)})
                    </Typography>
                  )}
                </Stack>
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  py: 1.25,
                  px: 1,
                  borderTop: '2px solid',
                  borderColor: 'divider',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  color: displayTotal > 0 ? 'success.main' : displayTotal < 0 ? 'inherit' : 'text.secondary',
                }}
              >
                {formattedDisplayTotal}
              </TableCell>
              <TableCell
                sx={{
                  width: 36,
                  p: 0.5,
                  borderTop: '2px solid',
                  borderColor: 'divider',
                }}
              />
            </TableRow>
            <TableRow>
              <TablePagination
                count={dbTxnCount}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={pageSize}
                onRowsPerPageChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                rowsPerPageOptions={[25, 50, 100, 250]}
                colSpan={6}
                sx={{
                  '& .MuiTablePagination-toolbar': {
                    px: 1,
                    minHeight: 44,
                  },
                  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                    fontSize: '0.8rem',
                    m: 0,
                  },
                }}
              />
            </TableRow>
          </TableFooter>
        </DataTable>
      )}
    </Box>
  );

  const toolbarToggleGroupSx = {
    height: { xs: 40, sm: 32 },
    '& .MuiToggleButton-root': {
      textTransform: 'none',
      fontWeight: 500,
      '&.Mui-selected': { fontWeight: 600 },
      fontSize: { xs: '0.82rem', sm: '0.75rem' },
      height: { xs: 40, sm: 32 },
      px: { xs: 1.35, sm: 1.2 },
      whiteSpace: 'nowrap',
      transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
  };

  const forecastLabel =
    forecastHorizon === 0
      ? 'Forecast'
      : forecastHorizon === 0.5
      ? 'Forecast: This Mo'
      : `Forecast: +${forecastHorizon}M`;

  const breakdownTargetMonth = isSingleMonth && currentSingleMonth
    ? currentSingleMonth
    : isCurrentMonthInRange
    ? currentCalMonth
    : null;

  const middleSectionContent = (
    <Paper sx={{ p: { xs: 1.25, sm: 2 }, height: { xs: 'auto', md: '100%' }, display: 'flex', flexDirection: 'column' }}>
      {/* Middle Section Header — Uniform & Mobile-Responsive Toolbar */}
      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        alignItems="center"
        flexWrap="nowrap"
        sx={{ mb: 1.5, flexShrink: 0 }}
      >
        {/* Group 1: View Switcher (uses Select on xs when 3 options are present) */}
        {isSingleMonth && (
          <FormControl size="small" sx={{ display: { xs: 'inline-flex', sm: 'none' }, minWidth: 118 }}>
            <Select
              variant="outlined"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'chart' | 'timeline' | 'table')}
              sx={{
                height: 40,
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
            >
              <MenuItem value="chart">View: Chart</MenuItem>
              <MenuItem value="timeline">View: Timeline</MenuItem>
              <MenuItem value="table">View: Table</MenuItem>
            </Select>
          </FormControl>
        )}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
          sx={{
            ...toolbarToggleGroupSx,
            ...(isSingleMonth ? { display: { xs: 'none', sm: 'inline-flex' } } : {}),
          }}
        >
          <ToggleButton value="chart">Chart</ToggleButton>
          {isSingleMonth && <ToggleButton value="timeline">Timeline</ToggleButton>}
          <ToggleButton value="table">Table</ToggleButton>
        </ToggleButtonGroup>

        {/* Mobile Consolidated Options Menu Button (xs / sm) */}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ display: { xs: 'flex', md: 'none' } }}>
          {viewMode === 'chart' ? (
            <ToggleButtonGroup size="small" sx={toolbarToggleGroupSx}>
              <ToggleButton
                value="mobile-options"
                selected={activeGroupBy === 'account' || forecastHorizon > 0 || Boolean(comparisonMonth)}
                onClick={(e) => setMobileOptionsAnchorEl(e.currentTarget)}
              >
                <TuneIcon sx={{ fontSize: 15, mr: 0.5 }} />
                Options
                <ArrowDropDownIcon sx={{ fontSize: '1rem', ml: 0.25, mr: -0.5, opacity: 0.75 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          ) : (
            breakdownTargetMonth && (
              <ToggleButtonGroup size="small" sx={toolbarToggleGroupSx}>
                <ToggleButton
                  value="breakdown"
                  selected={false}
                  onClick={() => setSelectedFutureMonth(breakdownTargetMonth)}
                >
                  Breakdown
                </ToggleButton>
              </ToggleButtonGroup>
            )
          )}
        </Stack>

        {/* Desktop Chart Grouping + Forecast / Compare / Breakdown Actions (md+) */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ display: { xs: 'none', md: 'flex' } }}
        >
          {viewMode === 'chart' && (
            <ToggleButtonGroup
              value={activeGroupBy}
              exclusive
              onChange={(_, v) => v && setGroupBy(v)}
              size="small"
              sx={toolbarToggleGroupSx}
            >
              <ToggleButton value="category">Category</ToggleButton>
              <ToggleButton value="account">Account</ToggleButton>
            </ToggleButtonGroup>
          )}

          {(viewMode === 'chart' || (isSingleMonth && currentSingleMonth)) && (
            <ToggleButtonGroup size="small" sx={toolbarToggleGroupSx}>
              {viewMode === 'chart' && (
                <ToggleButton
                  id="dashboard-forecast-toggle-btn"
                  value="forecast"
                  selected={forecastHorizon > 0}
                  onClick={(e) => setForecastAnchorEl(e.currentTarget)}
                >
                  {forecastLabel}
                  <ArrowDropDownIcon sx={{ fontSize: '1rem', ml: 0.25, mr: -0.5, opacity: 0.75 }} />
                </ToggleButton>
              )}

              {viewMode === 'chart' && isSingleMonth && (
                <ToggleButton
                  id="dashboard-compare-toggle-btn"
                  value="compare"
                  selected={Boolean(comparisonMonth)}
                  onClick={(e) => setCompareAnchorEl(e.currentTarget)}
                >
                  {comparisonMonth ? `Compare: ${monthLabel(comparisonMonth)}` : 'Compare'}
                  <ArrowDropDownIcon sx={{ fontSize: '1rem', ml: 0.25, mr: -0.5, opacity: 0.75 }} />
                </ToggleButton>
              )}

              {breakdownTargetMonth && (
                <ToggleButton
                  id="single-month-inspect-btn"
                  value="breakdown"
                  selected={false}
                  onClick={() => setSelectedFutureMonth(breakdownTargetMonth)}
                  title={
                    isCurrentMonthInRange && breakdownTargetMonth === currentCalMonth
                      ? `${monthLabel(currentCalMonth)} (Day ${currentMonthForecastSummary.dayOfMonth}/${currentMonthForecastSummary.daysInMonth}) breakdown`
                      : `Inspect ${monthLabel(breakdownTargetMonth)} breakdown`
                  }
                >
                  Breakdown
                </ToggleButton>
              )}
            </ToggleButtonGroup>
          )}
        </Stack>

        {/* Mobile Unified Options Menu */}
        <Menu
          anchorEl={mobileOptionsAnchorEl}
          open={Boolean(mobileOptionsAnchorEl)}
          onClose={() => setMobileOptionsAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              minWidth: 220,
              maxHeight: 380,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              boxShadow: (theme) => theme.shadows[4],
            },
          }}
        >
          {breakdownTargetMonth && (
            <MenuItem
              onClick={() => {
                setSelectedFutureMonth(breakdownTargetMonth);
                setMobileOptionsAnchorEl(null);
              }}
              sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'primary.main' }}
            >
              Inspect {monthLabel(breakdownTargetMonth)} Breakdown
            </MenuItem>
          )}
          {breakdownTargetMonth && <Divider />}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: 0.4 }}
          >
            GROUP BY
          </Typography>
          <MenuItem
            selected={activeGroupBy === 'category'}
            onClick={() => {
              setGroupBy('category');
              setMobileOptionsAnchorEl(null);
            }}
            sx={{ fontSize: '0.8125rem', fontWeight: activeGroupBy === 'category' ? 600 : 400 }}
          >
            By Category
          </MenuItem>
          <MenuItem
            selected={activeGroupBy === 'account'}
            onClick={() => {
              setGroupBy('account');
              setMobileOptionsAnchorEl(null);
            }}
            sx={{ fontSize: '0.8125rem', fontWeight: activeGroupBy === 'account' ? 600 : 400 }}
          >
            By Account
          </MenuItem>
          <Divider />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: 0.4 }}
          >
            FORECAST
          </Typography>
          {[
            { value: 0, label: 'Forecast: Off' },
            { value: 0.5, label: 'This Month (Remaining)' },
            { value: 1, label: '+1 Month' },
            { value: 3, label: '+3 Months' },
            { value: 6, label: '+6 Months' },
            { value: 12, label: '+12 Months' },
          ].map((opt) => (
            <MenuItem
              key={opt.value}
              selected={forecastHorizon === opt.value}
              onClick={() => {
                setForecastHorizon(opt.value as any);
                setMobileOptionsAnchorEl(null);
              }}
              sx={{ fontSize: '0.8125rem', fontWeight: forecastHorizon === opt.value ? 600 : 400 }}
            >
              {opt.label}
            </MenuItem>
          ))}
          {isSingleMonth && (
            <>
              <Divider />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: 0.4 }}
              >
                COMPARE MONTH
              </Typography>
              <MenuItem
                selected={!comparisonMonth}
                onClick={() => {
                  setComparisonMonth(null);
                  setMobileOptionsAnchorEl(null);
                }}
                sx={{ fontSize: '0.8125rem' }}
              >
                None (Off)
              </MenuItem>
              {priorYearMonth && (
                <MenuItem
                  selected={comparisonMonth === priorYearMonth}
                  onClick={() => {
                    setComparisonMonth(priorYearMonth);
                    setMobileOptionsAnchorEl(null);
                  }}
                  sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'secondary.main' }}
                >
                  {monthLabel(priorYearMonth)} (Last Year)
                </MenuItem>
              )}
            </>
          )}
        </Menu>

        {/* Forecast Horizon Dropdown Menu */}
        <Menu
          id="dashboard-forecast-menu"
          anchorEl={forecastAnchorEl}
          open={Boolean(forecastAnchorEl)}
          onClose={() => setForecastAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              minWidth: 185,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              boxShadow: (theme) => theme.shadows[4],
            },
          }}
        >
          {[
            { value: 0, label: 'Forecast: Off' },
            { value: 0.5, label: 'This Month (Remaining)' },
            { value: 1, label: '+1 Month' },
            { value: 3, label: '+3 Months' },
            { value: 6, label: '+6 Months' },
            { value: 12, label: '+12 Months' },
          ].map((opt) => (
            <MenuItem
              key={opt.value}
              selected={forecastHorizon === opt.value}
              onClick={() => {
                setForecastHorizon(opt.value as any);
                setForecastAnchorEl(null);
              }}
              sx={{ fontSize: '0.8125rem', fontWeight: forecastHorizon === opt.value ? 600 : 400 }}
            >
              {opt.label}
            </MenuItem>
          ))}
        </Menu>

        {/* Compare Month Dropdown Menu */}
        <Menu
          id="dashboard-compare-menu"
          anchorEl={compareAnchorEl}
          open={Boolean(compareAnchorEl)}
          onClose={() => setCompareAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              maxHeight: 320,
              minWidth: 200,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              boxShadow: (theme) => theme.shadows[4],
            },
          }}
        >
          <MenuItem
            selected={!comparisonMonth}
            onClick={() => {
              setComparisonMonth(null);
              setCompareAnchorEl(null);
            }}
            sx={{ fontSize: '0.8125rem' }}
          >
            <em>None (Off)</em>
          </MenuItem>
          {priorYearMonth && (
            <MenuItem
              selected={comparisonMonth === priorYearMonth}
              onClick={() => {
                setComparisonMonth(priorYearMonth);
                setCompareAnchorEl(null);
              }}
              sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'secondary.main' }}
            >
              {monthLabel(priorYearMonth)} (Same Month Last Year)
            </MenuItem>
          )}
          {availableDashboardMonths
            .filter((m) => m !== currentSingleMonth && m !== priorYearMonth)
            .map((m) => (
              <MenuItem
                key={m}
                selected={comparisonMonth === m}
                onClick={() => {
                  setComparisonMonth(m);
                  setCompareAnchorEl(null);
                }}
                sx={{ fontSize: '0.8125rem' }}
              >
                {monthLabel(m)}
              </MenuItem>
            ))}
        </Menu>
      </Stack>

      {/* Comparison Banner when comparing with any selected month */}
      {viewMode === 'chart' && isSingleMonth && comparisonMonth && (
        <Paper
          elevation={0}
          sx={{
            p: 1.25,
            px: 2,
            mb: 1.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.08),
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.secondary.main, 0.25),
            flexShrink: 0,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <HistoryIcon color="secondary" sx={{ fontSize: 22 }} />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Comparing {monthLabel(comparisonMonth)} vs {monthLabel(currentSingleMonth)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {comparisonMonth === priorYearMonth
                  ? `Same month last year actuals are displayed side-by-side with ${monthLabel(currentSingleMonth)}.`
                  : `Historical actuals for ${monthLabel(comparisonMonth)} are displayed side-by-side with ${monthLabel(currentSingleMonth)}.`}
                {' '}Click any bar to inspect categorical breakdown.
              </Typography>
            </Box>
          </Stack>
          <Button
            size="small"
            color="inherit"
            onClick={() => setComparisonMonth(null)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
          >
            Clear Comparison
          </Button>
        </Paper>
      )}

      {/* Content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: { xs: 'visible', md: dbTxnCount === 0 ? 'auto' : 'hidden' }, ...subtleScrollSx }}>
        {dbTxnCount === 0 ? (
          !demoMode && (!accounts || accounts.length === 0) ? (
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
                animation: 'fadeIn 220ms ease-out',
                '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Welcome to Strictly Spending
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
                Connect your bank accounts via SimpleFIN Bridge, import a CSV statement from any bank or card, or explore the app with sample data.
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.25}
                sx={{ mt: 1, width: { xs: '100%', sm: 'auto' }, maxWidth: 340 }}
              >
                <Button
                  variant="contained"
                  component={RouterLink}
                  to="/import"
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                >
                  Connect Bank or Import CSV
                </Button>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    await seedDemoData();
                    useFilters.getState().setDemoMode(true);
                    await queryClient.invalidateQueries();
                    window.dispatchEvent(new Event('db-update'));
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                >
                  Try Demo Mode
                </Button>
              </Stack>
            </Box>
          ) : (
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
                animation: 'fadeIn 220ms ease-out',
                '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {transactionType === 'income' ? 'No income transactions match current filters' : 'No transactions match current filters'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450 }}>
                {transactionType === 'income'
                  ? 'None of your income deposits or payroll match the selected date range or active accounts.'
                  : 'None of your transactions match the selected date range or active accounts.'}
                {transactionType === 'spend' && spendOnly && (
                  <Box component="span" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                    Tip: <strong>Expenses only</strong> is currently enabled, which excludes bank transfers and deposits.
                  </Box>
                )}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                {transactionType === 'income' ? (
                  <>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        const filterState = useFilters.getState();
                        filterState.setPreset('allTime');
                      }}
                      sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                    >
                      Show All Time
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => {
                        const filterState = useFilters.getState();
                        filterState.setTransactionType('all');
                      }}
                      sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                    >
                      View All Transactions
                    </Button>
                  </>
                ) : (
                  <>
                    {spendOnly && (
                      <Button
                        variant="outlined"
                        onClick={() => useFilters.getState().setSpendOnly(false)}
                        sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                      >
                        Turn off "Spend only"
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      onClick={() => {
                        const filterState = useFilters.getState();
                        filterState.reset();
                        filterState.setPreset('allTime');
                      }}
                      sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                    >
                      Reset Filters & Show All Time
                    </Button>
                  </>
                )}
              </Stack>
            </Box>
          )
        ) : viewMode === 'chart' ? (
          <Box
            key="dashboard-chart-view"
            sx={{
              width: '100%',
              height: { xs: '75vh', md: '100%' },
              minHeight: 260,
              animation: 'fadeIn 220ms ease-out',
              '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          >
            <SpendChart
              spendChartData={effectiveSpendChartData}
              incomeChartData={effectiveIncomeChartData}
              dashboardAggregates={dashboardAggregates || { totalSpend: 0, totalIncome: 0, accountTotals: {} }}
              monthList={effectiveMonthList}
              accounts={accounts || []}
              categories={categories || []}
              groupBy={activeGroupBy}
              recurrenceMap={recurrenceMap}
              isSingleMonth={isSingleMonth}
              onMonthClick={(monthKey) => drillToMonth(monthKey)}
              onFutureMonthClick={(monthKey) => setSelectedFutureMonth(monthKey)}
            />
          </Box>
        ) : viewMode === 'timeline' && currentSingleMonth ? (
          <Box
            key="dashboard-timeline-view"
            sx={{
              height: { xs: 'auto', md: '100%' },
              animation: 'fadeIn 220ms ease-out',
              '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          >
            <MonthTimelineView
              currentMonth={currentSingleMonth}
              availableMonths={availableDashboardMonths}
              accounts={accounts || []}
              categories={categories || []}
              recurrenceMap={recurrenceMap}
              onEditTransaction={(txn) => setEditTxn(txn)}
            />
          </Box>
        ) : (
          <Box
            key="dashboard-table-view"
            sx={{
              height: { xs: 'auto', md: '100%' },
              animation: 'fadeIn 220ms ease-out',
              '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          >
            {mainTable}
          </Box>
        )}
      </Box>
    </Paper>
  );

  const filterPanel = (
    <FilterPanel
      accounts={accounts || []}
      categories={categories || []}
      dashboardAggregates={dashboardAggregates || { totalSpend: 0, totalIncome: 0, accountTotals: {} }}
      allTxnCount={dbTxnCount}
      recurrenceMap={recurrenceMap}
    />
  );

  const merchantsCard = (
    <TopMerchantsCard
      topMerchantsData={topMerchantsData}
      recurrenceMap={recurrenceMap}
      isIncome={transactionType === 'income'}
    />
  );

  return (
    <PageLoader isLoading={isLoading}>
      <Box className={isTransitioning ? 'transitioning-panels' : ''} sx={{ height: isDesktop ? '100%' : 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <DemoModeBanner />
        {/* Combined Unified Toolbar */}
        <Stack
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
          sx={{ width: '100%' }}
        >
          {/* Left Side: Filters & Reset group */}
          <ToggleButtonGroup
            size="small"
            sx={{
              height: { xs: 42, sm: 36 },
              flexShrink: 0,
              '& .MuiToggleButton-root': {
                height: { xs: 42, sm: 36 },
                px: { xs: 1.35, sm: 1.25 },
                gap: 0.5,
                fontSize: { xs: '0.84rem', sm: '0.8125rem' },
                fontWeight: 600,
                textTransform: 'none',
                '&.Mui-selected': { fontWeight: 700 },
              },
            }}
          >
            <ToggleButton
              value="filters"
              selected={filterVisible}
              onClick={toggleFilters}
              title="Toggle Filters Panel"
            >
              <FilterListIcon sx={{ fontSize: 16 }} />
              Filters
            </ToggleButton>
            {hasActiveFilters && (
              <ToggleButton
                value="reset"
                selected={false}
                onClick={() => useFilters.getState().reset()}
                title="Reset Active Filters"
                sx={{ color: 'warning.main', px: { xs: '10px !important', sm: '10px !important' } }}
              >
                <RestartAltIcon sx={{ fontSize: 16 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Reset
                </Box>
              </ToggleButton>
            )}
          </ToggleButtonGroup>

          {/* Center: RangePicker (Compact Dropdown on Mobile, Full Bar on Desktop) */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="center"
            sx={{ flexGrow: 1, minWidth: 0 }}
          >
            <RangePicker />
          </Stack>

          {/* Right Side: Merchants button */}
          <ToggleButtonGroup
            size="small"
            sx={{
              height: { xs: 42, sm: 36 },
              flexShrink: 0,
              '& .MuiToggleButton-root': {
                height: { xs: 42, sm: 36 },
                px: { xs: 1.35, sm: 1.25 },
                gap: 0.5,
                fontSize: { xs: '0.84rem', sm: '0.8125rem' },
                fontWeight: 600,
                textTransform: 'none',
                '&.Mui-selected': { fontWeight: 700 },
              },
            }}
          >
            <ToggleButton
              value="merchants"
              selected={sidebarVisible}
              onClick={toggleSidebar}
              title="Toggle Top Merchants Panel"
            >
              <StorefrontIcon sx={{ fontSize: 16 }} />
              {transactionType === 'income' ? 'Sources' : 'Merchants'}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* Resizable content panel */}
        {!isDesktop ? (
          <>
            <TextField
              size="small"
              fullWidth
              placeholder="Quick search merchants, descriptions, or notes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              sx={{
                '& .MuiInputBase-root': {
                  height: 36,
                  fontSize: '0.84rem',
                  bgcolor: 'background.paper',
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSearchQuery('');
                          setPage(0);
                        }}
                        aria-label="Clear search"
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <Drawer
              anchor="left"
              open={filterVisible}
              onClose={() => setFilterVisible(false)}
              ModalProps={{ keepMounted: true }}
              PaperProps={{ sx: { width: { xs: '100%', sm: 360 } } }}
              sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Filters</Typography>
                <IconButton onClick={() => setFilterVisible(false)} size="small" aria-label="Close filters">
                  <CloseIcon />
                </IconButton>
              </Box>
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, ...subtleScrollSx }}>
                {filterPanel}
              </Box>
            </Drawer>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              {middleSectionContent}
            </Box>
            <Drawer
              anchor="right"
              open={sidebarVisible}
              onClose={() => setSidebarVisible(false)}
              ModalProps={{ keepMounted: true }}
              PaperProps={{ sx: { width: { xs: '100%', sm: 360 } } }}
              sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {transactionType === 'income' ? 'Top Income Sources' : 'Top Merchants'}
                </Typography>
                <IconButton onClick={() => setSidebarVisible(false)} size="small" aria-label="Close merchants">
                  <CloseIcon />
                </IconButton>
              </Box>
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, ...subtleScrollSx }}>
                {merchantsCard}
              </Box>
            </Drawer>
          </>
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
              onLayoutChanged={(layout) => {
                if (isTransitioningRef.current) return;
                onLayoutChanged(layout);
              }}
              className={isTransitioning ? 'transitioning-panels' : ''}
              style={{ height: '100%' }}
            >
              <Panel
                panelRef={filterPanelRef}
                id="filter"
                defaultSize={filterVisible ? "18%" : "0%"}
                minSize="15%"
                collapsible={true}
                collapsedSize="0%"
                style={{ overflow: 'hidden' }}
                onResize={(size) => {
                  if (isTransitioningRef.current) return;
                  const isZero = size.inPixels === 0 || size.asPercentage === 0;
                  if (isZero && filterVisible) {
                    setFilterVisible(false);
                  } else if (!isZero && !filterVisible) {
                    setFilterVisible(true);
                  }
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: '100%',
                    minWidth: 260,
                    overflow: 'hidden',
                    opacity: filterVisible ? 1 : 0,
                    transform: filterVisible ? 'none' : 'translateX(-20px)',
                    transition: 'opacity var(--transition-duration) var(--transition-easing), transform var(--transition-duration) var(--transition-easing)',
                    pointerEvents: filterVisible ? 'auto' : 'none',
                    willChange: isTransitioning ? 'opacity, transform' : 'auto',
                  }}
                >
                  <PanelScroll>{filterPanel}</PanelScroll>
                </Box>
              </Panel>

              <StyledResizeHandle
                ariaLabel="Resize filters / content"
                visible={filterVisible}
              />

              <Panel id="chart" defaultSize="50%" minSize="25%">
                {middleSectionContent}
              </Panel>

              <StyledResizeHandle
                ariaLabel="Resize content / top merchants"
                visible={sidebarVisible}
              />

              <Panel
                panelRef={sidebarPanelRef}
                id="merchants"
                defaultSize={sidebarVisible ? "20%" : "0%"}
                minSize="15%"
                collapsible={true}
                collapsedSize="0%"
                style={{ overflow: 'hidden' }}
                onResize={(size) => {
                  if (isTransitioningRef.current) return;
                  const isZero = size.inPixels === 0 || size.asPercentage === 0;
                  if (isZero && sidebarVisible) {
                    setSidebarVisible(false);
                  } else if (!isZero && !sidebarVisible) {
                    setSidebarVisible(true);
                  }
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: '100%',
                    minWidth: 280,
                    overflow: 'hidden',
                    opacity: sidebarVisible ? 1 : 0,
                    transform: sidebarVisible ? 'none' : 'translateX(20px)',
                    transition: 'opacity var(--transition-duration) var(--transition-easing), transform var(--transition-duration) var(--transition-easing)',
                    pointerEvents: sidebarVisible ? 'auto' : 'none',
                    willChange: isTransitioning ? 'opacity, transform' : 'auto',
                  }}
                >
                  <PanelScroll>{merchantsCard}</PanelScroll>
                </Box>
              </Panel>
            </PanelGroup>
          </Box>
        )}



        {editTxn && (
          <RecategorizeDialog
            txn={editTxn}
            onClose={() => setEditTxn(null)}
          />
        )}

        {selectedFutureMonth && (
          <FutureMonthBreakdownDialog
            monthKey={selectedFutureMonth}
            initialComparisonMonth={comparisonMonth}
            recentAvgIncome={recentAvgIncome}
            onClose={() => setSelectedFutureMonth(null)}
          />
        )}
      </Box>
    </PageLoader>
  );
}

// ----- Subcomponents & Helpers -----

function StyledResizeHandle({
  ariaLabel,
  disabled = false,
  visible = true,
}: {
  ariaLabel: string;
  disabled?: boolean;
  visible?: boolean;
}) {
  return (
    <PanelResizeHandle
      aria-label={ariaLabel}
      disabled={disabled || !visible}
      style={{
        width: visible ? 16 : 0,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          margin: '0 auto',
          width: 2,
          bgcolor: 'divider',
          borderRadius: 1,
          transition: 'background-color 120ms ease, width 120ms ease',
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


