import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { eq, ne, inArray, between, desc, asc } from 'drizzle-orm';
import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  Stack,
  Typography,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Box,
  Chip,
  Select,
  MenuItem,
  TableFooter,
  Button,
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { useDataStore } from '../dataStore';
import { useShallow } from 'zustand/react/shallow';

import { refreshRecurrenceAll } from '../recurrence';
import PageLoader from '../components/PageLoader';
import DataTable from '../components/DataTable';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import { subtleScrollSx } from '../styles';

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle aria-label={ariaLabel} style={{ width: 16, position: 'relative' }}>
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
  );
}

function PanelScroll({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ height: '100%', overflow: 'auto', ...subtleScrollSx }}>
      {children}
    </Box>
  );
}

export default function Categories() {
  const { categories, transactions } = useDataStore(useShallow((s) => ({
    categories: s.categories,
    transactions: s.transactions,
  })));
  const deferredTransactions = useDeferredValue(transactions);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [categoryType, setCategoryType] = useState('all');
  const [recurrenceFilter, setRecurrenceFilter] = useState('all');

  const panelIds = [
    ...(filtersOpen ? ['filters'] : []),
    'table'
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `categories-layout-v3-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!categories || !deferredTransactions) return c;
    for (let i = 0; i < deferredTransactions.length; i++) {
      const t = deferredTransactions[i];
      c[t.category] = (c[t.category] || 0) + 1;
    }
    return c;
  }, [categories, deferredTransactions]);

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter((c) => {
      const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = categoryType === 'all' || c.type === categoryType;
      const matchesRecurrence =
        recurrenceFilter === 'all' || (c.defaultRecurrence || 'onetime') === recurrenceFilter;
      return matchesSearch && matchesType && matchesRecurrence;
    });
  }, [categories, searchQuery, categoryType, recurrenceFilter]);

  const handleRecurrenceChange = async (categoryId: number, value: 'recurring' | 'onetime') => {
    await db.update(schema.categories).set({ defaultRecurrence: value }).where(eq(schema.categories.id, categoryId));
    await refreshRecurrenceAll();
  };

  const isLoading = !categories || !transactions;

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Categories
        </Typography>

        {/* Search & Filter bar */}
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant={filtersOpen ? 'contained' : 'outlined'}
            size="small"
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px`, height: 40 }}
          >
            Filters {(categoryType !== 'all' || recurrenceFilter !== 'all') ? '•' : ''}
          </Button>
          <Box sx={{ flex: 1, maxWidth: 400 }}>
            <TextField
              placeholder="Search categories..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              size="small"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: searchInput && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }
              }}
            />
          </Box>
        </Stack>

        {/* Main Layout Area */}
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
          <PanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            style={{ height: '100%' }}
          >
            {filtersOpen && (
              <Panel id="filters" defaultSize="25%" minSize="20%" maxSize="40%">
                <PanelScroll>
                  <Stack spacing={3} sx={{ pr: 1, py: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Advanced Filters
                    </Typography>

                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Category Type
                      </Typography>
                      <Select
                        fullWidth
                        size="small"
                        value={categoryType}
                        onChange={(e) => setCategoryType(e.target.value)}
                      >
                        <MenuItem value="all">All Types</MenuItem>
                        <MenuItem value="spend">Spend</MenuItem>
                        <MenuItem value="income">Income</MenuItem>
                        <MenuItem value="transfer">Transfer</MenuItem>
                      </Select>
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Default Recurrence
                      </Typography>
                      <Select
                        fullWidth
                        size="small"
                        value={recurrenceFilter}
                        onChange={(e) => setRecurrenceFilter(e.target.value)}
                      >
                        <MenuItem value="all">All Recurrence</MenuItem>
                        <MenuItem value="onetime">One-Time / Variable</MenuItem>
                        <MenuItem value="recurring">Recurring</MenuItem>
                      </Select>
                    </Box>

                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => {
                        setCategoryType('all');
                        setRecurrenceFilter('all');
                        setSearchQuery('');
                        setSearchInput('');
                      }}
                    >
                      Clear All Filters
                    </Button>
                  </Stack>
                </PanelScroll>
              </Panel>
            )}

            {filtersOpen && <StyledResizeHandle ariaLabel="Resize filters / table" />}

            <Panel id="table" defaultSize="75%" minSize="30%">
              <Box
                sx={{
                  position: 'relative',
                  flexGrow: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  pl: filtersOpen ? 1 : 0,
                }}
              >
                <DataTable stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Recurrence Default</TableCell>
                      <TableCell align="right">Transactions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCategories.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box
                              sx={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                bgcolor: c.color,
                              }}
                            />
                            <Typography>{c.name}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={c.type} />
                        </TableCell>
                        <TableCell>
                          {c.type === 'spend' || c.type === 'income' ? (
                            <Select
                              size="small"
                              value={c.defaultRecurrence || 'onetime'}
                              onChange={(e) => handleRecurrenceChange(c.id!, e.target.value as any)}
                              sx={{ minWidth: 160 }}
                            >
                              <MenuItem value="onetime">One-Time / Variable</MenuItem>
                              <MenuItem value="recurring">Recurring</MenuItem>
                            </Select>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              N/A (Transfer)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{counts[c.name] || 0}</TableCell>
                      </TableRow>
                    ))}
                    {filteredCategories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary', fontStyle: 'italic' }}>
                          No categories found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          Total Categories: {filteredCategories.length}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </DataTable>
              </Box>
            </Panel>
          </PanelGroup>
        </Box>
      </Stack>
    </PageLoader>
  );
}
