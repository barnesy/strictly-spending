import { useSettings, useAccounts } from './hooks/queries';
import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { queryClient } from './queryClient';
import { ThemeProvider, CssBaseline, Snackbar, Alert, Button, Box, Typography, IconButton, Paper, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { getAppTheme } from './theme';
import {
  useFilters,
  resolveDateRange,
  type DateRangePreset,
  type GroupBy,
  type RecurrenceFilter,
  type TransactionType,
  type ProfileType,
  type DrillState,
} from './stores/store';
import { useForecastStore } from './stores/forecastStore';
import { useSimpleFinStore } from './stores/simplefinStore';
import { simplefinGetConfig, simplefinGetAccounts } from './api/simplefin';
import { monthsBetween, usd } from './lib';
import {
  buildSyncSpendImpactSummary,
  maybeSendNativeSyncNotification,
  type SyncSpendImpactSummary,
} from './domain/syncImpactNotification';

import DynamicAnimationStyles from './components/DynamicAnimationStyles';
import IphoneInstallModal from './components/IphoneInstallModal';
import { isIosDevice } from './utils/pwaInstall';
import { LANDING_ONLY_BUILD } from './env';
import { Layout } from './components/Layout';
import { AppRoutes } from './AppRoutes';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Landing = lazyWithRetry(() => import('./pages/Landing'));

interface McpUiCommand {
  id?: number;
  page?: string | null;
  resetFilters?: boolean;
  preset?: DateRangePreset | null;
  month?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  onlyCategories?: string[] | null;
  excludeCategories?: string[] | null;
  disabledCategories?: string[] | null;
  searchQuery?: string | null;
  transactionType?: TransactionType | null;
  recurrenceFilter?: RecurrenceFilter | null;
  groupBy?: GroupBy | null;
  profile?: ProfileType | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  forecastMonths?: number | null;
  forecastExtraLoanPayment?: number | null;
  forecastLoanStrategy?: 'avalanche' | 'snowball' | 'custom' | null;
  forecastSavingsBudget?: number | null;
  message?: string | null;
}

interface UiUndoSnapshot {
  pathname: string;
  preset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  disabledCategories: string[];
  searchQuery: string;
  transactionType: TransactionType;
  spendOnly: boolean;
  recurrenceFilter: RecurrenceFilter;
  groupBy: GroupBy;
  profile?: ProfileType;
  enabledAccountIds: number[];
  minPrice?: number;
  maxPrice?: number;
  drill: DrillState | null;
}

export default function App() {
  const { data: settings = [] } = useSettings();
  const { data: accounts = [] } = useAccounts();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const lastProcessedCmdIdRef = useRef<number | null>(null);
  const initializedSettingsCmdRef = useRef(false);
  const autoSyncAttemptedRef = useRef(false);
  const undoSnapshotRef = useRef<UiUndoSnapshot | null>(null);
  const [aiToastMessage, setAiToastMessage] = useState<string | null>(null);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const [syncImpactSummary, setSyncImpactSummary] = useState<SyncSpendImpactSummary | null>(null);
  const [iosGuideOpen, setIosGuideOpen] = useState<boolean>(false);
  const [iosBannerDismissed, setIosBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('strictly_ios_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [isStandalonePwa] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isInstalledPwa] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pwa') === '1' || params.get('ios') === '1' || params.get('tester') === '1') {
      try {
        localStorage.setItem('strictly_installed_pwa', '1');
      } catch {
        // ignore storage errors
      }
      return true;
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return true;
    try {
      return localStorage.getItem('strictly_installed_pwa') === '1';
    } catch {
      return false;
    }
  });
  const [inBrowserDemo, setInBrowserDemo] = useState<boolean>(() => isInstalledPwa);

  useEffect(() => {
    const hasNonDemo = accounts.some((a) => a.source !== 'demo');
    if (hasNonDemo) {
      const state = useFilters.getState();
      if (state.demoMode) {
        state.setDemoMode(false);
      }
      const realIds = accounts.filter((a) => a.source !== 'demo' && a.id !== undefined).map((a) => a.id!);
      const realIdSet = new Set(realIds);
      const seenSet = new Set(state.seenAccountIds || []);
      const newlyDiscoveredIds = realIds.filter((id) => !seenSet.has(id));
      const validEnabled = state.enabledAccountIds.filter((id) => realIdSet.has(id));
      if (validEnabled.length === 0 && realIds.length > 0) {
        state.setEnabledAccounts(realIds);
        state.setSeenAccounts(realIds);
      } else if (newlyDiscoveredIds.length > 0 || validEnabled.length !== state.enabledAccountIds.length) {
        const mergedEnabled = Array.from(new Set([...validEnabled, ...newlyDiscoveredIds]));
        const mergedSeen = Array.from(new Set([...(state.seenAccountIds || []).filter((id) => realIdSet.has(id)), ...realIds]));
        state.setEnabledAccounts(mergedEnabled);
        state.setSeenAccounts(mergedSeen);
      }
    } else if (LANDING_ONLY_BUILD && accounts.length > 0 && accounts.every((a) => a.source === 'demo')) {
      if (!useFilters.getState().demoMode) {
        useFilters.getState().setDemoMode(true);
      }
    }
  }, [accounts]);

  const applyMcpUiCommand = useCallback(
    (cmd: McpUiCommand) => {
      if (!cmd || typeof cmd !== 'object') return;
      if (typeof cmd.id === 'number') {
        if (lastProcessedCmdIdRef.current === cmd.id) return;
        lastProcessedCmdIdRef.current = cmd.id;
      }

      const currentFilters = useFilters.getState();
      undoSnapshotRef.current = {
        pathname: locationRef.current,
        preset: currentFilters.preset,
        customStart: currentFilters.customStart,
        customEnd: currentFilters.customEnd,
        disabledCategories: [...currentFilters.disabledCategories],
        searchQuery: currentFilters.searchQuery,
        transactionType: currentFilters.transactionType,
        spendOnly: currentFilters.spendOnly,
        recurrenceFilter: currentFilters.recurrenceFilter,
        groupBy: currentFilters.groupBy,
        profile: currentFilters.profile,
        enabledAccountIds: [...currentFilters.enabledAccountIds],
        minPrice: currentFilters.minPrice,
        maxPrice: currentFilters.maxPrice,
        drill: currentFilters.drill ? { ...currentFilters.drill } : null,
      };

      if (cmd.resetFilters) {
        currentFilters.reset();
      }

      if (cmd.month && /^\d{4}-\d{2}$/.test(cmd.month)) {
        useFilters.getState().drillToMonth(cmd.month);
      } else if (cmd.startDate || cmd.endDate) {
        useFilters.getState().setCustomRange(
          cmd.startDate || undefined,
          cmd.endDate || undefined
        );
      } else if (cmd.preset) {
        useFilters.getState().setPreset(cmd.preset);
      } else if (cmd.page === '/timeline') {
        // Timeline view requires a single-month range; default to thisMonth if current range spans multiple months
        const f = useFilters.getState();
        const r = resolveDateRange(f);
        if (monthsBetween(r.start, r.end).length !== 1) {
          f.setPreset('thisMonth');
        }
      }

      if (Array.isArray(cmd.disabledCategories)) {
        useFilters.getState().setDisabledCategories(cmd.disabledCategories);
      }
      if (typeof cmd.searchQuery === 'string') {
        useFilters.getState().setSearchQuery(cmd.searchQuery);
      }
      if (cmd.transactionType) {
        useFilters.getState().setTransactionType(cmd.transactionType);
      }
      if (cmd.recurrenceFilter) {
        useFilters.getState().setRecurrenceFilter(cmd.recurrenceFilter);
      }
      if (cmd.groupBy) {
        useFilters.getState().setGroupBy(cmd.groupBy);
      }
      if (cmd.profile) {
        useFilters.getState().setProfile(cmd.profile, accountsRef.current);
      }
      if (cmd.minAmount !== undefined && cmd.minAmount !== null) {
        useFilters.getState().setMinPrice(cmd.minAmount);
      } else if (cmd.resetFilters) {
        useFilters.getState().setMinPrice(undefined);
      }
      if (cmd.maxAmount !== undefined && cmd.maxAmount !== null) {
        useFilters.getState().setMaxPrice(cmd.maxAmount);
      } else if (cmd.resetFilters) {
        useFilters.getState().setMaxPrice(undefined);
      }

      // Apply optional Forecast store adjustments
      const forecast = useForecastStore.getState();
      if (typeof cmd.forecastMonths === 'number' && cmd.forecastMonths > 0) {
        forecast.setMonths(cmd.forecastMonths);
      }
      if (typeof cmd.forecastExtraLoanPayment === 'number' && cmd.forecastExtraLoanPayment >= 0) {
        forecast.setExtraLoanPayment(cmd.forecastExtraLoanPayment);
      }
      if (cmd.forecastLoanStrategy) {
        forecast.setLoanStrategy(cmd.forecastLoanStrategy);
      }
      if (typeof cmd.forecastSavingsBudget === 'number' && cmd.forecastSavingsBudget >= 0) {
        forecast.setSavingsBudget(cmd.forecastSavingsBudget);
      }

      if (cmd.page) {
        const target = cmd.page === '/dashboard' ? '/' : cmd.page;
        navigate(target);
      }

      const defaultMsg = cmd.page
        ? `AI opened ${cmd.page}`
        : 'AI updated view filters';
      setAiToastMessage(cmd.message || defaultMsg);
    },
    [navigate]
  );

  const handleUndoAiUiCommand = useCallback(() => {
    const snap = undoSnapshotRef.current;
    if (!snap) {
      setAiToastMessage(null);
      return;
    }
    useFilters.setState({
      preset: snap.preset,
      customStart: snap.customStart,
      customEnd: snap.customEnd,
      disabledCategories: snap.disabledCategories,
      searchQuery: snap.searchQuery,
      transactionType: snap.transactionType,
      spendOnly: snap.spendOnly,
      recurrenceFilter: snap.recurrenceFilter,
      groupBy: snap.groupBy,
      profile: snap.profile,
      enabledAccountIds: snap.enabledAccountIds,
      minPrice: snap.minPrice,
      maxPrice: snap.maxPrice,
      drill: snap.drill,
    });
    if (snap.pathname && snap.pathname !== locationRef.current) {
      navigate(snap.pathname);
    }
    undoSnapshotRef.current = null;
    setAiToastMessage(null);
  }, [navigate]);

  // Also observe settings for mcp_ui_command changes (ignores pre-existing command on initial mount)
  useEffect(() => {
    const rawSetting = settings.find((s) => s.key === 'mcp_ui_command')?.value;
    if (!rawSetting) {
      if (settings.length > 0) initializedSettingsCmdRef.current = true;
      return;
    }
    let parsed: McpUiCommand | null = null;
    if (typeof rawSetting === 'string') {
      try {
        parsed = JSON.parse(rawSetting) as McpUiCommand;
      } catch {
        parsed = null;
      }
    } else if (typeof rawSetting === 'object') {
      parsed = rawSetting as McpUiCommand;
    }
    if (!parsed) return;

    if (!initializedSettingsCmdRef.current) {
      initializedSettingsCmdRef.current = true;
      if (typeof parsed.id === 'number') {
        lastProcessedCmdIdRef.current = parsed.id;
      }
      return;
    }
    applyMcpUiCommand(parsed);
  }, [settings, applyMcpUiCommand]);

  const themeSetting = settings.find(s => s.key === 'themeConfig');
  const themeConfig = themeSetting?.value as { mode: 'light' | 'dark'; primaryColor: string; secondaryColor: string; backgroundColor?: string; paperColor?: string; textColor?: string; borderRadius?: number; fontFamily?: string; fontSize?: number } | undefined;

  const parsedFontSize = Number(themeConfig?.fontSize);
  const fontSize = !isNaN(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 14;
  
  useEffect(() => {
    const rootSize = (fontSize / 14) * 16;
    document.documentElement.style.fontSize = `${rootSize}px`;
  }, [fontSize]);

  useEffect(() => {
    const handleDbUpdate = () => {
      queryClient.invalidateQueries();
    };
    const handleWindowUiCmd = (e: Event) => {
      const detail = (e as CustomEvent<McpUiCommand>).detail;
      if (detail) applyMcpUiCommand(detail);
    };
    window.addEventListener('db-update', handleDbUpdate);
    window.addEventListener('mcp-ui-command', handleWindowUiCmd);

    let unlistenTauriDb: (() => void) | undefined;
    let unlistenTauriUi: (() => void) | undefined;
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI__' in window ||
        ('__TAURI_INTERNALS__' in window &&
          'metadata' in (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__));
    if (isTauri) {
      import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          unlistenTauriDb = await listen('db-update', handleDbUpdate);
          unlistenTauriUi = await listen<McpUiCommand>('mcp-ui-command', (event) => {
            if (event.payload) {
              applyMcpUiCommand(event.payload);
            }
          });
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('db-update', handleDbUpdate);
      window.removeEventListener('mcp-ui-command', handleWindowUiCmd);
      if (unlistenTauriDb) unlistenTauriDb();
      if (unlistenTauriUi) unlistenTauriUi();
    };
  }, [applyMcpUiCommand]);

  useEffect(() => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    let isRunning = false;

    const maybeAutoSync = async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        const config = await simplefinGetConfig();
        if (!config?.access_url || !config.access_url.trim()) return;

        if (config.last_synced_at) {
          const lastSyncMs = new Date(config.last_synced_at).getTime();
          if (!Number.isNaN(lastSyncMs) && Date.now() - lastSyncMs < FOUR_HOURS_MS) {
            return;
          }
        }

        const sfAccounts = await simplefinGetAccounts();
        const hasMapped = sfAccounts.some(
          (a) => a.strictly_account_id !== null && a.strictly_account_id !== undefined
        );
        if (!hasMapped) return;

        const resp = await useSimpleFinStore.getState().syncTransactions();
        if (resp.accounts_synced > 0) {
          await queryClient.invalidateQueries();
          window.dispatchEvent(new Event('db-update'));
        }
        if (resp.added > 0) {
          const impact = await buildSyncSpendImpactSummary(resp.added);
          if (impact) {
            setSyncImpactSummary(impact);
            void maybeSendNativeSyncNotification(impact);
          } else {
            setSyncToastMessage(
              `Synced ${resp.added} new bank transaction${resp.added === 1 ? '' : 's'} via SimpleFIN`
            );
          }
        }
      } catch {
        // Silent background check: ignore network/bridge errors on startup
      } finally {
        isRunning = false;
      }
    };

    const timer = setTimeout(() => {
      void maybeAutoSync();
    }, 1200);

    const periodicTimer = setInterval(() => {
      void maybeAutoSync();
    }, 30 * 60 * 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void maybeAutoSync();
      }
    };
    const handleShowSyncImpact = async (ev: Event) => {
      const customEv = ev as CustomEvent<{ added?: number }>;
      const addedCount = customEv.detail?.added ?? 0;
      const impact = await buildSyncSpendImpactSummary(addedCount);
      if (impact) {
        setSyncImpactSummary(impact);
        void maybeSendNativeSyncNotification(impact);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('show-sync-impact', handleShowSyncImpact);

    return () => {
      clearTimeout(timer);
      clearInterval(periodicTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('show-sync-impact', handleShowSyncImpact);
    };
  }, []);

  const dynamicTheme = useMemo(() => {
    const mode = themeConfig?.mode || 'light';
    const primaryColor = themeConfig?.primaryColor || '#1976d2';
    const secondaryColor = themeConfig?.secondaryColor || '#5c6bc0';
    return getAppTheme({
      mode,
      primaryColor,
      secondaryColor,
      backgroundColor: themeConfig?.backgroundColor,
      paperColor: themeConfig?.paperColor,
      textColor: themeConfig?.textColor,
      borderRadius: themeConfig?.borderRadius,
      fontFamily: themeConfig?.fontFamily,
      fontSize,
    });
  }, [
    themeConfig?.mode,
    themeConfig?.primaryColor,
    themeConfig?.secondaryColor,
    themeConfig?.backgroundColor,
    themeConfig?.paperColor,
    themeConfig?.textColor,
    themeConfig?.borderRadius,
    themeConfig?.fontFamily,
    fontSize,
  ]);

  if (LANDING_ONLY_BUILD && !inBrowserDemo) {
    return (
      <ThemeProvider theme={dynamicTheme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          <Suspense fallback={null}>
            <Landing
              onLaunchDemo={() => {
                useFilters.getState().setDemoMode(true);
                setInBrowserDemo(true);
                queryClient.invalidateQueries();
              }}
            />
          </Suspense>
        </LocalizationProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={dynamicTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CssBaseline />
        <DynamicAnimationStyles />
        {LANDING_ONLY_BUILD && inBrowserDemo && !isInstalledPwa && (
          <Box
            sx={{
              bgcolor: '#1E40AF',
              color: '#FFFFFF',
              px: { xs: 1.5, sm: 2 },
              py: 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              zIndex: 1300,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                Live Browser Demo (Sample Data)
              </Box>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Interactive Browser Demo — Exploring Sample Financial Data
              </Box>
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                try {
                  localStorage.removeItem('strictly_installed_pwa');
                } catch {
                  // ignore
                }
                setInBrowserDemo(false);
              }}
              sx={{
                color: '#FFFFFF',
                borderColor: 'rgba(255,255,255,0.45)',
                py: 0.25,
                px: 1.1,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                ← Exit Demo
              </Box>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                ← Back to Download Page
              </Box>
            </Button>
          </Box>
        )}
        {LANDING_ONLY_BUILD && isIosDevice() && !isStandalonePwa && !iosBannerDismissed && (
          <Box
            sx={{
              bgcolor: '#0F172A',
              color: '#FFFFFF',
              px: 1.5,
              py: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              zIndex: 1300,
              borderBottom: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <PhoneIphoneIcon sx={{ fontSize: 16, color: '#60A5FA', flexShrink: 0 }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Install full-screen on iPhone: Share → Add to Home Screen
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => setIosGuideOpen(true)}
                sx={{
                  bgcolor: '#2563EB',
                  color: '#FFFFFF',
                  py: 0.2,
                  px: 1,
                  minWidth: 0,
                  height: 24,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#1D4ED8' },
                }}
              >
                How to
              </Button>
              <IconButton
                size="small"
                aria-label="Dismiss iPhone install hint"
                onClick={() => {
                  try {
                    localStorage.setItem('strictly_ios_banner_dismissed', '1');
                  } catch {
                    // ignore
                  }
                  setIosBannerDismissed(true);
                }}
                sx={{ color: 'rgba(255,255,255,0.7)', p: 0.25 }}
              >
                <CloseIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          </Box>
        )}
        <IphoneInstallModal open={iosGuideOpen} onClose={() => setIosGuideOpen(false)} />
        <Layout>
          <AppRoutes />
        </Layout>
        <Snackbar
          open={Boolean(aiToastMessage)}
          autoHideDuration={8000}
          onClose={() => setAiToastMessage(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            severity="info"
            variant="filled"
            onClose={() => setAiToastMessage(null)}
            action={
              <Button color="inherit" size="small" onClick={handleUndoAiUiCommand} sx={{ fontWeight: 700 }}>
                Undo
              </Button>
            }
            sx={{ alignItems: 'center', boxShadow: 4 }}
          >
            {aiToastMessage}
          </Alert>
        </Snackbar>
        <Snackbar
          open={Boolean(syncToastMessage)}
          autoHideDuration={5000}
          onClose={() => setSyncToastMessage(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            severity="success"
            variant="filled"
            onClose={() => setSyncToastMessage(null)}
            sx={{ alignItems: 'center', boxShadow: 4 }}
          >
            {syncToastMessage}
          </Alert>
        </Snackbar>
        <Snackbar
          open={Boolean(syncImpactSummary)}
          autoHideDuration={20000}
          onClose={(_e, reason) => {
            if (reason === 'clickaway') return;
            setSyncImpactSummary(null);
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Paper
            elevation={6}
            sx={{
              p: 2,
              maxWidth: { xs: 'calc(100vw - 32px)', sm: 400 },
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'primary.main',
              bgcolor: 'background.paper',
              color: 'text.primary',
            }}
          >
            {syncImpactSummary && (
              <Stack spacing={1.25}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <NotificationsActiveIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                      {syncImpactSummary.addedCount > 0
                        ? `${syncImpactSummary.addedCount} New Synced Transaction${syncImpactSummary.addedCount === 1 ? '' : 's'}`
                        : `Daily Spend Impact (${syncImpactSummary.recentWindowLabel})`}
                    </Typography>
                  </Stack>
                  <IconButton
                    size="small"
                    onClick={() => setSyncImpactSummary(null)}
                    sx={{ p: 0.25, mt: -0.25, mr: -0.25 }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>
                  Recent charges total{' '}
                  <strong style={{ color: 'inherit' }}>{usd.format(syncImpactSummary.recentSpendDollars)}</strong>
                  {syncImpactSummary.topCharges.length > 0 && (
                    <>
                      {' '}(including{' '}
                      {syncImpactSummary.topCharges
                        .slice(0, 2)
                        .map((item) => `${item.merchant} ${usd.format(item.amount)}`)
                        .join(', ')}
                      )
                    </>
                  )}
                  .
                </Typography>

                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: 1,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(25,118,210,0.05)'),
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        MONTH IMPACT ({syncImpactSummary.currentMonthLabel})
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          syncImpactSummary.monthCashRemainder >= 0
                            ? `${usd.format(syncImpactSummary.monthCashRemainder)} cash left`
                            : `${usd.format(Math.abs(syncImpactSummary.monthCashRemainder))} over income`
                        }
                        color={syncImpactSummary.monthCashRemainder < 0 ? 'error' : 'primary'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                      />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.78rem' }}>
                      MTD Spend: <strong>{usd.format(syncImpactSummary.monthSpendToDate)}</strong> • Projected EOM:{' '}
                      <strong>{usd.format(syncImpactSummary.projectedMonthEndSpend)}</strong>
                    </Typography>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        FULL-YEAR PACE IMPACT
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'warning.main' }}>
                        {usd.format(syncImpactSummary.projectedAnnualSpend)}/yr
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      10-yr invested opportunity cost of this pace:{' '}
                      <strong>{usd.format(syncImpactSummary.tenYearInvestedOpportunity)}</strong>
                    </Typography>
                  </Stack>
                </Box>

                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setSyncImpactSummary(null)}
                    sx={{ fontWeight: 700, fontSize: '0.75rem', borderRadius: 1 }}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />}
                    onClick={() => {
                      const prompt = syncImpactSummary.aiPrompt;
                      setSyncImpactSummary(null);
                      window.dispatchEvent(new CustomEvent('open-ai-with-prompt', { detail: { prompt } }));
                    }}
                    sx={{ fontWeight: 700, fontSize: '0.75rem', borderRadius: 1, textTransform: 'none' }}
                  >
                    Analyze in Ask AI
                  </Button>
                </Stack>
              </Stack>
            )}
          </Paper>
        </Snackbar>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
