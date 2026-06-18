import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Table,
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
} from '@mui/material';
import PageLoader from '../components/PageLoader';

import AutoCleanupDialog from '../components/AutoCleanupDialog';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { db } from '../db';
import type { CategoryRule } from '../types';
import { normalizeForMatch } from '../categorize';

export default function Rules() {
  const allRules = useLiveQuery(() => db.rules.orderBy('priority').reverse().toArray(), []);
  const allTxns = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];

  const isLoading = allRules === undefined || allTxns === undefined || categories === undefined;

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

  useEffect(() => {
    setPage(0);
  }, [searchQuery, categoryFilter]);

  const matchCounts = useMemo(() => {
    if (!allTxns || !paginatedRules.length) return {};
    const counts: Record<number, number> = {};
    paginatedRules.forEach(r => { if (r.id) counts[r.id] = 0; });
    
    const activeRules = paginatedRules
      .filter(r => r.id && r.pattern)
      .map(r => ({ id: r.id!, pattern: normalizeForMatch(r.pattern) }))
      .filter(r => r.pattern);

    if (activeRules.length > 0) {
      // Loop over transactions in memory! (Blazing fast compared to db.transactions.each)
      for (const t of allTxns) {
        const desc = normalizeForMatch(t.description);
        const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey) : '';
        for (const r of activeRules) {
          if (desc.includes(r.pattern) || (mkey && mkey.includes(r.pattern))) {
            counts[r.id]++;
          }
        }
      }
    }
    return counts;
  }, [allTxns, paginatedRules]);

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Categorization Rules</Typography>
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
      <Paper sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          label="Search Patterns"
          variant="outlined"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        <TextField
          select
          size="small"
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All Categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.name}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Paper>



      <Box sx={{ position: 'relative' }}>
        <Paper>
        <Table size="small">
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
                  <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                    {r.pattern}
                  </code>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.category}
                    sx={{
                      bgcolor:
                        (categories?.find((c) => c.name === r.category)
                          ?.color || '#bdbdbd') + '22',
                      color:
                        categories?.find((c) => c.name === r.category)?.color ||
                        '#666',
                    }}
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
        </Table>
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
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>

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
  allTxns: any[];
  onClose: () => void;
  onSave: (r: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => void;
}) {
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [category, setCategory] = useState(rule?.category || categories[0] || '');
  const [priority, setPriority] = useState(rule?.priority || 100);
  const [activeMatches, setActiveMatches] = useState<any[]>([]);

  useEffect(() => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      setActiveMatches([]);
      return;
    }
    const norm = normalizeForMatch(trimmed);
    if (!norm) {
      setActiveMatches([]);
      return;
    }

    const timer = setTimeout(() => {
      const matches = allTxns.filter(t => {
        const desc = normalizeForMatch(t.description);
        const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey) : '';
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
