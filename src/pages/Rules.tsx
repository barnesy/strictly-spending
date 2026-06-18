import { useState, useEffect } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { db } from '../db';
import type { CategoryRule } from '../types';
import { recategorizeAll, normalizeForMatch } from '../categorize';
import { mineRuleSuggestions } from '../ruleMiner';
import { useMemo } from 'react';

export default function Rules() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const loadData = async () => {
    const r = await db.rules.orderBy('priority').reverse().toArray();
    const c = await db.categories.toArray();
    const txns = await db.transactions.toArray();
    setRules(r);
    setCategories(c);
    setAllTransactions(txns);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSuggestions() {
      const res = await mineRuleSuggestions();
      if (active) {
        setSuggestions(res);
      }
    }
    loadSuggestions();
    return () => {
      active = false;
    };
  }, [rules]);

  const [editing, setEditing] = useState<CategoryRule | 'new' | null>(null);
  const [recategorizing, setRecategorizing] = useState(false);
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
    await loadData();
  };

  const handleDeleteClick = (id: number) => {
    setDeleteRuleId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteRuleId !== null) {
      await db.rules.delete(deleteRuleId);
      setDeleteRuleId(null);
      await loadData();
    }
  };

  const onRecategorize = async () => {
    setRecategorizing(true);
    const { updated } = await recategorizeAll();
    setRecategorizing(false);
    setFeedback(`Recategorized ${updated} transactions.`);
  };

  const matchCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const r of rules) {
      if (!r.id || !r.pattern) continue;
      const normalizedPattern = normalizeForMatch(r.pattern);
      if (!normalizedPattern) {
        counts[r.id] = 0;
        continue;
      }
      counts[r.id] = allTransactions.filter(t => {
        const desc = normalizeForMatch(t.description);
        const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey) : '';
        return desc.includes(normalizedPattern) || (mkey && mkey.includes(normalizedPattern));
      }).length;
    }
    return counts;
  }, [rules, allTransactions]);

  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      const matchesSearch = r.pattern.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [rules, searchQuery, categoryFilter]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Categorization Rules</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={onRecategorize}
            disabled={recategorizing}
          >
            Re-run on all transactions
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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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

      {suggestions && suggestions.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Recommended Rules (Mined from manual overrides)
          </Typography>
          <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1.5, '&::-webkit-scrollbar': { height: 6 } }}>
            {suggestions.map((s, idx) => (
              <Paper
                key={idx}
                elevation={0}
                sx={{
                  p: 2,
                  minWidth: 320,
                  maxWidth: 320,
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  bgcolor: 'rgba(25, 118, 210, 0.03)',
                  flexShrink: 0,
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Create rule for "{s.pattern}"
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    Matches: <code>{s.sampleDescription}</code> ({s.overridesCount} overrides)
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Chip
                    size="small"
                    label={s.category}
                    sx={{
                      bgcolor:
                        (categories?.find((c) => c.name === s.category)
                          ?.color || '#bdbdbd') + '22',
                      color:
                        categories?.find((c) => c.name === s.category)?.color ||
                        '#666',
                      fontWeight: 500,
                    }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onSave({ pattern: s.pattern, category: s.category, priority: 100 })}
                  >
                    Add Rule
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Stack>
      )}

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
            {filteredRules?.map((r) => (
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
            {filteredRules?.length === 0 && (
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
      </Paper>

      {editing !== null && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          categories={categories?.map((c) => c.name) || []}
          allTransactions={allTransactions}
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
    </Stack>
  );
}

function RuleDialog({
  rule,
  categories,
  allTransactions,
  onClose,
  onSave,
}: {
  rule: CategoryRule | null;
  categories: string[];
  allTransactions: any[];
  onClose: () => void;
  onSave: (r: Omit<CategoryRule, 'id' | 'createdAt'> & { id?: number }) => void;
}) {
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [category, setCategory] = useState(rule?.category || categories[0] || '');
  const [priority, setPriority] = useState(rule?.priority || 100);

  const activeMatches = useMemo(() => {
    const trimmed = pattern.trim();
    if (!trimmed) return [];
    const norm = normalizeForMatch(trimmed);
    if (!norm) return [];

    return allTransactions.filter(t => {
      const desc = normalizeForMatch(t.description);
      const mkey = t.merchantKey ? normalizeForMatch(t.merchantKey) : '';
      return desc.includes(norm) || (mkey && mkey.includes(norm));
    });
  }, [pattern, allTransactions]);

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
