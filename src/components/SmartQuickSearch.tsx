import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Stack,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Typography,
  Collapse,
  Paper,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CategoryIcon from '@mui/icons-material/Category';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RepeatIcon from '@mui/icons-material/Repeat';
import SortIcon from '@mui/icons-material/Sort';
import ViewListIcon from '@mui/icons-material/ViewList';
import BarChartIcon from '@mui/icons-material/BarChart';
import TimelineIcon from '@mui/icons-material/Timeline';

import type { Account, Category } from '../types';
import {
  useFilters,
  isBusinessAccount,
  type DashboardViewMode,
  type DateRangePreset,
  type GroupBy,
  type ProfileType,
  type RecurrenceFilter,
  type TransactionType,
  type TransactionSortBy,
} from '../stores/store';
import {
  parseNaturalLanguageSearch,
  type ParsedNaturalLanguageSearch,
  type SmartFilterChip,
} from '../domain/naturalLanguageSearch';

interface FilterSnapshot {
  preset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  enabledAccountIds: number[];
  disabledCategories: string[];
  spendOnly: boolean;
  transactionType: TransactionType;
  groupBy: GroupBy;
  recurrenceFilter: RecurrenceFilter;
  searchQuery: string;
  profile?: ProfileType;
  showRunway: boolean;
  forecastHorizon: number;
  dashboardViewMode?: DashboardViewMode;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: TransactionSortBy;
}

interface AppliedSmartSearchState {
  rawPrompt: string;
  chips: SmartFilterChip[];
  previousSnapshot: FilterSnapshot;
}

const EXAMPLE_PROMPT_GROUPS: Array<{
  title: string;
  prompts: string[];
}> = [
  {
    title: 'Categories & Dates',
    prompts: [
      'groceries this month',
      'dining and coffee last month',
      'spending this month without mortgage',
      'uncategorized all time',
    ],
  },
  {
    title: 'Amounts & Sorting',
    prompts: [
      'biggest purchases this month',
      'purchases over $100 last 30 days',
      'between $25 and $100 this month',
      'small purchases under $20',
    ],
  },
  {
    title: 'Accounts, Recurring & Income',
    prompts: [
      'recurring bills on credit cards',
      'paychecks last 90 days',
      'one-time purchases over $50',
      'business expenses this year',
    ],
  },
  {
    title: 'Views & Charts',
    prompts: [
      'chart spending by account this year',
      'timeline this month',
      'compare this month to last year',
      'forecast 6 months',
    ],
  },
];

function getChipIcon(chip: SmartFilterChip) {
  switch (chip.kind) {
    case 'date':
      return <CalendarTodayIcon sx={{ fontSize: '13px !important' }} />;
    case 'category':
      return <CategoryIcon sx={{ fontSize: '13px !important' }} />;
    case 'account':
    case 'profile':
      return <AccountBalanceIcon sx={{ fontSize: '13px !important' }} />;
    case 'amount':
      return <AttachMoneyIcon sx={{ fontSize: '13px !important' }} />;
    case 'recurrence':
      return <RepeatIcon sx={{ fontSize: '13px !important' }} />;
    case 'sort':
      return <SortIcon sx={{ fontSize: '13px !important' }} />;
    case 'view':
      if (chip.valueSummary === 'Chart') return <BarChartIcon sx={{ fontSize: '13px !important' }} />;
      if (chip.valueSummary === 'Timeline') return <TimelineIcon sx={{ fontSize: '13px !important' }} />;
      return <ViewListIcon sx={{ fontSize: '13px !important' }} />;
    default:
      return <AutoAwesomeIcon sx={{ fontSize: '13px !important' }} />;
  }
}

export default function SmartQuickSearch({
  accounts,
  categories,
  currentViewMode,
  onApplyViewChanges,
  onResetPage,
}: {
  accounts: Account[];
  categories: Category[];
  currentViewMode: DashboardViewMode;
  onApplyViewChanges: (opts: {
    viewMode?: DashboardViewMode;
    compareWithPriorYear?: boolean;
  }) => void;
  onResetPage?: () => void;
}) {
  const filters = useFilters();
  const [inputText, setInputText] = useState<string>(filters.searchQuery || '');
  const [appliedSmart, setAppliedSmart] = useState<AppliedSmartSearchState | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync external searchQuery changes (e.g. if Reset button or FilterPanel cleared it)
  useEffect(() => {
    if (!appliedSmart && filters.searchQuery !== inputText) {
      const parsedCurrent = parseNaturalLanguageSearch(inputText, { accounts, categories });
      if (!parsedCurrent.hasStructuredIntents) {
        setInputText(filters.searchQuery);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchQuery]);

  // Global keyboard shortcut: "/" or Cmd/Ctrl+K focuses the Quick Search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (!isEditable && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const parsed: ParsedNaturalLanguageSearch = useMemo(
    () => parseNaturalLanguageSearch(inputText, { accounts, categories }),
    [inputText, accounts, categories]
  );

  // When typing a simple keyword (no structured filter intents), live-update searchQuery
  useEffect(() => {
    if (parsed.hasStructuredIntents) {
      return;
    }
    const timer = setTimeout(() => {
      if (inputText !== filters.searchQuery) {
        filters.setSearchQuery(inputText);
        onResetPage?.();
      }
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, parsed.hasStructuredIntents]);

  const captureSnapshot = (): FilterSnapshot => {
    const s = useFilters.getState();
    return {
      preset: s.preset,
      customStart: s.customStart,
      customEnd: s.customEnd,
      enabledAccountIds: [...s.enabledAccountIds],
      disabledCategories: [...s.disabledCategories],
      spendOnly: s.spendOnly,
      transactionType: s.transactionType,
      groupBy: s.groupBy,
      recurrenceFilter: s.recurrenceFilter,
      searchQuery: s.searchQuery,
      profile: s.profile,
      showRunway: s.showRunway,
      forecastHorizon: s.forecastHorizon,
      dashboardViewMode: currentViewMode,
      minPrice: s.minPrice,
      maxPrice: s.maxPrice,
      sortBy: s.sortBy,
    };
  };

  const restoreSnapshot = (snap: FilterSnapshot) => {
    const s = useFilters.getState();
    if (snap.preset === 'custom') {
      s.setCustomRange(snap.customStart, snap.customEnd);
    } else {
      s.setPreset(snap.preset);
    }
    s.setEnabledAccounts(snap.enabledAccountIds);
    s.setDisabledCategories(snap.disabledCategories);
    s.setTransactionType(snap.transactionType);
    s.setSpendOnly(snap.spendOnly);
    s.setGroupBy(snap.groupBy);
    s.setRecurrenceFilter(snap.recurrenceFilter);
    s.setSearchQuery(snap.searchQuery);
    s.setShowRunway(snap.showRunway);
    s.setForecastHorizon(snap.forecastHorizon);
    s.setMinPrice(snap.minPrice);
    s.setMaxPrice(snap.maxPrice);
    s.setSortBy(snap.sortBy ?? 'date_desc');
    if (snap.dashboardViewMode) {
      onApplyViewChanges({ viewMode: snap.dashboardViewMode, compareWithPriorYear: false });
    }
    onResetPage?.();
  };

  const applyParsedQuery = (queryToApply: ParsedNaturalLanguageSearch) => {
    const s = useFilters.getState();

    if (queryToApply.isResetCommand) {
      s.reset();
      const allIds = accounts
        .map((a) => a.id!)
        .filter((id): id is number => typeof id === 'number');
      s.setEnabledAccounts(allIds);
      onApplyViewChanges({ viewMode: 'chart', compareWithPriorYear: false });
      setAppliedSmart(null);
      setInputText('');
      setShowExamples(false);
      onResetPage?.();
      return;
    }

    if (!queryToApply.hasStructuredIntents) {
      // Simple keyword search + Enter -> switch to Table view so user sees transactions
      s.setSearchQuery(queryToApply.remainingSearchQuery);
      onApplyViewChanges({ viewMode: 'table' });
      setShowExamples(false);
      onResetPage?.();
      return;
    }

    const previousSnapshot = appliedSmart?.previousSnapshot ?? captureSnapshot();

    // 1. Date Range
    if (queryToApply.preset === 'custom') {
      s.setCustomRange(queryToApply.customStart, queryToApply.customEnd);
    } else if (queryToApply.preset) {
      s.setPreset(queryToApply.preset);
    }

    // 2. Profile & Accounts
    const allAccountIds = accounts
      .map((a) => a.id!)
      .filter((id): id is number => typeof id === 'number');

    if (queryToApply.profile) {
      s.setProfile(queryToApply.profile, accounts);
    }
    if (queryToApply.enabledAccountIds && queryToApply.enabledAccountIds.length > 0) {
      s.setEnabledAccounts(queryToApply.enabledAccountIds);
    } else if (!queryToApply.profile) {
      // Restore all accounts for current profile so previous account solo doesn't linger
      if (s.profile === 'business') {
        s.setEnabledAccounts(
          accounts
            .filter((a) => isBusinessAccount(a) && typeof a.id === 'number')
            .map((a) => a.id!)
        );
      } else if (s.profile === 'personal') {
        s.setEnabledAccounts(
          accounts
            .filter((a) => !isBusinessAccount(a) && typeof a.id === 'number')
            .map((a) => a.id!)
        );
      } else {
        s.setEnabledAccounts(allAccountIds);
      }
    }

    // 3. Transaction Type & SpendOnly
    const nextTxnType: TransactionType = queryToApply.transactionType ?? 'spend';
    s.setTransactionType(nextTxnType);
    if (queryToApply.spendOnly !== undefined) {
      s.setSpendOnly(queryToApply.spendOnly);
    }

    // 4. Categories (Solo or Exclude or All)
    if (queryToApply.soloCategories && queryToApply.soloCategories.length > 0) {
      const soloSet = new Set(queryToApply.soloCategories.map((c) => c.toLowerCase()));
      const disabled = categories
        .filter((c) => !soloSet.has(c.name.toLowerCase()))
        .map((c) => c.name);
      s.setDisabledCategories(disabled);
    } else if (queryToApply.excludedCategories && queryToApply.excludedCategories.length > 0) {
      s.setDisabledCategories(queryToApply.excludedCategories);
    } else {
      s.setDisabledCategories([]);
    }

    // 5. Recurrence
    s.setRecurrenceFilter(queryToApply.recurrenceFilter ?? 'all');

    // 6. Min / Max Price
    s.setMinPrice(queryToApply.minPrice);
    s.setMaxPrice(queryToApply.maxPrice);

    // 7. Sort Order
    s.setSortBy(queryToApply.sortBy ?? 'date_desc');

    // 8. Group By / Forecast / Runway
    if (queryToApply.groupBy) {
      s.setGroupBy(queryToApply.groupBy);
    }
    if (queryToApply.forecastHorizon !== undefined) {
      s.setForecastHorizon(queryToApply.forecastHorizon);
    }
    if (queryToApply.showRunway !== undefined) {
      s.setShowRunway(queryToApply.showRunway);
    }

    // 9. Remaining Merchant / Text Search Query
    s.setSearchQuery(queryToApply.remainingSearchQuery);

    // 10. View Mode & Comparison
    onApplyViewChanges({
      viewMode: queryToApply.viewMode,
      compareWithPriorYear: queryToApply.compareWithPriorYear,
    });

    setAppliedSmart({
      rawPrompt: queryToApply.rawQuery,
      chips: queryToApply.chips,
      previousSnapshot,
    });
    // Keep only the remaining keyword in the text box (or empty if all tokens were filters)
    setInputText(queryToApply.remainingSearchQuery);
    setShowExamples(false);
    onResetPage?.();
  };

  const handleExampleClick = (promptText: string) => {
    const parsedExample = parseNaturalLanguageSearch(promptText, { accounts, categories });
    applyParsedQuery(parsedExample);
  };

  const handleUndoSmartSearch = () => {
    if (!appliedSmart) return;
    restoreSnapshot(appliedSmart.previousSnapshot);
    setInputText(appliedSmart.previousSnapshot.searchQuery || '');
    setAppliedSmart(null);
  };

  const handleClearSmartSearch = () => {
    const s = useFilters.getState();
    s.reset();
    const allIds = accounts
      .map((a) => a.id!)
      .filter((id): id is number => typeof id === 'number');
    s.setEnabledAccounts(allIds);
    setInputText('');
    setAppliedSmart(null);
    onResetPage?.();
  };

  const isPreviewVisible = parsed.hasStructuredIntents && inputText.trim().length > 0;

  return (
    <Box sx={{ width: '100%', flexShrink: 0 }}>
      <TextField
        inputRef={inputRef}
        variant="outlined"
        size="small"
        fullWidth
        placeholder='Search or filter in plain English — e.g. "groceries last month over $50", "biggest purchases this month", "recurring bills on credit cards"...'
        value={inputText}
        onChange={(e) => {
          setInputText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyParsedQuery(parsed);
          } else if (e.key === 'Escape') {
            setShowExamples(false);
          }
        }}
        sx={{
          '& .MuiInputBase-root': {
            height: { xs: 40, sm: 38 },
            pl: 1.25,
            pr: 0.75,
            fontSize: '0.84rem',
            bgcolor: 'background.paper',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            display: 'flex',
            alignItems: 'center',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
            ...(isPreviewVisible
              ? {
                  borderColor: 'primary.main',
                  boxShadow: (theme) => `0 0 0 2px ${alpha(theme.palette.primary.main, 0.16)}`,
                }
              : {}),
          },
          '& .MuiInputBase-input': {
            py: 0,
            px: 0.5,
            height: '100%',
            boxSizing: 'border-box',
          },
          '& .MuiInputAdornment-root': {
            my: 0,
            height: 'auto',
            display: 'flex',
            alignItems: 'center',
          },
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                {isPreviewVisible || appliedSmart ? (
                  <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                ) : (
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                )}
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {isPreviewVisible && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={() => applyParsedQuery(parsed)}
                      endIcon={<KeyboardReturnIcon sx={{ fontSize: '14px !important' }} />}
                      sx={{
                        height: 26,
                        px: 1,
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        textTransform: 'none',
                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Apply
                    </Button>
                  )}
                  {inputText && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        setInputText('');
                        if (!parsed.hasStructuredIntents) {
                          filters.setSearchQuery('');
                          onResetPage?.();
                        }
                      }}
                      aria-label="Clear search text"
                      sx={{ p: 0.4 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                  <Tooltip title="Plain-language search examples (press / to focus search)">
                    <Button
                      size="small"
                      variant={showExamples ? 'contained' : 'text'}
                      color={showExamples ? 'primary' : 'inherit'}
                      onClick={() => setShowExamples((v) => !v)}
                      startIcon={<LightbulbOutlinedIcon sx={{ fontSize: '15px !important' }} />}
                      sx={{
                        height: 26,
                        px: 0.9,
                        minWidth: 'auto',
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        textTransform: 'none',
                        color: showExamples ? undefined : 'text.secondary',
                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.4 } },
                      }}
                    >
                      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                        Examples
                      </Box>
                    </Button>
                  </Tooltip>
                </Stack>
              </InputAdornment>
            ),
          },
        }}
      />

      {/* Live Smart Filter Preview Bar while typing a plain-language query */}
      <Collapse in={isPreviewVisible} timeout={160} unmountOnExit>
        <Paper
          elevation={0}
          sx={{
            mt: 0.75,
            p: 1,
            px: 1.5,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 0.5 }}>
              <AutoAwesomeIcon sx={{ fontSize: 15, color: 'primary.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>
                Smart Filter Preview:
              </Typography>
            </Stack>
            {parsed.chips.map((chip) => (
              <Chip
                key={chip.id}
                icon={getChipIcon(chip)}
                label={`${chip.label}: ${chip.valueSummary}`}
                size="small"
                color="primary"
                variant="outlined"
                onClick={() => applyParsedQuery(parsed)}
                sx={{
                  height: 23,
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  bgcolor: 'background.paper',
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              />
            ))}
          </Stack>
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => applyParsedQuery(parsed)}
            endIcon={<KeyboardReturnIcon sx={{ fontSize: '14px !important' }} />}
            sx={{
              height: 28,
              px: 1.5,
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              flexShrink: 0,
            }}
          >
            Apply Filters & View
          </Button>
        </Paper>
      </Collapse>

      {/* Active Applied Smart Search Banner (after pressing Enter / Apply) */}
      <Collapse in={Boolean(appliedSmart && !isPreviewVisible)} timeout={160} unmountOnExit>
        {appliedSmart && (
          <Paper
            elevation={0}
            sx={{
              mt: 0.75,
              p: 0.75,
              px: 1.25,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.primary.main, 0.12)
                  : alpha(theme.palette.primary.main, 0.06),
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.22),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 0.75,
            }}
          >
            <Stack direction="row" spacing={0.65} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.25 }}>
                Applied &ldquo;{appliedSmart.rawPrompt}&rdquo;:
              </Typography>
              {appliedSmart.chips.map((chip) => (
                <Chip
                  key={chip.id}
                  icon={getChipIcon(chip)}
                  label={`${chip.label}: ${chip.valueSummary}`}
                  size="small"
                  sx={{
                    height: 21,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  }}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<UndoIcon sx={{ fontSize: '14px !important' }} />}
                onClick={handleUndoSmartSearch}
                sx={{
                  height: 24,
                  px: 1,
                  fontSize: '0.71rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderColor: 'divider',
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              >
                Undo
              </Button>
              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={handleClearSmartSearch}
                sx={{
                  height: 24,
                  px: 0.75,
                  minWidth: 'auto',
                  fontSize: '0.71rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  color: 'text.secondary',
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              >
                Reset All
              </Button>
            </Stack>
          </Paper>
        )}
      </Collapse>

      {/* Expandable Plain-Language Prompt Examples */}
      <Collapse in={showExamples} timeout={180} unmountOnExit>
        <Paper
          elevation={0}
          sx={{
            mt: 0.75,
            p: 1.5,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Plain-Language Search Examples — Click any prompt to update filters & views
              </Typography>
            </Stack>
            <IconButton size="small" onClick={() => setShowExamples(false)} sx={{ p: 0.25 }}>
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 1.25,
            }}
          >
            {EXAMPLE_PROMPT_GROUPS.map((group) => (
              <Box key={group.title}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    mb: 0.5,
                  }}
                >
                  {group.title}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {group.prompts.map((prompt) => (
                    <Chip
                      key={prompt}
                      label={prompt}
                      size="small"
                      variant="outlined"
                      onClick={() => handleExampleClick(prompt)}
                      sx={{
                        height: 23,
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
}
