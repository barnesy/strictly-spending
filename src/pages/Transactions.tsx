import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  IconButton,
  Tooltip,
  TablePagination,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { db } from '../db';
import { usdCents } from '../lib';
import { useFilters } from '../store';
import RecategorizeDialog from '../components/RecategorizeDialog';
import {
  buildRecurrenceMap,
  isRecurring,
  recurrenceLabel,
} from '../recurrence';
import type { Transaction } from '../types';

export default function Transactions() {
  const demoMode = useFilters((s) => s.demoMode);
  const accountsAll = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const txnsAll = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    []
  );
  const overrides = useLiveQuery(() => db.merchantOverrides.toArray(), []);
  // Demo-mode filter — hides real records without touching disk.
  const accounts = useMemo(
    () =>
      accountsAll && demoMode
        ? accountsAll.filter((a) => a.source === 'demo')
        : accountsAll,
    [accountsAll, demoMode]
  );
  const txns = useMemo(
    () =>
      txnsAll && demoMode
        ? txnsAll.filter((t) => t.source === 'demo')
        : txnsAll,
    [txnsAll, demoMode]
  );
  const recurrenceMap = useMemo(
    () => buildRecurrenceMap(txns || [], overrides || []),
    [txns, overrides]
  );

  const search = useFilters((s) => s.searchQuery);
  const setSearch = useFilters((s) => s.setSearchQuery);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    if (!txns) return [];
    const lowerSearch = search.toLowerCase();
    return txns.filter((t) => {
      if (accountFilter !== 'all' && t.accountId !== Number(accountFilter))
        return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (lowerSearch && !t.description.toLowerCase().includes(lowerSearch))
        return false;
      return true;
    });
  }, [txns, search, accountFilter, categoryFilter]);

  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const accountName = (id: number) =>
    accounts?.find((a) => a.id === id)?.name || '–';
  const categoryColor = (name: string) =>
    categories?.find((c) => c.name === name)?.color || '#bdbdbd';

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Transactions</Typography>
        <Typography variant="body2" color="text.secondary">
          {filtered.length} of {txns?.length ?? 0}
        </Typography>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField
            placeholder="Search description"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(0);
            }}
            size="small"
            label="Account"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All accounts</MenuItem>
            {accounts?.map((a) => (
              <MenuItem key={a.id} value={String(a.id)}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(0);
            }}
            size="small"
            label="Category"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All categories</MenuItem>
            <MenuItem value="Uncategorized">Uncategorized</MenuItem>
            {categories?.map((c) => (
              <MenuItem key={c.id} value={c.name}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Account</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell width={40}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.date}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="caption" color="text.secondary">
                    {accountName(t.accountId)}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    maxWidth: 380,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={t.description}
                >
                  {(() => {
                    const info = recurrenceMap.get(t.merchantKey);
                    if (info && isRecurring(info.kind)) {
                      return (
                        <Tooltip
                          title={`${recurrenceLabel(info.kind)} · ~${usdCents.format(info.estMonthlyCost)}/mo`}
                        >
                          <Box
                            component="span"
                            sx={{
                              color: 'primary.main',
                              fontSize: 14,
                              mr: 0.5,
                              cursor: 'help',
                            }}
                          >
                            &#x21bb;
                          </Box>
                        </Tooltip>
                      );
                    }
                    return null;
                  })()}
                  {t.description}
                </TableCell>
                <TableCell>
                  <Chip
                    label={t.category}
                    size="small"
                    sx={{
                      bgcolor: categoryColor(t.category) + '22',
                      color: categoryColor(t.category),
                      fontWeight: 500,
                      border: t.userOverridden ? '1px solid' : 'none',
                      borderColor: t.userOverridden
                        ? categoryColor(t.category)
                        : 'transparent',
                    }}
                  />
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color: t.amount < 0 ? 'inherit' : 'success.main',
                    fontWeight: 500,
                  }}
                >
                  {usdCents.format(t.amount)}
                </TableCell>
                <TableCell>
                  <Tooltip title="Recategorize">
                    <IconButton
                      size="small"
                      onClick={() => setEditTxn(t)}
                      aria-label={`Recategorize ${t.description.slice(0, 40)}`}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                    No transactions match.
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 250]}
        />
      </TableContainer>

      {editTxn && (
        <RecategorizeDialog
          txn={editTxn}
          onClose={() => setEditTxn(null)}
        />
      )}
    </Stack>
  );
}
