import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CategoryIcon from '@mui/icons-material/Category';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FilterListIcon from '@mui/icons-material/FilterList';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import { db } from '../db';
import { usd, usdCents } from '../lib';
import PageLoader from '../components/PageLoader';
import AnimatedLogo from '../components/AnimatedLogo';

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
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const allCategories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) || [];

  const isLoading = allTransactions === undefined;

  // Search Debouncing
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [minSpend, setMinSpend] = useState<number | ''>('');
  const [maxSpend, setMaxSpend] = useState<number | ''>('');
  const [minTxns, setMinTxns] = useState<number | ''>('');
  const [maxTxns, setMaxTxns] = useState<number | ''>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, minSpend, maxSpend, minTxns, maxTxns, filterCategory, startDate, endDate]);

  // Dialog states
  const [renameTarget, setRenameTarget] = useState<MerchantGroup | null>(null);
  const [newMerchantName, setNewMerchantName] = useState('');

  const [recategorizeTarget, setRecategorizeTarget] = useState<MerchantGroup | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeCustomName, setMergeCustomName] = useState('');

  const [viewTransactionsTarget, setViewTransactionsTarget] = useState<MerchantGroup | null>(null);
  
  const targetMerchantKey = viewTransactionsTarget?.merchantKey || '';
  const viewTransactions = useLiveQuery(
    () => targetMerchantKey ? db.transactions.where('merchantKey').equals(targetMerchantKey).toArray() : Promise.resolve([]),
    [targetMerchantKey]
  ) || [];

  // Group transactions by merchantKey
  const merchantGroups = useMemo<MerchantGroup[]>(() => {
    if (!allTransactions) return [];

    const groups: Record<string, MerchantGroup> = {};

    allTransactions.forEach((t) => {
      const key = t.merchantKey || 'Unknown';
      const isSpend = t.amount < 0;
      const amt = isSpend ? Math.abs(t.amount) : 0;

      if (!groups[key]) {
        groups[key] = {
          merchantKey: key,
          totalSpend: 0,
          totalTransactions: 0,
          categories: {},
          mostCommonCategory: t.category,
          earliestDate: t.date,
          latestDate: t.date,
        };
      }

      const g = groups[key];
      g.totalTransactions += 1;
      g.totalSpend += amt;

      // Track categories to find the most common one
      g.categories[t.category] = (g.categories[t.category] || 0) + 1;

      // Update date boundaries
      if (t.date < g.earliestDate) g.earliestDate = t.date;
      if (t.date > g.latestDate) g.latestDate = t.date;
    });

    // Post-process to resolve most common category and convert to array
    return Object.values(groups).map((g) => {
      let maxCount = 0;
      let commonCat = 'Uncategorized';
      Object.entries(g.categories).forEach(([cat, count]) => {
        if (count > maxCount) {
          maxCount = count;
          commonCat = cat;
        }
      });
      g.mostCommonCategory = commonCat;
      return g;
    });
  }, [allTransactions]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return merchantGroups.filter((g) => {
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
  }, [
    merchantGroups,
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
      await db.transactions.where('merchantKey').equals(renameTarget.merchantKey).modify({ merchantKey: trimmedName });
      setSnackbarMessage(`Successfully renamed "${renameTarget.merchantKey}" to "${trimmedName}".`);
    } catch (e: any) {
      console.error(e);
      setSnackbarMessage(`Failed to rename merchant: ${e.message}`);
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
      await db.transactions.where('merchantKey').equals(recategorizeTarget.merchantKey).modify({ category: selectedCategory });
      setSnackbarMessage(`Successfully recategorized transactions under "${recategorizeTarget.merchantKey}" to "${selectedCategory}".`);
    } catch (e: any) {
      console.error(e);
      setSnackbarMessage(`Failed to recategorize: ${e.message}`);
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
        await db.transactions.where('merchantKey').anyOf(sourceKeys).modify({ merchantKey: finalName });
      }
      setSnackbarMessage(`Merged ${selectedKeys.length} merchants into "${finalName}".`);
      setSelectedKeys([]);
      setMergeDialogOpen(false);
    } catch (e: any) {
      console.error(e);
      setSnackbarMessage(`Merge failed: ${e.message}`);
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
      const changes: any = { merchantKey: trimmedName };
      if (selectedCat && selectedCat !== 'keep') {
        changes.category = selectedCat;
      }

      await db.transactions.where('merchantKey').anyOf(allKeys).modify(changes);

      setSnackbarMessage(`Merged duplicate set into "${trimmedName}".`);
      setDuplicateGroups((prev) => prev.filter((g) => g.primarySuggest !== primarySuggest));
    } catch (e: any) {
      console.error(e);
      setSnackbarMessage(`Merge failed: ${e.message}`);
    } finally {
      setMergingIndex(null);
    }
  };

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Merchant Directory & Consolidation
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Group transaction histories by merchant, fix spelling errors in bulk, and consolidate duplicate records.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<MergeTypeIcon />}
            onClick={handleScanDuplicates}
            sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
          >
            Scan for Duplicates
          </Button>
          {selectedKeys.length >= 2 && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<MergeTypeIcon />}
              onClick={handleOpenMerge}
              sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
            >
              Merge Selected ({selectedKeys.length})
            </Button>
          )}
        </Stack>
      </Box>

      {/* Main View Container */}
      {viewTransactionsTarget ? (
        // Inner transaction ledger sub-view
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => setViewTransactionsTarget(null)}
                variant="outlined"
                size="small"
                sx={{ textTransform: 'none' }}
              >
                Back to directory
              </Button>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Transactions for "{viewTransactionsTarget.merchantKey}"
              </Typography>
            </Box>

            <TableContainer>
              <Table sx={{ '& .MuiTableCell-root': { py: 1.5, px: 2 } }}>
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {viewTransactions
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell variant="body">{t.date}</TableCell>
                        <TableCell variant="body" sx={{ fontFamily: 'monospace' }}>
                          {t.description}
                        </TableCell>
                        <TableCell variant="body">
                          <Chip label={t.category} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell variant="body" align="right" sx={{ fontWeight: 600, color: t.amount < 0 ? 'inherit' : 'success.main' }}>
                          {usdCents.format(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      ) : (
        // Main directory table
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ flex: 1, maxWidth: 400 }}>
                <TextField
                  placeholder="Search merchants..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  size="small"
                  fullWidth
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
                      )
                    }
                  }}
                />
              </Box>
              <Button
                variant={showAdvancedFilters ? 'contained' : 'outlined'}
                size="small"
                startIcon={<FilterListIcon />}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px`, height: 40 }}
              >
                Filters {(minSpend !== '' || maxSpend !== '' || minTxns !== '' || maxTxns !== '' || filterCategory !== 'all' || startDate || endDate) ? '•' : ''}
              </Button>
              {(minSpend !== '' || maxSpend !== '' || minTxns !== '' || maxTxns !== '' || filterCategory !== 'all' || startDate || endDate || searchQuery) && (
                <Button
                  variant="text"
                  color="inherit"
                  size="small"
                  startIcon={<RestartAltIcon />}
                  onClick={() => {
                    setMinSpend('');
                    setMaxSpend('');
                    setMinTxns('');
                    setMaxTxns('');
                    setFilterCategory('all');
                    setStartDate('');
                    setEndDate('');
                    setSearchInput('');
                    setSearchQuery('');
                  }}
                  sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px`, height: 40 }}
                >
                  Clear Filters
                </Button>
              )}
            </Stack>

            {showAdvancedFilters && (
              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: (theme) => `${theme.shape.borderRadius}px`, border: '1px solid', borderColor: 'divider' }}>
                <Stack spacing={2}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Filter Merchants</Typography>
                  <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" gap={2}>
                    {/* Price / Spend range */}
                    <TextField
                      label="Min Spend ($)"
                      type="number"
                      size="small"
                      value={minSpend}
                      onChange={(e) => setMinSpend(e.target.value === '' ? '' : Number(e.target.value))}
                      sx={{ width: 140 }}
                    />
                    <TextField
                      label="Max Spend ($)"
                      type="number"
                      size="small"
                      value={maxSpend}
                      onChange={(e) => setMaxSpend(e.target.value === '' ? '' : Number(e.target.value))}
                      sx={{ width: 140 }}
                    />

                    {/* Txn Count range */}
                    <TextField
                      label="Min Txns"
                      type="number"
                      size="small"
                      value={minTxns}
                      onChange={(e) => setMinTxns(e.target.value === '' ? '' : Number(e.target.value))}
                      sx={{ width: 120 }}
                    />
                    <TextField
                      label="Max Txns"
                      type="number"
                      size="small"
                      value={maxTxns}
                      onChange={(e) => setMaxTxns(e.target.value === '' ? '' : Number(e.target.value))}
                      sx={{ width: 120 }}
                    />

                    {/* Category */}
                    <FormControl size="small" sx={{ width: 180 }}>
                      <InputLabel id="filter-category-label">Primary Category</InputLabel>
                      <Select
                        labelId="filter-category-label"
                        value={filterCategory}
                        label="Primary Category"
                        onChange={(e) => setFilterCategory(e.target.value)}
                      >
                        <MenuItem value="all">All Categories</MenuItem>
                        {allCategories.map((c) => (
                          <MenuItem key={c.id} value={c.name}>
                            {c.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {/* Date Range */}
                    <TextField
                      label="Start Date"
                      type="date"
                      size="small"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      label="End Date"
                      type="date"
                      size="small"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 150 }}
                    />
                  </Stack>
                </Stack>
              </Box>
            )}

            <TableContainer sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
              <Table sx={{ '& .MuiTableCell-root': { py: 1.5, px: 2 } }}>
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredGroups.length}
                        checked={filteredGroups.length > 0 && selectedKeys.length === filteredGroups.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 300 }}>Merchant Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 120 }}>Total Spend</TableCell>
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
                      return (
                        <TableRow key={g.merchantKey} hover selected={isSelected}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => handleSelectOne(g.merchantKey, e.target.checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {g.merchantKey}
                            </Typography>
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
              </Table>
            </TableContainer>

            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={filteredGroups.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
            />
          </Stack>
        </Paper>
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
        PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
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
        PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
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
                    sx={{ p: 2.5, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                  >
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Duplicate Group {groupIdx + 1}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Matches: {group.allKeys.map(k => `"${k}"`).join(', ')}
                        </Typography>
                      </Box>
                      
                      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" gap={2}>
                        {/* 1. Quick Select Candidate */}
                        <FormControl size="small" sx={{ width: 180 }}>
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
                          sx={{ width: 200 }}
                        />

                        {/* 3. Target Category */}
                        <FormControl size="small" sx={{ width: 180 }}>
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
                          sx={{ textTransform: 'none', borderRadius: (theme) => `${theme.shape.borderRadius}px`, height: 38, ml: 'auto' }}
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
