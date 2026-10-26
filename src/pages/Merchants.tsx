import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { api } from '../api';
import { useMerchantTransactions, useCategories, useTaxRules, useMerchantGroups, useRecurrenceMap } from '../hooks/queries';
import { useBulkUpdateTransactions } from '../hooks/mutations';
import { resolveTaxDeduction } from '../tax/taxUtils';
import { recategorizeAll, deriveRulePattern } from '../domain/categorize';
import { recurrenceLabel } from '../domain/recurrence';
import { useFilters } from '../stores/store';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  TextField,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableFooter,
  Checkbox,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Tooltip,
  InputAdornment,
  Chip,
  TablePagination,
  Autocomplete,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { subtleScrollSx } from '../styles';
import DataTable from '../components/DataTable';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';
import EditIcon from '@mui/icons-material/Edit';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CategoryIcon from '@mui/icons-material/Category';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FilterListIcon from '@mui/icons-material/FilterList';
import RepeatIcon from '@mui/icons-material/Repeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';


import { usd, usdCents } from '../lib';
import PageLoader from '../components/PageLoader';
import AnimatedLogo from '../components/AnimatedLogo';
import { useDeferredRender } from '../hooks/useDeferredRender';

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle aria-label={ariaLabel} style={{ width: 16, position: 'relative' }}>
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
  );
}

function PanelScroll({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ height: '100%', overflow: 'auto', ...subtleScrollSx }}>
      {children}
    </Box>
  );
}

interface MerchantGroup {
  merchantKey: string;
  totalSpend: number;
  totalTransactions: number;
  categories: Record<string, number>;
  mostCommonCategory: string;
  earliestDate: string;
  latestDate: string;
}

export default function Merchants() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const demoMode = useFilters((s) => s.demoMode);
  const { data: merchantGroups = [], isLoading: isMerchantsLoading } = useMerchantGroups();
  const { data: recurrenceRecord = {} } = useRecurrenceMap(demoMode);
  const shouldRender = useDeferredRender();
  const { data: allCategories = [], isLoading: isCatLoading } = useCategories();
  const { data: taxRules = [] } = useTaxRules();
  const bulkUpdateTransactions = useBulkUpdateTransactions();

  const isLoading = isMerchantsLoading || isCatLoading;

  // Search Debouncing
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'recurring' | 'price_hikes'>('all');

  const nonSpendCategories = useMemo(() => {
    const set = new Set<string>(['Income', 'Transfers', 'Savings', 'Investments']);
    for (const c of allCategories) {
      if (c.type && c.type !== 'spend') {
        set.add(c.name);
      }
    }
    return set;
  }, [allCategories]);

  const maxDatasetDateMs = useMemo(() => {
    let maxStr = '';
    for (const g of merchantGroups) {
      if (g.latestDate > maxStr) maxStr = g.latestDate;
    }
    return maxStr ? new Date(maxStr).getTime() : Date.now();
  }, [merchantGroups]);

  const isRecurringSpendMerchant = useMemo(() => {
    const set = new Set<string>();
    for (const g of merchantGroups) {
      if (g.totalSpend <= 0) continue;
      if (nonSpendCategories.has(g.mostCommonCategory)) continue;
      const rec = recurrenceRecord[g.merchantKey];
      if (!rec || rec.kind === 'none' || rec.estMonthlyCost <= 0) continue;
      if (rec.count < 2 && rec.source !== 'override') continue;
      const lastDateStr = rec.lastDate || g.latestDate;
      if (lastDateStr) {
        const ageDays = (maxDatasetDateMs - new Date(lastDateStr).getTime()) / 86_400_000;
        const maxAgeDays = rec.kind === 'annual' ? 400 : 75;
        if (ageDays > maxAgeDays && rec.source !== 'override') continue;
      }
      set.add(g.merchantKey);
    }
    return set;
  }, [merchantGroups, recurrenceRecord, nonSpendCategories, maxDatasetDateMs]);

  const recurringStats = useMemo(() => {
    let recurringCount = 0;
    let totalMonthlyBurn = 0;
    let priceHikeCount = 0;
    let totalMonthlyHikeImpact = 0;

    for (const g of merchantGroups) {
      if (!isRecurringSpendMerchant.has(g.merchantKey)) continue;
      const rec = recurrenceRecord[g.merchantKey];
      if (rec) {
        recurringCount++;
        totalMonthlyBurn += rec.estMonthlyCost;
        if (rec.priceHikeDelta && rec.priceHikeDelta > 0) {
          priceHikeCount++;
          totalMonthlyHikeImpact += rec.priceHikeDelta;
        }
      }
    }

    return {
      recurringCount,
      totalMonthlyBurn,
      totalAnnualBurn: totalMonthlyBurn * 12,
      priceHikeCount,
      totalMonthlyHikeImpact,
    };
  }, [merchantGroups, recurrenceRecord, isRecurringSpendMerchant]);

  const panelIds = useMemo(() => [
    ...(filtersOpen ? ['filters'] : []),
    'table'
  ], [filtersOpen]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `merchants-layout-v3-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Pagination State
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Advanced Filters state
  const [minSpend, setMinSpend] = useState<number | ''>('');
  const [maxSpend, setMaxSpend] = useState<number | ''>('');
  const [minTxns, setMinTxns] = useState<number | ''>('');
  const [maxTxns, setMaxTxns] = useState<number | ''>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [prevFilters, setPrevFilters] = useState({
    searchQuery, minSpend, maxSpend, minTxns, maxTxns, filterCategory, startDate, endDate, viewFilter
  });

  if (
    searchQuery !== prevFilters.searchQuery ||
    minSpend !== prevFilters.minSpend ||
    maxSpend !== prevFilters.maxSpend ||
    minTxns !== prevFilters.minTxns ||
    maxTxns !== prevFilters.maxTxns ||
    filterCategory !== prevFilters.filterCategory ||
    startDate !== prevFilters.startDate ||
    endDate !== prevFilters.endDate ||
    viewFilter !== prevFilters.viewFilter
  ) {
    setPage(0);
    setPrevFilters({ searchQuery, minSpend, maxSpend, minTxns, maxTxns, filterCategory, startDate, endDate, viewFilter });
  }

  // Dialog states
  const [renameTarget, setRenameTarget] = useState<MerchantGroup | null>(null);
  const [newMerchantName, setNewMerchantName] = useState('');

  const [recategorizeTarget, setRecategorizeTarget] = useState<MerchantGroup | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeCustomName, setMergeCustomName] = useState('');

  const [viewTransactionsTarget, setViewTransactionsTarget] = useState<MerchantGroup | null>(null);
  
  const targetMerchantKey = viewTransactionsTarget?.merchantKey || '';
  const { data: viewTransactions = [] } = useMerchantTransactions(targetMerchantKey);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    const list = merchantGroups.filter((g) => {
      const rec = recurrenceRecord[g.merchantKey];
      const isRec = isRecurringSpendMerchant.has(g.merchantKey);
      if (viewFilter === 'recurring' && !isRec) return false;
      if (viewFilter === 'price_hikes' && (!isRec || !(rec?.priceHikeDelta && rec.priceHikeDelta > 0))) return false;

      // 1. Text search
      if (searchQuery && !g.merchantKey.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // 2. Spend range
      if (minSpend !== '' && g.totalSpend < minSpend) return false;
      if (maxSpend !== '' && g.totalSpend > maxSpend) return false;
      // 3. Transactions count range
      if (minTxns !== '' && g.totalTransactions < minTxns) return false;
      if (maxTxns !== '' && g.totalTransactions > maxTxns) return false;
      // 4. Category filter
      if (filterCategory !== 'all' && g.mostCommonCategory !== filterCategory) return false;
      // 5. Time range
      if (startDate && g.latestDate < startDate) return false;
      if (endDate && g.earliestDate > endDate) return false;

      return true;
    });

    if (viewFilter === 'recurring') {
      return [...list].sort(
        (a, b) => (recurrenceRecord[b.merchantKey]?.estMonthlyCost || 0) - (recurrenceRecord[a.merchantKey]?.estMonthlyCost || 0)
      );
    }
    if (viewFilter === 'price_hikes') {
      return [...list].sort(
        (a, b) => (recurrenceRecord[b.merchantKey]?.priceHikeDelta || 0) - (recurrenceRecord[a.merchantKey]?.priceHikeDelta || 0)
      );
    }
    return list;
  }, [
    merchantGroups,
    recurrenceRecord,
    isRecurringSpendMerchant,
    viewFilter,
    searchQuery,
    minSpend,
    maxSpend,
    minTxns,
    maxTxns,
    filterCategory,
    startDate,
    endDate,
  ]);

  // Paginated groups
  const paginatedGroups = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredGroups.slice(start, start + rowsPerPage);
  }, [filteredGroups, page, rowsPerPage]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedKeys(filteredGroups.map((g) => g.merchantKey));
    } else {
      setSelectedKeys([]);
    }
  };

  const handleSelectOne = (key: string, checked: boolean) => {
    if (checked) {
      setSelectedKeys((prev) => [...prev, key]);
    } else {
      setSelectedKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  // 1. Rename single merchant key
  const handleOpenRename = (group: MerchantGroup) => {
    setRenameTarget(group);
    setNewMerchantName(group.merchantKey);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !newMerchantName.trim()) return;

    const trimmedName = newMerchantName.trim();
    if (trimmedName === renameTarget.merchantKey) {
      setRenameTarget(null);
      return;
    }

    try {
      const txs = await api.getTransactions('1970-01-01', '2100-01-01', { merchantKey: renameTarget.merchantKey });
      const updatedTxs = txs.map((t: any) => ({ ...t, merchantKey: trimmedName }));
      await bulkUpdateTransactions.mutateAsync(updatedTxs);
      setSnackbarMessage(`Successfully renamed "${renameTarget.merchantKey}" to "${trimmedName}".`);
    } catch (e: unknown) {
      console.error(e);
      setSnackbarMessage(`Failed to rename merchant: ${(e as Error).message}`);
    } finally {
      setRenameTarget(null);
    }
  };

  // 2. Recategorize all transactions for a merchant key
  const handleOpenRecategorize = (group: MerchantGroup) => {
    setRecategorizeTarget(group);
    setSelectedCategory(group.mostCommonCategory);
  };

  const handleRecategorizeSubmit = async () => {
    if (!recategorizeTarget || !selectedCategory) return;

    try {
      const txs = await api.getTransactions('1970-01-01', '2100-01-01', { merchantKey: recategorizeTarget.merchantKey });
      const pattern = (deriveRulePattern(recategorizeTarget.merchantKey) || recategorizeTarget.merchantKey).trim();
      if (pattern) {
        const { normalizeForMatch } = await import('../lib');
        const { matchPattern } = await import('../domain/categorize');
        const normNew = normalizeForMatch(pattern);
        const existingRules = await api.getRules();
        for (const r of existingRules) {
          if (!r.id) continue;
          const normOld = normalizeForMatch(r.pattern);
          const isSameNormDiffRaw = normOld === normNew && r.pattern !== pattern;
          const oldContainsNew = normNew.length > 0 && matchPattern(normOld, normNew) && r.priority >= 1000;
          const matchesMerchant = matchPattern(recategorizeTarget.merchantKey, r.pattern);
          const shadowsMerchant =
            matchesMerchant &&
            r.category !== selectedCategory &&
            (r.priority > 1000 || (r.priority === 1000 && normOld.length >= normNew.length));
          if (isSameNormDiffRaw || oldContainsNew || shadowsMerchant) {
            await api.deleteRule(r.id);
          }
        }

        await api.addRule({
          pattern,
          category: selectedCategory,
          priority: 1000,
          createdAt: new Date().toISOString(),
        } as any).catch(console.error);
        await recategorizeAll({ forceUserRules: true });
      }

      const updatedTxs = txs.map((t: any) => {
        const taxGuess = resolveTaxDeduction(t.description, selectedCategory, t.merchantKey, taxRules);
        return {
          ...t,
          category: selectedCategory,
          userOverridden: true,
          isBusiness: taxGuess.isBusiness,
          taxCategory: taxGuess.taxCategory,
          deductionStatus: taxGuess.deductionStatus,
        };
      });
      await bulkUpdateTransactions.mutateAsync(updatedTxs);

      setSnackbarMessage(`Successfully recategorized transactions under "${recategorizeTarget.merchantKey}" to "${selectedCategory}".`);
    } catch (e: unknown) {
      console.error(e);
      setSnackbarMessage(`Failed to recategorize: ${(e as Error).message}`);
    } finally {
      setRecategorizeTarget(null);
    }
  };

  // 3. Merge selected merchant keys
  const handleOpenMerge = () => {
    if (selectedKeys.length < 2) return;
    setMergeCustomName(selectedKeys[0]);
    setMergeDialogOpen(true);
  };

  const handleMergeSubmit = async () => {
    const finalName = mergeCustomName.trim();
    if (!finalName) return;

    const sourceKeys = selectedKeys.filter((k) => k !== finalName);

    try {
      if (sourceKeys.length > 0) {
        let allTxs: any[] = [];
        for (const key of sourceKeys) {
          const txs = await api.getTransactions('1970-01-01', '2100-01-01', { merchantKey: key });
          allTxs = allTxs.concat(txs);
        }
        const updatedTxs = allTxs.map(t => ({ ...t, merchantKey: finalName }));
        await bulkUpdateTransactions.mutateAsync(updatedTxs);
      }
      setSnackbarMessage(`Merged ${selectedKeys.length} merchants into "${finalName}".`);
      setSelectedKeys([]);
      setMergeDialogOpen(false);
    } catch (e: unknown) {
      console.error(e);
      setSnackbarMessage(`Merge failed: ${(e as Error).message}`);
    }
  };

  // Levenshtein Distance Helper
  const getLevenshteinDistance = (a: string, b: string): number => {
    const tmp = [];
    let i, j;
    for (i = 0; i <= a.length; i++) {
      tmp.push([i]);
    }
    for (j = 1; j <= b.length; j++) {
      tmp[0].push(j);
    }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  };

  // Similarity Checker
  const areNamesSimilar = (name1: string, name2: string): boolean => {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    if (n1 === n2) return true;

    const clean = (s: string) => s
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\b(inc|co|corp|corporation|ltd|llc|market|coffee|store|gas|station|shop|restaurant|subscription|service|group)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const c1 = clean(n1);
    const c2 = clean(n2);

    if (!c1 || !c2) return false;
    if (c1 === c2) return true;

    if (c1.length >= 4 && c2.length >= 4) {
      if (c1.includes(c2) || c2.includes(c1)) return true;
    }

    if (c1.length >= 5 && c2.length >= 5) {
      const dist = getLevenshteinDistance(c1, c2);
      if (dist <= 2) return true;
    }

    return false;
  };

  // Run Scan for Duplicates
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [mergingIndex, setMergingIndex] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<{ primarySuggest: string; others: string[]; allKeys: string[] }[]>([]);
  const [resolvedPrimaries, setResolvedPrimaries] = useState<Record<string, string>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [resolvedCategories, setResolvedCategories] = useState<Record<string, string>>({});

  const handleScanDuplicates = () => {
    setIsScanning(true);
    setDuplicateDialogOpen(true);
    setDuplicateGroups([]);

    setTimeout(() => {
      const visited = new Set<string>();
      const clusters: { primarySuggest: string; others: string[]; allKeys: string[] }[] = [];
      const initialPrimaries: Record<string, string> = {};
      const initialCustomNames: Record<string, string> = {};
      const initialCategories: Record<string, string> = {};

      // Sort by transaction frequency descending so the most common merchant is primary suggestion
      const sortedGroups = [...merchantGroups].sort((a, b) => b.totalTransactions - a.totalTransactions);
      const len = sortedGroups.length;
      const chunkSize = 15; // Process 15 items per tick to keep frame rate high

      const nextChunk = (startIndex: number) => {
        const endIndex = Math.min(startIndex + chunkSize, len);
        
        for (let i = startIndex; i < endIndex; i++) {
          const g1 = sortedGroups[i];
          if (visited.has(g1.merchantKey)) continue;

          const clusterKeys = [g1.merchantKey];
          for (let j = i + 1; j < len; j++) {
            const g2 = sortedGroups[j];
            if (visited.has(g2.merchantKey)) continue;

            if (areNamesSimilar(g1.merchantKey, g2.merchantKey)) {
              clusterKeys.push(g2.merchantKey);
            }
          }

          if (clusterKeys.length > 1) {
            clusterKeys.forEach(k => visited.add(k));
            const key = g1.merchantKey;
            initialPrimaries[key] = g1.merchantKey;
            initialCustomNames[key] = g1.merchantKey;
            initialCategories[key] = g1.mostCommonCategory;
            clusters.push({
              primarySuggest: g1.merchantKey,
              others: clusterKeys.slice(1),
              allKeys: clusterKeys,
            });
          }
        }

        if (endIndex < len) {
          // Yield execution to let the UI / S spinner render
          setTimeout(() => nextChunk(endIndex), 0);
        } else {
          setResolvedPrimaries(initialPrimaries);
          setCustomNames(initialCustomNames);
          setResolvedCategories(initialCategories);
          setDuplicateGroups(clusters);
          setIsScanning(false);
        }
      };

      nextChunk(0);
    }, 150);
  };

  const handleMergeDuplicateGroup = async (primarySuggest: string, finalName: string, selectedCat: string, allKeys: string[]) => {
    const trimmedName = finalName.trim();
    if (!trimmedName) return;

    setMergingIndex(primarySuggest);

    try {
      let allTxs: any[] = [];
      for (const key of allKeys) {
        const txs = await api.getTransactions('1970-01-01', '2100-01-01', { merchantKey: key });
        allTxs = allTxs.concat(txs);
      }
      
      const updatedTxs = allTxs.map(t => {
        const tCopy = { ...t, merchantKey: trimmedName };
        if (selectedCat && selectedCat !== 'keep') {
          tCopy.category = selectedCat;
        }
        return tCopy;
      });

      await bulkUpdateTransactions.mutateAsync(updatedTxs);

      setSnackbarMessage(`Merged duplicate set into "${trimmedName}".`);
      setDuplicateGroups((prev) => prev.filter((g) => g.primarySuggest !== primarySuggest));
    } catch (e: unknown) {
      console.error(e);
      setSnackbarMessage(`Merge failed: ${(e as Error).message}`);
    } finally {
      setMergingIndex(null);
    }
  };

  if (!shouldRender) return <PageLoader isLoading={true}><div /></PageLoader>;

  const hasActiveFilters =
    minSpend !== '' ||
    maxSpend !== '' ||
    minTxns !== '' ||
    maxTxns !== '' ||
    filterCategory !== 'all' ||
    Boolean(startDate) ||
    Boolean(endDate);

  const advancedFiltersPanelContent = (
    <Stack spacing={2.5} sx={{ pr: isMobile ? 0 : 1, py: 1 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        Advanced Filters
      </Typography>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Category
        </Typography>
        <Select
          fullWidth
          size="small"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <MenuItem value="all">All Categories</MenuItem>
          {allCategories.map((c) => (
            <MenuItem key={c.id} value={c.name}>
              {c.name}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Total Spend Range
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Min"
            type="number"
            fullWidth
            value={minSpend}
            onChange={(e) => setMinSpend(e.target.value ? Number(e.target.value) : '')}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                endAdornment: minSpend !== '' && (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" onClick={() => setMinSpend('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            size="small"
            placeholder="Max"
            type="number"
            fullWidth
            value={maxSpend}
            onChange={(e) => setMaxSpend(e.target.value ? Number(e.target.value) : '')}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                endAdornment: maxSpend !== '' && (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" onClick={() => setMaxSpend('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      </Box>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Transactions Count
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Min"
            type="number"
            fullWidth
            value={minTxns}
            onChange={(e) => setMinTxns(e.target.value ? Number(e.target.value) : '')}
            slotProps={{
              input: {
                endAdornment: minTxns !== '' && (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" onClick={() => setMinTxns('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            size="small"
            placeholder="Max"
            type="number"
            fullWidth
            value={maxTxns}
            onChange={(e) => setMaxTxns(e.target.value ? Number(e.target.value) : '')}
            slotProps={{
              input: {
                endAdornment: maxTxns !== '' && (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" onClick={() => setMaxTxns('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      </Box>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Date Range
        </Typography>
        <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.5}>
          <TextField
            size="small"
            type="date"
            label="From"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Stack>
      </Box>

      <Button
        variant="outlined"
        fullWidth
        sx={UNIFORM_TOOLBAR_BUTTON_SX}
        onClick={() => {
          setFilterCategory('all');
          setMinSpend('');
          setMaxSpend('');
          setMinTxns('');
          setMaxTxns('');
          setStartDate('');
          setEndDate('');
          setSearchQuery('');
          setSearchInput('');
        }}
      >
        Clear All Filters
      </Button>
    </Stack>
  );

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={{ xs: 2, md: 3 }} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}>
            Merchants
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<MergeTypeIcon fontSize="small" />}
              onClick={handleScanDuplicates}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              {isMobile ? 'Scan Duplicates' : 'Scan for Duplicates'}
            </Button>
            {selectedKeys.length >= 2 && (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<MergeTypeIcon fontSize="small" />}
                onClick={handleOpenMerge}
                sx={{
                  ...UNIFORM_TOOLBAR_BUTTON_SX,
                  border: '1px solid',
                  borderColor: 'primary.main',
                }}
              >
                Merge ({selectedKeys.length})
              </Button>
            )}
          </Stack>
        </Box>

        {/* Main View Container */}
        {viewTransactionsTarget ? (
          // Inner transaction ledger sub-view
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Button
                startIcon={<ArrowBackIcon fontSize="small" />}
                onClick={() => setViewTransactionsTarget(null)}
                variant="outlined"
                color="inherit"
                size="small"
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Back to directory
              </Button>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                Transactions for &ldquo;{viewTransactionsTarget.merchantKey}&rdquo;
              </Typography>
            </Stack>

            <DataTable stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: { xs: 1, sm: 1.5 }, px: { xs: 1.25, sm: 2 } } }}>
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {viewTransactions
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell variant="body" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {t.date}
                      </TableCell>
                      <TableCell variant="body">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: { xs: '0.78rem', sm: '0.85rem' }, wordBreak: 'break-word' }}>
                          {t.description}
                        </Typography>
                        <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>
                          <Chip label={t.category} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />
                        </Box>
                      </TableCell>
                      <TableCell variant="body" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Chip label={t.category} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell variant="body" align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: t.amount < 0 ? 'inherit' : 'success.main' }}>
                        {usdCents.format(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={isMobile ? 2 : 3}>
                    <Typography variant="body2" color="text.secondary">
                      Total Transactions: {viewTransactions.length}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: viewTransactions.reduce((a, t) => a + t.amount, 0) < 0 ? 'inherit' : 'success.main' }}>
                      {usdCents.format(viewTransactions.reduce((a, t) => a + t.amount, 0))}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </DataTable>
          </Box>
        ) : (
          // Main directory table / mobile list
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 2 }}>
            {/* Subscriptions & Recurring Bills Summary Strip */}
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 1.25, sm: 2 },
                borderRadius: (t) => `${t.shape.borderRadius}px`,
                bgcolor: 'background.paper',
              }}
            >
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={{ xs: 1.25, sm: 1.5 }}
                alignItems={{ xs: 'stretch', md: 'center' }}
                justifyContent="space-between"
              >
                {/* Mobile (xs): Clean Select dropdown instead of 3-option segmented control */}
                <FormControl size="small" fullWidth sx={{ display: { xs: 'flex', sm: 'none' } }}>
                  <Select
                    variant="outlined"
                    value={viewFilter}
                    onChange={(e) => setViewFilter(e.target.value as 'all' | 'recurring' | 'price_hikes')}
                    sx={{
                      height: 42,
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      borderRadius: (t) => `${t.shape.borderRadius}px`,
                    }}
                  >
                    <MenuItem value="all">All Merchants ({merchantGroups.length})</MenuItem>
                    <MenuItem value="recurring">↻ Subscriptions &amp; Bills ({recurringStats.recurringCount})</MenuItem>
                    <MenuItem value="price_hikes">📈 Price Hikes ({recurringStats.priceHikeCount})</MenuItem>
                  </Select>
                </FormControl>

                {/* Tablet & Desktop (sm+): Segmented ToggleButtonGroup */}
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={viewFilter}
                  onChange={(_, val) => {
                    if (val) setViewFilter(val);
                  }}
                  sx={{
                    display: { xs: 'none', sm: 'inline-flex' },
                    flexWrap: 'wrap',
                    '& .MuiToggleButton-root': {
                      height: 34,
                      px: 1.75,
                      gap: 0.75,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textTransform: 'none',
                    },
                  }}
                >
                  <ToggleButton value="all">
                    All ({merchantGroups.length})
                  </ToggleButton>
                  <ToggleButton value="recurring">
                    <RepeatIcon sx={{ fontSize: 16 }} />
                    Subscriptions ({recurringStats.recurringCount})
                  </ToggleButton>
                  <ToggleButton
                    value="price_hikes"
                    sx={{
                      ...(recurringStats.priceHikeCount > 0 ? { color: 'warning.main' } : {}),
                    }}
                  >
                    <TrendingUpIcon sx={{ fontSize: 16 }} />
                    Price Hikes ({recurringStats.priceHikeCount})
                  </ToggleButton>
                </ToggleButtonGroup>

                <Stack
                  direction="row"
                  spacing={{ xs: 2, sm: 2.5 }}
                  alignItems="center"
                  justifyContent={{ xs: 'space-between', sm: 'flex-start' }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', fontWeight: 600 }}>
                      Est. Monthly Burn
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'primary.main' }}>
                      {usd.format(recurringStats.totalMonthlyBurn)}/mo
                    </Typography>
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', fontWeight: 600 }}>
                      Annualized Bills
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {usd.format(recurringStats.totalAnnualBurn)}/yr
                    </Typography>
                  </Box>
                  {recurringStats.priceHikeCount > 0 && (
                    <Box
                      onClick={() => setViewFilter(viewFilter === 'price_hikes' ? 'all' : 'price_hikes')}
                      sx={{ cursor: 'pointer', textAlign: { xs: 'right', sm: 'left' } }}
                    >
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontSize: '0.68rem', fontWeight: 600 }}>
                        Price Hikes ({recurringStats.priceHikeCount})
                      </Typography>
                      <Typography variant="subtitle2" color="warning.main" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        +{usdCents.format(recurringStats.totalMonthlyHikeImpact)}/charge
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Stack>
            </Paper>

            <Stack direction="row" spacing={1.25} alignItems="center">
              <Button
                variant={filtersOpen ? 'contained' : 'outlined'}
                color={filtersOpen ? 'primary' : 'inherit'}
                size="small"
                startIcon={<FilterListIcon fontSize="small" />}
                onClick={() => setFiltersOpen(!filtersOpen)}
                sx={{
                  ...UNIFORM_TOOLBAR_BUTTON_SX,
                  ...(filtersOpen ? { borderColor: 'primary.main' } : {}),
                  flexShrink: 0,
                }}
              >
                Filters {hasActiveFilters ? '•' : ''}
              </Button>
              <Box sx={{ flex: 1, maxWidth: { xs: '100%', sm: 400 } }}>
                <TextField
                  placeholder="Search merchants or subscriptions..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  size="small"
                  fullWidth
                  sx={{ '& .MuiInputBase-root': { height: 36, fontSize: '0.85rem' } }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: searchInput && (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>
            </Stack>

            {isMobile && (
              <Collapse in={filtersOpen}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: (t) => `${t.shape.borderRadius}px`,
                    bgcolor: 'background.paper',
                  }}
                >
                  {advancedFiltersPanelContent}
                </Paper>
              </Collapse>
            )}

            {/* Main Layout Area */}
            {isMobile ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 1.25 }}>
                {filteredGroups.length > 0 && (
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ px: 0.5 }}
                  >
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Checkbox
                        size="small"
                        indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredGroups.length}
                        checked={filteredGroups.length > 0 && selectedKeys.length === filteredGroups.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        sx={{ p: 0.5 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {selectedKeys.length > 0
                          ? `${selectedKeys.length} selected`
                          : `${filteredGroups.length} merchants`}
                      </Typography>
                    </Stack>
                    {selectedKeys.length > 0 && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setSelectedKeys([])}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0, minHeight: 24 }}
                      >
                        Clear selection
                      </Button>
                    )}
                  </Stack>
                )}

                {filteredGroups.length === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{ py: 4, textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}
                  >
                    No merchants found.
                  </Paper>
                ) : (
                  <Stack spacing={1.25}>
                    {paginatedGroups.map((g) => {
                      const isSelected = selectedKeys.includes(g.merchantKey);
                      const rec = recurrenceRecord[g.merchantKey];
                      const isRec = isRecurringSpendMerchant.has(g.merchantKey);
                      const hasHike = Boolean(isRec && rec?.priceHikeDelta && rec.priceHikeDelta > 0);
                      return (
                        <Paper
                          key={g.merchantKey}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: (t) => `${t.shape.borderRadius}px`,
                            borderColor: isSelected ? 'primary.main' : hasHike ? 'warning.main' : 'divider',
                            bgcolor: isSelected ? 'action.selected' : 'background.paper',
                          }}
                        >
                          <Stack spacing={0.85}>
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
                                <Checkbox
                                  size="small"
                                  checked={isSelected}
                                  onChange={(e) => handleSelectOne(g.merchantKey, e.target.checked)}
                                  sx={{ p: 0.25 }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 700, wordBreak: 'break-word', lineHeight: 1.3 }}
                                >
                                  {g.merchantKey}
                                </Typography>
                              </Stack>
                              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                                >
                                  {isRec && rec && viewFilter !== 'all'
                                    ? `~${usd.format(rec.estMonthlyCost)}/mo`
                                    : usd.format(g.totalSpend)}
                                </Typography>
                                {isRec && rec && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.68rem', display: 'block' }}>
                                    {viewFilter !== 'all' ? `${usd.format(g.totalSpend)} total` : `~${usd.format(rec.estMonthlyCost)}/mo`}
                                  </Typography>
                                )}
                              </Box>
                            </Stack>

                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              flexWrap="wrap"
                              gap={0.5}
                              sx={{ pl: 3.5 }}
                            >
                              <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Chip
                                  label={g.mostCommonCategory}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 21, fontSize: '0.7rem', fontWeight: 600 }}
                                />
                                {isRec && rec && (
                                  <Chip
                                    label={`↻ ${recurrenceLabel(rec.kind)}`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ height: 21, fontSize: '0.68rem', fontWeight: 700 }}
                                  />
                                )}
                                {hasHike && rec && (
                                  <Tooltip
                                    title={`Latest charge ${usdCents.format(rec.lastAmount || 0)} vs prior avg ${usdCents.format(rec.priorAmount || 0)}`}
                                  >
                                    <Chip
                                      label={`📈 +${usdCents.format(rec.priceHikeDelta || 0)}`}
                                      size="small"
                                      color="warning"
                                      variant="filled"
                                      sx={{ height: 21, fontSize: '0.68rem', fontWeight: 700 }}
                                    />
                                  </Tooltip>
                                )}
                              </Stack>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                {g.totalTransactions} txns
                              </Typography>
                            </Stack>

                            <Stack
                              direction="row"
                              spacing={1}
                              justifyContent="flex-end"
                              sx={{ pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}
                            >
                              <Button
                                size="small"
                                variant="text"
                                color="primary"
                                startIcon={<EditIcon sx={{ fontSize: 15 }} />}
                                onClick={() => handleOpenRename(g)}
                                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                              >
                                Rename
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                color="secondary"
                                startIcon={<CategoryIcon sx={{ fontSize: 15 }} />}
                                onClick={() => handleOpenRecategorize(g)}
                                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                              >
                                Category
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                color="inherit"
                                startIcon={<ListAltIcon sx={{ fontSize: 15 }} />}
                                onClick={() => setViewTransactionsTarget(g)}
                                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1, minWidth: 0 }}
                              >
                                Ledger
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}

                <Paper variant="outlined" sx={{ borderRadius: (t) => `${t.shape.borderRadius}px` }}>
                  <TablePagination
                    component="div"
                    rowsPerPageOptions={[10, 25, 50]}
                    labelRowsPerPage="Rows:"
                    count={filteredGroups.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                      setRowsPerPage(parseInt(e.target.value, 10));
                      setPage(0);
                    }}
                    sx={{
                      '& .MuiTablePagination-toolbar': { px: 1, minHeight: 44 },
                      '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: '0.75rem' },
                    }}
                  />
                </Paper>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                <PanelGroup
                  key={`merchants-${filtersOpen ? 'open' : 'closed'}`}
                  orientation="horizontal"
                  defaultLayout={defaultLayout}
                  onLayoutChanged={onLayoutChanged}
                  style={{ height: '100%' }}
                >
                  {filtersOpen && (
                    <Panel id="filters" defaultSize="25%" minSize="20%" maxSize="40%">
                      <PanelScroll>
                        {advancedFiltersPanelContent}
                      </PanelScroll>
                    </Panel>
                  )}

                  {filtersOpen && <StyledResizeHandle ariaLabel="Resize filters / table" />}

                  <Panel id="table" defaultSize="75%" minSize="30%">
                    <Box
                      sx={{
                        position: 'relative',
                        flexGrow: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        pl: filtersOpen ? 1 : 0,
                      }}
                    >
                      <DataTable size="small" stickyHeader>
                        <TableHead sx={{ bgcolor: 'action.hover' }}>
                          <TableRow>
                            <TableCell padding="checkbox">
                              <Checkbox
                                indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredGroups.length}
                                checked={filteredGroups.length > 0 && selectedKeys.length === filteredGroups.length}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                              />
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 320 }}>Merchant Name</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 130 }}>Total Spend</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 100 }}>Count</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 180 }}>Primary Category</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Active Dates</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 160 }} align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredGroups.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary', fontStyle: 'italic' }}>
                                No merchants found.
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedGroups.map((g) => {
                              const isSelected = selectedKeys.includes(g.merchantKey);
                              const rec = recurrenceRecord[g.merchantKey];
                              const isRec = isRecurringSpendMerchant.has(g.merchantKey);
                              const hasHike = Boolean(isRec && rec?.priceHikeDelta && rec.priceHikeDelta > 0);
                              return (
                                <TableRow key={g.merchantKey} hover selected={isSelected}>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={isSelected}
                                      onChange={(e) => handleSelectOne(g.merchantKey, e.target.checked)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {g.merchantKey}
                                      </Typography>
                                      {isRec && rec && (
                                        <Chip
                                          label={`↻ ${recurrenceLabel(rec.kind)} · ~${usd.format(rec.estMonthlyCost)}/mo`}
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                        />
                                      )}
                                      {hasHike && rec && (
                                        <Tooltip
                                          title={`Latest charge ${usdCents.format(rec.lastAmount || 0)} vs prior avg ${usdCents.format(rec.priorAmount || 0)}`}
                                        >
                                          <Chip
                                            label={`📈 +${usdCents.format(rec.priceHikeDelta || 0)} (+${Math.round(rec.priceHikePct || 0)}%)`}
                                            size="small"
                                            color="warning"
                                            variant="filled"
                                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                          />
                                        </Tooltip>
                                      )}
                                    </Stack>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      {usd.format(g.totalSpend)}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {g.totalTransactions} txns
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={g.mostCommonCategory}
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontWeight: 500 }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption" color="text.secondary">
                                      {g.earliestDate} to {g.latestDate}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right">
                                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                      <Tooltip title="Rename merchant name">
                                        <IconButton size="small" onClick={() => handleOpenRename(g)} color="primary">
                                          <EditIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Recategorize all transactions">
                                        <IconButton size="small" onClick={() => handleOpenRecategorize(g)} color="secondary">
                                          <CategoryIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="View transaction ledger">
                                        <IconButton size="small" onClick={() => setViewTransactionsTarget(g)}>
                                          <ListAltIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Tooltip>
                                    </Stack>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TablePagination
                              rowsPerPageOptions={[10, 25, 50, 100]}
                              count={filteredGroups.length}
                              rowsPerPage={rowsPerPage}
                              page={page}
                              onPageChange={(_, newPage) => setPage(newPage)}
                              onRowsPerPageChange={(e) => {
                                setRowsPerPage(parseInt(e.target.value, 10));
                                setPage(0);
                              }}
                            />
                          </TableRow>
                        </TableFooter>
                      </DataTable>
                    </Box>
                  </Panel>
                </PanelGroup>
              </Box>
            )}
          </Box>
        )}

      {/* Rename Dialog */}
      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Rename Merchant</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1.5 }}>
            <TextField
              label="Merchant Name"
              value={newMerchantName}
              onChange={(e) => setNewMerchantName(e.target.value)}
              fullWidth
              size="small"
              required
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Renaming will update the `merchantKey` for all {renameTarget?.totalTransactions} transactions currently matching "{renameTarget?.merchantKey}".
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button onClick={handleRenameSubmit} variant="contained" disabled={!newMerchantName.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Recategorize Dialog */}
      <Dialog
        open={recategorizeTarget !== null}
        onClose={() => setRecategorizeTarget(null)}
        PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Bulk Recategorize</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="recat-category-label">Category</InputLabel>
              <Select
                labelId="recat-category-label"
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {allCategories.map((c) => (
                  <MenuItem key={c.id} value={c.name}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              This will update the category of all {recategorizeTarget?.totalTransactions} transactions matching "{recategorizeTarget?.merchantKey}" to "{selectedCategory}".
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecategorizeTarget(null)}>Cancel</Button>
          <Button onClick={handleRecategorizeSubmit} variant="contained" color="primary">
            Recategorize
          </Button>
        </DialogActions>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog
        open={mergeDialogOpen}
        onClose={() => setMergeDialogOpen(false)}
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: (theme) => (isMobile ? 0 : `${theme.shape.borderRadius}px`) } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Merge Merchants</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1.5 }}>
            <Typography variant="body2">
              You are consolidating <strong>{selectedKeys.length}</strong> unique merchants. Select a candidate name or enter a custom one below:
            </Typography>
            <Autocomplete
              freeSolo
              options={selectedKeys}
              value={mergeCustomName}
              onInputChange={(_, newValue) => setMergeCustomName(newValue)}
              renderInput={(params) => (
                <TextField {...params} label="Target Merchant Name (Choose or type custom)" size="small" />
              )}
            />
            <Typography variant="caption" color="text.secondary">
              Merged merchants: {selectedKeys.filter((k) => k !== mergeCustomName.trim()).map((k) => `"${k}"`).join(', ')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleMergeSubmit}
            variant="contained"
            color="primary"
            disabled={!mergeCustomName.trim()}
          >
            Merge
          </Button>
        </DialogActions>
      </Dialog>

      {/* Scan Duplicates Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: (theme) => (isMobile ? 0 : `${theme.shape.borderRadius}px`) } }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Duplicate Merchant Scanner</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This scanner clusters similar merchant keys together using Levenshtein edit distance and suffix filtering. Review candidate groups and select the primary name to resolve duplication.
          </Typography>
          
          {isScanning ? (
            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <AnimatedLogo scale={2.5} spinSpeed={0.08} />
              <Typography variant="body2" color="text.secondary">
                Analyzing merchant spelling and clustering duplicates...
              </Typography>
            </Box>
          ) : duplicateGroups.length === 0 ? (
            <Box sx={{ py: 4, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center' }}>
              No potential duplicate merchant names were found. Your records look clean!
            </Box>
          ) : (
            <Stack spacing={2}>
              {duplicateGroups.map((group, groupIdx) => {
                const primarySuggest = group.primarySuggest;
                const candidateVal = resolvedPrimaries[primarySuggest] || primarySuggest;
                const nameInputVal = customNames[primarySuggest] !== undefined ? customNames[primarySuggest] : candidateVal;
                const categoryVal = resolvedCategories[primarySuggest] || 'keep';
                const isMergingThis = mergingIndex === primarySuggest;

                return (
                  <Paper
                    key={primarySuggest}
                    variant="outlined"
                    sx={{ p: { xs: 1.75, sm: 2.5 }, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                  >
                    <Stack spacing={1.75}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Duplicate Group {groupIdx + 1}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                          Matches: {group.allKeys.map(k => `"${k}"`).join(', ')}
                        </Typography>
                      </Box>
                      
                      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={1.5}>
                        {/* 1. Quick Select Candidate */}
                        <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 } }}>
                          <InputLabel>Select Candidate</InputLabel>
                          <Select
                            label="Select Candidate"
                            value={candidateVal}
                            disabled={mergingIndex !== null}
                            onChange={(e) => {
                              const val = e.target.value;
                              setResolvedPrimaries(prev => ({ ...prev, [primarySuggest]: val }));
                              setCustomNames(prev => ({ ...prev, [primarySuggest]: val }));
                            }}
                          >
                            {group.allKeys.map((k) => (
                              <MenuItem key={k} value={k}>
                                {k}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {/* 2. Custom Target Name */}
                        <TextField
                          label="Consolidated Name"
                          size="small"
                          value={nameInputVal}
                          disabled={mergingIndex !== null}
                          onChange={(e) => setCustomNames(prev => ({ ...prev, [primarySuggest]: e.target.value }))}
                          sx={{ width: { xs: '100%', sm: 200 } }}
                        />

                        {/* 3. Target Category */}
                        <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 } }}>
                          <InputLabel>Category</InputLabel>
                          <Select
                            label="Category"
                            value={categoryVal}
                            disabled={mergingIndex !== null}
                            onChange={(e) => setResolvedCategories(prev => ({ ...prev, [primarySuggest]: e.target.value }))}
                          >
                            <MenuItem value="keep">Keep Existing</MenuItem>
                            {allCategories.map((c) => (
                              <MenuItem key={c.id} value={c.name}>
                                {c.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {/* 4. Action */}
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          sx={{
                            ...UNIFORM_TOOLBAR_BUTTON_SX,
                            borderColor: 'primary.main',
                            width: { xs: '100%', sm: 'auto' },
                            ml: { xs: 0, sm: 'auto' },
                          }}
                          onClick={() => handleMergeDuplicateGroup(primarySuggest, nameInputVal, categoryVal, group.allKeys)}
                          disabled={!nameInputVal.trim() || mergingIndex !== null}
                        >
                          {isMergingThis ? 'Merging...' : 'Resolve & Merge'}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialogOpen(false)} variant="outlined">
            Close Scanner
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
    </PageLoader>
  );
}
