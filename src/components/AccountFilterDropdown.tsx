import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  Checkbox,
  Typography,
  Box,
  Divider,
  Stack,
} from '@mui/material';
import type { Theme, SxProps } from '@mui/material/styles';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { Account } from '../types';

const SCOPED_ACCOUNT_IDS_KEY = 'strictly_scoped_checking_account_ids';
const LEGACY_SCOPED_ACCOUNT_KEY = 'strictly_scoped_checking_account_id';

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Shared toolbar button styling matching the Forecast Settings button:
 * - height: 36px
 * - typeface: fontWeight 600, fontSize 0.8125rem, textTransform 'none'
 * - borderRadius: theme.shape.borderRadius
 * - borderColor: 'divider'
 */
export const UNIFORM_TOOLBAR_BUTTON_SX: SxProps<Theme> = {
  height: { xs: 42, sm: 36 },
  px: { xs: 1.35, sm: 1.25 },
  gap: 0.75,
  textTransform: 'none',
  fontWeight: 600,
  fontSize: { xs: '0.84rem', sm: '0.8125rem' },
  lineHeight: 1.2,
  borderRadius: (theme: Theme) => `${theme.shape.borderRadius}px`,
  border: '1px solid',
  borderColor: 'divider',
  color: 'text.primary',
  bgcolor: 'background.paper',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  minWidth: 'unset',
  '&:hover': {
    bgcolor: 'action.hover',
    borderColor: 'divider',
  },
};

export function formatShortAccountName(acc: Account): string {
  return acc.name
    .replace(/Bank of America/i, 'BoA')
    .replace(/Adv Plus Banking-/i, 'Adv Plus ')
    .replace(/Truist\s+/i, '')
    .replace(/(\b\d{4})\s*\(\1\)/g, '$1')
    .trim();
}

function readStoredAccountIds(): number[] | null {
  try {
    const rawList = localStorage.getItem(SCOPED_ACCOUNT_IDS_KEY);
    if (rawList) {
      if (rawList === 'all') return null;
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        const nums = parsed.map(Number).filter((n) => Number.isFinite(n));
        return nums.length > 0 ? nums : null;
      }
    }
    const legacy = localStorage.getItem(LEGACY_SCOPED_ACCOUNT_KEY);
    if (legacy && legacy !== 'all') {
      const num = Number(legacy);
      if (Number.isFinite(num)) return [num];
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function useScopedCheckingAccounts(checkingAccounts: Account[]) {
  const [rawSelectedIds, setRawSelectedIds] = useState<number[] | null>(() => readStoredAccountIds());

  const allCheckingIds = useMemo(
    () =>
      checkingAccounts
        .map((a) => a.id)
        .filter((id): id is number => id !== undefined),
    [checkingAccounts]
  );

  // Filter stored IDs against actual checking accounts; null or all IDs = "All Accounts"
  const effectiveSelectedIds = useMemo(() => {
    if (!rawSelectedIds || rawSelectedIds.length === 0 || allCheckingIds.length === 0) {
      return allCheckingIds;
    }
    const valid = rawSelectedIds.filter((id) => allCheckingIds.includes(id));
    if (valid.length === 0 || valid.length >= allCheckingIds.length) {
      return allCheckingIds;
    }
    return valid;
  }, [rawSelectedIds, allCheckingIds]);

  const isAllSelected =
    allCheckingIds.length === 0 || effectiveSelectedIds.length >= allCheckingIds.length;

  const setSelectedAccountIds = useCallback(
    (nextIds: number[] | null) => {
      if (!nextIds || nextIds.length === 0 || (allCheckingIds.length > 0 && nextIds.length >= allCheckingIds.length)) {
        setRawSelectedIds(null);
        try {
          localStorage.setItem(SCOPED_ACCOUNT_IDS_KEY, 'all');
          localStorage.setItem(LEGACY_SCOPED_ACCOUNT_KEY, 'all');
        } catch {
          // ignore
        }
      } else {
        const unique = Array.from(new Set(nextIds));
        setRawSelectedIds(unique);
        try {
          localStorage.setItem(SCOPED_ACCOUNT_IDS_KEY, JSON.stringify(unique));
          localStorage.setItem(
            LEGACY_SCOPED_ACCOUNT_KEY,
            unique.length === 1 ? String(unique[0]) : 'all'
          );
        } catch {
          // ignore
        }
      }
    },
    [allCheckingIds.length]
  );

  // Sync across tabs/components if storage changes
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SCOPED_ACCOUNT_IDS_KEY || e.key === LEGACY_SCOPED_ACCOUNT_KEY) {
        setRawSelectedIds(readStoredAccountIds());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const selectedAccounts = useMemo(() => {
    if (isAllSelected) return checkingAccounts;
    const set = new Set(effectiveSelectedIds);
    return checkingAccounts.filter((a) => a.id !== undefined && set.has(a.id));
  }, [checkingAccounts, effectiveSelectedIds, isAllSelected]);

  const selectedAccount = useMemo(
    () => (!isAllSelected && selectedAccounts.length === 1 ? selectedAccounts[0] : null),
    [isAllSelected, selectedAccounts]
  );

  const selectedAccountId = useMemo(
    () => (selectedAccount?.id !== undefined ? selectedAccount.id : null),
    [selectedAccount]
  );

  const scopedAccountIdsParam = useMemo(
    () => (isAllSelected ? undefined : effectiveSelectedIds),
    [isAllSelected, effectiveSelectedIds]
  );

  const scopeLabel = useMemo(() => {
    if (isAllSelected) return 'All Accounts';
    if (selectedAccounts.length === 1) return formatShortAccountName(selectedAccounts[0]);
    return selectedAccounts.map(formatShortAccountName).join(' + ');
  }, [isAllSelected, selectedAccounts]);

  return {
    selectedAccountIds: effectiveSelectedIds,
    setSelectedAccountIds,
    isAllSelected,
    selectedAccounts,
    selectedAccount,
    selectedAccountId,
    scopedAccountIdsParam,
    scopeLabel,
  };
}

interface AccountFilterDropdownProps {
  checkingAccounts: Account[];
  selectedAccountIds: number[];
  isAllSelected: boolean;
  onChangeSelectedIds: (nextIds: number[] | null) => void;
}

export const AccountFilterDropdown: React.FC<AccountFilterDropdownProps> = ({
  checkingAccounts,
  selectedAccountIds,
  isAllSelected,
  onChangeSelectedIds,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const allCheckingIds = useMemo(
    () =>
      checkingAccounts
        .map((a) => a.id)
        .filter((id): id is number => id !== undefined),
    [checkingAccounts]
  );

  const totalCheckingBalance = useMemo(
    () => checkingAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0),
    [checkingAccounts]
  );

  const buttonLabel = useMemo(() => {
    if (isAllSelected) return 'All Accounts';
    if (selectedAccountIds.length === 1) {
      const acc = checkingAccounts.find((a) => a.id === selectedAccountIds[0]);
      return acc ? formatShortAccountName(acc) : '1 Account';
    }
    return `${selectedAccountIds.length} Accounts`;
  }, [isAllSelected, selectedAccountIds, checkingAccounts]);

  const handleToggleAll = () => {
    onChangeSelectedIds(null);
  };

  const handleToggleAccount = (accId: number) => {
    const currentSet = new Set(isAllSelected ? allCheckingIds : selectedAccountIds);
    if (currentSet.has(accId)) {
      currentSet.delete(accId);
      // If unchecking the last remaining account, reset to All Accounts
      if (currentSet.size === 0) {
        onChangeSelectedIds(null);
      } else {
        onChangeSelectedIds(Array.from(currentSet));
      }
    } else {
      currentSet.add(accId);
      if (currentSet.size >= allCheckingIds.length) {
        onChangeSelectedIds(null);
      } else {
        onChangeSelectedIds(Array.from(currentSet));
      }
    }
  };

  const handleSelectOnly = (e: React.MouseEvent, accId: number) => {
    e.stopPropagation();
    onChangeSelectedIds([accId]);
  };

  if (checkingAccounts.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        title={buttonLabel}
        sx={{
          ...UNIFORM_TOOLBAR_BUTTON_SX,
          px: { xs: 0.9, sm: 1.25 },
          gap: { xs: 0.4, sm: 0.75 },
          fontSize: { xs: '0.78rem', sm: '0.8125rem' },
          maxWidth: { xs: 155, sm: 220, md: 260 },
          minWidth: 0,
          flexShrink: 1,
          overflow: 'hidden',
        }}
      >
        <AccountBalanceIcon
          sx={{
            fontSize: 16,
            flexShrink: 0,
            color: isAllSelected ? 'text.secondary' : 'primary.main',
          }}
        />
        <Box
          component="span"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {buttonLabel}
        </Box>
        <KeyboardArrowDownIcon sx={{ fontSize: 16, color: 'text.secondary', ml: -0.25, flexShrink: 0 }} />
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 270,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        <MenuItem
          onClick={handleToggleAll}
          dense
          sx={{ py: 0.75, px: 1.5, display: 'flex', justifyContent: 'space-between', gap: 1.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              size="small"
              checked={isAllSelected}
              indeterminate={!isAllSelected && selectedAccountIds.length > 0}
              sx={{ p: 0.25 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
              All Checking Accounts
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {usdCompact.format(totalCheckingBalance)}
          </Typography>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        {checkingAccounts.map((acc) => {
          const accId = acc.id!;
          const isChecked = isAllSelected || selectedAccountIds.includes(accId);
          const isOnlyThis = !isAllSelected && selectedAccountIds.length === 1 && selectedAccountIds[0] === accId;

          return (
            <MenuItem
              key={accId}
              onClick={() => handleToggleAccount(accId)}
              dense
              sx={{
                py: 0.75,
                px: 1.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                <Checkbox size="small" checked={isChecked} sx={{ p: 0.25 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: isChecked ? 600 : 500, fontSize: '0.8125rem' }}
                  >
                    {formatShortAccountName(acc)}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {usdCompact.format(acc.currentBalance || 0)}
                  </Typography>
                </Box>
              </Stack>

              <Button
                size="small"
                variant={isOnlyThis ? 'contained' : 'outlined'}
                color={isOnlyThis ? 'primary' : 'inherit'}
                onClick={(e) => handleSelectOnly(e, accId)}
                sx={{
                  minWidth: 0,
                  height: 22,
                  px: 0.85,
                  py: 0,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  borderColor: 'divider',
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              >
                Only
              </Button>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};
