import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Container, Button, Chip, Menu, MenuItem, Slide } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import RuleIcon from '@mui/icons-material/Rule';
import CategoryIcon from '@mui/icons-material/Category';
import SettingsIcon from '@mui/icons-material/Settings';
import PsychologyIcon from '@mui/icons-material/Psychology';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';

import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import Import from './pages/Import';
import Rules from './pages/Rules';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import LocalModel from './pages/LocalModel';
import { AgentSkills } from './pages/AgentSkills';
import Sort from './pages/Sort';
import ArtifactsLibrary from './pages/ArtifactsLibrary';
import CopilotChat from './components/CopilotChat';
import ArtifactViewer from './components/ArtifactViewer';
import { useChatStore } from './chatStore';
import { db } from './db';
import { useFilters } from './store';
import { PageTransition } from './components/PageTransition';

function AnimatedLogo() {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(12);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartRot, setDragStartRot] = useState({ x: 12, y: 0 });

  // Slow auto-spin animation when not dragging
  useEffect(() => {
    if (isDragging) return;
    let frame: number;
    let lastTime = performance.now();
    const update = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      setRotY((prev) => (prev + delta * 0.02) % 360);
      setRotX(() => 2 + 10 * Math.sin(time * 0.0004));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isDragging]);

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX, y: clientY });
    setDragStartRot({ x: rotX, y: rotY });
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;
    setRotY(dragStartRot.y + dx * 0.7);
    setRotX(Math.max(-45, Math.min(45, dragStartRot.x - dy * 0.7)));
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const layers = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        mr: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: '150px',
        overflow: 'visible',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }}
      onTouchEnd={handleEnd}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: isDragging ? 'none' : 'transform 150ms ease-out',
        }}
      >
        {layers.map((z) => {
          const isFace = z === 4 || z === -4;
          return (
            <Typography
              key={z}
              sx={{
                position: 'absolute',
                fontSize: '28px',
                fontWeight: 950,
                fontFamily: '"Impact", "Arial Black", system-ui, sans-serif',
                lineHeight: 1,
                userSelect: 'none',
                transform: `translateZ(${z}px)`,
                color: isFace ? '#CCFF00' : '#1A1A1A',
                WebkitTextStroke: '1.5px #000000',
                textShadow: isFace ? 'none' : '0.5px 0.5px 0 #000',
              }}
            >
              S
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
}

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget' },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' as const },
];

const MANAGE_NAV = [
  { to: '/import', label: 'Import', icon: <FileUploadIcon fontSize="small" /> },
  { to: '/rules', label: 'Rules', icon: <RuleIcon fontSize="small" /> },
  { to: '/categories', label: 'Categories', icon: <CategoryIcon fontSize="small" /> },
  { to: '/artifacts', label: 'Artifacts Library', icon: <LibraryBooksIcon fontSize="small" /> },
  { to: '/local-model', label: 'Local Model', icon: <Box component="span" sx={{ fontWeight: 900, fontSize: 11, minWidth: 20, display: 'inline-block', color: 'primary.main', textShadow: '0 0 0.5px currentColor' }}>AI</Box> },
  { to: '/agent-skills', label: 'Agent Skills', icon: <PsychologyIcon fontSize="small" /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
];

export default function App() {

  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isLayoutPage = (location.pathname === '/' || location.pathname === '/transactions') && isDesktop;
  const activeArtifact = useChatStore((s) => s.activeArtifact);
  const [manageAnchorEl, setManageAnchorEl] = useState<null | HTMLElement>(null);
  const isManageOpen = Boolean(manageAnchorEl);
  const handleManageClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setManageAnchorEl(event.currentTarget);
  };
  const handleManageClose = () => {
    setManageAnchorEl(null);
  };

  const isManageActive = ['/import', '/rules', '/categories', '/settings', '/local-model', '/agent-skills', '/artifacts'].includes(location.pathname);

  // Persist the open state of the side-car across page navigations and reloads.
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('app:copilotOpen') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('app:copilotOpen', String(isChatOpen));
  }, [isChatOpen]);

  const demoMode = useFilters((s) => s.demoMode);
  // Find database date boundaries using the indexed 'date' field
  const bounds = useLiveQuery(async () => {
    if (demoMode) {
      const demoTxns = await db.transactions.where('source').equals('demo').sortBy('date');
      if (demoTxns.length === 0) return { earliest: undefined, latest: undefined };
      return { earliest: demoTxns[0].date, latest: demoTxns[demoTxns.length - 1].date };
    } else {
      const earliestRecord = await db.transactions.orderBy('date').first();
      const latestRecord = await db.transactions.orderBy('date').reverse().first();
      return { earliest: earliestRecord?.date, latest: latestRecord?.date };
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
      const demoTxns = await db.transactions.where('source').equals('demo').toArray();
      return demoTxns.filter((t) => t.category === 'Uncategorized').length;
    } else {
      return await db.transactions.where('category').equals('Uncategorized').count();
    }
  }, [demoMode]) ?? 0;

  const renderMainWindow = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'white',
          color: 'text.primary',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 3 }}>
          <AnimatedLogo />
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
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    minWidth: 180,
                    borderRadius: 2,
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
            onClick={() => setIsChatOpen((prev) => !prev)}
            variant={isChatOpen ? 'contained' : 'outlined'}
            color="primary"
            size="small"
            sx={{
              textTransform: 'none',
              borderRadius: 2,
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
          <PageTransition key={location.pathname}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sort" element={<Sort />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/transactions" element={<Dashboard />} />
              <Route path="/import" element={<Import />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/local-model" element={<LocalModel />} />
              <Route path="/agent-skills" element={<AgentSkills />} />
              <Route path="/artifacts" element={<ArtifactsLibrary />} />
            </Routes>
          </PageTransition>
        </Container>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
      {isChatOpen ? (
        <PanelGroup key={activeArtifact ? 'with-artifact' : 'no-artifact'} orientation="horizontal">
          <Panel id="main-content" minSize={30} defaultSize={activeArtifact ? 40 : 70}>
            {renderMainWindow()}
          </Panel>

          <PanelResizeHandle style={{ width: 8, position: 'relative' }}>
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

          {activeArtifact && (
            <>
              <Panel
                id="artifact-viewer"
                minSize={20}
                defaultSize={35}
                collapsible={true}
                onResize={(size) => {
                  if (size.asPercentage === 0) {
                    useChatStore.getState().setActiveArtifact(null);
                  }
                }}
              >
                <Slide direction="left" in={true} mountOnEnter unmountOnExit>
                  <Box sx={{ height: '100%', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                    <ArtifactViewer />
                  </Box>
                </Slide>
              </Panel>

              <PanelResizeHandle style={{ width: 8, position: 'relative' }}>
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
            </>
          )}

          <Panel
            id="copilot-chat"
            minSize={15}
            defaultSize={activeArtifact ? 25 : 30}
            collapsible={true}
            onResize={(size) => {
              if (size.asPercentage === 0) {
                setIsChatOpen(false);
              }
            }}
          >
            <Slide direction="left" in={true} mountOnEnter unmountOnExit>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        renderMainWindow()
      )}
    </Box>
  );
}
