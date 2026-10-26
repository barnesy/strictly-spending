import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Divider,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSimpleFinStore } from '../stores/simplefinStore';
import { api } from '../api';
import { queryClient } from '../queryClient';
import type { Account } from '../types';
import type { SimpleFinAccountRecord } from '../api/simplefin';

interface SimpleFinAccountMapperDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SimpleFinAccountMapperDialog: React.FC<SimpleFinAccountMapperDialogProps> = ({
  open,
  onClose,
  onSaved,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { accounts, mapAccount } = useSimpleFinStore();
  const [strictlyAccounts, setStrictlyAccounts] = useState<Account[]>([]);
  // Mapping of simplefin account_id -> strictly_account_id (or null)
  const [mappingState, setMappingState] = useState<Record<string, number | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [creatingAccId, setCreatingAccId] = useState<string | null>(null);
  const [isAutoCreatingAll, setIsAutoCreatingAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      api.getAccounts().then((accs) => setStrictlyAccounts(accs));
    }
  }, [open]);

  useEffect(() => {
    const initialMap: Record<string, number | null> = {};
    accounts.forEach((acc) => {
      initialMap[acc.account_id] = acc.strictly_account_id ?? null;
    });
    setMappingState(initialMap);
  }, [accounts]);

  const handleSelectAccount = (sfinAccId: string, val: string) => {
    if (val === '__unmapped__') {
      setMappingState((prev) => ({ ...prev, [sfinAccId]: null }));
    } else {
      const numId = parseInt(val, 10);
      setMappingState((prev) => ({ ...prev, [sfinAccId]: isNaN(numId) ? null : numId }));
    }
  };

  const autoCreateSingleAccount = async (
    acc: SimpleFinAccountRecord,
    currentStrictlyList: Account[]
  ): Promise<{ newId: number; newAccountName: string; updatedList: Account[] }> => {
    const bankName = acc.org_name || 'Bank';
    const lower = `${bankName} ${acc.name}`.toLowerCase();
    const isMortgage =
      lower.includes('mortgage') ||
      lower.includes('home loan') ||
      lower.includes('rocket') ||
      lower.includes('mr. cooper') ||
      lower.includes('pennymac') ||
      lower.includes('loancare') ||
      lower.includes('freedom mortgage');
    const isLoan =
      isMortgage ||
      lower.includes('loan') ||
      lower.includes('auto finance') ||
      lower.includes('santander') ||
      lower.includes('nelnet') ||
      lower.includes('aidvantage') ||
      lower.includes('mohela') ||
      lower.includes('navient') ||
      lower.includes('sallie mae') ||
      lower.includes('edfinancial') ||
      lower.includes('lightstream') ||
      lower.includes('upstart');
    const isCredit =
      !isLoan &&
      (lower.includes('credit') ||
        lower.includes('card') ||
        lower.includes('sapphire') ||
        lower.includes('freedom') ||
        lower.includes('quicksilver') ||
        lower.includes('venture') ||
        lower.includes('savor') ||
        lower.includes('double cash') ||
        lower.includes('custom cash') ||
        lower.includes('blue cash') ||
        lower.includes('platinum') ||
        lower.includes('gold card') ||
        lower.includes('discover it') ||
        lower.includes('bilt'));
    const isExplicitInvestment =
      !isLoan &&
      !isCredit &&
      (lower.includes('ira') ||
        lower.includes('roth') ||
        lower.includes('401k') ||
        lower.includes('401(k)') ||
        lower.includes('403b') ||
        lower.includes('403(b)') ||
        lower.includes('457') ||
        lower.includes('hsa') ||
        lower.includes('health savings') ||
        lower.includes('529') ||
        lower.includes('stock') ||
        lower.includes('rsu') ||
        lower.includes('espp') ||
        lower.includes('brokerage') ||
        lower.includes('investment') ||
        lower.includes('portfolio') ||
        lower.includes('crypto') ||
        lower.includes('tod'));
    const isSavings =
      !isLoan &&
      !isCredit &&
      !isExplicitInvestment &&
      (lower.includes('saving') ||
        lower.includes('hysa') ||
        lower.includes('money market') ||
        lower.includes('mms') ||
        lower.includes('mma') ||
        lower.includes('certificate of deposit') ||
        /\bcd\b/.test(lower) ||
        /\bsav\b/.test(lower) ||
        lower.includes('marcus'));
    const isChecking =
      !isLoan &&
      !isCredit &&
      !isExplicitInvestment &&
      !isSavings &&
      (lower.includes('checking') ||
        /\bchk\b/.test(lower) ||
        lower.includes('cash management') ||
        /\bcma\b/.test(lower) ||
        lower.includes('share draft') ||
        lower.includes('adv plus banking') ||
        lower.includes('total checking'));
    const isBrokerageInstitutionFallback =
      !isLoan &&
      !isCredit &&
      !isSavings &&
      !isChecking &&
      (lower.includes('fidelity') ||
        lower.includes('robinhood') ||
        lower.includes('coinbase') ||
        lower.includes('vanguard') ||
        lower.includes('schwab') ||
        lower.includes('wealthfront') ||
        lower.includes('betterment') ||
        lower.includes('acorns') ||
        lower.includes('etrade') ||
        lower.includes('e*trade') ||
        lower.includes('merrill'));

    let cleanType: Account['type'] = 'checking';
    if (isMortgage) {
      cleanType = 'mortgage';
    } else if (isLoan) {
      cleanType = 'loan';
    } else if (isExplicitInvestment || isBrokerageInstitutionFallback) {
      cleanType = 'investment';
    } else if (isCredit) {
      cleanType = 'credit';
    } else if (isSavings) {
      cleanType = 'savings';
    }

    let source: Account['source'] = 'simplefin';
    if (lower.includes('america') || lower.includes('boa')) {
      source = isCredit ? 'boa-credit' : 'boa-checking';
    } else if (lower.includes('truist')) {
      source = 'truist-checking';
    } else if (lower.includes('chase') && isCredit) {
      source = 'chase';
    }

    const alreadyHasBank = acc.name.toLowerCase().startsWith(bankName.toLowerCase());
    const newAccountName = alreadyHasBank ? acc.name : `${bankName} ${acc.name}`;

    const existing = currentStrictlyList.find(
      (a) => a.name.toLowerCase() === newAccountName.toLowerCase()
    );
    let newId: number;
    let updatedList = currentStrictlyList;

    const last4Match = acc.name.match(/\((\d{4})\)/) || acc.name.match(/[- ]+(\d{4})/);
    const last4 = last4Match ? last4Match[1] : undefined;

    if (existing && existing.id) {
      newId = existing.id;
    } else {
      newId = await api.addAccount({
        name: newAccountName,
        type: cleanType,
        institution: bankName,
        source,
        enabled: true,
        last4,
        currentBalance: acc.balance ?? 0,
      });

      updatedList = await api.getAccounts();
    }

    return { newId, newAccountName, updatedList };
  };

  const handleAutoCreateAccount = async (acc: SimpleFinAccountRecord) => {
    setCreatingAccId(acc.account_id);
    setFeedback(null);
    try {
      const { newId, newAccountName, updatedList } = await autoCreateSingleAccount(acc, strictlyAccounts);
      setStrictlyAccounts(updatedList);
      setMappingState((prev) => ({ ...prev, [acc.account_id]: newId }));

      // Save mapping immediately in SimpleFin database
      await mapAccount(acc.account_id, newId);
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));

      setFeedback({
        type: 'success',
        text: `Created and linked "${acc.name}" to account "${newAccountName}".`,
      });
    } catch (err: unknown) {
      console.error('Failed to auto-create account:', err);
      setFeedback({
        type: 'error',
        text: `Failed to auto-create account: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setCreatingAccId(null);
    }
  };

  const handleAutoCreateAll = async () => {
    const unmapped = accounts.filter((acc) => !mappingState[acc.account_id]);
    if (unmapped.length === 0) return;

    setIsAutoCreatingAll(true);
    setFeedback(null);
    try {
      let currentList = strictlyAccounts;
      const nextMap = { ...mappingState };
      let createdCount = 0;

      for (const acc of unmapped) {
        const { newId, updatedList } = await autoCreateSingleAccount(acc, currentList);
        currentList = updatedList;
        nextMap[acc.account_id] = newId;
        await mapAccount(acc.account_id, newId);
        createdCount++;
      }

      setStrictlyAccounts(currentList);
      setMappingState(nextMap);
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));

      setFeedback({
        type: 'success',
        text: `Successfully created and linked all ${createdCount} unmapped accounts!`,
      });
    } catch (err: unknown) {
      console.error('Failed to auto-create all accounts:', err);
      setFeedback({
        type: 'error',
        text: `Failed to auto-create some accounts: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsAutoCreatingAll(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      for (const acc of accounts) {
        const selectedStrictlyId = mappingState[acc.account_id] ?? null;
        if (selectedStrictlyId !== (acc.strictly_account_id ?? null)) {
          await mapAccount(acc.account_id, selectedStrictlyId);
        }
      }
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const unmappedCount = accounts.filter((acc) => !mappingState[acc.account_id]).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <SwapHorizIcon color="primary" />
            <Typography variant="h6">Map SimpleFIN Bank Accounts</Typography>
          </Stack>
          {unmappedCount > 1 && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={isAutoCreatingAll ? <CircularProgress size={16} /> : <AutoAwesomeIcon fontSize="small" />}
              disabled={isAutoCreatingAll || isSaving}
              onClick={handleAutoCreateAll}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Auto-Create All ({unmappedCount})
            </Button>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose which account in Strictly Spending should receive imported transactions from each bank account.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {feedback && (
            <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
              {feedback.text}
            </Alert>
          )}

          {accounts.length === 0 ? (
            <Alert severity="warning">
              No accounts discovered from SimpleFIN yet. If your subscription was recently activated, please click "Refresh Accounts" on the card.
            </Alert>
          ) : (
            accounts.map((acc) => {
              const currentStrictlyId = mappingState[acc.account_id];
              const mappedAccount = strictlyAccounts.find((a) => a.id === currentStrictlyId);
              const isCreatingThis = creatingAccId === acc.account_id;

              return (
                <Box
                  key={acc.account_id}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" fontWeight={600}>
                          {acc.name}
                        </Typography>
                        {acc.org_name && (
                          <Chip label={acc.org_name} size="small" variant="outlined" color="primary" />
                        )}
                        {acc.balance !== null && acc.balance !== undefined && (
                          <Chip
                            label={`$${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                            size="small"
                            variant="filled"
                            color="default"
                          />
                        )}
                        {mappedAccount ? (
                          <Chip label="Mapped" size="small" color="success" variant="outlined" />
                        ) : (
                          <Chip label="Unmapped" size="small" color="warning" variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <FormControl fullWidth size="small">
                      <InputLabel id={`map-label-${acc.account_id}`}>
                        Strictly Spending Destination
                      </InputLabel>
                      <Select
                        labelId={`map-label-${acc.account_id}`}
                        value={currentStrictlyId ? String(currentStrictlyId) : '__unmapped__'}
                        label="Strictly Spending Destination"
                        onChange={(e) => handleSelectAccount(acc.account_id, e.target.value)}
                      >
                        <MenuItem value="__unmapped__">
                          <em>(Do not sync / Unmapped)</em>
                        </MenuItem>
                        {strictlyAccounts.map((sa) => (
                          <MenuItem key={sa.id} value={String(sa.id)}>
                            {sa.name} ({sa.type || 'account'})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {!mappedAccount && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={
                          isCreatingThis ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />
                        }
                        disabled={isCreatingThis || isAutoCreatingAll}
                        sx={{ whiteSpace: 'nowrap', minWidth: '180px', fontWeight: 600 }}
                        onClick={() => handleAutoCreateAccount(acc)}
                      >
                        {isCreatingThis ? 'Creating...' : 'Auto-Create Account'}
                      </Button>
                    )}
                  </Stack>
                </Box>
              );
            })
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isSaving || isAutoCreatingAll}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSaving || isAutoCreatingAll || accounts.length === 0}
        >
          {isSaving ? 'Saving...' : 'Save Mappings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
