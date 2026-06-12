import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Container, Button, Chip, Fab } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Dashboard from './pages/Dashboard';
import Forecast from './pages/Forecast';
import Import from './pages/Import';
import Transactions from './pages/Transactions';
import Rules from './pages/Rules';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Sort from './pages/Sort';
import ChatDrawer from './components/ChatDrawer';
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
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const demoMode = useFilters((s) => s.demoMode);
  // Live count of Uncategorized transactions, demo-mode aware, for the nav badge.
  const allTxnsAll = useLiveQuery(() => db.transactions.toArray(), []);
  const setTransactionDataBounds = useFilters((s) => s.setTransactionDataBounds);

  useEffect(() => {
    if (!allTxnsAll || allTxnsAll.length === 0) {
      setTransactionDataBounds(undefined, undefined);
      return;
    }
    const filtered = demoMode
      ? allTxnsAll.filter((t) => t.source === 'demo')
      : allTxnsAll;

    if (filtered.length === 0) {
      setTransactionDataBounds(undefined, undefined);
      return;
    }

    let earliest = filtered[0].date;
    let latest = filtered[0].date;
    for (let i = 1; i < filtered.length; i++) {
      const d = filtered[i].date;
      if (d < earliest) earliest = d;
      if (d > latest) latest = d;
    }
    setTransactionDataBounds(earliest, latest);
  }, [allTxnsAll, demoMode, setTransactionDataBounds]);

  const uncategorizedCount = useMemo(() => {
    if (!allTxnsAll) return 0;
    const filtered = demoMode
      ? allTxnsAll.filter((t) => t.source === 'demo')
      : allTxnsAll;
    return filtered.filter((t) => t.category === 'Uncategorized').length;
  }, [allTxnsAll, demoMode]);

  const hasTransactions = useMemo(() => {
    if (!allTxnsAll) return false;
    const filtered = demoMode
      ? allTxnsAll.filter((t) => t.source === 'demo')
      : allTxnsAll;
    return filtered.length > 0;
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
        <Toolbar sx={{ gap: 3 }}>
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
      <Container maxWidth={false} sx={{ py: 3 }}>
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
      
      {(location.pathname !== '/' || !hasTransactions) && (
        <Fab
          color="primary"
          aria-label="ask ai"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          onClick={() => setIsChatOpen(true)}
        >
          <AutoAwesomeIcon />
        </Fab>
      )}

      <ChatDrawer open={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </Box>
  );
}
