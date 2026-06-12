import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  FormControlLabel,
  TextField,
  LinearProgress,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { db } from '../db';
import {
  isWatchFolderSupported,
  pickFolder,
  setConfig,
  clearConfig,
  checkPermission,
  requestPermission,
  scanFolder,
  type ScanResult,
} from '../watchFolder';
import { seedDemoData, clearDemoData, hasDemoData } from '../demoData';
import { useFilters } from '../store';
import { useChatStore } from '../chatStore';
import { DEMO_ONLY_BUILD } from '../env';
import type {
  PostImportAction,
  WatchFolderConfig,
} from '../types';

export default function Settings() {
  const demoMode = useFilters((s) => s.demoMode);
  const setDemoMode = useFilters((s) => s.setDemoMode);
  const supported = isWatchFolderSupported();
  const settings = useLiveQuery(
    () => db.settings.get('watchFolder'),
    []
  );
  const config = settings?.value as WatchFolderConfig | undefined;

  const [permission, setPermission] = useState<
    'granted' | 'prompt' | 'denied' | 'unknown'
  >('unknown');
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

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

  const onDeactivateLicense = async () => {
    if (!confirm('Remove license key? Premium features will be disabled.')) return;
    await db.settings.delete('license');
  };

  const {
    aiLoaded,
    aiStatus,
    aiProgress,
    aiProgressPercent,
    initializeAI,
    checkAIStatus,
  } = useChatStore();

  useEffect(() => {
    checkAIStatus();
  }, [checkAIStatus]);

  const onInitializeAI = async () => {
    await initializeAI();
  };

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

  const onClearDemo = async () => {
    if (
      !confirm(
        'Remove all demo accounts and demo transactions? Your real data is untouched.'
      )
    )
      return;
    setDemoBusy(true);
    try {
      const r = await clearDemoData();
      setDemoMsg(
        `Removed ${r.removedTransactions} demo transactions and ${r.removedAccounts} demo accounts`
      );
    } catch (e) {
      setDemoMsg(`Error: ${(e as Error).message}`);
    } finally {
      setDemoBusy(false);
    }
  };

  // When config changes, query current permission state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!config?.handle) {
        setPermission('unknown');
        return;
      }
      try {
        const state = await checkPermission(config.handle);
        if (!cancelled) setPermission(state);
      } catch {
        if (!cancelled) setPermission('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config?.handle]);

  const onConnect = async () => {
    setError(null);
    try {
      const { handle, name } = await pickFolder();
      const newConfig: WatchFolderConfig = {
        handle,
        name,
        connectedAt: new Date().toISOString(),
        postImportAction: config?.postImportAction ?? 'move',
        autoImport: config?.autoImport ?? false,
      };
      await setConfig(newConfig);
      setPermission('granted');
    } catch (e) {
      // User cancelled picker → silent
      const msg = (e as Error).message;
      if (!/abort/i.test(msg)) setError(msg);
    }
  };

  const onDisconnect = async () => {
    if (!confirm('Disconnect the watch folder?')) return;
    await clearConfig();
    setScan(null);
  };

  const onRequestPerm = async () => {
    if (!config?.handle) return;
    try {
      const state = await requestPermission(config.handle);
      setPermission(state);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onScan = useCallback(async () => {
    if (!config?.handle) return;
    setScanning(true);
    setError(null);
    try {
      // Permission may have lapsed since last load
      let state = await checkPermission(config.handle);
      if (state === 'prompt') {
        state = await requestPermission(config.handle);
      }
      setPermission(state);
      if (state !== 'granted') {
        setError('Folder access not granted');
        return;
      }
      const result = await scanFolder(config.handle);
      setScan(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [config?.handle]);

  const updateOption = async (patch: Partial<WatchFolderConfig>) => {
    if (!config) return;
    await setConfig({ ...config, ...patch });
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
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Watch folder
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Point Strictly Spending at a folder on your machine. New CSVs
              you drop in (or in any subfolder, up to 5 levels deep) are
              auto-detected and offered for import, with content-hash
              deduplication so the same file is never imported twice (even
              if renamed or moved between folders).
            </Typography>
          </Box>

          {!supported && (
            <Alert severity="warning">
              Your browser doesn't support the File System Access API. Watch
              folder requires Chrome, Edge, or Safari 16.4+. The drag-and-drop
              CSV import on the Import tab still works.
            </Alert>
          )}

          {supported && !config && (
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                startIcon={<FolderOpenIcon />}
                onClick={onConnect}
              >
                Connect folder…
              </Button>
              <Typography variant="caption" color="text.secondary">
                Not connected
              </Typography>
            </Stack>
          )}

          {supported && config && (
            <>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Chip
                  icon={<FolderOpenIcon />}
                  label={config.name}
                  color="primary"
                  variant="outlined"
                />
                {permission === 'granted' && (
                  <Chip label="Access granted" size="small" color="success" variant="outlined" />
                )}
                {permission === 'prompt' && (
                  <Chip label="Re-grant needed" size="small" color="warning" />
                )}
                {permission === 'denied' && (
                  <Chip label="Access denied" size="small" color="error" />
                )}
                <Typography variant="caption" color="text.secondary">
                  Connected {new Date(config.connectedAt).toLocaleDateString()}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} flexWrap="wrap">
                {permission !== 'granted' && (
                  <Button
                    variant="contained"
                    onClick={onRequestPerm}
                  >
                    Re-grant access
                  </Button>
                )}
                <Button
                  startIcon={<RefreshIcon />}
                  onClick={onScan}
                  disabled={scanning || permission !== 'granted'}
                >
                  {scanning ? 'Scanning…' : 'Scan now'}
                </Button>
                <Button
                  startIcon={<LinkOffIcon />}
                  onClick={onDisconnect}
                  color="error"
                >
                  Disconnect
                </Button>
              </Stack>

              {scan && (
                <Alert
                  severity={scan.pending.length > 0 ? 'info' : 'success'}
                  sx={{ mt: 1 }}
                >
                  Last scan: {new Date(scan.scannedAt).toLocaleString()}
                  <br />
                  <strong>{scan.pending.length}</strong> new CSV file
                  {scan.pending.length === 1 ? '' : 's'} ready ·{' '}
                  {scan.skipped.filter((s) => s.reason === 'already-imported').length}{' '}
                  already-imported skipped ·{' '}
                  {scan.skipped.filter((s) => s.reason === 'unknown-format').length}{' '}
                  unknown format
                  {scan.pending.length > 0 && (
                    <>
                      <br />
                      <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                        Go to the <strong>Import</strong> tab to review &
                        commit.
                      </Typography>
                    </>
                  )}
                </Alert>
              )}

              <Divider />

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  After successful import
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={config.postImportAction}
                  onChange={(_, v) =>
                    v && updateOption({ postImportAction: v as PostImportAction })
                  }
                >
                  <ToggleButton value="leave">Leave file in folder</ToggleButton>
                  <ToggleButton value="move">
                    Move to .imported/ subfolder
                  </ToggleButton>
                  <ToggleButton value="delete">Delete file</ToggleButton>
                </ToggleButtonGroup>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1 }}
                >
                  Default: <strong>Move</strong>. Keeps history without
                  cluttering the watch folder.
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  When new files are detected
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.autoImport}
                      onChange={(e) =>
                        updateOption({ autoImport: e.target.checked })
                      }
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Auto-import without preview (faster, but you don't see
                      categorization before commit)
                    </Typography>
                  }
                />
              </Box>
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Paper>
      )}

      {!DEMO_ONLY_BUILD && (
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <VpnKeyIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
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
                  <AutoAwesomeIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Local AI Setup
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Power your Strictly Copilot entirely locally using Ollama. Installs the service and downloads the Llama 3.2 1B model. 100% private and runs offline.
                </Typography>
                <Stack spacing={1.5} alignItems="flex-start" sx={{ width: '100%' }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Button 
                      variant="outlined" 
                      startIcon={<AutoAwesomeIcon />}
                      onClick={onInitializeAI}
                      disabled={aiLoaded || aiStatus === 'checking' || aiStatus === 'pulling'}
                    >
                      {aiStatus === 'uninstalled' ? 'Install Local AI' :
                       aiStatus === 'stopped' ? 'Start Ollama' :
                       aiStatus === 'running' ? 'Download AI Model' :
                       aiStatus === 'ready' ? 'AI Ready' :
                       aiStatus === 'checking' ? 'Checking...' :
                       'Retry Setup'}
                    </Button>
                    {aiProgress && aiStatus !== 'pulling' && (
                      <Typography variant="body2" color={aiStatus === 'error' ? 'error' : 'text.secondary'}>
                        {aiProgress}
                      </Typography>
                    )}
                  </Stack>
                  {aiStatus === 'pulling' && (
                    <Box sx={{ width: '100%', maxWidth: 400 }}>
                      <LinearProgress variant="determinate" value={aiProgressPercent} sx={{ mb: 0.5, borderRadius: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        {aiProgress}
                      </Typography>
                    </Box>
                  )}
                </Stack>
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
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
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
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Demo mode
              </Typography>
              {demoMode && (
                <Chip label="On" size="small" color="warning" />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Hides your real accounts and transactions across every view
              (Dashboard, Forecast, Transactions) and shows only the{' '}
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
                    disabled={!demoLoaded}
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
    </Stack>
  );
}
