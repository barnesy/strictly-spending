// The Sort view — rapid Uncategorized triage.
//
// Architecture:
//   - Pulls all data via useLiveQuery (transactions, categories, rules, overrides).
//   - Respects demo-mode filter.
//   - Builds the queue via buildSortQueue() in src/sort.ts.
//   - Current card = first un-skipped card in the queue.
//   - Decisions commit to the DB + push to useSortStore for undo.
//   - Keyboard shortcuts: Enter (suggested), 1-9 (grid), Cmd/Ctrl-Z (undo),
//     S (skip), ? (help), Esc (close help).

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { queryClient } from '../queryClient';
import { useCategories, useSortQueue } from '../hooks/queries';
import { recategorizeAll, deriveRulePattern } from '../domain/categorize';
import PageLoader from '../components/PageLoader';
import {
  Box,
  Stack,
  Typography,
  Button,
  Paper,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  Chip,
  TextField,
  Drawer,
  useTheme,
  useMediaQuery,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import { guessTaxFields } from '../tax/taxUtils';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AutoCleanupDialog from '../components/AutoCleanupDialog';

import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

import { useFilters } from '../stores/store';
import { type SortCard as SortCardData, type Transaction } from '../types';

import SortCard from '../components/SortCard';
import SortCategoryGrid from '../components/SortCategoryGrid';
import SortEmptyState from '../components/SortEmptyState';
import { useDeferredRender } from '../hooks/useDeferredRender';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';

export default function Sort() {
  const demoMode = useFilters((s) => s.demoMode);

  const { data: categories = [], isLoading: isCatLoading } = useCategories();
  const { data: queue = [], isLoading: isQueueLoading } = useSortQueue(demoMode);

  const isDataLoading = isCatLoading || isQueueLoading;

  const [currentIndex, setCurrentIndex] = useState(0);
  const visibleQueue = useMemo(
    () => (Array.isArray(queue) ? queue.filter((c) => c && Array.isArray(c.txns) && c.txns.length > 0) : []),
    [queue]
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeChild = scrollContainerRef.current.children[currentIndex] as HTMLElement | undefined;
    if (activeChild) {
      activeChild.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentIndex, visibleQueue]);

  useEffect(() => {
    if (visibleQueue.length > 0 && currentIndex >= visibleQueue.length) {
      setCurrentIndex(Math.max(0, visibleQueue.length - 1));
    }
  }, [visibleQueue.length, currentIndex]);

  const currentCard: SortCardData | undefined =
    visibleQueue[currentIndex] ?? visibleQueue[0];

  const [selections, setSelections] = useState<Record<string, { category: string; saveRule: boolean; rulePattern: string; recurrence?: string }>>({});
  const [recurrence, setRecurrence] = useState('');
  const [saveRule, setSaveRule] = useState(true);
  const [rulePattern, setRulePattern] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{
    phase: string;
    percent: number;
    current?: number;
    total?: number;
  }>({
    phase: '',
    percent: 0,
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoCleanupOpen, setAutoCleanupOpen] = useState(false);

  // Sync state when active card or selections change
  useEffect(() => {
    if (!currentCard) {
      setRulePattern('');
      setSaveRule(true);
      return;
    }
    const key = currentCard.merchantKey;
    const sel = selections[key];
    if (sel) {
      setRulePattern(sel.rulePattern);
      setSaveRule(sel.saveRule);
      setRecurrence(sel.recurrence || '');
    } else {
      setRulePattern(deriveRulePattern(currentCard.txns?.[0]?.description || key) || key);
      setSaveRule(true);
      setRecurrence('');
    }
  }, [currentCard, selections]);

  // Sync rulePattern and saveRule changes into selections state if they edit them without selecting category first
  const handlePatternChange = (val: string) => {
    if (!currentCard) return;
    const key = currentCard.merchantKey;
    setRulePattern(val);
    if (selections[key]) {
      setSelections(prev => ({
        ...prev,
        [key]: { ...prev[key], rulePattern: val }
      }));
    }
  };

  const handleRecurrenceChange = (val: string) => {
    if (!currentCard) return;
    const key = currentCard.merchantKey;
    setRecurrence(val);
    if (selections[key]) {
      setSelections(prev => ({
        ...prev,
        [key]: { ...prev[key], recurrence: val }
      }));
    }
  };

  const handleSaveRuleChange = (val: boolean) => {
    if (!currentCard) return;
    const key = currentCard.merchantKey;
    setSaveRule(val);
    if (selections[key]) {
      setSelections(prev => ({
        ...prev,
        [key]: { ...prev[key], saveRule: val }
      }));
    }
  };

  const isInteractive = !isApplying && !!currentCard;

  const activeSuggestion = useMemo(() => {
    if (!currentCard) return undefined;
    return currentCard.suggestedCategory;
  }, [currentCard]);

  const lookupCategoryColor = useCallback(
    (name: string): string => {
      const c = (categories || []).find((cc) => cc.name === name);
      return c?.color ?? '#9e9e9e';
    },
    [categories]
  );

  const handleClearSelection = () => {
    if (!currentCard || isApplying) return;
    const key = currentCard.merchantKey;
    setSelections(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleApplySelections = useCallback(async () => {
    const selectionKeys = Object.keys(selections);
    if (selectionKeys.length === 0 || isApplying) return;

    setIsApplying(true);
    setApplyProgress({ phase: 'Preparing selections...', percent: 5 });

    try {
      const toUpdateTxns: Transaction[] = [];
      const addedPatterns = new Set<string>();

      let processedCount = 0;
      for (const key of selectionKeys) {
        const sel = selections[key];
        const card = queue.find((c) => c.merchantKey === key);
        if (!card) continue;

        const txs = card.txns;
        for (const t of txs) {
          const taxGuess = guessTaxFields(t.description, sel.category);
          toUpdateTxns.push({
            ...t,
            category: sel.category,
            userOverridden: true,
            isBusiness: taxGuess.isBusiness,
            taxCategory: taxGuess.taxCategory,
            deductionStatus: taxGuess.deductionStatus,
          });
        }

        const patternToSave = sel.rulePattern.trim();
        if (sel.recurrence) {
          const overrideKeys = Array.from(new Set([key, ...txs.map((t) => t.merchantKey).filter(Boolean)]));
          for (const mk of overrideKeys) {
            await api.putMerchantOverride({ merchantKey: mk, recurrence: sel.recurrence as import('../types').RecurrenceKind }).catch((e) => console.error(e));
          }
        }

        if (sel.saveRule && patternToSave && !addedPatterns.has(patternToSave)) {
          addedPatterns.add(patternToSave);
          await api.addRule({
            pattern: patternToSave,
            category: sel.category,
            priority: 1000,
            createdAt: new Date().toISOString(),
          }).catch((e) => console.error(e));
        }

        processedCount++;
        setApplyProgress({
          phase: `Configuring rules (${processedCount}/${selectionKeys.length})...`,
          percent: Math.round(5 + (processedCount / selectionKeys.length) * 15),
        });
        await new Promise((r) => setTimeout(r, 0));
      }

      if (toUpdateTxns.length > 0) {
        setApplyProgress({
          phase: `Updating ${toUpdateTxns.length} selected transaction(s)...`,
          percent: 25,
        });
        await new Promise((r) => setTimeout(r, 0));
        await api.bulkUpdateTransactions(toUpdateTxns);
      }

      if (addedPatterns.size > 0) {
        await recategorizeAll({
          onProgress: (p) => {
            const scaled = Math.round(30 + (p.percent / 100) * 60);
            setApplyProgress({
              phase: p.phase,
              percent: scaled,
              current: p.processed,
              total: p.total,
            });
          },
        });
      }

      setApplyProgress({ phase: 'Refreshing views...', percent: 95 });
      await new Promise((r) => setTimeout(r, 0));
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));

      setApplyProgress({ phase: 'All changes applied successfully!', percent: 100 });
      await new Promise((r) => setTimeout(r, 350));

      setSelections({});
      setCurrentIndex(0);
    } catch (err) {
      console.error('[Sort.tsx] Failed to apply selections:', err);
    } finally {
      setIsApplying(false);
      setApplyProgress({ phase: '', percent: 0 });
    }
  }, [selections, queue, isApplying]);

  const suggestedCardsCount = useMemo(() => {
    return visibleQueue.filter((c) => !!c.suggestedCategory && !selections[c.merchantKey]?.category).length;
  }, [visibleQueue, selections]);

  const handleSelectAllSuggested = useCallback(() => {
    if (isApplying) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const card of visibleQueue) {
        if (card.suggestedCategory && !next[card.merchantKey]?.category) {
          next[card.merchantKey] = {
            category: card.suggestedCategory,
            saveRule: true,
            rulePattern: deriveRulePattern(card.txns[0]?.description || card.merchantKey) || card.merchantKey,
          };
        }
      }
      return next;
    });
  }, [visibleQueue, isApplying]);

  const onPick = useCallback(
    async (categoryName: string) => {
      if (!currentCard || isApplying) return;
      const key = currentCard.merchantKey;

      setMobileDrawerOpen(false);
      const nextSelection = {
        category: categoryName,
        saveRule,
        rulePattern: rulePattern || key,
        recurrence: selections[key]?.recurrence,
      };

      setSelections(prev => ({
        ...prev,
        [key]: {
          ...nextSelection,
          recurrence: prev[key]?.recurrence ?? nextSelection.recurrence,
        }
      }));

      const tempSelections = {
        ...selections,
        [key]: nextSelection
      };

      // Auto-advance to the next card immediately (animations play in background)
      const nextIndex = visibleQueue.findIndex((card, idx) => idx > currentIndex && !tempSelections[card.merchantKey]?.category);
      if (nextIndex !== -1) {
        setCurrentIndex(nextIndex);
      } else {
        const firstUnselected = visibleQueue.findIndex((card) => !tempSelections[card.merchantKey]?.category);
        if (firstUnselected !== -1) {
          setCurrentIndex(firstUnselected);
        }
      }
    },
    [currentCard, currentIndex, visibleQueue, selections, rulePattern, saveRule, isApplying]
  );

  // Keyboard handler — single global listener while the page is mounted.
  // Number keys 1-9 pick the Nth visible category in the same order).returning().
  const visibleGridOrderRef = useRef<string[]>([]);

  useEffect(() => {
    // Compute the same ordering SortCategoryGrid uses, so number keys line up.
    const cats = categories || [];
    const filtered = cats.filter((c) => c.name !== 'Uncategorized');
    const sug = filtered.find((c) => c.name === activeSuggestion);
    const rest = filtered.filter((c) => c.name !== activeSuggestion);
    rest.sort((a, b) => a.sortOrder - b.sortOrder);
    visibleGridOrderRef.current = (sug ? [sug, ...rest] : rest).map((c) => c.name);
  }, [categories, activeSuggestion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isApplying) return;

      // Ignore when focus is in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === 'Escape' && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(visibleQueue.length - 1, prev + 1));
        return;
      }

      if (!isInteractive) return;

      if (e.key === 'Enter' && activeSuggestion) {
        e.preventDefault();
        onPick(activeSuggestion);
        return;
      }

      // Number key shortcuts 1-9
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        const name = visibleGridOrderRef.current[idx];
        if (name) {
          e.preventDefault();
          onPick(name);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick, isInteractive, helpOpen, activeSuggestion, visibleQueue.length, isApplying]);


  const isLoading = isDataLoading || categories === undefined;
  const shouldRender = useDeferredRender();

  if (!categories || isLoading || !shouldRender) {
    return <PageLoader isLoading={true}>{false}</PageLoader>;
  }

  const selectionsCount = Object.keys(selections).length;

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={2} sx={{ width: '100%', height: { xs: 'auto', md: 'calc(100vh - 120px)' }, minHeight: { xs: 'calc(100dvh - 140px)', md: 0 }, pb: 2 }}>
      {/* Header row */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Sort
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {suggestedCardsCount > 0 && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<DoneAllIcon />}
              disabled={isApplying}
              onClick={handleSelectAllSuggested}
              sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, fontWeight: 700 }}
            >
              Select Suggested ({suggestedCardsCount})
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoFixHighIcon />}
            onClick={() => setAutoCleanupOpen(true)}
            sx={UNIFORM_TOOLBAR_BUTTON_SX}
          >
            Auto Cleanup
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setHelpOpen(true)}
            sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Shortcuts
          </Button>
        </Stack>
      </Stack>
      
      {/* Global Apply Bar */}
      {(selectionsCount > 0 || isApplying) && (
        <Paper
          elevation={isApplying ? 3 : 1}
          sx={{
            p: { xs: 1.5, sm: 2 },
            border: '1px solid',
            borderColor: isApplying ? 'primary.main' : 'success.main',
            borderRadius: 2,
            transition: 'all 0.3s ease',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? isApplying
                  ? 'linear-gradient(135deg, rgba(25, 118, 210, 0.18) 0%, rgba(25, 118, 210, 0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.05) 100%)'
                : isApplying
                  ? 'linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.03) 100%)'
                  : 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.02) 100%)',
          }}
        >
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              spacing={1.5}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  {isApplying && <CircularProgress size={18} thickness={5} color="primary" />}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {isApplying ? 'Applying Selections...' : 'Selections Ready to Apply'}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${selectionsCount} merchant${selectionsCount === 1 ? '' : 's'}`}
                    color={isApplying ? 'primary' : 'success'}
                    variant={isApplying ? 'filled' : 'outlined'}
                    sx={{ height: 22, fontWeight: 700, fontSize: '0.75rem' }}
                  />
                </Stack>
                {isApplying && applyProgress.phase && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mt: 0.5, display: 'block' }}>
                    {applyProgress.phase}
                  </Typography>
                )}
              </Box>

              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={isApplying}
                  onClick={() => {
                    if (window.confirm('Clear all your current pending selections?')) {
                      setSelections({});
                    }
                  }}
                  sx={UNIFORM_TOOLBAR_BUTTON_SX}
                >
                  Reset selections
                </Button>
                <Button
                  variant="contained"
                  color={isApplying ? 'primary' : 'success'}
                  disabled={isApplying}
                  onClick={handleApplySelections}
                  startIcon={isApplying ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={{
                    ...UNIFORM_TOOLBAR_BUTTON_SX,
                    fontWeight: 700,
                    minWidth: { xs: 140, sm: 160 },
                    flex: { xs: 1, sm: 'initial' },
                    boxShadow: 2,
                  }}
                >
                  {isApplying ? 'Applying...' : `Apply ${selectionsCount} selection${selectionsCount === 1 ? '' : 's'}`}
                </Button>
              </Stack>
            </Stack>

            {isApplying && (
              <Box sx={{ width: '100%', pt: 0.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Overall Progress
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {applyProgress.percent}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={applyProgress.percent}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: (theme) =>
                      theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      transition: 'transform 0.2s linear',
                    },
                  }}
                />
              </Box>
            )}
          </Stack>
        </Paper>
      )}

      {/* Card or empty state */}
      {currentCard ? (
        <>
          {isDesktop ? (
            <PanelGroup
              key="sort-panels"
              orientation="horizontal"
              style={{ flex: 1, minHeight: 0 }}
            >
              <Panel id="sort-controls-panel" defaultSize="45%" minSize="30%" style={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, overflowY: 'auto', pr: 2 }}>
                  <Stack spacing={2}>
                <Paper sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
                        >
                          Pick a category
                        </Typography>
                        {selections[currentCard.merchantKey]?.category && (
                          <Chip
                            size="small"
                            label="Clear Selection"
                            onClick={handleClearSelection}
                            onDelete={handleClearSelection}
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                          />
                        )}
                      </Stack>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={saveRule}
                          onChange={(e) => handleSaveRuleChange(e.target.checked)}
                        />
                      }
                      label={
                        <Typography variant="caption" color="text.secondary">
                          Save as rule (catches future imports)
                        </Typography>
                      }
                      sx={{ m: 0 }}
                    />
                  </Stack>
                  
                  {saveRule && (
                    <Box sx={{ mt: 0.5, mb: 1, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Rule Pattern"
                        value={rulePattern}
                        onChange={(e) => handlePatternChange(e.target.value)}
                        placeholder="e.g. starbucks"
                        helperText="Future imports matching this keyword will be auto-categorized."
                        FormHelperTextProps={{
                          sx: { mx: 1, my: 0.5 }
                        }}
                      />
                      <Box sx={{ mt: 2 }}>
                        <TextField
                          select
                          fullWidth
                          size="small"
                          label="Recurrence"
                          value={recurrence}
                          onChange={(e) => handleRecurrenceChange(e.target.value)}
                          SelectProps={{ native: true }}
                        >
                          <option value=""></option>
                          <option value="recurring">Recurring</option>
                          <option value="onetime">One-time</option>
                        </TextField>
                      </Box>
                    </Box>
                  )}

                  <SortCategoryGrid
                    categories={categories || []}
                    suggested={activeSuggestion}
                    selected={selections[currentCard.merchantKey]?.category || null}
                    onPick={onPick}
                    spendOnly={false}
                    isAiSuggested={false}
                    hideNewCategory={false}
                  />
                  </Stack>
                </Paper>

                {/* Footer hint */}
                <Stack
                  direction="row"
                  spacing={1.5}
                  justifyContent="center"
                  sx={{ opacity: 0.7, py: 1 }}
                  flexWrap="wrap"
                >
                  <KeyHint k="Enter" desc="accept suggested" />
                  <KeyHint k="1–9" desc="grid pick" />
                  <KeyHint k="← / →" desc="navigate cards" />
                  <KeyHint k="?" desc="help" />
                </Stack>
              </Stack>
                </Box>
              </Panel>
              
              <PanelResizeHandle
                aria-label="Resize panels"
                style={{
                  width: 16,
                  position: 'relative',
                }}
              >
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

              <Panel id="sort-preview-panel" defaultSize="55%" minSize="35%" style={{ display: 'flex', flexDirection: 'column' }}>
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    p: 3,
                    ml: 2,
                  }}
                >
                  <Box sx={{ position: 'relative', width: '100%', maxWidth: 680, height: '85%', maxHeight: 420, minHeight: 0, my: 'auto' }}>
                {(() => {
                  const windowStart = Math.max(0, currentIndex - 2);
                  const windowEnd = Math.min(visibleQueue.length - 1, currentIndex + 3);
                  
                  const visibleCards = [];
                  for (let i = windowStart; i <= windowEnd; i++) {
                    visibleCards.push({
                      card: visibleQueue[i],
                      stackIndex: i - currentIndex
                    });
                  }

                  const sortedCards = [...visibleCards].sort((a, b) => b.stackIndex - a.stackIndex);

                  return sortedCards.map(({ card, stackIndex }) => {
                    const cardSuggestion = card.suggestedCategory;

                    const selection = selections[card.merchantKey];
                    const chosenColor = selection ? lookupCategoryColor(selection.category) : undefined;
                    const zipDirection = selection ? 'right' : 'left';

                    return (
                      <SortCard
                        key={card.merchantKey}
                        card={card}
                        suggestedColor={
                          cardSuggestion
                            ? lookupCategoryColor(cardSuggestion)
                            : undefined
                        }
                        chosenColor={chosenColor}
                        stackIndex={stackIndex}
                        zipDirection={zipDirection}
                      />
                    );
                  });
                })()}
              </Box>
                </Box>
              </Panel>
            </PanelGroup>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
              <Box
                onTouchStart={(e) => {
                  touchStartXRef.current = e.touches[0]?.clientX ?? null;
                  setTouchDeltaX(0);
                }}
                onTouchMove={(e) => {
                  if (touchStartXRef.current === null) return;
                  const curX = e.touches[0]?.clientX ?? touchStartXRef.current;
                  setTouchDeltaX(curX - touchStartXRef.current);
                }}
                onTouchEnd={(e) => {
                  if (touchStartXRef.current === null) return;
                  const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
                  const deltaX = endX - touchStartXRef.current;
                  touchStartXRef.current = null;
                  setTouchDeltaX(0);
                  if (Math.abs(deltaX) > 55) {
                    if (deltaX > 0) {
                      if (activeSuggestion) {
                        onPick(activeSuggestion);
                      } else {
                        setCurrentIndex((prev) => Math.max(0, prev - 1));
                      }
                    } else {
                      setCurrentIndex((prev) => Math.min(visibleQueue.length - 1, prev + 1));
                    }
                  }
                }}
                sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 0.5, overflow: 'hidden', minHeight: 340, position: 'relative' }}
              >
                {Math.abs(touchDeltaX) > 25 && (
                  <Chip
                    size="small"
                    color={touchDeltaX > 0 && activeSuggestion ? 'success' : 'default'}
                    label={
                      touchDeltaX > 0
                        ? activeSuggestion
                          ? `✓ Accept: ${activeSuggestion}`
                          : '← Previous Card'
                        : 'Skip / Next →'
                    }
                    sx={{
                      position: 'absolute',
                      top: 12,
                      zIndex: 25,
                      fontWeight: 700,
                      boxShadow: 2,
                    }}
                  />
                )}
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '100%',
                    height: 340,
                    maxHeight: 400,
                    minHeight: 300,
                    my: 'auto',
                    transform: touchDeltaX
                      ? `translateX(${Math.max(-90, Math.min(90, touchDeltaX * 0.45))}px) rotate(${Math.max(-6, Math.min(6, touchDeltaX * 0.03))}deg)`
                      : 'none',
                    transition: touchDeltaX ? 'none' : 'transform 180ms ease-out',
                  }}
                >
                {(() => {
                  const windowStart = Math.max(0, currentIndex - 2);
                  const windowEnd = Math.min(visibleQueue.length - 1, currentIndex + 3);
                  
                  const visibleCards = [];
                  for (let i = windowStart; i <= windowEnd; i++) {
                    visibleCards.push({
                      card: visibleQueue[i],
                      stackIndex: i - currentIndex
                    });
                  }

                  const sortedCards = [...visibleCards].sort((a, b) => b.stackIndex - a.stackIndex);

                  return sortedCards.map(({ card, stackIndex }) => {
                    const cardSuggestion = card.suggestedCategory;

                    const selection = selections[card.merchantKey];
                    const chosenColor = selection ? lookupCategoryColor(selection.category) : undefined;
                    const zipDirection = selection ? 'right' : 'left';

                    return (
                      <SortCard
                        key={card.merchantKey}
                        card={card}
                        suggestedColor={
                          cardSuggestion
                            ? lookupCategoryColor(cardSuggestion)
                            : undefined
                        }
                        chosenColor={chosenColor}
                        stackIndex={stackIndex}
                        zipDirection={zipDirection}
                      />
                    );
                  });
                })()}
              </Box>
              </Box>
              <Stack spacing={1} sx={{ py: 1.5, zIndex: 10 }}>
                {visibleQueue.length > 1 && (
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, minWidth: 92 }}
                    >
                      ← Prev
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textAlign: 'center' }}>
                      {activeSuggestion ? 'Swipe ← Skip · Swipe → Accept' : 'Swipe ← / →'} · {currentIndex + 1} / {visibleQueue.length}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      disabled={currentIndex >= visibleQueue.length - 1}
                      onClick={() => setCurrentIndex((prev) => Math.min(visibleQueue.length - 1, prev + 1))}
                      sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, minWidth: 92 }}
                    >
                      Next →
                    </Button>
                  </Stack>
                )}
                {activeSuggestion && (
                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    onClick={() => onPick(activeSuggestion)}
                    sx={{
                      ...UNIFORM_TOOLBAR_BUTTON_SX,
                      height: 44,
                      fontWeight: 700,
                      borderColor: lookupCategoryColor(activeSuggestion),
                      color: lookupCategoryColor(activeSuggestion),
                    }}
                  >
                    Accept Suggested: {activeSuggestion}
                  </Button>
                )}
                <Button 
                  variant="contained" 
                  size="large" 
                  fullWidth
                  onClick={() => setMobileDrawerOpen(true)}
                  sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, height: 44, fontWeight: 700 }}
                >
                  {selections[currentCard.merchantKey]?.category
                    ? `Selected: ${selections[currentCard.merchantKey].category} (Change)`
                    : 'Pick Category'}
                </Button>
              </Stack>
              <Drawer 
                anchor="bottom" 
                open={mobileDrawerOpen} 
                onClose={() => setMobileDrawerOpen(false)}
                PaperProps={{
                  sx: {
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    maxHeight: '85vh',
                    pb: 'env(safe-area-inset-bottom)',
                  },
                }}
              >
                <Box sx={{ p: 2, overflowY: 'auto' }}>
                  <Stack spacing={2}>
                <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
                        >
                          Pick a category
                        </Typography>
                        {selections[currentCard.merchantKey]?.category && (
                          <Chip
                            size="small"
                            label="Clear Selection"
                            onClick={handleClearSelection}
                            onDelete={handleClearSelection}
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                          />
                        )}
                      </Stack>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={saveRule}
                          onChange={(e) => handleSaveRuleChange(e.target.checked)}
                        />
                      }
                      label={
                        <Typography variant="caption" color="text.secondary">
                          Save as rule (catches future imports)
                        </Typography>
                      }
                      sx={{ m: 0 }}
                    />
                  </Stack>
                  
                  {saveRule && (
                    <Box sx={{ mt: 0.5, mb: 1, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Rule Pattern"
                        value={rulePattern}
                        onChange={(e) => handlePatternChange(e.target.value)}
                        placeholder="e.g. starbucks"
                        helperText="Future imports matching this keyword will be auto-categorized."
                        FormHelperTextProps={{
                          sx: { mx: 1, my: 0.5 }
                        }}
                      />
                      <Box sx={{ mt: 2 }}>
                        <TextField
                          select
                          fullWidth
                          size="small"
                          label="Recurrence"
                          value={recurrence}
                          onChange={(e) => handleRecurrenceChange(e.target.value)}
                          SelectProps={{ native: true }}
                        >
                          <option value=""></option>
                          <option value="recurring">Recurring</option>
                          <option value="onetime">One-time</option>
                        </TextField>
                      </Box>
                    </Box>
                  )}

                  <SortCategoryGrid
                    categories={categories || []}
                    suggested={activeSuggestion}
                    selected={selections[currentCard.merchantKey]?.category || null}
                    onPick={onPick}
                    spendOnly={false}
                    isAiSuggested={false}
                    hideNewCategory={false}
                  />
                  </Stack>
                </Paper>
              </Stack>
                </Box>
              </Drawer>
            </Box>
          )}
        </>

      ) : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SortEmptyState />
        </Box>
      )}

      {/* Horizontal queue tracker */}
      {visibleQueue.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'block', mb: 0.5 }}
          >
            {currentIndex + 1} of {visibleQueue.length} Merchants
          </Typography>
          <Paper
            ref={scrollContainerRef}
            elevation={0}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15) transparent' : 'rgba(0,0,0,0.15) transparent',
            }}
          >
            {visibleQueue.map((card, idx) => {
              const sel = selections[card.merchantKey];
              const isActive = idx === currentIndex;
              const isSelected = !!sel?.category;
              const chosenColor = isSelected ? lookupCategoryColor(sel.category) : undefined;
              
              return (
                <Button
                  key={card.merchantKey}
                  variant={isActive ? "contained" : "outlined"}
                  color={isActive ? "primary" : "inherit"}
                  onClick={() => setCurrentIndex(idx)}
                  sx={{
                    flexShrink: 0,
                    px: 2,
                    py: 1,
                    borderWidth: isSelected ? 3 : (isActive ? 2 : 1),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: 140,
                    maxWidth: 180,
                    bgcolor: isActive ? 'primary.main' : 'background.paper',
                    color: isActive ? 'primary.contrastText' : 'text.primary',
                    borderColor: isSelected ? chosenColor : (isActive ? 'primary.main' : 'divider'),
                    '&:hover': {
                      bgcolor: isActive ? 'primary.dark' : 'action.hover',
                    }
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: isActive || isSelected ? 700 : 600, fontSize: '0.8rem', width: '100%', textAlign: 'center' }}
                  >
                    {card.merchantKey}
                  </Typography>
                </Button>
              );
            })}
          </Paper>
        </Box>
      )}

      {/* Help dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Row k="Enter" desc="Accept the suggested category for current card" />
            <Row k="1 – 9" desc="Pick the Nth visible category" />
            <Row k="← / →" desc="Navigate between merchants" />
            <Row k="?" desc="Open this help" />
            <Row k="Esc" desc="Close this help" />
          </Stack>
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            Make category selections for any merchants you want, then click <strong>Apply Selections</strong> to save them all at once.
          </Alert>
        </DialogContent>
      </Dialog>

      <AutoCleanupDialog
        open={autoCleanupOpen}
        onClose={() => setAutoCleanupOpen(false)}
        categories={categories || []}
        onComplete={() => {
          queryClient.invalidateQueries();
          window.dispatchEvent(new Event('db-update'));
        }}
      />
      </Stack>
    </PageLoader>
  );
}

function Row({ k, desc }: { k: string; desc: string }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
      <Chip label={k} size="small" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
      <Typography variant="body2" color="text.secondary">
        {desc}
      </Typography>
    </Stack>
  );
}

function KeyHint({ k, desc }: { k: string; desc: string }) {
  return (
    <Typography variant="caption" color="text.secondary">
      <kbd
        style={{
          border: '1px solid currentColor',
          borderRadius: 4,
          padding: '0 5px',
          fontSize: 10,
          marginRight: 4,
          fontFamily: 'inherit',
          opacity: 0.8,
        }}
      >
        {k}
      </kbd>
      {desc}
    </Typography>
  );
}
