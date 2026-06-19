import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useMemo, useRef } from 'react';
import { AppBar, Toolbar, Typography, Box, Container, Button, Chip, Menu, MenuItem, Slide, ThemeProvider, CssBaseline, Drawer } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { getAppTheme } from './theme';
import useMediaQuery from '@mui/material/useMediaQuery';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TuneIcon from '@mui/icons-material/Tune';
import BrushIcon from '@mui/icons-material/Brush';
import BugReportIcon from '@mui/icons-material/BugReport';
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
import DynamicAnimationStyles from './components/DynamicAnimationStyles';
import CopilotChat from './components/CopilotChat';
import { db } from './db';
import { useFilters } from './store';
import { PageTransition } from './components/PageTransition';
import AnimatedLogo from './components/AnimatedLogo';

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' as const },
  { to: '/categories', label: 'Categories' },
  { to: '/rules', label: 'Rules' },
  { to: '/merchants', label: 'Merchants' },
];

const MANAGE_NAV = [
  { to: '/import', label: 'Import', icon: <FileUploadIcon fontSize="small" /> },
  { to: '/local-model', label: 'Local Model', icon: <Box component="span" sx={{ fontWeight: 900, fontSize: 11, minWidth: 20, display: 'inline-block', color: 'primary.main', textShadow: '0 0 0.5px currentColor' }}>AI</Box> },
  { to: '/agent-skills', label: 'Agent Skills', icon: <PsychologyIcon fontSize="small" /> },
  { to: '/animation-playground', label: 'Animations', icon: <TuneIcon fontSize="small" /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
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
  const isLayoutPage = (location.pathname === '/' || location.pathname === '/transactions') && isDesktop;
  const [manageAnchorEl, setManageAnchorEl] = useState<null | HTMLElement>(null);
  const isManageOpen = Boolean(manageAnchorEl);
  const handleManageClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setManageAnchorEl(event.currentTarget);
  };
  const handleManageClose = () => {
    setManageAnchorEl(null);
  };

  const isManageActive = ['/import', '/settings', '/theme', '/local-model', '/agent-skills', '/animation-playground'].includes(location.pathname);

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
        chatPanel.resize("360px");
      } else {
        chatPanel.collapse();
      }
      const timer = setTimeout(() => setIsTransitioning(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isChatOpen, isDesktop]);

  const demoMode = useFilters((s) => s.demoMode);
  // Find database date boundaries using the indexed 'date' field
  const bounds = useLiveQuery(async () => {
    if (demoMode) {
      const earliestTxn = await db.transactions.orderBy('date').filter(t => t.source === 'demo').first();
      const latestTxn = await db.transactions.orderBy('date').reverse().filter(t => t.source === 'demo').first();
      return { earliest: earliestTxn?.date, latest: latestTxn?.date };
    } else {
      const earliestTxn = await db.transactions.orderBy('date').filter(t => t.source !== 'demo').first();
      const latestTxn = await db.transactions.orderBy('date').reverse().filter(t => t.source !== 'demo').first();
      return { earliest: earliestTxn?.date, latest: latestTxn?.date };
    }
  }, [demoMode]);

  const setTransactionDataBounds = useFilters((s) => s.setTransactionDataBounds);

  useEffect(() => {
    if (bounds) {
      setTransactionDataBounds(bounds.earliest, bounds.latest);
    }
  }, [bounds, setTransactionDataBounds]);

  // Live count of Uncategorized transactions for the nav badge, optimized via index counts
  const uncategorizedCount = useLiveQuery(async () => {
    if (demoMode) {
      return await db.transactions
        .where('category')
        .equals('Uncategorized')
        .filter(t => t.source === 'demo')
        .count();
    } else {
      return await db.transactions
        .where('category')
        .equals('Uncategorized')
        .filter(t => t.source !== 'demo')
        .count();
    }
  }, [demoMode]) ?? 0;

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

            <Button
              id="manage-nav-button"
              onClick={handleManageClick}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                color: isManageActive ? 'primary.main' : 'text.secondary',
                textTransform: 'none',
                fontWeight: isManageActive ? 600 : 500,
                gap: 0.75,
              }}
            >
              Manage
            </Button>
            {isManageOpen && (
              <Menu
                anchorEl={manageAnchorEl}
                open={isManageOpen}
                onClose={handleManageClose}
                transitionDuration={0}
                MenuListProps={{
                  'aria-labelledby': 'manage-nav-button',
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
                {MANAGE_NAV.map((item) => {
                  const isItemActive = location.pathname === item.to;
                  return (
                    <MenuItem
                      key={item.to}
                      component={NavLink}
                      to={item.to}
                      onClick={handleManageClose}
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
            startIcon={<BugReportIcon fontSize="small" />}
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
              <Route path="/animation-playground" element={<AnimationSettings />} />
              <Route path="/merchants" element={<Merchants />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageTransition>
        </Container>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={dynamicTheme}>
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
              defaultSize={isChatOpen ? "360px" : "0px"}
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
    </ThemeProvider>
  );
}
