import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useDataStore } from '../dataStore';
import { useShallow } from 'zustand/react/shallow';
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
} from '@mui/material';
import PageLoader from '../components/PageLoader';
import { useTheme } from '@mui/material/styles';
import DataTable from '../components/DataTable';
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
import { db } from '../db';
import type { CategoryRule, Transaction } from '../types';
import { normalizeForMatch } from '../categorize';

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

  const { allRulesUnsorted, allTxns, categories, isDataLoading } = useDataStore(useShallow((s) => ({
    allRulesUnsorted: s.rules,
    allTxns: s.transactions,
    categories: s.categories,
    isDataLoading: s.isLoading,
  })));

  const allRules = useMemo(() => {
    if (!allRulesUnsorted) return undefined;
    return [...allRulesUnsorted].sort((a, b) => b.priority - a.priority);
  }, [allRulesUnsorted]);

  const deferredAllTxns = useDeferredValue(allTxns);

  const isLoading = isDataLoading || allRules === undefined || allTxns === undefined || categories === undefined;

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const panelIds = [
    ...(filtersOpen ? ['filters'] : []),
    'table'
  ];
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

  const totalRules = filteredRules.length;

  const paginatedRules = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRules.slice(start, start + rowsPerPage);
  }, [filteredRules, page, rowsPerPage]);

  const [editing, setEditing] = useState<CategoryRule | 'new' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onSave = async (rule: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => {
    if (rule.id) {
      await db.rules.update(rule.id, {
        pattern: rule.pattern,
        category: rule.category,
        priority: rule.priority,
      });
    } else {
      await db.rules.add({
        pattern: rule.pattern,
        category: rule.category,
        priority: rule.priority,
        createdAt: new Date().toISOString(),
      });
    }
    setEditing(null);
  };

  const handleDeleteClick = (id: number) => {
    setDeleteRuleId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteRuleId !== null) {
      await db.rules.delete(deleteRuleId);
      setDeleteRuleId(null);
    }
  };

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  const [prevCategoryFilter, setPrevCategoryFilter] = useState(categoryFilter);
  if (searchQuery !== prevSearchQuery || categoryFilter !== prevCategoryFilter) {
    setPrevSearchQuery(searchQuery);
    setPrevCategoryFilter(categoryFilter);
    setPage(0);
  }

  const matchCounts = useMemo(() => {
    const stats: Record<number, number> = {};
    if (!allRules) return stats;
    for (const r of allRules) stats[r.id!] = 0;
    if (!deferredAllTxns) return stats;

    for (const t of deferredAllTxns) {
      const desc = normalizeForMatch(t.description);
      const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey) : '';
      for (const r of allRules) {
        if (r.pattern && (desc.includes(normalizeForMatch(r.pattern)) || (mkey && mkey.includes(normalizeForMatch(r.pattern))))) {
          stats[r.id!]++;
          break; // First matching rule wins
        }
      }
    }
    return stats;
  }, [allRules, deferredAllTxns]);

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3} sx={{ flexGrow: 1, minHeight: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Rules</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => setCleanupOpen(true)}
          >
            Auto Cleanup
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing('new')}
          >
            New rule
          </Button>
        </Stack>
      </Stack>

      {feedback && <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert>}

      {/* Search & Filter bar */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 1 }}>
        <Button
          variant={filtersOpen ? 'contained' : 'outlined'}
          size="small"
          startIcon={<FilterListIcon />}
          onClick={() => setFiltersOpen(!filtersOpen)}
          sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px`, height: 40 }}
        >
          Filters {categoryFilter !== 'all' ? '•' : ''}
        </Button>
        <Box sx={{ flex: 1, maxWidth: 400 }}>
          <TextField
            placeholder="Search patterns..."
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
                    onClick={() => {
                      setCategoryFilter('all');
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
                          sx={getAccessibleChipStyles(
                            categories?.find((c) => c.name === r.category)?.color || (isDarkMode ? '#b0bec5' : '#78909c'),
                            isDarkMode
                          )}
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

      {editing !== null && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          categories={categories?.map((c) => c.name) || []}
          allTxns={allTxns || []}
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
      <AutoCleanupDialog 
        open={cleanupOpen} 
        categories={categories}
        onClose={() => setCleanupOpen(false)} 
        onComplete={() => setCleanupOpen(false)} 
      />
      </Stack>
    </PageLoader>
  );
}

function RuleDialog({
  rule,
  categories,
  allTxns,
  onClose,
  onSave,
}: {
  rule: CategoryRule | null;
  categories: string[];
  allTxns: Transaction[];
  onClose: () => void;
  onSave: (r: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => void;
}) {
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [category, setCategory] = useState(rule?.category || categories[0] || '');
  const [priority, setPriority] = useState(rule?.priority || 100);
  const [activeMatches, setActiveMatches] = useState<Transaction[]>([]);

  useEffect(() => {
    const trimmed = pattern.trim();
    const timer = setTimeout(() => {
      if (!trimmed) {
        setActiveMatches([]);
        return;
      }
      const norm = normalizeForMatch(trimmed);
      if (!norm) {
        setActiveMatches([]);
        return;
      }
      const matches = allTxns.filter(t => {
        const desc = normalizeForMatch(t.description as string);
        const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey as string) : '';
        return desc.includes(norm) || (mkey && mkey.includes(norm));
      });
      setActiveMatches(matches);
    }, 300);

    return () => clearTimeout(timer);
  }, [pattern, allTxns]);

  const affectedCount = useMemo(() => {
    return activeMatches.filter(t => t.category !== category).length;
  }, [activeMatches, category]);

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
              <Typography variant="body2" sx={{ fontWeight: 600, color: activeMatches.length > 0 ? 'success.main' : 'text.secondary', mb: 1 }}>
                Matches {activeMatches.length} transaction(s) in database
                {activeMatches.length > 0 && (
                  <Box component="span" sx={{ display: 'block', mt: 0.5, fontWeight: 500, fontSize: '0.8rem', color: affectedCount > 0 ? 'warning.main' : 'success.main' }}>
                    {affectedCount === 0 ? '✓ No transactions will be changed (already correct)' : `⚠ ${affectedCount} transaction(s) will be updated to "${category}"`}
                  </Box>
                )}
              </Typography>
              {activeMatches.length > 0 && (
                <Stack spacing={0.75} sx={{ mt: 1 }}>
                  {activeMatches.slice(0, 5).map((t, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
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
                  {activeMatches.length > 5 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                      + {activeMatches.length - 5} more matching transactions...
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
