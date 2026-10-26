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
  Chip,
  Stack,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { CleanupReport, TransactionPreview } from '../domain/autoCleanup';
import { generateCleanupReport, executeCleanup } from '../domain/autoCleanup';
import type { Category } from '../types';
import { usdCents } from '../lib';

interface Props {
  open: boolean;
  categories: Category[];
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
          {transactions.slice(0, 50).map((t) => (
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
  const [selectedTransferPairs, setSelectedTransferPairs] = useState<Set<string>>(new Set());
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<number>>(new Set());

  // Customizations
  const [customSuggestionCategories, setCustomSuggestionCategories] = useState<Record<string, string>>({});
  const [customRetroCategories, setCustomRetroCategories] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (open) {
      generateCleanupReport().then((rep) => {
        setReport(rep);
        setSelectedSuggestions(new Set(rep.suggestions.map((s) => s.pattern + '|' + s.category)));
        setSelectedRedundant(new Set(rep.redundantRules.map((r) => r.ruleId)));
        setSelectedRetroactive(new Set(rep.retroactiveChanges.map((t) => t.transactionId)));
        setSelectedTransferPairs(new Set(rep.transferPairs.map((p) => p.pairKey)));
        setSelectedDuplicates(new Set(rep.duplicateCandidates.map((d) => d.duplicateId)));
        setCustomSuggestionCategories({});
        setCustomRetroCategories({});
        setExpandedRow(null);
        setLoading(false);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReport(null);
    }
  }, [open]);

  const handleExecute = async () => {
    if (!report) return;
    setExecuting(true);
    const approvedSuggestions = report.suggestions
      .filter((s) => selectedSuggestions.has(s.pattern + '|' + s.category))
      .map((s) => ({
        pattern: s.pattern,
        category: customSuggestionCategories[s.pattern + '|' + s.category] || s.category,
      }));

    const approvedRetroactiveTxns = Array.from(selectedRetroactive).map((id) => {
      const originalGroup =
        report.retroactiveChanges.find((t) => t.transactionId === id)?.newCategory || 'Uncategorized';
      return {
        transactionId: id,
        category: customRetroCategories[originalGroup] || originalGroup,
      };
    });

    const approvedTransferTxnIds: number[] = [];
    for (const pair of report.transferPairs) {
      if (selectedTransferPairs.has(pair.pairKey)) {
        approvedTransferTxnIds.push(pair.outflowTxn.id, pair.inflowTxn.id);
      }
    }

    await executeCleanup(
      approvedSuggestions,
      Array.from(selectedRedundant),
      approvedRetroactiveTxns,
      approvedTransferTxnIds,
      Array.from(selectedDuplicates)
    );
    setExecuting(false);
    onComplete();
  };

  const retroGrouped = useMemo(() => {
    if (!report) return {};
    const groups: Record<string, { ids: number[]; transactions: TransactionPreview[] }> = {};
    for (const t of report.retroactiveChanges) {
      if (!groups[t.newCategory]) groups[t.newCategory] = { ids: [], transactions: [] };
      groups[t.newCategory].ids.push(t.transactionId);
      groups[t.newCategory].transactions.push({
        id: t.transactionId,
        date: t.date,
        description: t.description,
        amount: t.amount,
      });
    }
    return groups;
  }, [report]);

  // Handle toggles
  const toggleSuggestion = (key: string) => {
    const next = new Set(selectedSuggestions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedSuggestions(next);
  };
  const toggleRedundant = (id: number) => {
    const next = new Set(selectedRedundant);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRedundant(next);
  };
  const toggleTransferPair = (pairKey: string) => {
    const next = new Set(selectedTransferPairs);
    if (next.has(pairKey)) next.delete(pairKey);
    else next.add(pairKey);
    setSelectedTransferPairs(next);
  };
  const toggleDuplicate = (dupId: number) => {
    const next = new Set(selectedDuplicates);
    if (next.has(dupId)) next.delete(dupId);
    else next.add(dupId);
    setSelectedDuplicates(next);
  };
  const toggleRetroGroup = (ids: number[], checked: boolean) => {
    const next = new Set(selectedRetroactive);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    setSelectedRetroactive(next);
  };
  const toggleExpand = (key: string) => {
    setExpandedRow((prev) => (prev === key ? null : key));
  };

  const hasNothingToDo =
    report &&
    report.suggestions.length === 0 &&
    report.redundantRules.length === 0 &&
    report.retroactiveChanges.length === 0 &&
    report.transferPairs.length === 0 &&
    report.duplicateCandidates.length === 0;

  const nothingSelected =
    selectedSuggestions.size === 0 &&
    selectedRedundant.size === 0 &&
    selectedRetroactive.size === 0 &&
    selectedTransferPairs.size === 0 &&
    selectedDuplicates.size === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          m: { xs: 0, sm: 4 },
          width: { xs: '100%', sm: 'calc(100% - 64px)' },
          maxHeight: { xs: '100%', sm: 'calc(100% - 64px)' },
          borderRadius: { xs: 0, sm: undefined },
        },
      }}
    >
      <DialogTitle>Auto Cleanup &amp; Transfer Pair Detector</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 8,
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography color="text.secondary">
              Analyzing rules, cross-account transfer pairs, and duplicate transactions...
            </Typography>
          </Box>
        ) : hasNothingToDo ? (
          <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            Your rules, transfers, and transactions are completely up to date! Nothing to clean up.
          </Typography>
        ) : report ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Review the proposed database actions below. Deselect any changes you wish to skip, and adjust categories if needed.
            </Typography>

            {/* Cross-Account Transfer Pairs */}
            {report.transferPairs.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <SwapHorizIcon fontSize="small" color="primary" />
                    <Typography fontWeight={600} sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                      Link {report.transferPairs.length} Cross-Account Transfer Pair
                      {report.transferPairs.length > 1 ? 's' : ''}
                    </Typography>
                    <Chip
                      size="small"
                      label="Marks both sides as Transfers"
                      color="primary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {report.transferPairs.map((pair) => (
                      <ListItem
                        key={pair.pairKey}
                        disablePadding
                        sx={{ py: 0.75, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                      >
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedTransferPairs.has(pair.pairKey)}
                            onChange={() => toggleTransferPair(pair.pairKey)}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {usdCents.format(pair.amountAbs)}
                              </Typography>
                              <Chip size="small" label={pair.outflowTxn.accountName} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              <Typography variant="caption" color="text.secondary">
                                ({pair.outflowTxn.date}) &rarr;
                              </Typography>
                              <Chip size="small" label={pair.inflowTxn.accountName} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              <Typography variant="caption" color="text.secondary">
                                ({pair.inflowTxn.date})
                              </Typography>
                            </Stack>
                          }
                          secondary={`${pair.outflowTxn.description} [${pair.outflowTxn.currentCategory}] ↔ ${pair.inflowTxn.description} [${pair.inflowTxn.currentCategory}]`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Duplicate Transactions */}
            {report.duplicateCandidates.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ContentCopyIcon fontSize="small" color="warning" />
                    <Typography fontWeight={600}>
                      Remove {report.duplicateCandidates.length} Duplicate Transaction
                      {report.duplicateCandidates.length > 1 ? 's' : ''}
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {report.duplicateCandidates.map((dup) => (
                      <ListItem
                        key={dup.duplicateId}
                        disablePadding
                        sx={{ py: 0.75, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                      >
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedDuplicates.has(dup.duplicateId)}
                            onChange={() => toggleDuplicate(dup.duplicateId)}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {usdCents.format(dup.amount)}
                              </Typography>
                              <Typography variant="body2">{dup.date}</Typography>
                              <Chip size="small" label={dup.accountName} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {dup.duplicateDescription}
                              </Typography>
                            </Stack>
                          }
                          secondary={dup.reason}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

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
                    {report.redundantRules.map((r) => (
                      <ListItem key={r.ruleId} disablePadding>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedRedundant.has(r.ruleId)}
                            onChange={() => toggleRedundant(r.ruleId)}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <span>
                              <code>{r.pattern}</code> &rarr; {r.category}
                            </span>
                          }
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
                    {report.suggestions.map((s) => {
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
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                              <Typography component="span" variant="body2">
                                <code>{s.pattern}</code> &rarr;
                              </Typography>
                              <Select
                                size="small"
                                variant="standard"
                                value={selectedCategory}
                                onChange={(e) =>
                                  setCustomSuggestionCategories({
                                    ...customSuggestionCategories,
                                    [key]: e.target.value,
                                  })
                                }
                                sx={{ minWidth: 150 }}
                              >
                                {categories.map((c) => (
                                  <MenuItem key={c.id} value={c.name}>
                                    {c.name}
                                  </MenuItem>
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
                                Based on {s.transactions.length} matching transactions.
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
                    Recategorize {report.retroactiveChanges.length} Past Transaction
                    {report.retroactiveChanges.length > 1 ? 's' : ''}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense disablePadding>
                    {Object.entries(retroGrouped).map(([cat, group]) => {
                      const ids = group.ids;
                      const allChecked = ids.every((id) => selectedRetroactive.has(id));
                      const someChecked = ids.some((id) => selectedRetroactive.has(id)) && !allChecked;
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
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                              <Typography component="span" variant="body2">
                                Move {ids.length} transaction{ids.length > 1 ? 's' : ''} to
                              </Typography>
                              <Select
                                size="small"
                                variant="standard"
                                value={selectedCategory}
                                onChange={(e) =>
                                  setCustomRetroCategories({
                                    ...customRetroCategories,
                                    [cat]: e.target.value,
                                  })
                                }
                                sx={{ minWidth: 150 }}
                              >
                                {categories.map((c) => (
                                  <MenuItem key={c.id} value={c.name}>
                                    {c.name}
                                  </MenuItem>
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
        <Button onClick={onClose} disabled={executing}>
          Cancel
        </Button>
        {!loading && !hasNothingToDo && (
          <Button
            onClick={handleExecute}
            variant="contained"
            color="primary"
            disabled={executing || nothingSelected}
          >
            {executing ? <CircularProgress size={24} /> : 'Execute Selected'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
