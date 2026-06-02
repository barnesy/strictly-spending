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
          {/* Hamburger — mobile only */}
          <IconButton
            edge="start"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            sx={{ display: { xs: 'inline-flex', md: 'none' }, position: 'relative' }}
          >
            <MenuIcon />
            {uncategorizedCount > 0 && (
              <Chip
                label={uncategorizedCount}
                size="small"
                color="warning"
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  height: 16,
                  fontSize: 10,
                  fontWeight: 600,
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            )}
          </IconButton>

          <Box sx={{ display: 'flex', flexDirection: 'column', mr: 1 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, lineHeight: 1.1, fontSize: { xs: 17, md: 20 } }}
            >
              Strictly Spending
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: 11,
                lineHeight: 1,
                mt: 0.25,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              Where is the money actually going?
            </Typography>
          </Box>

          {/* Inline tabs — desktop only */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              gap: 0.5,
              flex: 1,
            }}
          >
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
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile navigation drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { md: 'none' } }}
      >
        <Box sx={{ width: 260, pt: 1 }} role="presentation">
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Strictly Spending
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Where is the money actually going?
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
                      bgcolor: 'action.selected',
                      '& .MuiListItemText-primary': {
                        color: 'primary.main',
                        fontWeight: 600,
                      },
                    },
                  }}
                >
                  <ListItemText primary={n.label} />
                  {showBadge && (
                    <Chip
                      label={uncategorizedCount}
                      size="small"
                      color="warning"
                      sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </List>
        </Box>
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
