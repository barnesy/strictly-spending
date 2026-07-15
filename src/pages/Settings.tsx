import { useState, useEffect } from 'react';
import { api } from '../api';
import { useSettings } from '../hooks/queries';
import { usePutSetting, useDeleteSetting } from '../hooks/mutations';
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

import { clearImportedData } from '../demoData';
import { useChatStore } from '../stores/chatStore';
import AnimatedLogo from '../components/AnimatedLogo';

export default function Settings() {
  // Custom confirmation dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmType, setConfirmType] = useState<'deactivateLicense' | 'clearImported' | null>(null);

  const [clearImportedBusy, setClearImportedBusy] = useState(false);
  const [clearImportedMsg, setClearImportedMsg] = useState<string | null>(null);

  const [hasImportedData, setHasImportedData] = useState(false);
  useEffect(() => {
    api.getTransactions().then(rows => {
      setHasImportedData(rows.some(t => t.source !== 'demo'));
    });
  }, []);

  const putSetting = usePutSetting();
  const deleteSetting = useDeleteSetting();

  // License state
  const { data: settings = [] } = useSettings();
  const licenseSetting = settings.find(s => s.key === 'license');
  const license = licenseSetting?.value as { active: boolean; key: string } | undefined;
  
  const maxLoopsSetting = settings.find(s => s.key === 'app:maxLoops');
  const maxLoops = (maxLoopsSetting?.value as number) ?? 15;
  
  const maxHistorySetting = settings.find(s => s.key === 'app:maxHistoryLength');
  const maxHistoryLength = (maxHistorySetting?.value as number) ?? 100;

  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const onActivateLicense = async () => {
    setLicenseError(null);
    if (licenseKey.trim().toUpperCase() === 'PRO-123') {
      await putSetting.mutateAsync({ key: 'license', value: { active: true, key: licenseKey.trim().toUpperCase() } });
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

  const checkAIStatus = useChatStore((s) => s.checkAIStatus);
  const aiStatus = useChatStore((s) => s.aiStatus);

  useEffect(() => {
    checkAIStatus();
  }, [checkAIStatus]);

  const executeClearImported = async () => {
    setClearImportedBusy(true);
    setClearImportedMsg(null);
    try {
      const r = await clearImportedData();
      window.dispatchEvent(new Event('db-update'));
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
              <Divider />
              <Box>
                <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
                  AI Deep Research Mode
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Adjust the maximum agent iterations and history length. Higher numbers allow the AI to tackle more complex, multi-step queries autonomously, but require more processing time and memory.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    size="small"
                    type="number"
                    label="Max Agent Loops"
                    value={maxLoops}
                    onChange={(e) => putSetting.mutate({ key: 'app:maxLoops', value: parseInt(e.target.value) || 15 })}
                    InputProps={{ inputProps: { min: 1, max: 100 } }}
                    helperText="Default: 15"
                    sx={{ width: { xs: '100%', sm: 160 } }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Max Context History"
                    value={maxHistoryLength}
                    onChange={(e) => putSetting.mutate({ key: 'app:maxHistoryLength', value: parseInt(e.target.value) || 100 })}
                    InputProps={{ inputProps: { min: 10, max: 1000 } }}
                    helperText="Default: 100 messages"
                    sx={{ width: { xs: '100%', sm: 160 } }}
                  />
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

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScienceIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                System Stability & Diagnostics
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Configure system-level stability safeguards. If your application freezes or crashes on startup due to WebView2 GPU driver conflicts on Windows, you can launch the app in Safe Mode.
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Safe Mode Status
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Launch the application via terminal or shortcut with the <code>--safe-mode</code> or <code>-s</code> flag to disable WebView2 GPU hardware acceleration and pause all automatic AI background checks.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Chip 
                label={aiStatus === 'safemode' ? 'Safe Mode Active' : 'Safe Mode Inactive'} 
                color={aiStatus === 'safemode' ? 'warning' : 'default'} 
                size="small" 
                sx={{ fontWeight: 600 }}
              />
              <Typography variant="caption" color="text.secondary">
                GPU Hardware Acceleration: <strong>{aiStatus === 'safemode' ? 'OFF (Safe/CPU)' : 'ON (GPU)'}</strong>
              </Typography>
            </Box>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 5, display: 'flex', justifyContent: 'center', bgcolor: 'transparent', boxShadow: 'none', mt: 4 }}>
        <AnimatedLogo scale={8} spinSpeed={0} />
      </Paper>

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
              if (confirmType === 'clearImported') {
                await executeClearImported();
              } else if (confirmType === 'deactivateLicense') {
                await deleteSetting.mutateAsync('license');
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
