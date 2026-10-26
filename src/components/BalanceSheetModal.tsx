import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Stack,
  Button,
  IconButton,
  Divider,
  Paper,
  Chip,
  Switch,
  FormControl,
  FormControlLabel,
  Select,
  MenuItem,
  LinearProgress,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  InputAdornment,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HomeIcon from '@mui/icons-material/Home';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BusinessIcon from '@mui/icons-material/Business';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import { useAccounts, useLoans } from '../hooks/queries';
import { useAddAccount, useUpdateAccount } from '../hooks/mutations';
import { usd } from '../lib';
import { isBusinessAccount, useFilters, type ProfileType } from '../stores/store';
import { subtleScrollSx } from '../styles';
import type { Account, AccountType } from '../types';

function getRadius(theme: { shape: { borderRadius: string | number } }, mult = 1): string {
  return `${Math.round(Number(theme.shape.borderRadius || 8) * mult)}px`;
}

interface BalanceSheetModalProps {
  open: boolean;
  onClose: () => void;
  defaultProfile?: ProfileType;
}

export default function BalanceSheetModal({
  open,
  onClose,
  defaultProfile = 'all',
}: BalanceSheetModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data: accountsAll = [] } = useAccounts();
  const { data: loans = [] } = useLoans();
  const demoMode = useFilters((s) => s.demoMode);
  const addAccountMutation = useAddAccount();
  const updateAccountMutation = useUpdateAccount();

  // Tap-to-edit / Add manual account dialog state
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [acctName, setAcctName] = useState('');
  const [acctInstitution, setAcctInstitution] = useState('');
  const [acctType, setAcctType] = useState<AccountType>('checking');
  const [acctBalance, setAcctBalance] = useState('0');

  const handleOpenEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setAcctName(acc.name);
    setAcctInstitution(acc.institution || 'Bank');
    setAcctType(acc.type);
    setAcctBalance(String(Math.abs(acc.currentBalance || 0)));
    setAccountDialogOpen(true);
  };

  const handleOpenAddAccount = () => {
    setEditingAccount(null);
    setAcctName('');
    setAcctInstitution('');
    setAcctType('checking');
    setAcctBalance('0');
    setAccountDialogOpen(true);
  };

  const handleSaveAccount = async () => {
    const trimmedName = acctName.trim();
    if (!trimmedName) return;
    const rawVal = Math.abs(parseFloat(acctBalance) || 0);
    const isLiability = acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage';
    const signedBalance = isLiability ? -rawVal : rawVal;
    const institutionVal = acctInstitution.trim() || 'Bank';

    if (editingAccount && editingAccount.id !== undefined) {
      await updateAccountMutation.mutateAsync({
        id: editingAccount.id,
        updates: {
          ...editingAccount,
          name: trimmedName,
          institution: institutionVal,
          type: acctType,
          currentBalance: signedBalance,
        },
      });
    } else {
      const newId = await addAccountMutation.mutateAsync({
        name: trimmedName,
        institution: institutionVal,
        type: acctType,
        source: demoMode ? 'demo' : 'custom',
        enabled: true,
        currentBalance: signedBalance,
      });
      if (!demoMode && typeof newId === 'number') {
        const currentEnabled = useFilters.getState().enabledAccountIds;
        const nextIds = Array.from(new Set([...currentEnabled, newId]));
        useFilters.getState().setEnabledAccounts(nextIds);
        useFilters.getState().setSeenAccounts(nextIds);
      }
    }
    window.dispatchEvent(new Event('db-update'));
    setAccountDialogOpen(false);
  };

  const accounts = useMemo(() => {
    return demoMode
      ? accountsAll.filter((a) => a.source === 'demo')
      : accountsAll.filter((a) => a.source !== 'demo');
  }, [accountsAll, demoMode]);

  const activeLoans = useMemo(() => loans.filter((l) => l.enabled !== false), [loans]);

  const [includeRealEstate, setIncludeRealEstate] = useState<boolean>(true);
  const [viewScope, setViewScope] = useState<ProfileType>(defaultProfile);

  // Property value from house loans
  const realEstatePropertyValue = useMemo(() => {
    const houseLoan = activeLoans.find((l) => l.type === 'house');
    return houseLoan ? (houseLoan.propertyValue ?? 0) : 0;
  }, [activeLoans]);

  // Filter accounts according to chosen scope
  const filteredAccounts = useMemo(() => {
    if (viewScope === 'business') {
      return accounts.filter((a) => isBusinessAccount(a));
    }
    if (viewScope === 'personal') {
      return accounts.filter((a) => !isBusinessAccount(a));
    }
    return accounts;
  }, [accounts, viewScope]);

  const businessLabel = useMemo(
    () => (accounts.some((a) => /webtime/i.test(a.name || '')) ? 'WEBTIME LLC' : 'Business'),
    [accounts]
  );

  // Asset breakdowns
  const cashAccounts = useMemo(() => {
    return filteredAccounts.filter(
      (a) => a.type === 'checking' || a.type === 'savings'
    );
  }, [filteredAccounts]);

  const investmentAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.type === 'investment');
  }, [filteredAccounts]);

  const totalCash = useMemo(() => {
    return cashAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  }, [cashAccounts]);

  const totalInvestments = useMemo(() => {
    return investmentAccounts.reduce(
      (sum, a) => sum + (a.currentBalance || 0),
      0
    );
  }, [investmentAccounts]);

  const propertyValueIncluded =
    includeRealEstate && viewScope !== 'business' ? realEstatePropertyValue : 0;

  const totalAssets = totalCash + totalInvestments + propertyValueIncluded;
  const liquidAssets = totalCash + totalInvestments;

  // Liabilities breakdowns
  const creditAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.type === 'credit');
  }, [filteredAccounts]);

  const autoLoanAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.type === 'loan');
  }, [filteredAccounts]);

  const mortgageAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.type === 'mortgage');
  }, [filteredAccounts]);

  const totalCreditDebt = useMemo(() => {
    return creditAccounts.reduce(
      (sum, a) => sum + Math.abs(Math.min(0, a.currentBalance || 0)),
      0
    );
  }, [creditAccounts]);

  const totalAutoDebt = useMemo(() => {
    const acctDebt = autoLoanAccounts.reduce(
      (sum, a) => sum + Math.abs(Math.min(0, a.currentBalance || 0)),
      0
    );
    if (acctDebt > 0 || viewScope === 'business') return acctDebt;
    return activeLoans
      .filter((l) => l.type === 'car' || l.type === 'student')
      .reduce((sum, l) => sum + Math.max(0, l.principal || 0), 0);
  }, [autoLoanAccounts, activeLoans, viewScope]);

  const totalMortgageDebt = useMemo(() => {
    const acctDebt = mortgageAccounts.reduce(
      (sum, a) => sum + Math.abs(Math.min(0, a.currentBalance || 0)),
      0
    );
    if (acctDebt > 0 || viewScope === 'business') return acctDebt;
    return activeLoans
      .filter((l) => l.type === 'house')
      .reduce((sum, l) => sum + Math.max(0, l.principal || 0), 0);
  }, [mortgageAccounts, activeLoans, viewScope]);

  const totalLiabilities = totalCreditDebt + totalAutoDebt + totalMortgageDebt;

  // Net Worth
  const netWorthTotal = totalAssets - totalLiabilities;
  const liquidNetWorth = liquidAssets - totalLiabilities;
  const homeEquity = Math.max(0, realEstatePropertyValue - totalMortgageDebt);
  const debtToAssetRatio =
    totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        paper: {
          sx: {
            borderRadius: (theme) => (isMobile ? 0 : getRadius(theme, 1.5)),
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              display: 'flex',
              p: 0.75,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) =>
                alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.2 : 0.1
                ),
              color: 'primary.main',
            }}
          >
            <AccountBalanceIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Balance Sheet & Net Worth
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Consolidated snapshot of assets, debt, and equity
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small" aria-label="close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: { xs: 1.75, sm: 3 },
          pt: { xs: '16px !important', sm: '24px !important' },
          overflowX: 'hidden',
          ...subtleScrollSx,
        }}
      >
        {/* Controls Bar: Profile Switcher & Real Estate Toggle */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1.25, sm: 2 }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          sx={{ mb: { xs: 2, sm: 3 } }}
        >
          {/* Mobile (xs): Clean Select dropdown instead of 3-button segmented control */}
          <FormControl size="small" fullWidth sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <Select
              variant="outlined"
              value={viewScope}
              onChange={(e) => setViewScope(e.target.value as ProfileType)}
              sx={{
                height: 42,
                fontWeight: 600,
                fontSize: '0.84rem',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
            >
              <MenuItem value="all">All Accounts</MenuItem>
              <MenuItem value="personal">Personal Profile</MenuItem>
              <MenuItem value="business">
                {businessLabel === 'Business' ? 'Business Profile' : `${businessLabel} (Business)`}
              </MenuItem>
            </Select>
          </FormControl>

          {/* Tablet & Desktop (sm+): Segmented ToggleButtonGroup */}
          <ToggleButtonGroup
            value={viewScope}
            exclusive
            onChange={(_, val) => val && setViewScope(val)}
            size="small"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              '& .MuiToggleButtonGroup-grouped': {
                borderColor: 'divider',
              },
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.8rem',
                px: 1.75,
                py: 0.5,
                whiteSpace: 'nowrap',
                borderColor: 'divider',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: (theme) =>
                    alpha(
                      theme.palette.primary.main,
                      theme.palette.mode === 'dark' ? 0.2 : 0.1
                    ),
                  color: 'primary.main',
                  fontWeight: 600,
                  borderColor: 'divider',
                  '&:hover': {
                    bgcolor: (theme) =>
                      alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'dark' ? 0.28 : 0.16
                      ),
                  },
                },
              },
            }}
          >
            <ToggleButton value="all">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <AllInclusiveIcon fontSize="small" />
                <span>All Accounts</span>
              </Stack>
            </ToggleButton>
            <ToggleButton value="personal">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <PersonOutlineIcon fontSize="small" />
                <span>Personal</span>
              </Stack>
            </ToggleButton>
            <ToggleButton value="business">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <BusinessIcon fontSize="small" />
                <span>{businessLabel}</span>
              </Stack>
            </ToggleButton>
          </ToggleButtonGroup>

          {viewScope !== 'business' && (realEstatePropertyValue > 0 || totalMortgageDebt > 0) && (
            <FormControlLabel
              control={
                <Switch
                  checked={includeRealEstate}
                  onChange={(e) => setIncludeRealEstate(e.target.checked)}
                  size="small"
                  color="primary"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                  Include Real Estate ({usd.format(realEstatePropertyValue)})
                </Typography>
              }
            />
          )}
        </Stack>

        {/* Hero Card: Net Worth Overview */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            mb: { xs: 2, sm: 3 },
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            bgcolor: (theme) =>
              alpha(
                theme.palette.primary.main,
                theme.palette.mode === 'dark' ? 0.05 : 0.03
              ),
            border: '1px solid',
            borderColor: 'divider',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            spacing={{ xs: 1.5, sm: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1, fontSize: { xs: '0.68rem', sm: '0.75rem' }, lineHeight: 1.3 }}>
                {viewScope === 'business'
                  ? `${businessLabel} Net Position`
                  : includeRealEstate && realEstatePropertyValue > 0
                  ? 'Total Estimated Net Worth'
                  : 'Liquid Financial Net Worth'}
              </Typography>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.85rem', sm: '2.5rem', md: '3rem' },
                  lineHeight: 1.15,
                  color: netWorthTotal >= 0 ? 'success.main' : 'error.main',
                  letterSpacing: '-0.02em',
                }}
              >
                {netWorthTotal >= 0
                  ? `+${usd.format(netWorthTotal)}`
                  : usd.format(netWorthTotal)}
              </Typography>
              {includeRealEstate && viewScope !== 'business' && realEstatePropertyValue > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                  Liquid Net Worth (excl. property): <strong>{usd.format(liquidNetWorth)}</strong>
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={1.25} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              <Paper
                variant="outlined"
                sx={{
                  flex: { xs: 1, sm: 'initial' },
                  p: { xs: 1.25, sm: 1.5 },
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  minWidth: { xs: 0, sm: 120 },
                  bgcolor: (theme) =>
                    alpha(
                      theme.palette.success.main,
                      theme.palette.mode === 'dark' ? 0.12 : 0.06
                    ),
                  borderColor: 'success.main',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  TOTAL ASSETS
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                  {usd.format(totalAssets)}
                </Typography>
              </Paper>

              <Paper
                variant="outlined"
                sx={{
                  flex: { xs: 1, sm: 'initial' },
                  p: { xs: 1.25, sm: 1.5 },
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  minWidth: { xs: 0, sm: 120 },
                  bgcolor: (theme) =>
                    alpha(
                      theme.palette.error.main,
                      theme.palette.mode === 'dark' ? 0.12 : 0.06
                    ),
                  borderColor: 'error.main',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  LIABILITIES
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                  -{usd.format(totalLiabilities)}
                </Typography>
              </Paper>
            </Stack>
          </Stack>

          {/* Visual Equity / Debt ratio bar */}
          {totalAssets > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Assets vs. Debt Ratio
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {debtToAssetRatio.toFixed(1)}% Debt / {(100 - debtToAssetRatio).toFixed(1)}% Equity
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, 100 - debtToAssetRatio))}
                sx={{
                  height: 8,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  bgcolor: (theme) => alpha(theme.palette.error.main, 0.2),
                  '& .MuiLinearProgress-bar': {
                    bgcolor: 'success.main',
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  },
                }}
              />
            </Box>
          )}
        </Paper>

        {/* Detailed Breakdown: Assets vs Liabilities Columns */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5}>
          {/* ASSETS COLUMN */}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2.5,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              borderColor: 'divider',
              borderTop: '4px solid',
              borderTopColor: 'success.main',
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <SavingsIcon color="success" fontSize="small" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Assets
                </Typography>
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'success.main' }}>
                {usd.format(totalAssets)}
              </Typography>
            </Stack>

            <Stack spacing={2}>
              {/* Cash & Savings Section */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    CASH & SAVINGS ({cashAccounts.length})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {usd.format(totalCash)}
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {cashAccounts.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No cash accounts in this view
                    </Typography>
                  ) : (
                    cashAccounts.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        onClick={() => handleOpenEditAccount(a)}
                        title="Tap to edit account balance or type"
                        sx={{
                          py: 0.75,
                          px: 1,
                          borderRadius: (theme) => getRadius(theme, 0.75),
                          bgcolor: 'action.hover',
                          minWidth: 0,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <AccountBalanceIcon fontSize="small" color="action" />
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanAccountName(a.name)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                          {usd.format(a.currentBalance || 0)}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>

              <Divider />

              {/* Investments Section */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    INVESTMENTS & RETIREMENT ({investmentAccounts.length})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {usd.format(totalInvestments)}
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {investmentAccounts.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No investment accounts in this view
                    </Typography>
                  ) : (
                    investmentAccounts.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        onClick={() => handleOpenEditAccount(a)}
                        title="Tap to edit account balance or type"
                        sx={{
                          py: 0.75,
                          px: 1,
                          borderRadius: (theme) => getRadius(theme, 0.75),
                          bgcolor: 'action.hover',
                          minWidth: 0,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <TrendingUpIcon fontSize="small" color="primary" />
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanAccountName(a.name)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                          {usd.format(a.currentBalance || 0)}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>

              {/* Real Estate Section */}
              {includeRealEstate && viewScope !== 'business' && (realEstatePropertyValue > 0 || totalMortgageDebt > 0) && (
                <>
                  <Divider />
                  <Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                        REAL ESTATE / PROPERTY
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {usd.format(realEstatePropertyValue)}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        py: 0.75,
                        px: 1,
                        borderRadius: (theme) => getRadius(theme, 0.75),
                        bgcolor: 'action.hover',
                        minWidth: 0,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        <HomeIcon fontSize="small" color="success" />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Primary Residence
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Equity: {usd.format(homeEquity)}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                        {usd.format(realEstatePropertyValue)}
                      </Typography>
                    </Stack>
                  </Box>
                </>
              )}
            </Stack>
          </Paper>

          {/* LIABILITIES COLUMN */}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2.5,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              borderColor: 'divider',
              borderTop: '4px solid',
              borderTopColor: 'error.main',
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <CreditCardIcon color="error" fontSize="small" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Liabilities & Debt
                </Typography>
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'error.main' }}>
                -{usd.format(totalLiabilities)}
              </Typography>
            </Stack>

            <Stack spacing={2}>
              {/* Credit Cards Section */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    CREDIT CARDS ({creditAccounts.length})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                    -{usd.format(totalCreditDebt)}
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {creditAccounts.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No credit card balances
                    </Typography>
                  ) : (
                    creditAccounts.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        onClick={() => handleOpenEditAccount(a)}
                        title="Tap to edit account balance or type"
                        sx={{
                          py: 0.75,
                          px: 1,
                          borderRadius: (theme) => getRadius(theme, 0.75),
                          bgcolor: 'action.hover',
                          minWidth: 0,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <CreditCardIcon fontSize="small" color="action" />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cleanAccountName(a.name)}
                            </Typography>
                            {isBusinessAccount(a) && (
                              <Chip
                                label={businessLabel}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{
                                  height: 16,
                                  fontSize: 9,
                                  mt: 0.2,
                                  borderRadius: (theme) => getRadius(theme, 0.5),
                                }}
                              />
                            )}
                          </Box>
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main', flexShrink: 0 }}>
                          -{usd.format(Math.abs(Math.min(0, a.currentBalance || 0)))}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>

              <Divider />

              {/* Auto & Student Loans Section */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    LOANS ({autoLoanAccounts.length})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                    -{usd.format(totalAutoDebt)}
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {autoLoanAccounts.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No loans in this view
                    </Typography>
                  ) : (
                    autoLoanAccounts.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        onClick={() => handleOpenEditAccount(a)}
                        title="Tap to edit account balance or type"
                        sx={{
                          py: 0.75,
                          px: 1,
                          borderRadius: (theme) => getRadius(theme, 0.75),
                          bgcolor: 'action.hover',
                          minWidth: 0,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <DirectionsCarIcon fontSize="small" color="action" />
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanAccountName(a.name)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main', flexShrink: 0 }}>
                          -{usd.format(Math.abs(Math.min(0, a.currentBalance || 0)))}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>

              <Divider />

              {/* Mortgages Section */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    MORTGAGES ({mortgageAccounts.length})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
                    -{usd.format(totalMortgageDebt)}
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {mortgageAccounts.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No mortgages in this view
                    </Typography>
                  ) : (
                    mortgageAccounts.map((a) => (
                      <Stack
                        key={a.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        onClick={() => handleOpenEditAccount(a)}
                        title="Tap to edit account balance or type"
                        sx={{
                          py: 0.75,
                          px: 1,
                          borderRadius: (theme) => getRadius(theme, 0.75),
                          bgcolor: 'action.hover',
                          minWidth: 0,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <HomeIcon fontSize="small" color="action" />
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanAccountName(a.name)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main', flexShrink: 0 }}>
                          -{usd.format(Math.abs(Math.min(0, a.currentBalance || 0)))}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Stack>

        {/* Footer Insights */}
        {viewScope !== 'business' && realEstatePropertyValue > 0 && (
          <Paper
            variant="outlined"
            sx={{
              mt: 3,
              p: 2,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: (theme) =>
                alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.08 : 0.04
                ),
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <InfoOutlinedIcon color="primary" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              <strong>Equity Insight:</strong> Your home is valued at {usd.format(realEstatePropertyValue)} with a {usd.format(totalMortgageDebt)} mortgage balance, giving you <strong>{usd.format(homeEquity)} in home equity</strong> ({((homeEquity / (realEstatePropertyValue || 1)) * 100).toFixed(1)}%).
            </Typography>
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between' }}>
        <Button
          onClick={handleOpenAddAccount}
          variant="outlined"
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
        >
          Add Account
        </Button>
        <Button
          onClick={onClose}
          variant="contained"
          color="primary"
          sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
        >
          Done
        </Button>
      </DialogActions>

      {/* Edit / Add Manual Account Sub-Dialog */}
      <Dialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          {editingAccount ? 'Edit Account' : 'Add Account'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Account Name"
              placeholder="e.g. Fidelity 401(k), Chase Checking"
              size="small"
              fullWidth
              value={acctName}
              onChange={(e) => setAcctName(e.target.value)}
              autoFocus
            />
            <FormControl size="small" fullWidth>
              <Select
                value={acctType}
                onChange={(e) => setAcctType(e.target.value as AccountType)}
              >
                <MenuItem value="checking">Checking / Cash Management</MenuItem>
                <MenuItem value="savings">Savings / HYSA / CD</MenuItem>
                <MenuItem value="investment">Investment / Retirement (401k, IRA)</MenuItem>
                <MenuItem value="credit">Credit Card</MenuItem>
                <MenuItem value="loan">Loan (Auto / Student / Personal)</MenuItem>
                <MenuItem value="mortgage">Mortgage</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Institution"
              placeholder="e.g. Fidelity, Chase, Vanguard"
              size="small"
              fullWidth
              value={acctInstitution}
              onChange={(e) => setAcctInstitution(e.target.value)}
            />
            <TextField
              label={
                acctType === 'credit' || acctType === 'loan' || acctType === 'mortgage'
                  ? 'Current Balance Owed ($)'
                  : 'Current Balance ($)'
              }
              type="number"
              size="small"
              fullWidth
              value={acctBalance}
              onChange={(e) => setAcctBalance(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAccountDialogOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAccount}
            disabled={!acctName.trim()}
            variant="contained"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

function cleanAccountName(name: string): string {
  return name
    .replace('Bank of America', 'BoA')
    .replace('Business Adv Customized Cash Rewards', 'Business Adv')
    .replace('CORP Account - Business Adv', 'WEBTIME CORP')
    .replace('Customized Cash Rewards', 'Customized Cash')
    .replace('Adv Plus Banking-', 'Adv Plus')
    .replace(/(\b\d{4})\s*\(\1\)/g, '$1');
}
