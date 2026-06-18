import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Divider,
  Switch,
  FormControlLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ScienceIcon from '@mui/icons-material/Science';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { db } from '../db';
import { seedDemoData, clearDemoData, hasDemoData, clearImportedData } from '../demoData';
import { useFilters } from '../store';
import { useChatStore } from '../chatStore';
import { DEMO_ONLY_BUILD } from '../env';

export default function Settings() {
  const demoMode = useFilters((s) => s.demoMode);
  const setDemoMode = useFilters((s) => s.setDemoMode);

  // Custom confirmation dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmType, setConfirmType] = useState<'clearDemo' | 'deactivateLicense' | 'clearImported' | null>(null);

  const [clearImportedBusy, setClearImportedBusy] = useState(false);
  const [clearImportedMsg, setClearImportedMsg] = useState<string | null>(null);

  const hasImportedData = useLiveQuery(
    async () => {
      const count = await db.transactions.where('source').notEqual('demo').count();
      return count > 0;
    },
    []
  );

  // License state
  const licenseSetting = useLiveQuery(() => db.settings.get('license'), []);
  const license = licenseSetting?.value as { active: boolean; key: string } | undefined;
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const onActivateLicense = async () => {
    setLicenseError(null);
    if (licenseKey.trim().toUpperCase() === 'PRO-123') {
      await db.settings.put({ key: 'license', value: { active: true, key: licenseKey.trim().toUpperCase() } });
      setLicenseKey('');
    } else {
      setLicenseError("Invalid license key. For testing, try 'PRO-123'.");
    }
  };

  const onDeactivateLicense = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setConfirmTitle('Remove License Key');
    setConfirmMessage('Are you sure you want to remove the license key? Premium features will be disabled.');
    setConfirmType('deactivateLicense');
    setConfirmOpen(true);
  };

  const { checkAIStatus } = useChatStore();

  useEffect(() => {
    checkAIStatus();
  }, [checkAIStatus]);

  // Demo data state
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  useEffect(() => {
    hasDemoData().then(setDemoLoaded);
  }, [demoMsg]);

  const onLoadDemo = async () => {
    setDemoBusy(true);
    setDemoMsg(null);
    try {
      const r = await seedDemoData();
      setDemoMsg(
        r.alreadyPresent
          ? 'Demo data already present. Nothing added.'
          : `Added ${r.added} demo transactions across 3 demo accounts`
      );
    } catch (e) {
      setDemoMsg(`Error: ${(e as Error).message}`);
    } finally {
      setDemoBusy(false);
    }
  };

  const executeClearDemo = async () => {
    setDemoBusy(true);
    try {
      const r = await clearDemoData();
      setDemoMode(false);
      setDemoMsg(
        `Removed ${r.removedTransactions} demo transactions and ${r.removedAccounts} demo accounts`
      );
    } catch (e) {
      setDemoMsg(`Error: ${(e as Error).message}`);
    } finally {
      setDemoBusy(false);
    }
  };

  const onClearDemo = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const skipConfirm = new URLSearchParams(window.location.search).get('noconfirm') === 'true';
    if (skipConfirm) {
      await executeClearDemo();
    } else {
      setConfirmTitle('Clear Demo Data');
      setConfirmMessage('Remove all demo accounts and demo transactions? Your real data is untouched.');
      setConfirmType('clearDemo');
      setConfirmOpen(true);
    }
  };

  const executeClearImported = async () => {
    setClearImportedBusy(true);
    setClearImportedMsg(null);
    try {
      const r = await clearImportedData();
      setClearImportedMsg(
        `Successfully removed ${r.removedTransactions} imported transactions and ${r.removedAccounts} imported accounts.`
      );
    } catch (e) {
      setClearImportedMsg(`Error: ${(e as Error).message}`);
    } finally {
      setClearImportedBusy(false);
    }
  };

  const onClearImported = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setConfirmTitle('Clear All Imported Data');
    setConfirmMessage('Are you sure you want to delete all transactions, accounts, and batch history you imported? This will not affect the Demo data or your customization rules.');
    setConfirmType('clearImported');
    setConfirmOpen(true);
  };


  return (
    <Stack spacing={3}>
      <Typography variant="h5">Settings</Typography>

      {DEMO_ONLY_BUILD && (
        <Alert severity="info">
          You're viewing the embedded demo build. Demo data is preloaded,
          demo mode is forced on, and destructive controls (clear, disconnect)
          are hidden. Visit the GitHub repo to run the full app locally.
        </Alert>
      )}



      {!DEMO_ONLY_BUILD && (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <VpnKeyIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Strictly Spending Pro
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Unlock advanced features like Local AI categorization, native Watch Folders, and infinite history with a one-time license key purchase.
            </Typography>
          </Box>
          
          {license?.active ? (
            <Stack spacing={3}>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Chip label="Pro Active" color="success" />
                <Typography variant="body2" color="text.secondary">
                  License Key: {license.key.replace(/.(?=.{4})/g, '*')}
                </Typography>
                <Button size="small" color="error" onClick={onDeactivateLicense}>
                  Deactivate
                </Button>
              </Stack>
              <Divider />
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Box component="span" sx={{ fontWeight: 900, color: 'primary.main', mr: 0.5, fontSize: 13, textShadow: '0 0 0.5px currentColor' }}>AI</Box>
                  <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                    Local AI Configuration
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Configure, download, select, and test offline models powered by Ollama on the dedicated local model management page.
                </Typography>
                <Button 
                  variant="outlined" 
                  component={NavLink}
                  to="/local-model"
                >
                  <Box component="span" sx={{ fontWeight: 900, mr: 0.75, textShadow: '0 0 0.5px currentColor' }}>AI</Box>
                  Manage Local Model
                </Button>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  label="License Key"
                  placeholder="PRO-..."
                  value={licenseKey}
                  onChange={e => setLicenseKey(e.target.value)}
                  sx={{ width: 280 }}
                />
                <Button variant="contained" onClick={onActivateLicense} disabled={!licenseKey.trim()}>
                  Activate
                </Button>
              </Stack>
              {licenseError && <Alert severity="error">{licenseError}</Alert>}
            </Stack>
          )}
        </Stack>
      </Paper>
      )}

      {!DEMO_ONLY_BUILD && (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScienceIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Demo data
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Adds 3 sample accounts with ~250 fake transactions spanning Jan
              through the current month. Useful for exploring features
              without your real data, screenshots, or sharing the app
              without exposing personal finances. Your real accounts are
              never touched. Demo accounts are clearly labelled with{' '}
              <code>Demo:</code> prefixes.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<ScienceIcon />}
              onClick={onLoadDemo}
              disabled={demoBusy || demoLoaded}
            >
              {demoLoaded ? 'Demo data loaded' : 'Load demo data'}
            </Button>
            <Button
              startIcon={<DeleteIcon />}
              onClick={onClearDemo}
              color="error"
              disabled={demoBusy || !demoLoaded}
            >
              Clear demo data
            </Button>
          </Stack>

          <Divider />

          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <VisibilityIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                Demo mode
              </Typography>
              {demoMode && (
                <Chip label="On" size="small" color="warning" />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Hides your real accounts and transactions across every view
              (Dashboard, Budget, Transactions) and shows only the{' '}
              <code>Demo:</code> data. Your real data stays on disk; turn this
              off to see it again. Handy for screenshots, demos, and
              share-screen moments.
            </Typography>
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={demoMode}
                    onChange={(e) => setDemoMode(e.target.checked)}
                    disabled={!demoLoaded && !demoMode}
                  />
                }
                label={
                  <Typography variant="body2">
                    {demoMode
                      ? 'Showing demo data only (real data hidden)'
                      : demoLoaded
                      ? 'Showing real data (toggle on to hide it)'
                      : 'Load demo data first to enable'}
                  </Typography>
                }
              />
            </Box>
          </Box>

          {demoMsg && (
            <Alert
              severity={
                demoMsg.startsWith('Error') ? 'error' : 'success'
              }
              onClose={() => setDemoMsg(null)}
            >
              {demoMsg}
            </Alert>
          )}
        </Stack>
      </Paper>
      )}

      {!DEMO_ONLY_BUILD && (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <DeleteIcon fontSize="small" color="error" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, color: 'error.main' }}>
                Imported data
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Removes all transactions, accounts, and batch history you imported. 
              This will not affect demo data, default categories, or customization rules.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onClearImported}
              disabled={clearImportedBusy || !hasImportedData}
            >
              Clear all imported data
            </Button>
          </Stack>

          {clearImportedMsg && (
            <Alert
              severity={clearImportedMsg.startsWith('Error') ? 'error' : 'success'}
              onClose={() => setClearImportedMsg(null)}
            >
              {clearImportedMsg}
            </Alert>
          )}
        </Stack>
      </Paper>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>{confirmTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirmMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setConfirmOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              setConfirmOpen(false);
              if (confirmType === 'clearDemo') {
                await executeClearDemo();
              } else if (confirmType === 'clearImported') {
                await executeClearImported();
              } else if (confirmType === 'deactivateLicense') {
                await db.settings.delete('license');
              }
              setConfirmType(null);
            }}
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
