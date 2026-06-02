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
import {
  Box,
  Stack,
  Typography,
  LinearProgress,
  Button,
  Paper,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  Chip,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { db } from '../db';
import { useFilters } from '../store';
import { buildRecurrenceMap } from '../recurrence';
import { buildSortQueue, type SortCard as SortCardData } from '../sort';
import { useSortStore } from '../sortStore';
import SortCard from '../components/SortCard';
import SortCategoryGrid from '../components/SortCategoryGrid';
import SortEmptyState from '../components/SortEmptyState';

export default function Sort() {
  const demoMode = useFilters((s) => s.demoMode);

  const allTxnsAll = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const rules = useLiveQuery(() => db.rules.toArray(), []);
  const overrides = useLiveQuery(() => db.merchantOverrides.toArray(), []);

  const allTxns = useMemo(
    () =>
      allTxnsAll && demoMode
        ? allTxnsAll.filter((t) => t.source === 'demo')
        : allTxnsAll,
    [allTxnsAll, demoMode]
  );

  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(allTxns || [], overrides || []),
    [allTxns, overrides]
  );

  const uncategorized = useMemo(
    () => (allTxns || []).filter((t) => t.category === 'Uncategorized'),
    [allTxns]
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

  const skipped = useSortStore((s) => s.skipped);
  const history = useSortStore((s) => s.history);
  const pushDecision = useSortStore((s) => s.push);
  const popLast = useSortStore((s) => s.popLastDecision);
  const skipMerchant = useSortStore((s) => s.skipMerchant);

  // Current card = first non-skipped. If all remaining are skipped, fall back
  // to showing them (queue is small enough that this is fine).
  const visibleQueue = useMemo(
    () => queue.filter((c) => !skipped.has(c.merchantKey)),
    [queue, skipped]
  );
  const currentCard: SortCardData | undefined =
    visibleQueue[0] ?? queue[0];

  const [saveRule, setSaveRule] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  // Animation: when set, the current card slides off; we clear it after
  // the DB write so the next card mounts cleanly.
  const [leaving, setLeaving] = useState<{ color: string } | null>(null);

  const isInteractive = !!currentCard;

  const lookupCategoryColor = useCallback(
    (name: string): string => {
      const c = (categories || []).find((cc) => cc.name === name);
      return c?.color ?? '#9e9e9e';
    },
    [categories]
  );

  const commitDecision = useCallback(
    async (card: SortCardData, categoryName: string, alsoRule: boolean) => {
      const txnIds = card.txns.map((t) => t.id!).filter((x) => x !== undefined);

      await db.transaction('rw', db.transactions, db.rules, async () => {
        await db.transactions.where('id').anyOf(txnIds).modify({
          category: categoryName,
          userOverridden: true,
        });
      });

      let ruleId: number | undefined;
      if (alsoRule && card.merchantKey) {
        ruleId = (await db.rules.add({
          pattern: card.merchantKey,
          category: categoryName,
          priority: 1000,
          createdAt: new Date().toISOString(),
        })) as number;
      }

      pushDecision({
        merchantKey: card.merchantKey,
        txnIds,
        previousCategory: 'Uncategorized',
        newCategory: categoryName,
        ruleId,
        decidedAt: Date.now(),
      });
    },
    [pushDecision]
  );

  const onPick = useCallback(
    async (categoryName: string) => {
      if (!currentCard) return;
      // Animate the card off in the destination color, then commit.
      setLeaving({ color: lookupCategoryColor(categoryName) });
      // Small delay so the user sees the tint before the card disappears.
      await new Promise((r) => setTimeout(r, 180));
      await commitDecision(currentCard, categoryName, saveRule);
      setLeaving(null);
    },
    [currentCard, lookupCategoryColor, commitDecision, saveRule]
  );

  const onUndo = useCallback(async () => {
    const d = popLast();
    if (!d) return;
    await db.transaction('rw', db.transactions, db.rules, async () => {
      await db.transactions.where('id').anyOf(d.txnIds).modify({
        category: d.previousCategory,
        userOverridden: false,
      });
      if (d.ruleId !== undefined) {
        await db.rules.delete(d.ruleId);
      }
    });
  }, [popLast]);

  const onSkip = useCallback(() => {
    if (!currentCard) return;
    skipMerchant(currentCard.merchantKey);
  }, [currentCard, skipMerchant]);

  // Keyboard handler — single global listener while the page is mounted.
  // Number keys 1-9 pick the Nth visible category in the same order as the
  // grid renders them (suggested first, then sortOrder).
  const visibleGridOrderRef = useRef<string[]>([]);

  useEffect(() => {
    // Compute the same ordering SortCategoryGrid uses, so number keys line up.
    const cats = categories || [];
    const filtered = cats.filter((c) => c.type === 'spend' && c.name !== 'Uncategorized');
    const sug = filtered.find((c) => c.name === currentCard?.suggestedCategory);
    const rest = filtered.filter((c) => c.name !== currentCard?.suggestedCategory);
    rest.sort((a, b) => a.sortOrder - b.sortOrder);
    visibleGridOrderRef.current = (sug ? [sug, ...rest] : rest).map((c) => c.name);
  }, [categories, currentCard]);

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

      // Cmd-Z / Ctrl-Z = undo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
        return;
      }

      if (!isInteractive) return;

      if (e.key === 'Enter' && currentCard?.suggestedCategory) {
        e.preventDefault();
        onPick(currentCard.suggestedCategory);
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSkip();
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
  }, [onPick, onUndo, onSkip, isInteractive, currentCard, helpOpen]);

  if (!allTxns || !categories || !rules) {
    return null;
  }

  // Cumulative progress (decisions made / decisions needed from initial state)
  const remaining = visibleQueue.length;
  const made = history.length;
  const total = remaining + made;
  const pct = total > 0 ? Math.round((made / total) * 100) : 100;

  return (
    <Stack spacing={2} sx={{ maxWidth: 820, mx: 'auto' }}>
      {/* Header row */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Sort
          </Typography>
          <Typography variant="caption" color="text.secondary">
            One decision per merchant → categorize many transactions at once.
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Button
            size="small"
            startIcon={<UndoIcon />}
            onClick={onUndo}
            disabled={history.length === 0}
            sx={{ textTransform: 'none' }}
          >
            Undo {history.length > 0 && `(${history.length})`}
          </Button>
          {currentCard && (
            <Button
              size="small"
              startIcon={<SkipNextIcon />}
              onClick={onSkip}
              sx={{ textTransform: 'none' }}
            >
              Skip
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

      {/* Progress */}
      <Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="baseline"
          justifyContent="space-between"
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
          >
            {currentCard
              ? `${remaining} merchant${remaining === 1 ? '' : 's'} left`
              : 'Done'}
            {skipped.size > 0 && ` · ${skipped.size} skipped`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {made} sorted
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
        />
      </Box>

      {/* Card or empty state */}
      {currentCard ? (
        <>
          <SortCard
            card={currentCard}
            suggestedColor={
              currentCard.suggestedCategory
                ? lookupCategoryColor(currentCard.suggestedCategory)
                : undefined
            }
            leaving={leaving}
          />

          {/* Category grid */}
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
                >
                  Pick a category
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={saveRule}
                      onChange={(e) => setSaveRule(e.target.checked)}
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
              <SortCategoryGrid
                categories={categories}
                suggested={currentCard.suggestedCategory}
                onPick={onPick}
                spendOnly={false}
              />
            </Stack>
          </Paper>

          {/* Footer hint */}
          <Stack
            direction="row"
            spacing={1.5}
            justifyContent="center"
            sx={{ opacity: 0.7 }}
            flexWrap="wrap"
          >
            <KeyHint k="Enter" desc="accept" />
            <KeyHint k="1–9" desc="grid pick" />
            <KeyHint k="S" desc="skip" />
            <KeyHint k="⌘Z" desc="undo" />
            <KeyHint k="?" desc="help" />
          </Stack>
        </>
      ) : (
        <SortEmptyState />
      )}

      {/* Help dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Row k="Enter" desc="Accept the suggested category" />
            <Row k="1 – 9" desc="Pick the Nth visible category" />
            <Row k="S" desc="Skip this merchant (defer to end)" />
            <Row k="⌘Z / Ctrl-Z" desc="Undo last decision" />
            <Row k="?" desc="Open this help" />
            <Row k="Esc" desc="Close this help" />
          </Stack>
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            One decision categorizes <strong>all</strong> transactions for that
            merchant. Save-as-rule also catches future imports automatically.
          </Alert>
        </DialogContent>
      </Dialog>
    </Stack>
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
