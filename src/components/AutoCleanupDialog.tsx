import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  IconButton,
  Collapse,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { CleanupReport, TransactionPreview } from '../autoCleanup';
import { generateCleanupReport, executeCleanup } from '../autoCleanup';

interface Props {
  open: boolean;
  categories: any[];
  onClose: () => void;
  onComplete: () => void;
}

function TransactionTable({ transactions }: { transactions: TransactionPreview[] }) {
  return (
    <Box sx={{ mt: 1, mb: 2, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
      <Table size="small">
        <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
          <TableRow>
            <TableCell sx={{ py: 1 }}>Date</TableCell>
            <TableCell sx={{ py: 1 }}>Description</TableCell>
            <TableCell sx={{ py: 1 }} align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {transactions.slice(0, 50).map(t => (
            <TableRow key={t.id}>
              <TableCell>{new Date(t.date).toLocaleDateString()}</TableCell>
              <TableCell>{t.description}</TableCell>
              <TableCell align="right">${Math.abs(t.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
          {transactions.length > 50 && (
            <TableRow>
              <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                ... and {transactions.length - 50} more
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function AutoCleanupDialog({ open, categories, onClose, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [report, setReport] = useState<CleanupReport | null>(null);

  // Selections
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [selectedRedundant, setSelectedRedundant] = useState<Set<number>>(new Set());
  const [selectedRetroactive, setSelectedRetroactive] = useState<Set<number>>(new Set());

  // Customizations
  const [customSuggestionCategories, setCustomSuggestionCategories] = useState<Record<string, string>>({});
  const [customRetroCategories, setCustomRetroCategories] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      generateCleanupReport().then(rep => {
        setReport(rep);
        setSelectedSuggestions(new Set(rep.suggestions.map(s => s.pattern + '|' + s.category)));
        setSelectedRedundant(new Set(rep.redundantRules.map(r => r.ruleId)));
        setSelectedRetroactive(new Set(rep.retroactiveChanges.map(t => t.transactionId)));
        setCustomSuggestionCategories({});
        setCustomRetroCategories({});
        setExpandedRow(null);
        setLoading(false);
      });
    } else {
      setReport(null);
    }
  }, [open]);

  const handleExecute = async () => {
    if (!report) return;
    setExecuting(true);
    const approvedSuggestions = report.suggestions
      .filter(s => selectedSuggestions.has(s.pattern + '|' + s.category))
      .map(s => ({
        pattern: s.pattern,
        category: customSuggestionCategories[s.pattern + '|' + s.category] || s.category
      }));

    const approvedRetroactiveTxns = Array.from(selectedRetroactive).map(id => {
      const originalGroup = report.retroactiveChanges.find(t => t.transactionId === id)?.newCategory || 'Uncategorized';
      return {
        transactionId: id,
        category: customRetroCategories[originalGroup] || originalGroup
      };
    });

    await executeCleanup(
      approvedSuggestions,
      Array.from(selectedRedundant),
      approvedRetroactiveTxns
    );
    setExecuting(false);
    onComplete();
  };

  const retroGrouped = useMemo(() => {
    if (!report) return {};
    const groups: Record<string, { ids: number[], transactions: TransactionPreview[] }> = {};
    for (const t of report.retroactiveChanges) {
      if (!groups[t.newCategory]) groups[t.newCategory] = { ids: [], transactions: [] };
      groups[t.newCategory].ids.push(t.transactionId);
      groups[t.newCategory].transactions.push({ id: t.transactionId, date: t.date, description: t.description, amount: t.amount });
    }
    return groups;
  }, [report]);

  // Handle toggles
  const toggleSuggestion = (key: string) => {
    const next = new Set(selectedSuggestions);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedSuggestions(next);
  };
  const toggleRedundant = (id: number) => {
    const next = new Set(selectedRedundant);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRedundant(next);
  };
  const toggleRetroGroup = (ids: number[], checked: boolean) => {
    const next = new Set(selectedRetroactive);
    for (const id of ids) {
      if (checked) next.add(id); else next.delete(id);
    }
    setSelectedRetroactive(next);
  };
  const toggleExpand = (key: string) => {
    setExpandedRow(prev => prev === key ? null : key);
  };

  const hasNothingToDo = report && 
    report.suggestions.length === 0 && 
    report.redundantRules.length === 0 && 
    report.retroactiveChanges.length === 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Auto Cleanup Report</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8, gap: 2 }}>
            <CircularProgress />
            <Typography color="text.secondary">Analyzing database...</Typography>
          </Box>
        ) : hasNothingToDo ? (
           <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
             Your rules and transactions are completely up to date! Nothing to clean up.
           </Typography>
        ) : report ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Review the proposed database actions below. Deselect any changes you wish to skip, and adjust categories if needed.
            </Typography>

            {/* Redundant Rules */}
            {report.redundantRules.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>
                    Delete {report.redundantRules.length} Redundant Rule{report.redundantRules.length > 1 ? 's' : ''}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {report.redundantRules.map(r => (
                      <ListItem key={r.ruleId} disablePadding>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedRedundant.has(r.ruleId)}
                            onChange={() => toggleRedundant(r.ruleId)}
                          />
                        </ListItemIcon>
                        <ListItemText 
                          primary={<span><code>{r.pattern}</code> → {r.category}</span>}
                          secondary={r.reason}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Rule Suggestions */}
            {report.suggestions.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>
                    Add {report.suggestions.length} Suggested Rule{report.suggestions.length > 1 ? 's' : ''}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {report.suggestions.map(s => {
                      const key = s.pattern + '|' + s.category;
                      const isExpanded = expandedRow === key;
                      const selectedCategory = customSuggestionCategories[key] || s.category;
                      return (
                        <Box key={key} sx={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <ListItem disablePadding sx={{ py: 1 }}>
                            <ListItemIcon>
                              <Checkbox
                                edge="start"
                                checked={selectedSuggestions.has(key)}
                                onChange={() => toggleSuggestion(key)}
                              />
                            </ListItemIcon>
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Typography component="span" variant="body2">
                                <code>{s.pattern}</code> →
                              </Typography>
                              <Select
                                size="small"
                                variant="standard"
                                value={selectedCategory}
                                onChange={(e) => setCustomSuggestionCategories({ ...customSuggestionCategories, [key]: e.target.value })}
                                sx={{ minWidth: 150 }}
                              >
                                {categories.map(c => (
                                  <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
                                ))}
                                <MenuItem value="Uncategorized">Uncategorized</MenuItem>
                              </Select>
                            </Box>
                            <IconButton onClick={() => toggleExpand(key)} size="small" sx={{ ml: 2 }}>
                              {isExpanded ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </ListItem>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ pl: 7, pr: 2 }}>
                              <Typography variant="caption" color="text.secondary">
                                Based on {s.transactions.length} manual overrides.
                              </Typography>
                              <TransactionTable transactions={s.transactions} />
                            </Box>
                          </Collapse>
                        </Box>
                      );
                    })}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Retroactive Categorizations */}
            {report.retroactiveChanges.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>
                    Recategorize {report.retroactiveChanges.length} Past Transaction{report.retroactiveChanges.length > 1 ? 's' : ''}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {Object.entries(retroGrouped).map(([cat, group]) => {
                      const ids = group.ids;
                      const allChecked = ids.every(id => selectedRetroactive.has(id));
                      const someChecked = ids.some(id => selectedRetroactive.has(id)) && !allChecked;
                      const isExpanded = expandedRow === 'retro-' + cat;
                      const selectedCategory = customRetroCategories[cat] || cat;
                      return (
                        <Box key={cat} sx={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <ListItem disablePadding sx={{ py: 1 }}>
                            <ListItemIcon>
                              <Checkbox
                                edge="start"
                                checked={allChecked}
                                indeterminate={someChecked}
                                onChange={(e) => toggleRetroGroup(ids, e.target.checked)}
                              />
                            </ListItemIcon>
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Typography component="span" variant="body2">
                                Move {ids.length} transaction{ids.length > 1 ? 's' : ''} to
                              </Typography>
                              <Select
                                size="small"
                                variant="standard"
                                value={selectedCategory}
                                onChange={(e) => setCustomRetroCategories({ ...customRetroCategories, [cat]: e.target.value })}
                                sx={{ minWidth: 150 }}
                              >
                                {categories.map(c => (
                                  <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
                                ))}
                                <MenuItem value="Uncategorized">Uncategorized</MenuItem>
                              </Select>
                            </Box>
                            <IconButton onClick={() => toggleExpand('retro-' + cat)} size="small" sx={{ ml: 2 }}>
                              {isExpanded ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </ListItem>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ pl: 7, pr: 2 }}>
                               <TransactionTable transactions={group.transactions} />
                            </Box>
                          </Collapse>
                        </Box>
                      );
                    })}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={executing}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleExecute} 
          disabled={loading || executing || hasNothingToDo}
        >
          {executing ? 'Applying...' : 'Approve & Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
