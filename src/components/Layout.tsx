import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Button,
  Chip,
  Menu,
  MenuItem,
  Drawer,
  Tooltip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Badge,
  Paper,
} from '@mui/material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PieChartOutlineOutlinedIcon from '@mui/icons-material/PieChartOutlineOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import RealEstateAgentOutlinedIcon from '@mui/icons-material/RealEstateAgentOutlined';
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

import AnimatedLogo from './AnimatedLogo';
import { useFilters } from '../stores/store';
import { useAccounts, useTransactionBounds, useUncategorizedCount, useLoans } from '../hooks/queries';

const BalanceSheetModal = lazy(() => import('./BalanceSheetModal'));
const BuiltInAiDrawer = lazy(() => import('./BuiltInAiDrawer'));
const IphoneInstallModal = lazy(() => import('./IphoneInstallModal'));

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  badge?: 'uncategorized';
};

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/loans', label: 'Loans' },
  { to: '/forecast', label: 'Forecast' },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' },
];

const SETTINGS_SECTIONS = [
  {
    title: 'Organize',
    items: [
      { to: '/categories', label: 'Categories' },
      { to: '/rules', label: 'Rules' },
      { to: '/merchants', label: 'Merchants' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/import', label: 'Import' },
      { to: '/settings', label: 'Settings' },
      { to: '/theme', label: 'Theme' },
    ],
  },
];

function formatCompactUsd(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}k`;
  return `$${abs.toFixed(0)}`;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const layoutPages = [
    '/',
    '/dashboard',
    '/transactions',
    '/timeline',
    '/categories',
    '/rules',
    '/merchants',
    '/forecast',
  ];
  const isLayoutPage = layoutPages.includes(location.pathname) && isDesktop;

  const mobileTabValue = useMemo(() => {
    if (
      location.pathname === '/' ||
      location.pathname === '/dashboard' ||
      location.pathname === '/timeline' ||
      location.pathname === '/transactions'
    ) {
      return '/';
    }
    if (['/budget', '/forecast', '/loans', '/sort'].includes(location.pathname)) {
      return location.pathname;
    }
    return false;
  }, [location.pathname]);

  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const isSettingsOpen = Boolean(settingsAnchorEl);
  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) =>
    setSettingsAnchorEl(event.currentTarget);
  const handleSettingsClose = () => setSettingsAnchorEl(null);

  const isSettingsActive = SETTINGS_SECTIONS.flatMap((s) => s.items).some(
    (item) => item.to === location.pathname
  );

  const [mem, setMem] = useState<{ used: number; total: number } | null>(null);
  useEffect(() => {
    const updateMem = () => {
      const memory = (performance as any).memory;
      if (memory) {
        setMem({
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        });
      }
    };
    updateMem();
    const interval = setInterval(updateMem, 5000);
    return () => clearInterval(interval);
  }, []);

  const demoMode = useFilters((s) => s.demoMode);
  const earliestTransactionDate = useFilters((s) => s.earliestTransactionDate);
  const latestTransactionDate = useFilters((s) => s.latestTransactionDate);
  const { data: dbBounds } = useTransactionBounds(demoMode);
  const { data: uncategorizedCount = 0 } = useUncategorizedCount(demoMode);

  const setTransactionDataBounds = useFilters((s) => s.setTransactionDataBounds);

  useEffect(() => {
    if (dbBounds) {
      const [earliest, latest] = dbBounds;
      if (earliest !== earliestTransactionDate || latest !== latestTransactionDate) {
        setTransactionDataBounds(earliest ?? undefined, latest ?? undefined);
      }
    }
  }, [dbBounds, earliestTransactionDate, latestTransactionDate, setTransactionDataBounds]);

  const { data: accountsAll } = useAccounts();
  const enabledAccountIds = useFilters((s) => s.enabledAccountIds);
  const setEnabledAccounts = useFilters((s) => s.setEnabledAccounts);
  const seenAccountIds = useFilters((s) => s.seenAccountIds);
  const setSeenAccounts = useFilters((s) => s.setSeenAccounts);
  const profile = useFilters((s) => s.profile);

  const [isBalanceSheetOpen, setIsBalanceSheetOpen] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);
  const [isIphoneModalOpen, setIsIphoneModalOpen] = useState(false);
  const { data: loans = [] } = useLoans();

  useEffect(() => {
    const handleOpenAi = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (detail?.prompt) {
        setPendingAiPrompt(detail.prompt);
      }
      setIsAiDrawerOpen(true);
    };
    window.addEventListener('open-ai-with-prompt', handleOpenAi);
    return () => window.removeEventListener('open-ai-with-prompt', handleOpenAi);
  }, []);

  const activeAccounts = useMemo(() => {
    if (!accountsAll) return [];
    return demoMode
      ? accountsAll.filter((a) => a.source === 'demo')
      : accountsAll.filter((a) => a.source !== 'demo');
  }, [accountsAll, demoMode]);

  const netWorthEstimate = useMemo(() => {
    if (!activeAccounts || activeAccounts.length === 0) return 0;
    const cash = activeAccounts
      .filter((a) => a.type === 'checking' || a.type === 'savings')
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    const invest = activeAccounts
      .filter((a) => a.type === 'investment')
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    const activeLoans = loans.filter((l) => l.enabled !== false);
    const houseLoan = activeLoans.find((l) => l.type === 'house');
    const propertyVal = houseLoan ? (houseLoan.propertyValue ?? 0) : 0;
    const debtAccounts = activeAccounts.filter(
      (a) => a.type === 'credit' || a.type === 'loan' || a.type === 'mortgage'
    );
    const accountDebts = debtAccounts.reduce(
      (sum, a) => sum + Math.abs(Math.min(0, a.currentBalance || 0)),
      0
    );
    const hasMortgageAccount = debtAccounts.some((a) => a.type === 'mortgage');
    const hasLoanAccount = debtAccounts.some((a) => a.type === 'loan');
    const standaloneLoanDebts = activeLoans.reduce((sum, l) => {
      if (l.type === 'house' && hasMortgageAccount) return sum;
      if ((l.type === 'car' || l.type === 'student') && hasLoanAccount) return sum;
      return sum + Math.max(0, l.principal || 0);
    }, 0);
    return cash + invest + propertyVal - (accountDebts + standaloneLoanDebts);
  }, [activeAccounts, loans]);

  useEffect(() => {
    if (!activeAccounts || activeAccounts.length === 0) return;
    const accountIdSet = new Set(activeAccounts.map((a) => a.id!).filter(Boolean));
    const cleanedEnabled = enabledAccountIds.filter((id) => accountIdSet.has(id));
    const cleanedSeen = seenAccountIds.filter((id) => accountIdSet.has(id));
    const seenSet = new Set(cleanedSeen);
    const newOnes = activeAccounts.filter((a) => !seenSet.has(a.id!)).map((a) => a.id!);

    let nextEnabled: number[];
    if (cleanedSeen.length === 0 && activeAccounts.length > 0) {
      nextEnabled = activeAccounts.map((a) => a.id!);
    } else {
      nextEnabled = [...cleanedEnabled, ...newOnes];
    }
    const nextSeen = Array.from(new Set([...cleanedSeen, ...activeAccounts.map((a) => a.id!)]));

    const enabledChanged = JSON.stringify(nextEnabled) !== JSON.stringify(enabledAccountIds);
    const seenChanged = JSON.stringify(nextSeen) !== JSON.stringify(seenAccountIds);

    if (enabledChanged) setEnabledAccounts(nextEnabled);
    if (seenChanged) setSeenAccounts(nextSeen);
  }, [activeAccounts, enabledAccountIds, setEnabledAccounts, seenAccountIds, setSeenAccounts]);

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderBottom: '1px solid',
            borderColor: 'divider',
            pt: 'env(safe-area-inset-top)',
            zIndex: (theme) => theme.zIndex.drawer + 1,
          }}
        >
          <Toolbar sx={{ gap: { xs: 0.25, md: 1.5 }, minHeight: { xs: 56, sm: 64 }, px: { xs: 1.25, sm: 2 } }}>
            <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
              <IconButton
                size="medium"
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={() => setIsMobileNavOpen(true)}
                sx={{ ml: -0.5, mr: 0 }}
              >
                <MenuIcon />
              </IconButton>
            </Box>
            <AnimatedLogo sx={{ ml: { xs: -0.25, md: -0.5 }, mr: { xs: 'auto', md: 1 } }} />
            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flex: 1, alignItems: 'center' }}>
              {PRIMARY_NAV.map((n) => {
                const showBadge = n.badge === 'uncategorized' && uncategorizedCount > 0;
                return (
                  <Button
                    key={n.to}
                    component={NavLink}
                    to={n.to}
                    end={n.end}
                    sx={{
                      color: 'text.secondary',
                      textTransform: 'none',
                      fontWeight: 500,
                      '&.active': { color: 'primary.main', fontWeight: 600 },
                      gap: 0.75,
                    }}
                  >
                    {n.label}
                    {showBadge && (
                      <Chip
                        label={uncategorizedCount}
                        size="small"
                        color="warning"
                        sx={{
                          height: 18,
                          fontSize: 11,
                          fontWeight: 600,
                          '& .MuiChip-label': { px: 0.75 },
                        }}
                      />
                    )}
                  </Button>
                );
              })}

              {/* Settings Menu */}
              <Button
                id="settings-nav-button"
                onClick={handleSettingsClick}
                endIcon={<KeyboardArrowDownIcon />}
                sx={{
                  color: isSettingsActive ? 'primary.main' : 'text.secondary',
                  textTransform: 'none',
                  fontWeight: isSettingsActive ? 600 : 500,
                  gap: 0.75,
                }}
              >
                Settings
              </Button>
              {isSettingsOpen && (
                <Menu
                  anchorEl={settingsAnchorEl}
                  open={isSettingsOpen}
                  onClose={handleSettingsClose}
                  transitionDuration={0}
                  MenuListProps={{ 'aria-labelledby': 'settings-nav-button' }}
                  sx={{
                    '& .MuiPaper-root': {
                      border: '1px solid',
                      borderColor: 'divider',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                      minWidth: 160,
                      mt: 0.5,
                    },
                  }}
                >
                  {SETTINGS_SECTIONS.map((section, idx) => [
                    idx > 0 && <Divider key={`div-${section.title}`} sx={{ my: 0.5 }} />,
                    <Typography
                      key={`title-${section.title}`}
                      variant="overline"
                      color="text.secondary"
                      sx={{ px: 2, display: 'block', lineHeight: 2 }}
                    >
                      {section.title}
                    </Typography>,
                    ...section.items.map((item) => {
                      const isItemActive = location.pathname === item.to;
                      return (
                        <MenuItem
                          key={item.to}
                          component={NavLink}
                          to={item.to}
                          onClick={handleSettingsClose}
                          sx={{
                            color: isItemActive ? 'primary.main' : 'text.primary',
                            fontWeight: isItemActive ? 600 : 400,
                            py: 1,
                            px: 2,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                            {item.label}
                          </Typography>
                        </MenuItem>
                      );
                    }),
                  ])}
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem
                    onClick={() => {
                      handleSettingsClose();
                      setIsIphoneModalOpen(true);
                    }}
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      py: 1,
                      px: 2,
                      gap: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <PhoneIphoneIcon sx={{ fontSize: 16 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                      iPhone Tester Link
                    </Typography>
                  </MenuItem>
                </Menu>
              )}
            </Box>

            {/* Net Worth & Ask AI */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1 }, mr: { xs: 0.5, sm: 1 } }}>
              <Tooltip title="View Balance Sheet & Net Worth details">
                <Button
                  onClick={() => setIsBalanceSheetOpen(true)}
                  size="small"
                  variant="outlined"
                  startIcon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: { xs: 15, sm: 16 } }} />}
                  sx={{
                    height: { xs: 36, sm: 34 },
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: { xs: '0.78rem', sm: '0.8rem' },
                    color: netWorthEstimate >= 0 ? 'success.main' : 'error.main',
                    borderColor: 'divider',
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    px: { xs: 1.1, sm: 1.25 },
                    whiteSpace: 'nowrap',
                    '& .MuiButton-startIcon': {
                      mr: { xs: 0.5, sm: 0.75 },
                    },
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, mr: 0.5 }}>
                    Net Worth:
                  </Box>
                  {`${netWorthEstimate >= 0 ? '+' : ''}${formatCompactUsd(netWorthEstimate)}`}
                </Button>
              </Tooltip>

              <Tooltip title="Ask Built-in On-Device AI about your finances">
                <Button
                  onClick={() => setIsAiDrawerOpen(true)}
                  size="small"
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon sx={{ fontSize: { xs: 15, sm: 16 }, color: 'primary.main' }} />}
                  sx={{
                    height: { xs: 36, sm: 34 },
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: { xs: '0.78rem', sm: '0.8rem' },
                    color: 'text.primary',
                    borderColor: 'divider',
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    px: { xs: 1, sm: 1.25 },
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    '& .MuiButton-startIcon': {
                      mr: { xs: 0.4, sm: 0.6 },
                    },
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  Ask AI
                </Button>
              </Tooltip>
            </Box>

            {mem && (
              <Tooltip title={`JS Heap: ${mem.used}MB used / ${mem.total}MB total`}>
                <Box
                  sx={{
                    display: { xs: 'none', lg: 'inline-flex' },
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    fontSize: '11px',
                    fontWeight: 500,
                    mr: 1,
                    userSelect: 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: mem.used / mem.total > 0.85 ? 'error.main' : 'success.main',
                      boxShadow: (theme) =>
                        `0 0 0 0 ${mem.used / mem.total > 0.85 ? theme.palette.error.main : theme.palette.success.main}bb`,
                      animation: 'memPulse 2s infinite',
                      '@keyframes memPulse': {
                        '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.5)' },
                        '70%': { boxShadow: '0 0 0 5px rgba(76, 175, 80, 0)' },
                        '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' },
                      },
                    }}
                  />
                  {mem.used} MB
                </Box>
              </Tooltip>
            )}
            <Button
              component="a"
              href="https://github.com/barnesy/strictly-spending/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              onClick={async (e: React.MouseEvent<HTMLAnchorElement>) => {
                const url = 'https://github.com/barnesy/strictly-spending/issues/new';
                const isNativeTauri =
                  typeof window !== 'undefined' &&
                  ('__TAURI__' in window ||
                    ('__TAURI_INTERNALS__' in window &&
                      'metadata' in (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__));
                if (isNativeTauri) {
                  e.preventDefault();
                  try {
                    const { open } = await import('@tauri-apps/plugin-shell');
                    await open(url);
                  } catch {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }
              }}
              variant="text"
              color="inherit"
              size="small"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                textTransform: 'none',
                fontWeight: 500,
                color: 'text.secondary',
                '&:hover': { color: 'text.primary', bgcolor: 'transparent' },
              }}
            >
              Feedback
            </Button>
          </Toolbar>
        </AppBar>

        <Drawer
          anchor="left"
          open={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          PaperProps={{ sx: { width: 280, pb: 'env(safe-area-inset-bottom)' } }}
          sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
        >
          <Box
            sx={{
              p: 2,
              pt: 'calc(16px + env(safe-area-inset-top))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Menu
            </Typography>
            <IconButton onClick={() => setIsMobileNavOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<AccountBalanceWalletOutlinedIcon fontSize="small" />}
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsBalanceSheetOpen(true);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                justifyContent: 'space-between',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                borderColor: 'divider',
                color: netWorthEstimate >= 0 ? 'success.main' : 'error.main',
              }}
            >
              <span>Net Worth</span>
              <span>
                {netWorthEstimate >= 0 ? '+' : ''}
                {formatCompactUsd(netWorthEstimate)}
              </span>
            </Button>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<AutoAwesomeIcon fontSize="small" color="primary" />}
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsAiDrawerOpen(true);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                justifyContent: 'flex-start',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                borderColor: 'divider',
                color: 'text.primary',
              }}
            >
              Ask Strictly AI
            </Button>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<PhoneIphoneIcon fontSize="small" color="primary" />}
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsIphoneModalOpen(true);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                justifyContent: 'flex-start',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                borderColor: 'divider',
                color: 'text.primary',
              }}
            >
              iPhone Tester Link & Guide
            </Button>
          </Box>
          <List sx={{ pt: 1, px: 1 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 2, pb: 0.5, display: 'block' }}
            >
              Primary
            </Typography>
            {PRIMARY_NAV.map((n) => {
              const isActive =
                location.pathname === n.to ||
                (n.end === undefined && location.pathname.startsWith(n.to));
              return (
                <ListItem key={n.to} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    component={NavLink}
                    to={n.to}
                    end={n.end}
                    onClick={() => setIsMobileNavOpen(false)}
                    sx={{
                      borderRadius: 1,
                      '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' },
                    }}
                  >
                    <ListItemText
                      primary={n.label}
                      primaryTypographyProps={{ variant: 'body1', fontWeight: isActive ? 600 : 400 }}
                    />
                    {n.badge === 'uncategorized' && uncategorizedCount > 0 && (
                      <Chip
                        label={uncategorizedCount}
                        size="small"
                        color="warning"
                        sx={{ height: 20, '& .MuiChip-label': { px: 1 } }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}

            {SETTINGS_SECTIONS.map((section) => (
              <Box key={section.title}>
                <Divider sx={{ my: 1 }} />
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ px: 2, pb: 0.5, display: 'block' }}
                >
                  {section.title}
                </Typography>
                {section.items.map((item) => (
                  <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      component={NavLink}
                      to={item.to}
                      onClick={() => setIsMobileNavOpen(false)}
                      sx={{
                        borderRadius: 1,
                        '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' },
                      }}
                    >
                      <ListItemText primary={item.label} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </Box>
            ))}

            <Divider sx={{ my: 1 }} />
            <ListItem disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component="a"
                href="https://github.com/barnesy/strictly-spending/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e: React.MouseEvent<HTMLAnchorElement>) => {
                  setIsMobileNavOpen(false);
                  const url = 'https://github.com/barnesy/strictly-spending/issues/new';
                  const isNativeTauri =
                    typeof window !== 'undefined' &&
                    ('__TAURI__' in window ||
                      ('__TAURI_INTERNALS__' in window &&
                        'metadata' in (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__));
                  if (isNativeTauri) {
                    e.preventDefault();
                    try {
                      const { open } = await import('@tauri-apps/plugin-shell');
                      await open(url);
                    } catch {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                sx={{ borderRadius: 1 }}
              >
                <ListItemText primary="Feedback / Report Issue" />
              </ListItemButton>
            </ListItem>
          </List>
        </Drawer>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: { md: 900 },
            overflowY: isLayoutPage ? 'hidden' : 'auto',
            overflowX: 'auto',
            display: isLayoutPage ? 'flex' : 'block',
            flexDirection: isLayoutPage ? 'column' : undefined,
          }}
        >
          <Container
            maxWidth={false}
            sx={{
              py: { xs: 1.5, sm: 3 },
              px: { xs: 1.5, sm: 3 },
              ...(isLayoutPage
                ? {
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                  }
                : {}),
            }}
          >
            {children}
          </Container>
        </Box>

        {/* Mobile Bottom Navigation Bar */}
        <Paper
          elevation={0}
          sx={{
            display: { xs: 'block', md: 'none' },
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            pb: 'env(safe-area-inset-bottom)',
            flexShrink: 0,
            zIndex: (theme) => theme.zIndex.appBar,
          }}
        >
          <BottomNavigation
            showLabels
            value={mobileTabValue}
            onChange={(_, newValue) => {
              if (typeof newValue === 'string') {
                navigate(newValue);
              }
            }}
            sx={{
              height: 56,
              bgcolor: 'transparent',
              '& .MuiBottomNavigationAction-root': {
                minWidth: 0,
                px: 0.5,
                py: 0.75,
                color: 'text.secondary',
                '&.Mui-selected': {
                  color: 'primary.main',
                },
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.68rem',
                fontWeight: 500,
                '&.Mui-selected': {
                  fontSize: '0.7rem',
                  fontWeight: 700,
                },
              },
            }}
          >
            <BottomNavigationAction
              label="Dashboard"
              value="/"
              icon={<DashboardOutlinedIcon fontSize="small" />}
            />
            <BottomNavigationAction
              label="Budget"
              value="/budget"
              icon={<PieChartOutlineOutlinedIcon fontSize="small" />}
            />
            <BottomNavigationAction
              label="Forecast"
              value="/forecast"
              icon={<TrendingUpOutlinedIcon fontSize="small" />}
            />
            <BottomNavigationAction
              label="Loans"
              value="/loans"
              icon={<RealEstateAgentOutlinedIcon fontSize="small" />}
            />
            <BottomNavigationAction
              label="Sort"
              value="/sort"
              icon={
                uncategorizedCount > 0 ? (
                  <Badge
                    badgeContent={uncategorizedCount > 99 ? '99+' : uncategorizedCount}
                    color="warning"
                    sx={{
                      '& .MuiBadge-badge': {
                        fontSize: '0.62rem',
                        height: 16,
                        minWidth: 16,
                        px: 0.4,
                        fontWeight: 700,
                      },
                    }}
                  >
                    <StyleOutlinedIcon fontSize="small" />
                  </Badge>
                ) : (
                  <StyleOutlinedIcon fontSize="small" />
                )
              }
            />
          </BottomNavigation>
        </Paper>
      </Box>

      {/* Balance Sheet & Net Worth Modal */}
      {isBalanceSheetOpen && (
        <Suspense fallback={null}>
          <BalanceSheetModal
            open={isBalanceSheetOpen}
            onClose={() => setIsBalanceSheetOpen(false)}
            defaultProfile={profile}
          />
        </Suspense>
      )}

      {/* Chrome / Edge Built-in AI Drawer */}
      <Suspense fallback={null}>
        <BuiltInAiDrawer
          open={isAiDrawerOpen}
          onClose={() => setIsAiDrawerOpen(false)}
          initialPrompt={pendingAiPrompt}
          onConsumeInitialPrompt={() => setPendingAiPrompt(null)}
        />
      </Suspense>

      {/* iPhone / iOS Tester & Home Screen Install Modal */}
      {isIphoneModalOpen && (
        <Suspense fallback={null}>
          <IphoneInstallModal
            open={isIphoneModalOpen}
            onClose={() => setIsIphoneModalOpen(false)}
          />
        </Suspense>
      )}
    </Box>
  );
}
