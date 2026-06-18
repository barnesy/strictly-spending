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
import { useLiveQuery } from 'dexie-react-hooks';
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
  Switch,
  TextField,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckIcon from '@mui/icons-material/Check';
import { db } from '../db';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

import { useFilters } from '../store';
import { buildRecurrenceMap, refreshRecurrenceAll } from '../recurrence';
import { buildSortQueue, type SortCard as SortCardData } from '../sort';

import SortCard from '../components/SortCard';
import SortCategoryGrid from '../components/SortCategoryGrid';
import SortEmptyState from '../components/SortEmptyState';
import { localAI } from '../ai';

export default function Sort() {
  const demoMode = useFilters((s) => s.demoMode);

  const uncategorizedAll = useLiveQuery(
    () => db.transactions.where('category').equals('Uncategorized').toArray(),
    []
  );
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const rules = useLiveQuery(() => db.rules.toArray(), []);
  const overrides = useLiveQuery(() => db.merchantOverrides.toArray(), []);

  const uncategorized = useMemo(
    () =>
      uncategorizedAll && demoMode
        ? uncategorizedAll.filter((t) => t.source === 'demo')
        : uncategorizedAll?.filter((t) => t.source !== 'demo') || [],
    [uncategorizedAll, demoMode]
  );

  const merchantKeys = useMemo(() => {
    return Array.from(new Set(uncategorized.map((t) => t.merchantKey).filter(Boolean)));
  }, [uncategorized]);

  const relevantTxnsAll = useLiveQuery(
    () =>
      merchantKeys.length > 0
        ? db.transactions.where('merchantKey').anyOf(merchantKeys).toArray()
        : Promise.resolve([]),
    [merchantKeys.join(',')]
  );

  const relevantTxns = useMemo(
    () =>
      relevantTxnsAll && demoMode
        ? relevantTxnsAll.filter((t) => t.source === 'demo')
        : relevantTxnsAll?.filter((t) => t.source !== 'demo') || [],
    [relevantTxnsAll, demoMode]
  );

  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(relevantTxns, overrides || []),
    [relevantTxns, overrides]
  );

  // Build queue from current state. useLiveQuery means this rebuilds as the
  // DB changes (e.g. after a decision commits, the row no longer matches
  // 'Uncategorized' and drops out).
  const queue = useMemo(
    () =>
      buildSortQueue(
        uncategorized,
        recurrenceMap,
        categories || [],
        rules || []
      ),
    [uncategorized, recurrenceMap, categories, rules]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const visibleQueue = queue;

  useEffect(() => {
    if (visibleQueue.length > 0 && currentIndex >= visibleQueue.length) {
      setCurrentIndex(Math.max(0, visibleQueue.length - 1));
    }
  }, [visibleQueue.length, currentIndex]);

  const currentCard: SortCardData | undefined =
    visibleQueue[currentIndex] ?? visibleQueue[0];

  const [selections, setSelections] = useState<Record<string, { category: string; saveRule: boolean; rulePattern: string }>>({});
  const [saveRule, setSaveRule] = useState(true);
  const [rulePattern, setRulePattern] = useState('');

  const [aiSuggestEnabled, setAiSuggestEnabled] = useState(() => {
    return localStorage.getItem('app:aiSuggestEnabled') === 'true';
  });
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { category: string; pattern: string }>>({});
  const [aiSuggesting, setAiSuggesting] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const fetchingKeysRef = useRef<Set<string>>(new Set());

  const [helpOpen, setHelpOpen] = useState(false);

  // Sync state when active card or suggestions or selections change
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
    } else {
      const aiSug = aiSuggestions[key];
      setRulePattern(aiSug ? aiSug.pattern : key);
      setSaveRule(true);
    }
  }, [currentCard?.merchantKey, selections, aiSuggestions]);

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

  const scoreSetting = useLiveQuery(() => db.settings.get('app:aiGuessScore'), []);
  const score = scoreSetting?.value as { correctCount: number; totalCount: number } | undefined;

  const updateScore = useCallback(async (correct: boolean) => {
    await db.transaction('rw', db.settings, async () => {
      const existing = await db.settings.get('app:aiGuessScore');
      const val = (existing?.value as { correctCount: number; totalCount: number } | undefined) || { correctCount: 0, totalCount: 0 };
      const updated = {
        correctCount: val.correctCount + (correct ? 1 : 0),
        totalCount: val.totalCount + 1,
      };
      await db.settings.put({ key: 'app:aiGuessScore', value: updated });
    });
  }, []);

  const handleToggleAiSuggest = (enabled: boolean) => {
    setAiSuggestEnabled(enabled);
    localStorage.setItem('app:aiSuggestEnabled', String(enabled));
  };

  useEffect(() => {
    if (!aiSuggestEnabled || !currentCard) return;
    const key = currentCard.merchantKey;
    if (aiSuggestions[key] || fetchingKeysRef.current.has(key)) return;

    const controller = new AbortController();
    let active = true;

    async function fetchSuggestion() {
      fetchingKeysRef.current.add(key);
      console.log('[Sort.tsx] fetchSuggestion started for merchant key:', key);
      setAiSuggesting(prev => ({ ...prev, [key]: true }));
      setAiErrors(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });

      try {
        if (!localAI.isLoaded) {
          console.log('[Sort.tsx] localAI is not loaded. Initializing...');
          await localAI.init();
          console.log('[Sort.tsx] localAI initialization finished.');
        }

        if (!active) {
          console.log('[Sort.tsx] fetchSuggestion aborted because component unmounted or active is false.');
          return;
        }

        const catNames = (categories || [])
          .map((c) => c.name)
          .filter((name) => name !== 'Uncategorized');

        const desc = currentCard.txns[0]?.description || key || '';
        const toReview = [
          {
            desc,
            ruleCategory: currentCard.suggestedCategory || 'Uncategorized',
          },
        ];

        console.log('[Sort.tsx] Calling localAI.reviewTransactionsWithRules with desc:', desc);
        const results = await localAI.reviewTransactionsWithRules(toReview, catNames, controller.signal);
        console.log('[Sort.tsx] localAI.reviewTransactionsWithRules results:', results);

        if (!active) return;
        if (results && results.length > 0) {
          const result = results[0];
          if (result && result.category && result.category !== 'Uncategorized' && catNames.includes(result.category)) {
            console.log('[Sort.tsx] Setting AI suggestion for key:', key, result);
            setAiSuggestions(prev => ({ ...prev, [key]: result }));
          } else {
            console.log('[Sort.tsx] Suggestion category invalid or Uncategorized:', result);
          }
        }
      } catch (err: any) {
        if (active && err.name !== 'AbortError') {
          console.error('[Sort.tsx] AI Auto-Suggest failed:', err);
          setAiErrors(prev => ({ ...prev, [key]: err.message || String(err) }));
        }
      } finally {
        fetchingKeysRef.current.delete(key);
        if (active) {
          console.log('[Sort.tsx] fetchSuggestion finished for merchant key:', key);
          setAiSuggesting(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
          });
        }
      }
    }

    fetchSuggestion();

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentCard?.merchantKey, aiSuggestEnabled, categories]);

  const isInteractive = !!currentCard;

  const activeSuggestion = useMemo(() => {
    if (!currentCard) return undefined;
    const key = currentCard.merchantKey;
    const activeAiCategory = aiSuggestions[key]?.category || null;
    return aiSuggestEnabled ? activeAiCategory : currentCard.suggestedCategory;
  }, [currentCard, aiSuggestions, aiSuggestEnabled]);

  const lookupCategoryColor = useCallback(
    (name: string): string => {
      const c = (categories || []).find((cc) => cc.name === name);
      return c?.color ?? '#9e9e9e';
    },
    [categories]
  );

  const handleClearSelection = () => {
    if (!currentCard) return;
    const key = currentCard.merchantKey;
    setSelections(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleApplySelections = useCallback(async () => {
    const selectionKeys = Object.keys(selections);
    if (selectionKeys.length === 0) return;

    await db.transaction('rw', db.transactions, db.rules, async () => {
      for (const key of selectionKeys) {
        const sel = selections[key];
        const card = queue.find(c => c.merchantKey === key);
        if (!card) continue;

        const txnIds = card.txns.map((t) => t.id!).filter((x) => x !== undefined);

        await db.transactions.where('id').anyOf(txnIds).modify({
          category: sel.category,
          userOverridden: true,
        });

        const patternToSave = sel.rulePattern.trim();
        if (sel.saveRule && patternToSave) {
          await db.rules.add({
            pattern: patternToSave,
            category: sel.category,
            priority: 1000,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    setSelections({});
    setCurrentIndex(0);
    await refreshRecurrenceAll();
  }, [selections, queue]);

  const onPick = useCallback(
    async (categoryName: string) => {
      if (!currentCard) return;
      const key = currentCard.merchantKey;

      const activeAiCategory = aiSuggestions[key]?.category || null;
      if (aiSuggestEnabled && activeAiCategory) {
        const isCorrect = activeAiCategory === categoryName;
        await updateScore(isCorrect);
      }

      // Set selection
      setSelections(prev => ({
        ...prev,
        [key]: {
          category: categoryName,
          saveRule,
          rulePattern: rulePattern || key,
        }
      }));

      // Auto-advance to the next uncategorized card immediately (animations play in background)
      const nextIndex = visibleQueue.findIndex((card, idx) => idx > currentIndex && !selections[card.merchantKey]?.category);
      if (nextIndex !== -1) {
        setCurrentIndex(nextIndex);
      } else {
        const firstUnselected = visibleQueue.findIndex((card) => !selections[card.merchantKey]?.category);
        if (firstUnselected !== -1) {
          setCurrentIndex(firstUnselected);
        }
      }
    },
    [currentCard, currentIndex, visibleQueue, selections, rulePattern, saveRule, aiSuggestEnabled, aiSuggestions, updateScore]
  );

  // Keyboard handler — single global listener while the page is mounted.
  // Number keys 1-9 pick the Nth visible category in the same order as the
  // grid renders them (suggested first, then sortOrder).
  const visibleGridOrderRef = useRef<string[]>([]);

  useEffect(() => {
    // Compute the same ordering SortCategoryGrid uses, so number keys line up.
    const cats = categories || [];
    const filtered = cats.filter((c) => c.type === 'spend' && c.name !== 'Uncategorized');
    const sug = filtered.find((c) => c.name === activeSuggestion);
    const rest = filtered.filter((c) => c.name !== activeSuggestion);
    rest.sort((a, b) => a.sortOrder - b.sortOrder);
    visibleGridOrderRef.current = (sug ? [sug, ...rest] : rest).map((c) => c.name);
  }, [categories, activeSuggestion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [onPick, isInteractive, helpOpen, activeSuggestion, visibleQueue.length]);

  if (!uncategorizedAll || !relevantTxnsAll || !categories || !rules) {
    return <PageLoader isLoading={true}>{false}</PageLoader>;
  }

  const selectionsCount = Object.keys(selections).length;
  const remaining = visibleQueue.length;

  const isLoading = uncategorizedAll === undefined || categories === undefined || rules === undefined;

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={2} sx={{ width: '100%', height: 'calc(100vh - 120px)', pb: 2 }}>
      {/* Header row */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Sort
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={aiSuggestEnabled}
                onChange={(e) => handleToggleAiSuggest(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                AI Auto-Suggest
              </Typography>
            }
            sx={{ m: 0 }}
          />
          {score && score.totalCount > 0 && (
            <Chip
              size="small"
              label={`AI Accuracy: ${Math.round((score.correctCount / score.totalCount) * 100)}% (${score.correctCount}/${score.totalCount})`}
              color="secondary"
              variant="outlined"
              onDelete={async () => {
                if (window.confirm('Reset AI accuracy statistics?')) {
                  await db.settings.delete('app:aiGuessScore');
                }
              }}
              sx={{ height: 26, borderRadius: 2 }}
            />
          )}
          {selectionsCount > 0 && (
            <Button
              size="small"
              onClick={() => {
                if (window.confirm('Clear all your current pending selections?')) {
                  setSelections({});
                }
              }}
              sx={{ textTransform: 'none', color: 'error.main' }}
            >
              Reset Selections
            </Button>
          )}
          <Button
            size="small"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setHelpOpen(true)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Shortcuts
          </Button>
        </Stack>
      </Stack>

      {/* Global Apply Bar */}
      {selectionsCount > 0 && (
        <Paper
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'success.main',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.05) 100%)'
                : 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.02) 100%)',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Selections Ready to Apply
              </Typography>
              <Typography variant="caption" color="text.secondary">
                You have categorized **{selectionsCount}** merchant(s) in this session.
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="success"
              onClick={handleApplySelections}
              sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
            >
              Apply {selectionsCount} Selection(s)
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Horizontal queue tracker */}
      {visibleQueue.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'block', mb: 0.5 }}
          >
            Triage Queue ({remaining} merchants remaining)
          </Typography>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              bgcolor: 'background.default',
              '&::-webkit-scrollbar': {
                height: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'action.selected',
                borderRadius: 3,
              },
            }}
          >
            {visibleQueue.map((card, idx) => {
              const sel = selections[card.merchantKey];
              const isActive = idx === currentIndex;
              const isSelected = !!sel?.category;
              return (
                <Button
                  key={card.merchantKey}
                  variant={isActive ? "contained" : "outlined"}
                  color={isSelected ? "success" : isActive ? "primary" : "inherit"}
                  onClick={() => setCurrentIndex(idx)}
                  sx={{
                    flexShrink: 0,
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 2,
                    py: 1,
                    borderWidth: isActive ? 2 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: 140,
                    maxWidth: 180,
                    bgcolor: isActive ? 'primary.main' : isSelected ? 'success.light' : 'background.paper',
                    color: isActive ? 'primary.contrastText' : isSelected ? 'success.contrastText' : 'text.primary',
                    borderColor: isActive ? 'primary.main' : isSelected ? 'success.main' : 'divider',
                    '&:hover': {
                      bgcolor: isActive ? 'primary.dark' : isSelected ? 'success.main' : 'action.hover',
                    }
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: isActive ? 700 : 600, fontSize: '0.8rem', width: '100%', textAlign: 'center' }}
                  >
                    {card.merchantKey}
                  </Typography>
                  {isSelected && (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                      <CheckIcon sx={{ fontSize: 12 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                        {sel.category}
                      </Typography>
                    </Stack>
                  )}
                </Button>
              );
            })}
          </Paper>
        </Box>
      )}

      {/* Card or empty state */}
      {currentCard ? (
        <PanelGroup orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
          {/* Left Panel: Controls (Scrollable) */}
          <Panel id="sort-controls-panel" defaultSize={45} minSize={30} style={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, overflowY: 'auto', pr: 2 }}>
              <Stack spacing={2}>
                <Paper sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
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
                      <Box sx={{ mt: 0.5, mb: 1 }}>
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
                      </Box>
                    )}
                    <SortCategoryGrid
                      categories={categories}
                      suggested={activeSuggestion}
                      selected={selections[currentCard.merchantKey]?.category || null}
                      onPick={onPick}
                      spendOnly={false}
                      isAiSuggested={aiSuggestEnabled && (aiSuggestions[currentCard.merchantKey]?.category !== undefined)}
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

          {/* Separator / Drag Handle */}
          <PanelResizeHandle
            style={{
              width: 12,
              position: 'relative',
              cursor: 'col-resize',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 'calc(50% - 1px)',
                width: 2,
                bgcolor: 'divider',
                borderRadius: 1,
                transition: 'background-color 120ms ease, width 120ms ease, left 120ms ease',
                '&:hover, &[data-resize-handle-active]': {
                  bgcolor: 'primary.main',
                  width: 4,
                  left: 'calc(50% - 2px)',
                },
              }}
            />
          </PanelResizeHandle>

          {/* Right Panel: 3D Stack Viewport */}
          <Panel id="sort-preview-panel" defaultSize={55} minSize={35} style={{ display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'auto',
                p: 3,
                ml: 2,
                width: '100%',
                height: '100%',
              }}
            >
              {/* 3D Stack of Cards */}
              <Box sx={{ position: 'relative', width: '100%', maxWidth: 680, minHeight: 560, my: 'auto' }}>
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
                    const cardSuggestion = aiSuggestEnabled
                      ? (aiSuggestions[card.merchantKey]?.category || null)
                      : card.suggestedCategory;

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
                        suggestedCategoryOverride={aiSuggestEnabled ? (aiSuggestions[card.merchantKey]?.category || undefined) : undefined}
                        aiSuggesting={aiSuggesting[card.merchantKey] || false}
                        aiError={aiErrors[card.merchantKey] || null}
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
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SortEmptyState />
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
