import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Typography,
  Stack,
  Box,
  Button,
  Chip,
  Alert,
  Divider,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  Tooltip,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

import { useNavigate } from 'react-router-dom';
import { useSimpleFinStore } from '../stores/simplefinStore';
import { SimpleFinAccountMapperDialog } from './SimpleFinAccountMapperDialog';
import { queryClient } from '../queryClient';
import { api } from '../api';
import { useFilters } from '../stores/store';
import { UNIFORM_TOOLBAR_BUTTON_SX } from './AccountFilterDropdown';
import {
  getNotificationPermissionState,
  requestSyncNotificationPermission,
} from '../domain/syncImpactNotification';

export const SimpleFinBankSyncCard: React.FC = () => {
  const navigate = useNavigate();
  const {
    config,
    accounts,
    isLoading,
    isSyncing,
    error,
    successMessage,
    warnings,
    fetchConfig,
    claimToken,
    fetchAccounts,
    syncTransactions,
    disconnect,
    clearMessages,
  } = useSimpleFinStore();

  const [tokenInput, setTokenInput] = useState('');
  const [mapperOpen, setMapperOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermissionState());

  useEffect(() => {
    fetchConfig();
    fetchAccounts();
  }, [fetchConfig, fetchAccounts]);

  const isConnected = Boolean(config?.access_url && config.access_url.trim().length > 0);
  const mappedCount = (accounts || []).filter((a) => a.strictly_account_id !== null).length;
  const isPaymentRequired = error?.toLowerCase().includes('payment required');

  const activateRealAccountsAndTurnOffDemo = async () => {
    useFilters.getState().setDemoMode(false);
    const allAccounts = await api.getAccounts();
    const nonDemo = allAccounts.filter((a) => a.source !== 'demo' && a.id !== undefined);
    if (nonDemo.length > 0) {
      const ids = nonDemo.map((a) => a.id!);
      const idSet = new Set(ids);
      const currentEnabled = useFilters.getState().enabledAccountIds.filter((id) => idSet.has(id));
      const newIds = currentEnabled.length > 0 ? Array.from(new Set([...currentEnabled, ...ids])) : ids;
      useFilters.getState().setEnabledAccounts(newIds);
      useFilters.getState().setSeenAccounts(ids);
    }
    await queryClient.invalidateQueries();
    window.dispatchEvent(new Event('db-update'));
  };

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    try {
      await claimToken(tokenInput.trim());
      setTokenInput('');
      await activateRealAccountsAndTurnOffDemo();
    } catch {
      // Error handled by store
    }
  };

  const handleSync = async (startDate?: string) => {
    clearMessages();
    try {
      const resp = await syncTransactions(startDate);
      await activateRealAccountsAndTurnOffDemo();
      if (resp.added > 0) {
        window.dispatchEvent(new CustomEvent('show-sync-impact', { detail: { added: resp.added } }));
      }
    } catch {
      // Error handled by store
    }
  };

  const handleRefreshAccounts = async () => {
    clearMessages();
    await fetchAccounts(true);
    await activateRealAccountsAndTurnOffDemo();
  };

  const handleConfirmDisconnect = async () => {
    setDisconnectDialogOpen(false);
    await disconnect();
  };

  return (
    <>
      <Card sx={{ border: '1px solid', borderColor: 'divider', boxShadow: 1, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
        <CardHeader
          avatar={<AccountBalanceIcon color="primary" sx={{ fontSize: 32 }} />}
          title={
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h6" sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>Bank Sync (SimpleFIN Bridge)</Typography>
              <Chip
                label={isConnected ? 'Connected' : 'Not Connected'}
                color={isConnected ? 'success' : 'default'}
                size="small"
                variant={isConnected ? 'filled' : 'outlined'}
              />
              {isConnected && (
                <Chip
                  label={`${mappedCount} / ${accounts.length} Accounts Mapped`}
                  color={mappedCount > 0 ? 'primary' : 'warning'}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
          }
          subheader="Daily bank sync for Bank of America, Truist, and 10,000+ institutions via SimpleFIN Bridge ($15/year flat)"
        />

        <Divider />

        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            {/* Alerts */}
            {successMessage && (
              <Alert
                severity="success"
                onClose={clearMessages}
                action={
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button color="inherit" size="small" variant="outlined" onClick={() => navigate('/')} sx={UNIFORM_TOOLBAR_BUTTON_SX}>
                      View Dashboard
                    </Button>
                    <Button color="inherit" size="small" variant="contained" onClick={() => navigate('/sort')} sx={UNIFORM_TOOLBAR_BUTTON_SX}>
                      Sort Transactions
                    </Button>
                  </Stack>
                }
              >
                {successMessage}
              </Alert>
            )}

            {error && (
              <Alert
                severity={isPaymentRequired ? 'warning' : 'error'}
                onClose={clearMessages}
                action={
                  isPaymentRequired ? (
                    <Button
                      color="inherit"
                      size="small"
                      endIcon={<OpenInNewIcon />}
                      href="https://beta-bridge.simplefin.org"
                      target="_blank"
                      sx={UNIFORM_TOOLBAR_BUTTON_SX}
                    >
                      Open SimpleFIN
                    </Button>
                  ) : undefined
                }
              >
                {error}
              </Alert>
            )}

            {warnings && warnings.length > 0 && (
              <Stack spacing={1}>
                {warnings.map((w, idx) => (
                  <Alert
                    key={idx}
                    severity="warning"
                    onClose={clearMessages}
                    action={
                      w.toLowerCase().includes('auth') ? (
                        <Button
                          color="inherit"
                          size="small"
                          endIcon={<OpenInNewIcon />}
                          href="https://beta-bridge.simplefin.org"
                          target="_blank"
                          sx={UNIFORM_TOOLBAR_BUTTON_SX}
                        >
                          SimpleFIN Login
                        </Button>
                      ) : undefined
                    }
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Bank Sync Notice:
                    </Typography>
                    <Typography variant="body2">{w}</Typography>
                    {w.toLowerCase().includes('auth') && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        Truist requires multi-factor authentication (MFA) to refresh recent charges. Log into SimpleFIN Bridge to complete verification.
                      </Typography>
                    )}
                  </Alert>
                ))}
              </Stack>
            )}

            {/* NOT CONNECTED STATE */}
            {!isConnected ? (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  SimpleFIN Bridge is a lightweight, privacy-respecting financial bridge with a transparent flat rate of <strong>$15/year</strong> (or $1.50/month). It connects seamlessly to Bank of America and Truist with no per-request fees.
                </Typography>

                <Box
                  sx={{
                    p: 2,
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    border: '1px dashed',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    How to get started:
                  </Typography>
                  <Typography variant="body2" component="div">
                    <ol style={{ paddingLeft: '1.2rem', margin: '0.4rem 0' }}>
                      <li>
                        Log in to{' '}
                        <Link href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener">
                          beta-bridge.simplefin.org
                        </Link>{' '}
                        and link your Bank of America and Truist accounts.
                      </li>
                      <li>Click <strong>"Create Access Token"</strong> / <strong>"Generate Setup Token"</strong>.</li>
                      <li>Paste the generated token into the box below and click <strong>Connect Bank Sync</strong>.</li>
                    </ol>
                  </Typography>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <TextField
                    fullWidth
                    type="password"
                    autoComplete="off"
                    label="SimpleFIN Setup Token (Base64 or Access URL)"
                    placeholder="aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS8..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    inputProps={{
                      autoComplete: 'new-password',
                      autoCorrect: 'off',
                      autoCapitalize: 'off',
                      spellCheck: false,
                    }}
                    size="small"
                    disabled={isLoading}
                  />
                  <Button
                    variant="contained"
                    onClick={handleConnect}
                    disabled={isLoading || !tokenInput.trim()}
                    sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, minWidth: { xs: '100%', sm: 190 } }}
                  >
                    {isLoading ? <CircularProgress size={20} color="inherit" /> : 'Connect Bank Sync'}
                  </Button>
                </Stack>
              </Stack>
            ) : (
              /* CONNECTED STATE */
              <Stack spacing={2.5}>
                {/* Status summary banner */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        CONNECTED SERVICE
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        SimpleFIN Bridge (MX Financial Data)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Last Synced:{' '}
                        {config.last_synced_at
                          ? new Date(config.last_synced_at).toLocaleString()
                          : 'Never'}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Tooltip title="Optimized sync: retrieves only new/updated transactions within a 14-day safety window to catch pending and settled charges quickly without downloading full history.">
                        <span>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={isSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                            onClick={() => handleSync()}
                            disabled={isSyncing || isLoading}
                            sx={UNIFORM_TOOLBAR_BUTTON_SX}
                          >
                            {isSyncing ? 'Syncing...' : 'Sync Recent (Optimized)'}
                          </Button>
                        </span>
                      </Tooltip>

                      <Tooltip title="Full historical sync: re-fetches full history across all connected accounts to ensure nothing was missed.">
                        <span>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<HistoryIcon />}
                            onClick={() => handleSync('0')}
                            disabled={isSyncing || isLoading}
                            sx={UNIFORM_TOOLBAR_BUTTON_SX}
                          >
                            Full Sync
                          </Button>
                        </span>
                      </Tooltip>

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SwapHorizIcon />}
                        onClick={() => setMapperOpen(true)}
                        disabled={isSyncing}
                        sx={UNIFORM_TOOLBAR_BUTTON_SX}
                      >
                        Map Accounts
                      </Button>

                      <Tooltip title="Refresh accounts from SimpleFIN">
                        <Button
                          variant="outlined"
                          size="small"
                          sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, minWidth: 36, px: 1 }}
                          onClick={handleRefreshAccounts}
                          disabled={isLoading || isSyncing}
                        >
                          <RefreshIcon fontSize="small" />
                        </Button>
                      </Tooltip>

                      <Tooltip title="Disconnect SimpleFIN">
                        <Button
                          color="error"
                          variant="outlined"
                          size="small"
                          sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, minWidth: 36, px: 1 }}
                          onClick={() => setDisconnectDialogOpen(true)}
                          disabled={isSyncing}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1.5}
                  >
                    <Box>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <NotificationsActiveIcon color="primary" sx={{ fontSize: 18 }} />
                        <Typography variant="body2" fontWeight={700}>
                          Daily Sync Spend Impact Digest
                        </Typography>
                        {notifPermission === 'granted' && (
                          <Chip
                            label="Alerts Active"
                            color="success"
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                          />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Auto-sync checks every 4h (SimpleFIN refreshes bank feeds daily) and shows your Month & Full-Year spend impact whenever new transactions arrive.
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      {notifPermission === 'default' && (
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<NotificationsActiveIcon />}
                          onClick={async () => {
                            const next = await requestSyncNotificationPermission();
                            setNotifPermission(next);
                          }}
                          sx={UNIFORM_TOOLBAR_BUTTON_SX}
                        >
                          Enable Browser Alerts
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<NotificationsActiveIcon />}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('show-sync-impact', { detail: { added: 0 } }));
                        }}
                        sx={UNIFORM_TOOLBAR_BUTTON_SX}
                      >
                        Preview Spend Impact
                      </Button>
                    </Stack>
                  </Stack>
                </Box>

                {/* Account list */}
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Discovered Bank Accounts ({accounts.length})
                  </Typography>

                  {accounts.length === 0 ? (
                    <Alert
                      severity="info"
                      icon={<WarningAmberIcon />}
                      action={
                        <Button color="inherit" size="small" onClick={handleRefreshAccounts}>
                          Refresh
                        </Button>
                      }
                    >
                      No accounts received yet. If you recently connected institutions on SimpleFIN or completed subscription, click Refresh.
                    </Alert>
                  ) : (
                    <Stack spacing={1}>
                      {accounts.map((acc) => {
                        const isMapped = acc.strictly_account_id !== null && acc.strictly_account_id !== undefined;
                        const pendingHoldDiff =
                          acc.balance !== null &&
                          acc.balance !== undefined &&
                          acc.available_balance !== null &&
                          acc.available_balance !== undefined &&
                          acc.balance >= 0 &&
                          acc.balance - acc.available_balance >= 0.01
                            ? acc.balance - acc.available_balance
                            : 0;
                        const bankPolledLabel = acc.balance_date
                          ? new Date(acc.balance_date * 1000).toLocaleString()
                          : null;

                        return (
                          <Box
                            key={acc.account_id}
                            sx={{
                              p: 1.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 1.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="body2" fontWeight={600}>
                                  {acc.name}
                                </Typography>
                                {acc.org_name && (
                                  <Chip label={acc.org_name} size="small" variant="outlined" />
                                )}
                                {pendingHoldDiff > 0 && (
                                  <Tooltip title="Your bank has reduced your Available Balance for pending debit/ACH holds, but has not yet released the itemized transactions to SimpleFIN Bridge. Some banks (including Bank of America via MX) only export transactions after nightly batch settlement.">
                                    <Chip
                                      label={`⏳ $${pendingHoldDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending at bank (awaiting settlement)`}
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                    />
                                  </Tooltip>
                                )}
                              </Stack>
                              <Stack
                                direction="row"
                                spacing={2}
                                alignItems="center"
                                flexWrap="wrap"
                                useFlexGap
                                sx={{ mt: 0.5 }}
                              >
                                {acc.balance !== null && acc.balance !== undefined && (
                                  <Typography variant="caption" color="text.secondary">
                                    Posted Balance:{' '}
                                    <strong>
                                      ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </strong>
                                  </Typography>
                                )}
                                {acc.available_balance !== null &&
                                  acc.available_balance !== undefined &&
                                  acc.available_balance !== acc.balance && (
                                    <Typography variant="caption" color="text.secondary">
                                      Available:{' '}
                                      <strong>
                                        ${acc.available_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </strong>
                                    </Typography>
                                  )}
                                {acc.latest_transaction_date && (
                                  <Typography variant="caption" color="text.secondary">
                                    Latest Posted Txn: <strong>{acc.latest_transaction_date}</strong>
                                  </Typography>
                                )}
                                {bankPolledLabel && (
                                  <Typography variant="caption" color="text.secondary">
                                    Bank Polled: {bankPolledLabel}
                                  </Typography>
                                )}
                              </Stack>
                            </Box>

                            <Chip
                              icon={isMapped ? <CheckCircleOutlineIcon /> : <WarningAmberIcon />}
                              label={isMapped ? 'Mapped' : 'Unmapped (Ignored)'}
                              color={isMapped ? 'success' : 'warning'}
                              size="small"
                              variant={isMapped ? 'filled' : 'outlined'}
                              onClick={() => setMapperOpen(true)}
                              clickable
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Account Mapper Dialog */}
      <SimpleFinAccountMapperDialog
        open={mapperOpen}
        onClose={() => setMapperOpen(false)}
        onSaved={fetchAccounts}
      />

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        open={disconnectDialogOpen}
        onClose={() => setDisconnectDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` } }}
      >
        <DialogTitle>Disconnect SimpleFIN Bridge?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to disconnect SimpleFIN Bridge? Existing imported transactions in Strictly Spending will be preserved, but automatic syncing will stop until you reconnect.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisconnectDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDisconnect}>
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
