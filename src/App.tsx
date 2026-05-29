import { Routes, Route, NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Button,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Dashboard from './pages/Dashboard';
import Forecast from './pages/Forecast';
import Import from './pages/Import';
import Transactions from './pages/Transactions';
import Rules from './pages/Rules';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Sort from './pages/Sort';
import { db } from './db';
import { useFilters } from './store';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sort', label: 'Sort', badge: 'uncategorized' as const },
  { to: '/forecast', label: 'Forecast' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/import', label: 'Import' },
  { to: '/rules', label: 'Rules' },
  { to: '/categories', label: 'Categories' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  const demoMode = useFilters((s) => s.demoMode);
  const theme = useTheme();
  // Below `md` the eight nav buttons no longer fit in the toolbar, so we
  // collapse them into a hamburger-triggered drawer.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Live count of Uncategorized transactions, demo-mode aware, for the nav badge.
  const allTxnsAll = useLiveQuery(() => db.transactions.toArray(), []);
  const uncategorizedCount = useMemo(() => {
    if (!allTxnsAll) return 0;
    const filtered = demoMode
      ? allTxnsAll.filter((t) => t.source === 'demo')
      : allTxnsAll;
    return filtered.filter((t) => t.category === 'Uncategorized').length;
  }, [allTxnsAll, demoMode]);

  const renderBadge = () =>
    uncategorizedCount > 0 ? (
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
    ) : null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'white',
          color: 'text.primary',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <Toolbar sx={{ gap: { xs: 1, md: 3 } }}>
          {isMobile && (
            <IconButton
              edge="start"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              sx={{ color: 'text.primary' }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', mr: 1 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, lineHeight: 1.1 }}
            >
              Strictly Spending
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 11, lineHeight: 1, mt: 0.25 }}
            >
              Where is the money actually going?
            </Typography>
          </Box>
          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
              {NAV.map((n) => {
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
                    {showBadge && renderBadge()}
                  </Button>
                );
              })}
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 260 } } }}
      >
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            Strictly Spending
          </Typography>
        </Box>
        <List>
          {NAV.map((n) => {
            const showBadge =
              n.badge === 'uncategorized' && uncategorizedCount > 0;
            return (
              <ListItemButton
                key={n.to}
                component={NavLink}
                to={n.to}
                end={(n as { end?: boolean }).end}
                onClick={() => setDrawerOpen(false)}
                sx={{
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'action.selected',
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                  },
                }}
              >
                <ListItemText primary={n.label} />
                {showBadge && renderBadge()}
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>
      <Container maxWidth={false} sx={{ py: { xs: 2, md: 3 }, px: { xs: 1.5, sm: 3 } }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sort" element={<Sort />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/import" element={<Import />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Container>
    </Box>
  );
}
