import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { eq, inArray } from 'drizzle-orm';
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

import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { useDataStore } from '../dataStore';
import { refreshRecurrenceAll } from '../recurrence';
import { useDbQuery } from '../hooks/useDbQuery';
import { useShallow } from 'zustand/react/shallow';
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
  Tabs,
  Tab,
  Drawer,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { guessTaxFields } from '../taxUtils';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';

import { useFilters } from '../store';
import { buildSortQueue, type SortCard as SortCardData } from '../sort';
import type { Transaction } from '../types';

import SortCard from '../components/SortCard';
import SortCategoryGrid from '../components/SortCategoryGrid';
import SortEmptyState from '../components/SortEmptyState';
import { localAI } from '../ai';
import { playThinkingSound, stopThinkingSound, playSuccessSound, playFailSound } from '../audio';
import { useDeferredRender } from '../hooks/useDeferredRender';

export default function Sort() {
  const demoMode = useFilters((s) => s.demoMode);

  const [aiSuggestEnabled, setAiSuggestEnabled] = useState(() => {
    return localStorage.getItem('app:aiSuggestEnabled') === 'true';
  });
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { category: string; pattern: string; recurrence?: string }>>({});
  const [aiSuggesting, setAiSuggesting] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  const { allTransactions, categories, rules, isDataLoading, globalRecurrenceMap, globalDemoRecurrenceMap } = useDataStore(useShallow((s) => ({
    allTransactions: s.transactions,
    categories: s.categories,
    rules: s.rules,
    isDataLoading: s.isLoading,
    globalRecurrenceMap: s.recurrenceMap,
    globalDemoRecurrenceMap: s.demoRecurrenceMap,
  })));

  const uncategorizedAll = useMemo(
    () => allTransactions.filter((t) => t.category === 'Uncategorized'),
    [allTransactions]
  );
  const deferredUncategorizedAll = useDeferredValue(uncategorizedAll);

  const merchantKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const t of uncategorizedAll || []) if (t.merchantKey) keys.add(t.merchantKey);
    return Array.from(keys);
  }, [uncategorizedAll]);

  const relevantTxnsAll = useMemo(() => {
    if (merchantKeys.length === 0) return [];
    const keySet = new Set(merchantKeys);
    return allTransactions.filter((t) => t.merchantKey && keySet.has(t.merchantKey));
  }, [merchantKeys, allTransactions]);

  const uncategorized = useMemo(
    () =>
      deferredUncategorizedAll && demoMode
        ? deferredUncategorizedAll.filter((t) => t.source === 'demo')
        : deferredUncategorizedAll?.filter((t) => t.source !== 'demo') || [],
    [deferredUncategorizedAll, demoMode]
  );

  const recurrenceMap = demoMode ? globalDemoRecurrenceMap : globalRecurrenceMap;

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

  const fetchingKeysRef = useRef<Set<string>>(new Set());

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
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
      setRecurrence(sel.recurrence || '');
    } else {
      const aiSug = aiSuggestions[key];
      setRulePattern(aiSug ? aiSug.pattern : key);
      setSaveRule(true);
      setRecurrence(aiSug && aiSug.recurrence ? aiSug.recurrence : '');
    }
  }, [currentCard, selections, aiSuggestions]);

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

  const scoreSetting = useDbQuery(async () => (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:aiGuessScore')))[0], []);
  const score = scoreSetting?.value as { correctCount: number; totalCount: number } | undefined;

  const updateScore = useCallback(async (correct: boolean) => {
    await (async () => {
      const existing = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:aiGuessScore')))[0];
      const val = (existing?.value as { correctCount: number; totalCount: number } | undefined) || { correctCount: 0, totalCount: 0 };
      const updated = {
        correctCount: val.correctCount + (correct ? 1 : 0),
        totalCount: val.totalCount + 1,
      };
      await db.insert(schema.settings).values({ key: 'app:aiGuessScore', value: updated }).onConflictDoNothing();
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

      playThinkingSound();

      try {
        if (!localAI.isLoaded) {
          console.log('[Sort.tsx] localAI is not loaded. Initializing...');
          await localAI.init();
          console.log('[Sort.tsx] localAI initialization finished.');
        }

        if (!active) {
          console.log('[Sort.tsx] fetchSuggestion aborted because component unmounted or active is false.');
          stopThinkingSound();
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

        if (!active) {
          stopThinkingSound();
          return;
        }
        if (results && results.length > 0) {
          const result = results[0];
          if (result) {
            console.log('[Sort.tsx] Setting AI suggestion for key:', key, result);
            playSuccessSound();
            setAiSuggestions(prev => ({ ...prev, [key]: result }));
          } else {
            console.log('[Sort.tsx] Suggestion invalid:', result);
            playFailSound();
          }
        } else {
          console.log('[Sort.tsx] No results returned.');
          playFailSound();
        }
      } catch (err: unknown) {
        if (active && (err as Error).name !== 'AbortError') {
          console.error('[Sort.tsx] AI Auto-Suggest failed:', err);
          playFailSound();
          setAiErrors(prev => ({ ...prev, [key]: (err as Error).message || String(err) }));
        } else if ((err as Error).name === 'AbortError') {
          stopThinkingSound();
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
      stopThinkingSound();
    };
  }, [currentCard, aiSuggestEnabled, categories, aiSuggestions]);

  const isInteractive = !!currentCard;

  const activeSuggestion = useMemo(() => {
    if (!currentCard) return undefined;
    const key = currentCard.merchantKey;
    const activeAiCategory = aiSuggestions[key]?.category || null;
    return (aiSuggestEnabled && activeAiCategory) ? activeAiCategory : currentCard.suggestedCategory;
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

    await (async () => {
      for (const key of selectionKeys) {
        const sel = selections[key];
        const card = queue.find(c => c.merchantKey === key);
        if (!card) continue;

        const txnIds = card.txns.map((t) => t.id!).filter((x) => x !== undefined);

        const txs = await db.select().from(schema.transactions).where(inArray(schema.transactions.id, txnIds));
        for (const t of txs) {
          const taxGuess = guessTaxFields(t.description, sel.category);
          await db.update(schema.transactions).set({
            category: sel.category,
            userOverridden: true,
            isBusiness: taxGuess.isBusiness,
            taxCategory: taxGuess.taxCategory,
            deductionStatus: taxGuess.deductionStatus,
          }).where(eq(schema.transactions.id, t.id!));
        }

        const patternToSave = sel.rulePattern.trim();
        if (sel.recurrence) {
          await db.insert(schema.merchantOverrides).values({
            merchantKey: key,
            recurrence: sel.recurrence as any
          }).onConflictDoNothing();
        }

        if (sel.saveRule && patternToSave) {
          await db.insert(schema.rules).values({
            pattern: patternToSave,
            category: sel.category,
            priority: 1000,
            createdAt: new Date().toISOString(),
          });
        }
      }
    })();

    setSelections({});
    setCurrentIndex(0);
    await refreshRecurrenceAll();
  }, [selections, queue]);

  const onPick = useCallback(
    async (categoryName: string) => {
      if (!currentCard) return;
      const key = currentCard.merchantKey;

      setMobileDrawerOpen(false);
      const nextSelection = {
        category: categoryName,
        saveRule,
        rulePattern: rulePattern || key,
      };

      const activeAiCategory = aiSuggestions[key]?.category || null;
      if (aiSuggestEnabled && activeAiCategory) {
        const isCorrect = activeAiCategory === categoryName;
        await updateScore(isCorrect);
      }

      setSelections(prev => ({
        ...prev,
        [key]: nextSelection
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
    [currentCard, currentIndex, visibleQueue, selections, rulePattern, saveRule, aiSuggestEnabled, aiSuggestions, updateScore]
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


  const isLoading = isDataLoading || allTransactions === undefined || categories === undefined;
  const shouldRender = useDeferredRender();

  if (!uncategorizedAll || !relevantTxnsAll || !categories || !rules || isLoading || !shouldRender) {
    return <PageLoader isLoading={true}>{false}</PageLoader>;
  }

  const selectionsCount = Object.keys(selections).length;

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
                  await db.delete(schema.settings).where(eq(schema.settings.key, 'app:aiGuessScore'));
                }
              }}
              sx={{ height: 26, borderRadius: 2 }}
            />
          )}

          <Button
            size="small"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setHelpOpen(true)}
            sx={{ color: 'text.secondary' }}
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
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                size="small"
                onClick={() => {
                  if (window.confirm('Clear all your current pending selections?')) {
                    setSelections({});
                  }
                }}
                sx={{ color: 'error.main', fontWeight: 600 }}
              >
                Reset selections
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={handleApplySelections}
                sx={{ fontWeight: 700 }}
              >
                Apply {selectionsCount} selection(s)
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Card or empty state */}
      {currentCard ? (
        <>
          {isDesktop ? (
            <PanelGroup orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
              <Panel id="sort-controls-panel" defaultSize="45%" minSize="30%" style={{ display: 'flex', flexDirection: 'column' }}>
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
                    <Box sx={{ mt: 0.5, mb: 1, p: 1.5, borderRadius: 2, border: aiSuggestions[currentCard.merchantKey]?.pattern === rulePattern ? '2px solid' : '1px solid', borderColor: aiSuggestions[currentCard.merchantKey]?.pattern === rulePattern ? 'primary.main' : 'divider' }}>
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
                          sx={{
                            '.MuiOutlinedInput-notchedOutline': {
                              borderColor: aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence ? 'primary.main' : 'inherit',
                              borderWidth: aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence ? 2 : 1
                            }
                          }}
                        >
                          <option value=""></option>
                          <option value="recurring">Recurring</option>
                          <option value="onetime">One-time</option>
                        </TextField>
                        {aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence && (
                          <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5, px: 1 }}>
                            ✨ AI Suggested Recurrence
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}

                  <SortCategoryGrid
                    categories={categories || []}
                    suggested={activeSuggestion}
                    selected={selections[currentCard.merchantKey]?.category || null}
                    onPick={onPick}
                    spendOnly={false}
                    isAiSuggested={aiSuggestEnabled && (aiSuggestions[currentCard.merchantKey]?.category !== undefined)}
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
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    p: 3,
                    ml: 2,
                  }}
                >
                  <Box sx={{ position: 'relative', width: '100%', maxWidth: 680, height: '100%', minHeight: 0, my: 'auto' }}>
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
                        suggestedCategoryOverride={
                          aiSuggestEnabled ? (aiSuggestions[card.merchantKey]?.category || undefined) : undefined
                        }
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
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, overflow: 'hidden' }}>
                <Box sx={{ position: 'relative', width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, my: 'auto' }}>
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
                        suggestedCategoryOverride={
                          aiSuggestEnabled ? (aiSuggestions[card.merchantKey]?.category || undefined) : undefined
                        }
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
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
                <Button 
                  variant="contained" 
                  size="large" 
                  fullWidth
                  onClick={() => setMobileDrawerOpen(true)} 
                >
                  Pick Category
                </Button>
              </Box>
              <Drawer 
                anchor="bottom" 
                open={mobileDrawerOpen} 
                onClose={() => setMobileDrawerOpen(false)}
                PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh' } }}
              >
                <Box sx={{ p: 2, overflowY: 'auto' }}>
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
                    <Box sx={{ mt: 0.5, mb: 1, p: 1.5, borderRadius: 2, border: aiSuggestions[currentCard.merchantKey]?.pattern === rulePattern ? '2px solid' : '1px solid', borderColor: aiSuggestions[currentCard.merchantKey]?.pattern === rulePattern ? 'primary.main' : 'divider' }}>
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
                          sx={{
                            '.MuiOutlinedInput-notchedOutline': {
                              borderColor: aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence ? 'primary.main' : 'inherit',
                              borderWidth: aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence ? 2 : 1
                            }
                          }}
                        >
                          <option value=""></option>
                          <option value="recurring">Recurring</option>
                          <option value="onetime">One-time</option>
                        </TextField>
                        {aiSuggestions[currentCard.merchantKey]?.recurrence && aiSuggestions[currentCard.merchantKey]?.recurrence === recurrence && (
                          <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5, px: 1 }}>
                            ✨ AI Suggested Recurrence
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}

                  <SortCategoryGrid
                    categories={categories || []}
                    suggested={activeSuggestion}
                    selected={selections[currentCard.merchantKey]?.category || null}
                    onPick={onPick}
                    spendOnly={false}
                    isAiSuggested={aiSuggestEnabled && (aiSuggestions[currentCard.merchantKey]?.category !== undefined)}
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
