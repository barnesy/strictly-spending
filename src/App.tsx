import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useMemo, useRef } from 'react';
import { AppBar, Toolbar, Typography, Box, Container, Button, Chip, Menu, MenuItem, Slide, ThemeProvider, CssBaseline, Drawer, Tooltip } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { useTheme } from '@mui/material/styles';
import { getAppTheme } from './theme';
import useMediaQuery from '@mui/material/useMediaQuery';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import PsychologyIcon from '@mui/icons-material/Psychology';
import TuneIcon from '@mui/icons-material/Tune';
import BrushIcon from '@mui/icons-material/Brush';
import CategoryIcon from '@mui/icons-material/Category';
import RuleIcon from '@mui/icons-material/Rule';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PercentIcon from '@mui/icons-material/Percent';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DescriptionIcon from '@mui/icons-material/Description';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import Import from './pages/Import';
import Rules from './pages/Rules';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import ThemeManager from './pages/ThemeManager';
import LocalModel from './pages/LocalModel';
import { AgentSkills } from './pages/AgentSkills';
import Sort from './pages/Sort';
import AnimationSettings from './pages/AnimationSettings';
import Merchants from './pages/Merchants';
import Taxes from './pages/Taxes';
import Loans from './pages/Loans';
import Documents from './pages/Documents';
import ToolsReference from './pages/ToolsReference';
import DynamicAnimationStyles from './components/DynamicAnimationStyles';
import CopilotChat from './components/CopilotChat';
import { db } from './db';
import { useFilters } from './store';
import { useDataStore } from './dataStore';
import { PageTransition } from './components/PageTransition';
import AnimatedLogo from './components/AnimatedLogo';

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' as const },
];

const PLANNING_NAV = [
  { to: '/loans', label: 'Loans', icon: <AccountBalanceIcon fontSize="small" /> },
  { to: '/taxes', label: 'Taxes', icon: <PercentIcon fontSize="small" /> },
  { to: '/documents', label: 'Documents', icon: <DescriptionIcon fontSize="small" /> },
];

const ORGANIZE_NAV = [
  { to: '/categories', label: 'Categories', icon: <CategoryIcon fontSize="small" /> },
  { to: '/rules', label: 'Rules', icon: <RuleIcon fontSize="small" /> },
  { to: '/merchants', label: 'Merchants', icon: <StorefrontIcon fontSize="small" /> },
];

const AI_NAV = [
  { to: '/local-model', label: 'Local Model', icon: <Box component="span" sx={{ fontWeight: 900, fontSize: 11, minWidth: 20, display: 'inline-block', color: 'primary.main', textShadow: '0 0 0.5px currentColor' }}>AI</Box> },
  { to: '/agent-skills', label: 'Agent Skills', icon: <PsychologyIcon fontSize="small" /> },
  { to: '/tools-reference', label: 'Tool Reference', icon: <Box component="span" sx={{ fontWeight: 900, fontSize: 11, minWidth: 20, display: 'inline-block', color: 'primary.main', textShadow: '0 0 0.5px currentColor' }}>🛠️</Box> },
];

const SETTINGS_NAV = [
  { to: '/import', label: 'Import', icon: <FileUploadIcon fontSize="small" /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
  { to: '/animation-playground', label: 'Animations', icon: <TuneIcon fontSize="small" /> },
  { to: '/theme', label: 'Theme', icon: <BrushIcon fontSize="small" /> },
];

export default function App() {
  const themeSetting = useLiveQuery(() => db.settings.get('themeConfig'), []);
  const themeConfig = themeSetting?.value as { mode: 'light' | 'dark'; primaryColor: string; secondaryColor: string; backgroundColor?: string; paperColor?: string; textColor?: string; borderRadius?: number; fontFamily?: string; fontSize?: number } | undefined;

  const fontSize = themeConfig?.fontSize ?? 14;
  useEffect(() => {
    const rootSize = (fontSize / 14) * 16;
    document.documentElement.style.fontSize = `${rootSize}px`;
  }, [fontSize]);

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
  }, [themeConfig, fontSize]);

  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const layoutPages = ['/', '/transactions', '/documents', '/categories', '/rules', '/merchants'];
  const isLayoutPage = layoutPages.includes(location.pathname) && isDesktop;
  const [planningAnchorEl, setPlanningAnchorEl] = useState<null | HTMLElement>(null);
  const [organizeAnchorEl, setOrganizeAnchorEl] = useState<null | HTMLElement>(null);
  const [aiToolsAnchorEl, setAiToolsAnchorEl] = useState<null | HTMLElement>(null);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);

  const isPlanningOpen = Boolean(planningAnchorEl);
  const isOrganizeOpen = Boolean(organizeAnchorEl);
  const isAiToolsOpen = Boolean(aiToolsAnchorEl);
  const isSettingsOpen = Boolean(settingsAnchorEl);

  const handlePlanningClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setPlanningAnchorEl(event.currentTarget);
  };
  const handlePlanningClose = () => {
    setPlanningAnchorEl(null);
  };

  const handleOrganizeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setOrganizeAnchorEl(event.currentTarget);
  };
  const handleOrganizeClose = () => {
    setOrganizeAnchorEl(null);
  };

  const handleAiToolsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAiToolsAnchorEl(event.currentTarget);
  };
  const handleAiToolsClose = () => {
    setAiToolsAnchorEl(null);
  };

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };
  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const isPlanningActive = ['/loans', '/taxes', '/documents'].includes(location.pathname);
  const isOrganizeActive = ['/categories', '/rules', '/merchants'].includes(location.pathname);
  const isAiToolsActive = ['/local-model', '/agent-skills', '/tools-reference'].includes(location.pathname);
  const isSettingsActive = ['/import', '/settings', '/animation-playground', '/theme'].includes(location.pathname);

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

  // Persist the open state of the side-car across page navigations and reloads.
  const initialChatOpen = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('app:copilotOpen') === 'true';
  }, []);

  const [isChatOpen, setIsChatOpen] = useState<boolean>(initialChatOpen);
  const chatPanelRef = useRef<PanelImperativeHandle>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    localStorage.setItem('app:copilotOpen', String(isChatOpen));
  }, [isChatOpen]);

  useEffect(() => {
    const handleOpenChat = () => setIsChatOpen(true);
    window.addEventListener('app:open-chat', handleOpenChat);
    return () => window.removeEventListener('app:open-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    const chatPanel = chatPanelRef.current;
    if (chatPanel) {
      setIsTransitioning(true);
      if (isChatOpen) {
        chatPanel.resize("480px");
      } else {
        chatPanel.collapse();
      }
      const timer = setTimeout(() => setIsTransitioning(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isChatOpen, isDesktop]);

  const demoMode = useFilters((s) => s.demoMode);
  const initStore = useDataStore((s) => s.init);
  useEffect(() => {
    initStore();
  }, [initStore]);

  const transactions = useDataStore((s) => s.transactions);

  // Find database date boundaries in memory using transactions store
  const bounds = useMemo(() => {
    const activeTxns = demoMode
      ? transactions.filter((t) => t.source === 'demo')
      : transactions.filter((t) => t.source !== 'demo');
    if (activeTxns.length === 0) return { earliest: undefined, latest: undefined };

    let earliest = activeTxns[0].date;
    let latest = activeTxns[0].date;
    for (let i = 1; i < activeTxns.length; i++) {
      const d = activeTxns[i].date;
      if (d < earliest) earliest = d;
      if (d > latest) latest = d;
    }
    return { earliest, latest };
  }, [transactions, demoMode]);

  const setTransactionDataBounds = useFilters((s) => s.setTransactionDataBounds);

  useEffect(() => {
    if (bounds) {
      setTransactionDataBounds(bounds.earliest, bounds.latest);
    }
  }, [bounds, setTransactionDataBounds]);

  // Live count of Uncategorized transactions for the nav badge, optimized in memory
  const uncategorizedCount = useMemo(() => {
    return transactions.filter(
      (t) =>
        t.category === 'Uncategorized' &&
        (demoMode ? t.source === 'demo' : t.source !== 'demo')
    ).length;
  }, [transactions, demoMode]);

  const renderMainWindow = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 3 }}>
          <AnimatedLogo sx={{ mr: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 0.5, flex: 1, alignItems: 'center' }}>
            {PRIMARY_NAV.map((n) => {
              const showBadge =
                n.badge === 'uncategorized' && uncategorizedCount > 0;
              return (
                <Button
                  key={n.to}
                  component={NavLink}
                  to={n.to}
                  end={(n as { end?: boolean }).end}
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

            {/* Planning Menu */}
            <Button
              id="planning-nav-button"
              onClick={handlePlanningClick}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                color: isPlanningActive ? 'primary.main' : 'text.secondary',
                textTransform: 'none',
                fontWeight: isPlanningActive ? 600 : 500,
                gap: 0.75,
              }}
            >
              Planning
            </Button>
            {isPlanningOpen && (
              <Menu
                anchorEl={planningAnchorEl}
                open={isPlanningOpen}
                onClose={handlePlanningClose}
                transitionDuration={0}
                MenuListProps={{
                  'aria-labelledby': 'planning-nav-button',
                }}
                sx={{
                  '& .MuiPaper-root': {
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    minWidth: 160,
                    mt: 0.5,
                  }
                }}
              >
                {PLANNING_NAV.map((item) => {
                  const isItemActive = location.pathname === item.to;
                  return (
                    <MenuItem
                      key={item.to}
                      component={NavLink}
                      to={item.to}
                      onClick={handlePlanningClose}
                      sx={{
                        color: isItemActive ? 'primary.main' : 'text.primary',
                        fontWeight: isItemActive ? 600 : 400,
                        gap: 1.5,
                        py: 1,
                        px: 2,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      {item.icon}
                      <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                        {item.label}
                      </Typography>
                    </MenuItem>
                  );
                })}
              </Menu>
            )}

            {/* Organize Menu */}
            <Button
              id="organize-nav-button"
              onClick={handleOrganizeClick}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                color: isOrganizeActive ? 'primary.main' : 'text.secondary',
                textTransform: 'none',
                fontWeight: isOrganizeActive ? 600 : 500,
                gap: 0.75,
              }}
            >
              Organize
            </Button>
            {isOrganizeOpen && (
              <Menu
                anchorEl={organizeAnchorEl}
                open={isOrganizeOpen}
                onClose={handleOrganizeClose}
                transitionDuration={0}
                MenuListProps={{
                  'aria-labelledby': 'organize-nav-button',
                }}
                sx={{
                  '& .MuiPaper-root': {
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    minWidth: 160,
                    mt: 0.5,
                  }
                }}
              >
                {ORGANIZE_NAV.map((item) => {
                  const isItemActive = location.pathname === item.to;
                  return (
                    <MenuItem
                      key={item.to}
                      component={NavLink}
                      to={item.to}
                      onClick={handleOrganizeClose}
                      sx={{
                        color: isItemActive ? 'primary.main' : 'text.primary',
                        fontWeight: isItemActive ? 600 : 400,
                        gap: 1.5,
                        py: 1,
                        px: 2,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      {item.icon}
                      <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                        {item.label}
                      </Typography>
                    </MenuItem>
                  );
                })}
              </Menu>
            )}

            {/* AI Tools Menu */}
            <Button
              id="aitools-nav-button"
              onClick={handleAiToolsClick}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                color: isAiToolsActive ? 'primary.main' : 'text.secondary',
                textTransform: 'none',
                fontWeight: isAiToolsActive ? 600 : 500,
                gap: 0.75,
              }}
            >
              AI Tools
            </Button>
            {isAiToolsOpen && (
              <Menu
                anchorEl={aiToolsAnchorEl}
                open={isAiToolsOpen}
                onClose={handleAiToolsClose}
                transitionDuration={0}
                MenuListProps={{
                  'aria-labelledby': 'aitools-nav-button',
                }}
                sx={{
                  '& .MuiPaper-root': {
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    minWidth: 180,
                    mt: 0.5,
                  }
                }}
              >
                {AI_NAV.map((item) => {
                  const isItemActive = location.pathname === item.to;
                  return (
                    <MenuItem
                      key={item.to}
                      component={NavLink}
                      to={item.to}
                      onClick={handleAiToolsClose}
                      sx={{
                        color: isItemActive ? 'primary.main' : 'text.primary',
                        fontWeight: isItemActive ? 600 : 400,
                        gap: 1.5,
                        py: 1,
                        px: 2,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      {item.icon}
                      <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                        {item.label}
                      </Typography>
                    </MenuItem>
                  );
                })}
              </Menu>
            )}

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
                MenuListProps={{
                  'aria-labelledby': 'settings-nav-button',
                }}
                sx={{
                  '& .MuiPaper-root': {
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    minWidth: 160,
                    mt: 0.5,
                  }
                }}
              >
                {SETTINGS_NAV.map((item) => {
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
                        gap: 1.5,
                        py: 1,
                        px: 2,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      {item.icon}
                      <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                        {item.label}
                      </Typography>
                    </MenuItem>
                  );
                })}
              </Menu>
            )}
          </Box>
          {mem && (
            <Tooltip title={`JS Heap: ${mem.used}MB used / ${mem.total}MB total`}>
              <Box
                sx={{
                  display: 'inline-flex',
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
                    boxShadow: (theme) => `0 0 0 0 ${mem.used / mem.total > 0.85 ? theme.palette.error.main : theme.palette.success.main}bb`,
                    animation: 'memPulse 2s infinite',
                    '@keyframes memPulse': {
                      '0%': {
                        boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.5)',
                      },
                      '70%': {
                        boxShadow: '0 0 0 5px rgba(76, 175, 80, 0)',
                      },
                      '100%': {
                        boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)',
                      },
                    },
                  }}
                />
                {mem.used} MB
              </Box>
            </Tooltip>
          )}
          <Button
            onClick={async () => {
              const url = "https://github.com/barnesy/strictly-spending/issues/new";
              const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
              if (isTauri) {
                const { open } = await import('@tauri-apps/plugin-shell');
                await open(url);
              } else {
                window.open(url, '_blank');
              }
            }}
            variant="text"
            color="inherit"
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              color: 'text.secondary',
              mr: 1,
              '&:hover': { color: 'text.primary', bgcolor: 'transparent' }
            }}
          >
            Feedback
          </Button>
          <Button
            onClick={() => setIsChatOpen((prev) => !prev)}
            variant={isChatOpen ? 'contained' : 'outlined'}
            color="primary"
            size="small"
            sx={{
              textTransform: 'none',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              fontWeight: 600,
              boxShadow: isChatOpen ? '0 2px 8px rgba(25, 118, 210, 0.25)' : 'none',
            }}
          >
            <Box component="span" sx={{ fontWeight: 900, mr: 0.75, textShadow: '0 0 0.5px currentColor' }}>AI</Box>
            {isChatOpen ? 'Close' : 'Copilot'}
          </Button>
        </Toolbar>
      </AppBar>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: isLayoutPage ? 'hidden' : 'auto',
          display: isLayoutPage ? 'flex' : 'block',
          flexDirection: isLayoutPage ? 'column' : undefined,
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            py: 3,
            px: 3,
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
          <PageTransition transitionKey={location.pathname === '/' || location.pathname === '/transactions' ? 'dashboard' : location.pathname}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sort" element={<Sort />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/transactions" element={<Dashboard />} />
              <Route path="/import" element={<Import />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/theme" element={<ThemeManager />} />
              <Route path="/local-model" element={<LocalModel />} />
              <Route path="/agent-skills" element={<AgentSkills />} />
              <Route path="/tools-reference" element={<ToolsReference />} />
              <Route path="/animation-playground" element={<AnimationSettings />} />
              <Route path="/merchants" element={<Merchants />} />
              <Route path="/taxes" element={<Taxes />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageTransition>
        </Container>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={dynamicTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CssBaseline />
        <DynamicAnimationStyles />
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
          {isDesktop ? (
            <PanelGroup
              orientation="horizontal"
              className={isTransitioning ? 'transitioning-panels' : ''}
              style={{ flex: 1, minHeight: 0 }}
            >
              <Panel id="main-content" minSize="360px" groupResizeBehavior="preserve-relative-size">
                {renderMainWindow()}
              </Panel>

              <PanelResizeHandle
                disabled={!isChatOpen}
                style={{
                  width: 24,
                  position: 'relative',
                  display: isChatOpen ? 'block' : 'none'
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
                    transition: 'background-color 120ms ease',
                    '[data-resize-handle-active] &, &:hover': {
                      bgcolor: 'primary.main',
                      width: 3,
                    },
                  }}
                />
              </PanelResizeHandle>

              <Panel
                panelRef={chatPanelRef}
                id="copilot-chat"
                minSize="360px"
                defaultSize={isChatOpen ? "480px" : "0px"}
                collapsible={true}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(size, _, prevSize) => {
                  if (size.inPixels === 0 && prevSize && prevSize.inPixels > 0) {
                    setIsChatOpen(false);
                  }
                }}
              >
                <Slide direction="left" in={isChatOpen} mountOnEnter unmountOnExit>
                  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 360 }}>
                    <CopilotChat
                      onClose={() => setIsChatOpen(false)}
                      showCloseButton={true}
                      isEmbedded={true}
                    />
                  </Box>
                </Slide>
              </Panel>
            </PanelGroup>
          ) : (
            <>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {renderMainWindow()}
              </Box>
              <Drawer
                anchor="right"
                open={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                PaperProps={{
                  sx: {
                    width: { xs: '100%', sm: 400 },
                    border: 'none',
                    boxShadow: 'none',
                  }
                }}
              >
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CopilotChat
                    onClose={() => setIsChatOpen(false)}
                    showCloseButton={true}
                    isEmbedded={true}
                  />
                </Box>
              </Drawer>
            </>
          )}
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
