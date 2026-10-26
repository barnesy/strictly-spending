import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useRules, useCategories, useRuleMatchCounts } from '../hooks/queries';
import { useAddRule, useUpdateRule, useDeleteRule } from '../hooks/mutations';
import {
  Box,
  Stack,
  Typography,
  Button,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  TablePagination,
  TableFooter,
  InputAdornment,
  Paper,
  Collapse,
  useMediaQuery,
} from '@mui/material';
import PageLoader from '../components/PageLoader';
import { useTheme } from '@mui/material/styles';
import DataTable from '../components/DataTable';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';
import AutoCleanupDialog from '../components/AutoCleanupDialog';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
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
import { useDeferredRender } from '../hooks/useDeferredRender';

import type { CategoryRule } from '../types';
import { api, type RulePreviewResult } from '../api';
import { useFilters } from '../stores/store';

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

export default function Rules() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { data: allRulesUnsorted = [], isLoading: isRuleLoading } = useRules();
  const { data: matchCounts = {} } = useRuleMatchCounts();
  const { data: categories = [], isLoading: isCatLoading } = useCategories();
  const isDataLoading = isRuleLoading || isCatLoading;

  const allRules = useMemo(() => {
    if (!allRulesUnsorted) return undefined;
    return [...allRulesUnsorted].sort((a, b) => b.priority - a.priority);
  }, [allRulesUnsorted]);

  const isLoading = isDataLoading || allRules === undefined || categories === undefined;

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const shouldRender = useDeferredRender();

  const panelIds = useMemo(() => [
    ...(filtersOpen ? ['filters'] : []),
    'table'
  ], [filtersOpen]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `rules-layout-v3-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // Derive filtered and paginated data in memory (blazing fast)
  const filteredRules = useMemo(() => {
    if (!allRules) return [];
    return allRules.filter(r => {
      if (!searchQuery && categoryFilter === 'all') return true;
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || r.pattern.toLowerCase().includes(searchLower);
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [allRules, searchQuery, categoryFilter]);

  const categoryChipStyles = useMemo(() => {
    const map: Record<string, ReturnType<typeof getAccessibleChipStyles>> = {};
    const fallbackColor = isDarkMode ? '#b0bec5' : '#78909c';
    for (const c of categories || []) {
      map[c.name] = getAccessibleChipStyles(c.color || fallbackColor, isDarkMode);
    }
    map.__fallback = getAccessibleChipStyles(fallbackColor, isDarkMode);
    return map;
  }, [categories, isDarkMode]);

  const totalRules = filteredRules.length;

  const paginatedRules = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRules.slice(start, start + rowsPerPage);
  }, [filteredRules, page, rowsPerPage]);

  const addRule = useAddRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  const [editing, setEditing] = useState<CategoryRule | 'new' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onSave = async (rule: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => {
    if (rule.id) {
      await updateRule.mutateAsync({
        id: rule.id,
        updates: {
          pattern: rule.pattern,
          category: rule.category,
          priority: rule.priority,
        }
      });
    } else {
      await addRule.mutateAsync({
        pattern: rule.pattern,
        category: rule.category,
        priority: rule.priority,
        createdAt: new Date().toISOString(),
      });
    }
    const { recategorizeAll } = await import('../domain/categorize');
    const { queryClient } = await import('../queryClient');
    await recategorizeAll({ forceUserRules: true });
    await queryClient.invalidateQueries();
    window.dispatchEvent(new Event('db-update'));
    setEditing(null);
  };

  const handleDeleteClick = (id: number) => {
    setDeleteRuleId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteRuleId !== null) {
      await deleteRule.mutateAsync(deleteRuleId);
      setDeleteRuleId(null);
      const { recategorizeAll } = await import('../domain/categorize');
      const { queryClient } = await import('../queryClient');
      await recategorizeAll({ forceUserRules: true });
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
    }
  };

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (searchQuery !== prevSearchQuery || categoryFilter !== prevCategoryFilter) {
    setPrevSearchQuery(searchQuery);
    setPrevCategoryFilter(categoryFilter);
    setPage(0);
  }

  if (!shouldRender) {
    return <PageLoader isLoading={true}><div /></PageLoader>;
  }

  const rulesFilterPanelContent = (
    <Stack spacing={2.5} sx={{ pr: isMobile ? 0 : 1, py: 1 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        Advanced Filters
      </Typography>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Category
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <MenuItem value="all">All Categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.name}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Button
        variant="outlined"
        fullWidth
        sx={UNIFORM_TOOLBAR_BUTTON_SX}
        onClick={() => {
          setCategoryFilter('all');
          setSearchQuery('');
          setSearchInput('');
        }}
      >
        Clear All Filters
      </Button>
    </Stack>
  );

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={{ xs: 2, md: 3 }} sx={{ flexGrow: 1, minHeight: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}>
            Rules
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={() => setCleanupOpen(true)}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Auto Cleanup
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon fontSize="small" />}
              onClick={() => setEditing('new')}
              sx={{
                ...UNIFORM_TOOLBAR_BUTTON_SX,
                border: '1px solid',
                borderColor: 'primary.main',
              }}
            >
              New rule
            </Button>
          </Stack>
        </Stack>

        {feedback && <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert>}

        {/* Search & Filter bar */}
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Button
            variant={filtersOpen ? 'contained' : 'outlined'}
            color={filtersOpen ? 'primary' : 'inherit'}
            size="small"
            startIcon={<FilterListIcon fontSize="small" />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            sx={{
              ...UNIFORM_TOOLBAR_BUTTON_SX,
              ...(filtersOpen ? { borderColor: 'primary.main' } : {}),
              flexShrink: 0,
            }}
          >
            Filters {categoryFilter !== 'all' ? '•' : ''}
          </Button>
          <Box sx={{ flex: 1, maxWidth: { xs: '100%', sm: 400 } }}>
            <TextField
              placeholder="Search patterns..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              size="small"
              fullWidth
              sx={{ '& .MuiInputBase-root': { height: 36, fontSize: '0.85rem' } }}
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
                  ),
                },
              }}
            />
          </Box>
        </Stack>

        {isMobile && (
          <Collapse in={filtersOpen}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: (t) => `${t.shape.borderRadius}px`,
                bgcolor: 'background.paper',
              }}
            >
              {rulesFilterPanelContent}
            </Paper>
          </Collapse>
        )}

        {/* Main Layout Area */}
        {isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 1.25 }}>
            {totalRules === 0 ? (
              <Paper
                variant="outlined"
                sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}
              >
                No matching rules found.
              </Paper>
            ) : (
              <Stack spacing={1.25}>
                {paginatedRules?.map((r) => (
                  <Paper
                    key={r.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: (t) => `${t.shape.borderRadius}px`,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Chip
                          size="small"
                          label={r.pattern}
                          variant="outlined"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            maxWidth: '62%',
                          }}
                        />
                        <Chip
                          size="small"
                          label={r.category}
                          sx={categoryChipStyles[r.category] || categoryChipStyles.__fallback}
                        />
                      </Stack>

                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Matches: <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>{matchCounts[r.id!] || 0}</Box>
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Priority: <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>{r.priority}</Box>
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="small"
                            onClick={() => setEditing(r)}
                            aria-label={`Edit rule: ${r.pattern}`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(r.id!)}
                            aria-label={`Delete rule: ${r.pattern}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            <Paper variant="outlined" sx={{ borderRadius: (t) => `${t.shape.borderRadius}px` }}>
              <TablePagination
                component="div"
                count={totalRules}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
                labelRowsPerPage="Rows:"
                rowsPerPageOptions={[10, 25, 50]}
                sx={{
                  '& .MuiTablePagination-toolbar': { px: 1, minHeight: 44 },
                  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: '0.75rem' },
                }}
              />
            </Paper>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
            <PanelGroup
              key={`rules-${filtersOpen ? 'open' : 'closed'}`}
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
              style={{ height: '100%' }}
            >
              {filtersOpen && (
                <Panel id="filters" defaultSize="25%" minSize="20%" maxSize="40%">
                  <PanelScroll>
                    {rulesFilterPanelContent}
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
                        <TableCell>Pattern</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Matches</TableCell>
                        <TableCell align="right">Priority</TableCell>
                        <TableCell width={100}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedRules?.map((r) => (
                        <TableRow key={r.id} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={r.pattern}
                              variant="outlined"
                              sx={{
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={r.category}
                              sx={categoryChipStyles[r.category] || categoryChipStyles.__fallback}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {matchCounts[r.id!] || 0}
                          </TableCell>
                          <TableCell align="right">{r.priority}</TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => setEditing(r)}
                              aria-label={`Edit rule: ${r.pattern}`}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(r.id!)}
                              aria-label={`Delete rule: ${r.pattern}`}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {totalRules === 0 && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                              No matching rules found.
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TablePagination
                          count={totalRules}
                          page={page}
                          onPageChange={(_, p) => setPage(p)}
                          rowsPerPage={rowsPerPage}
                          onRowsPerPageChange={(e) => {
                            setRowsPerPage(Number(e.target.value));
                            setPage(0);
                          }}
                          rowsPerPageOptions={[10, 25, 50, 100]}
                        />
                      </TableRow>
                    </TableFooter>
                  </DataTable>
                </Box>
              </Panel>
            </PanelGroup>
          </Box>
        )}

      {editing !== null && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          categories={categories?.map((c) => c.name) || []}
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}

      {/* Tauri-safe delete confirmation dialog */}
      <Dialog open={deleteRuleId !== null} onClose={() => setDeleteRuleId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Rule?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this rule? It will no longer automatically categorize future imports.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRuleId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {cleanupOpen && (
        <AutoCleanupDialog 
          open={cleanupOpen} 
          categories={categories}
          onClose={() => setCleanupOpen(false)} 
          onComplete={() => setCleanupOpen(false)} 
        />
      )}
      </Stack>
    </PageLoader>
  );
}

function RuleDialog({
  rule,
  categories,
  onClose,
  onSave,
}: {
  rule: CategoryRule | null;
  categories: string[];
  onClose: () => void;
  onSave: (r: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => void;
}) {
  const demoMode = useFilters((s) => s.demoMode);
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [category, setCategory] = useState(rule?.category || categories[0] || '');
  const [priority, setPriority] = useState(rule?.priority || 100);
  const [preview, setPreview] = useState<RulePreviewResult>({
    totalMatches: 0,
    affectedCount: 0,
    sampleTransactions: [],
  });

  useEffect(() => {
    const trimmed = pattern.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!trimmed) {
        setPreview({ totalMatches: 0, affectedCount: 0, sampleTransactions: [] });
        return;
      }
      api.previewRuleMatches(trimmed, category, demoMode)
        .then((res) => {
          if (!cancelled) {
            setPreview(res);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreview({ totalMatches: 0, affectedCount: 0, sampleTransactions: [] });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pattern, category, demoMode]);

  const { totalMatches, affectedCount, sampleTransactions } = preview;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{rule ? 'Edit rule' : 'New rule'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Pattern (case-insensitive substring)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            fullWidth
          >
            {categories.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Priority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            helperText="Higher beats lower when multiple rules match"
          />

          {pattern.trim() && (
            <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                Rule Dry Run Preview
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: totalMatches > 0 ? 'success.main' : 'text.secondary', mb: 1 }}>
                Matches {totalMatches} transaction(s) in database
                {totalMatches > 0 && (
                  <Box component="span" sx={{ display: 'block', mt: 0.5, fontWeight: 500, fontSize: '0.8rem', color: affectedCount > 0 ? 'warning.main' : 'success.main' }}>
                    {affectedCount === 0 ? '✓ No transactions will be changed (already correct)' : `⚠ ${affectedCount} transaction(s) will be updated to "${category}"`}
                  </Box>
                )}
              </Typography>
              {sampleTransactions.length > 0 && (
                <Stack spacing={0.75} sx={{ mt: 1 }}>
                  {sampleTransactions.map((t, i) => (
                    <Box key={t.id ?? i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }} title={t.description}>
                        • {t.description} (${t.amount.toFixed(2)})
                      </Typography>
                      <Chip
                        size="small"
                        label={t.category}
                        color={t.category === category ? 'default' : 'warning'}
                        variant={t.category === category ? 'outlined' : 'filled'}
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  ))}
                  {totalMatches > 5 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                      + {totalMatches - 5} more matching transactions...
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() =>
            onSave({
              id: rule?.id,
              pattern: pattern.trim(),
              category,
              priority,
            })
          }
          disabled={!pattern.trim() || !category}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function adjustColorLuminance(hex: string, percent: number): string {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);

  R = Math.floor(R * (1 + percent));
  G = Math.floor(G * (1 + percent));
  B = Math.floor(B * (1 + percent));

  R = Math.min(255, Math.max(0, R));
  G = Math.min(255, Math.max(0, G));
  B = Math.min(255, Math.max(0, B));

  const rHex = R.toString(16).padStart(2, '0');
  const gHex = G.toString(16).padStart(2, '0');
  const bHex = B.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

function getAccessibleChipStyles(hexColor: string, isDark: boolean) {
  let hex = hexColor.trim();
  if (!hex.startsWith('#')) {
    hex = '#9e9e9e';
  }
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  if (hex.length !== 7) {
    hex = '#9e9e9e';
  }

  try {
    const R = parseInt(hex.substring(1, 3), 16);
    const G = parseInt(hex.substring(3, 5), 16);
    const B = parseInt(hex.substring(5, 7), 16);
    const luminance = (0.299 * R + 0.587 * G + 0.114 * B) / 255;

    let finalColor = hex;
    if (isDark) {
      if (luminance < 0.65) {
        const factor = (0.65 - luminance) / (1 - luminance || 1);
        finalColor = adjustColorLuminance(hex, Math.min(1.5, Math.max(0.1, factor)));
      }
    } else {
      if (luminance > 0.35) {
        const factor = (0.35 - luminance) / (luminance || 1);
        finalColor = adjustColorLuminance(hex, Math.max(-0.8, Math.min(-0.1, factor)));
      }
    }

    return {
      bgcolor: finalColor + '18', // ~9% opacity background
      color: finalColor,
      border: `1px solid ${finalColor}33`,
      fontWeight: 600,
    };
  } catch {
    return {
      bgcolor: isDark ? '#ffffff11' : '#00000008',
      color: isDark ? '#fff' : '#000',
      border: `1px solid ${isDark ? '#ffffff22' : '#00000011'}`,
      fontWeight: 600,
    };
  }
}
