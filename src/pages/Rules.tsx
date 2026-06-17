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
import { recategorizeAll } from '../categorize';
import { mineRuleSuggestions } from '../ruleMiner';

export default function Rules() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const loadData = async () => {
    const r = await db.rules.orderBy('priority').reverse().toArray();
    const c = await db.categories.toArray();
    setRules(r);
    setCategories(c);
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

  const onDelete = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await db.rules.delete(id);
    await loadData();
  };

  const onRecategorize = async () => {
    setRecategorizing(true);
    const { updated } = await recategorizeAll();
    setRecategorizing(false);
    setFeedback(`Recategorized ${updated} transactions.`);
  };

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
              <TableCell align="right">Priority</TableCell>
              <TableCell width={100}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules?.map((r) => (
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
                    onClick={() => onDelete(r.id!)}
                    aria-label={`Delete rule: ${r.pattern}`}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {rules?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                    No rules yet.
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
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}
    </Stack>
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
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [category, setCategory] = useState(rule?.category || categories[0] || '');
  const [priority, setPriority] = useState(rule?.priority || 100);

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
