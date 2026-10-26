import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useTheme } from '@mui/material/styles';
import { useUpdateCategory } from '../hooks/mutations';
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
  useMediaQuery,
  Collapse,
  Paper,
} from '@mui/material';
import { useCategories, useCategoryTransactionCounts } from '../hooks/queries';

import { refreshRecurrenceAll } from '../domain/recurrence';
import PageLoader from '../components/PageLoader';
import DataTable from '../components/DataTable';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { useDeferredRender } from '../hooks/useDeferredRender';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import { subtleScrollSx } from '../styles';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';

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
  const { data: categories = [], isLoading: isCatLoading } = useCategories();
  const { data: counts = {} } = useCategoryTransactionCounts();

  const [searchInput, setSearchInput] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const shouldRender = useDeferredRender();

  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [categoryType, setCategoryType] = useState('all');
  const [recurrenceFilter, setRecurrenceFilter] = useState('all');

  const panelIds = useMemo(() => [
    ...(filtersOpen ? ['filters'] : []),
    'table'
  ], [filtersOpen]);
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

  const updateCategory = useUpdateCategory();

  const handleRecurrenceChange = async (categoryId: number, value: 'recurring' | 'onetime') => {
    await updateCategory.mutateAsync({ id: categoryId, updates: { defaultRecurrence: value } });
    await refreshRecurrenceAll();
  };

  const isLoading = isCatLoading || categories === undefined;

  if (!shouldRender) {
    return <PageLoader isLoading={true}><div /></PageLoader>;
  }

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={{ xs: 2, md: 3 }} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}>
          Categories
        </Typography>

        {/* Search & Filter bar */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant={filtersOpen ? 'contained' : 'outlined'}
            size="small"
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            sx={UNIFORM_TOOLBAR_BUTTON_SX}
          >
            Filters {(categoryType !== 'all' || recurrenceFilter !== 'all') ? '•' : ''}
          </Button>
          <Box sx={{ flex: 1, maxWidth: { xs: '100%', md: 400 } }}>
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

        {/* Mobile Collapsible Filters */}
        {isMobile && (
          <Collapse in={filtersOpen} unmountOnExit>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Advanced Filters
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
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

                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
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
                </Stack>

                <Button
                  variant="outlined"
                  fullWidth
                  sx={UNIFORM_TOOLBAR_BUTTON_SX}
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
            </Paper>
          </Collapse>
        )}

        {/* Main Layout Area */}
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
          {isMobile ? (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Total Categories: {filteredCategories.length}
                </Typography>
              </Box>
              <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
                {filteredCategories.map((c) => {
                  const txCount = counts[c.name] || 0;
                  return (
                    <Box key={c.id} sx={{ p: 1.75 }}>
                      <Stack spacing={1.25}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: c.color,
                                flexShrink: 0,
                              }}
                            />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.name}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                            <Chip size="small" label={c.type} sx={{ height: 22, fontSize: '0.7rem' }} />
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${txCount} txn${txCount === 1 ? '' : 's'}`}
                              sx={{ height: 22, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}
                            />
                          </Stack>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Default Recurrence
                          </Typography>
                          {c.type === 'spend' || c.type === 'income' ? (
                            <Select
                              size="small"
                              value={c.defaultRecurrence || 'onetime'}
                              onChange={(e) => handleRecurrenceChange(c.id!, e.target.value as any)}
                              sx={{ minWidth: 165, fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.75 } }}
                            >
                              <MenuItem value="onetime">One-Time / Variable</MenuItem>
                              <MenuItem value="recurring">Recurring</MenuItem>
                            </Select>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              N/A (Transfer)
                            </Typography>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                    <Typography variant="body2">No categories found.</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          ) : (
            <PanelGroup
              key={`categories-${filtersOpen ? 'open' : 'closed'}`}
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
                        sx={UNIFORM_TOOLBAR_BUTTON_SX}
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
          )}
        </Box>
      </Stack>
    </PageLoader>
  );
}
