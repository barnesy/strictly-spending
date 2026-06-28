import { useState, useEffect, useMemo, useRef } from 'react';
import { AppBar, Toolbar, Typography, Box, Container, Button, Chip, Menu, MenuItem, Slide, Drawer, Tooltip, IconButton, List, ListItem, ListItemButton, ListItemText, Divider } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

import AnimatedLogo from './AnimatedLogo';
import CopilotChat from './CopilotChat';
import { useFilters } from '../store';
import { useTransactionBounds, useUncategorizedCount } from '../hooks/queries';

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' as const },
];

const PLANNING_NAV = [
  { to: '/loans', label: 'Loans' },
  { to: '/taxes', label: 'Taxes' },
];

const ORGANIZE_NAV = [
  { to: '/categories', label: 'Categories' },
  { to: '/rules', label: 'Rules' },
  { to: '/merchants', label: 'Merchants' },
];

const AI_NAV = [
  { to: '/artifacts', label: 'Artifacts' },
  { to: '/local-model', label: 'Local Model' },
  { to: '/ai-reference', label: 'AI Reference' },
  { to: '/api-playground', label: 'API Playground' },
];

const SETTINGS_NAV = [
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
  { to: '/animation-playground', label: 'Animations' },
  { to: '/theme', label: 'Theme' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const layoutPages = ['/', '/dashboard', '/transactions', '/categories', '/rules', '/merchants', '/artifacts'];
  const isLayoutPage = layoutPages.includes(location.pathname) && isDesktop;
  
  const [planningAnchorEl, setPlanningAnchorEl] = useState<null | HTMLElement>(null);
  const [organizeAnchorEl, setOrganizeAnchorEl] = useState<null | HTMLElement>(null);
  const [aiToolsAnchorEl, setAiToolsAnchorEl] = useState<null | HTMLElement>(null);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const isPlanningOpen = Boolean(planningAnchorEl);
  const isOrganizeOpen = Boolean(organizeAnchorEl);
  const isAiToolsOpen = Boolean(aiToolsAnchorEl);
  const isSettingsOpen = Boolean(settingsAnchorEl);

  const handlePlanningClick = (event: React.MouseEvent<HTMLButtonElement>) => setPlanningAnchorEl(event.currentTarget);
  const handlePlanningClose = () => setPlanningAnchorEl(null);

  const handleOrganizeClick = (event: React.MouseEvent<HTMLButtonElement>) => setOrganizeAnchorEl(event.currentTarget);
  const handleOrganizeClose = () => setOrganizeAnchorEl(null);

  const handleAiToolsClick = (event: React.MouseEvent<HTMLButtonElement>) => setAiToolsAnchorEl(event.currentTarget);
  const handleAiToolsClose = () => setAiToolsAnchorEl(null);

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => setSettingsAnchorEl(event.currentTarget);
  const handleSettingsClose = () => setSettingsAnchorEl(null);

  const isPlanningActive = ['/loans', '/taxes'].includes(location.pathname);
  const isOrganizeActive = ['/categories', '/rules', '/merchants'].includes(location.pathname);
  const isAiToolsActive = ['/artifacts', '/local-model', '/ai-reference', '/api-playground'].includes(location.pathname);
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
      if (isChatOpen) chatPanel.resize("480px");
      else chatPanel.collapse();
      const timer = setTimeout(() => setIsTransitioning(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isChatOpen, isDesktop]);

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

  const renderMainWindow = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 3, minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 3 } }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              onClick={() => setIsMobileNavOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
          <AnimatedLogo sx={{ mr: { xs: 'auto', md: 1.5 } }} />
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flex: 1, alignItems: 'center' }}>
            {PRIMARY_NAV.map((n) => {
              const showBadge = n.badge === 'uncategorized' && uncategorizedCount > 0;
              const targetRoute = n.to;
              return (
                <Button
                  key={n.to}
                  component={NavLink}
                  to={targetRoute}
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
                MenuListProps={{ 'aria-labelledby': 'planning-nav-button' }}
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
                        py: 1,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
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
                MenuListProps={{ 'aria-labelledby': 'organize-nav-button' }}
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
                        py: 1,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
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
                MenuListProps={{ 'aria-labelledby': 'aitools-nav-button' }}
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
                        py: 1,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
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
                MenuListProps={{ 'aria-labelledby': 'settings-nav-button' }}
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
                        py: 1,
                        px: 2,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
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

      <Drawer
        anchor="left"
        open={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        PaperProps={{ sx: { width: 280 } }}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Menu</Typography>
          <IconButton onClick={() => setIsMobileNavOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <List sx={{ pt: 1, px: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pb: 0.5, display: 'block' }}>Primary</Typography>
          {PRIMARY_NAV.map((n) => (
            <ListItem key={n.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={n.to}
                end={(n as { end?: boolean }).end}
                onClick={() => setIsMobileNavOpen(false)}
                sx={{
                  borderRadius: 1,
                  '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' }
                }}
              >
                <ListItemText primary={n.label} />
                {n.badge === 'uncategorized' && uncategorizedCount > 0 && (
                  <Chip label={uncategorizedCount} size="small" color="warning" sx={{ height: 20, '& .MuiChip-label': { px: 1 } }} />
                )}
              </ListItemButton>
            </ListItem>
          ))}
          
          <Divider sx={{ my: 1 }} />
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pb: 0.5, display: 'block' }}>Planning</Typography>
          {PLANNING_NAV.map((item) => (
            <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton component={NavLink} to={item.to} onClick={() => setIsMobileNavOpen(false)} sx={{ borderRadius: 1, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
          
          <Divider sx={{ my: 1 }} />
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pb: 0.5, display: 'block' }}>Organize</Typography>
          {ORGANIZE_NAV.map((item) => (
            <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton component={NavLink} to={item.to} onClick={() => setIsMobileNavOpen(false)} sx={{ borderRadius: 1, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
          
          <Divider sx={{ my: 1 }} />
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pb: 0.5, display: 'block' }}>Settings</Typography>
          {SETTINGS_NAV.map((item) => (
            <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton component={NavLink} to={item.to} onClick={() => setIsMobileNavOpen(false)} sx={{ borderRadius: 1, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

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
    </Box>
  );

  return (
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
            sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
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
  );
}
