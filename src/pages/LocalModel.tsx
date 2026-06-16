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
  TextField,
  LinearProgress,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MemoryIcon from '@mui/icons-material/Memory';

import { db } from '../db';
import { useChatStore, formatModelName } from '../chatStore';
import { localAI } from '../ai';

const RECOMMENDED_OLLAMA_MODELS = [
  { name: 'llama3.2:1b', label: 'Llama 3.2 1B (Default)', desc: 'Fast, lightweight (1.3 GB). Ideal for most machines.', size: '1.3 GB' },
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', desc: 'Higher quality reasoning (2.0 GB). Recommended if you have 8GB+ RAM.', size: '2.0 GB' },
  { name: 'gemma2:2b', label: 'Gemma 2 2B', desc: 'Google-developed lightweight model (1.6 GB). Highly responsive.', size: '1.6 GB' },
  { name: 'mistral:latest', label: 'Mistral 7B', desc: 'High capability model (4.1 GB). Requires 16GB+ RAM.', size: '4.1 GB' },
];


export default function LocalModel() {
  const licenseSetting = useLiveQuery(() => db.settings.get('license'), []);
  const license = licenseSetting?.value as { active: boolean; key: string } | undefined;

  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const {
    aiLoaded,
    aiStatus,
    aiProgress,
    aiProgressPercent,
    modelName,
    setModelName,
    initializeAI,
    checkAIStatus,
    pullModel,
    cancelPullModel,
  } = useChatStore();

  const [installedModels, setInstalledModels] = useState<any[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // Diagnostic Playground State
  const [testPrompt, setTestPrompt] = useState('Hello! Are you online?');
  const [testResponse, setTestResponse] = useState('');
  const [testingAI, setTestingAI] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const refreshInstalledModels = useCallback(async () => {
    setFetchingModels(true);
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.ok) {
        const data = await res.json();
        setInstalledModels(data.models || []);
      }
    } catch (e) {
      console.error('Failed to fetch models from Ollama:', e);
    } finally {
      setFetchingModels(false);
    }
  }, []);

  useEffect(() => {
    checkAIStatus();
  }, [checkAIStatus]);

  useEffect(() => {
    if (aiStatus === 'ready' || aiStatus === 'running') {
      refreshInstalledModels();
    }
  }, [aiStatus, refreshInstalledModels]);

  const onActivateLicense = async () => {
    setLicenseError(null);
    if (licenseKey.trim().toUpperCase() === 'PRO-123') {
      await db.settings.put({ key: 'license', value: { active: true, key: licenseKey.trim().toUpperCase() } });
      setLicenseKey('');
    } else {
      setLicenseError("Invalid license key. For testing, try 'PRO-123'.");
    }
  };

  const handleSelectModel = (name: string) => {
    setModelName(name);
  };

  const handlePullCustomModel = async (name: string) => {
    if (!name.trim()) return;
    setModelName(name.trim());
    setTimeout(async () => {
      await pullModel();
      await refreshInstalledModels();
    }, 100);
  };

  const runTestPrompt = async () => {
    setTestingAI(true);
    setTestError(null);
    setTestResponse('');
    try {
      const reply = await localAI.chatCopilot(
        [{ role: 'user', content: testPrompt }],
        `Current Page: /local-model
Active Filters: {}
Available Categories: Groceries, Utilities, Travel, Restaurants & Coffee`
      );
      setTestResponse(reply);
    } catch (e: any) {
      setTestError(e.message);
    } finally {
      setTestingAI(false);
    }
  };

  const getStatusColor = () => {
    switch (aiStatus) {
      case 'ready': return 'success';
      case 'pulling': return 'warning';
      case 'checking': return 'info';
      case 'running': return 'primary';
      default: return 'error';
    }
  };

  const getStatusLabel = () => {
    switch (aiStatus) {
      case 'ready': return 'Ready';
      case 'pulling': return 'Downloading Model';
      case 'checking': return 'Checking status...';
      case 'running': return 'Model needs download';
      case 'stopped': return 'Stopped';
      case 'uninstalled': return 'Not Installed';
      default: return 'Disconnected';
    }
  };

  if (!license?.active) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Paper sx={{ p: 4, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'absolute',
              top: -50,
              right: -50,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(25, 118, 210, 0.05) 0%, rgba(25, 118, 210, 0) 70%)',
            }}
          />
          <VpnKeyIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            Strictly Spending Pro
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Unlock advanced local features like private Local AI transaction reviews, local NL queries, and native Watch Folders with a one-time license key purchase.
          </Typography>
          <Stack spacing={2} sx={{ maxWidth: 360, mx: 'auto' }}>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="License Key"
                placeholder="PRO-..."
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={onActivateLicense} disabled={!licenseKey.trim()}>
                Activate
              </Button>
            </Stack>
            {licenseError && <Alert severity="error">{licenseError}</Alert>}
            <Typography variant="caption" color="text.secondary">
              For testing and demonstration, use the license key: <strong>PRO-123</strong>
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            AI Local Model Management
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Configure, download, and test offline models. 100% private and runs locally on your machine.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              checkAIStatus();
              if (aiStatus === 'ready' || aiStatus === 'running') {
                refreshInstalledModels();
              }
            }}
            disabled={fetchingModels || aiStatus === 'checking' || aiStatus === 'pulling'}
          >
            Refresh Status
          </Button>
        </Stack>
      </Box>

      {/* Connection & Status Banner */}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Ollama Connection Status:
              </Typography>
              <Chip
                label={getStatusLabel()}
                color={getStatusColor()}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Engine Type: <strong>Local Host Socket (http://localhost:11434)</strong>
            </Typography>
          </Stack>

          {aiStatus !== 'ready' && aiStatus !== 'pulling' && (
            <Alert severity="info">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Ollama Server Setup Required
              </Typography>
              To use Ollama, ensure you have downloaded and started <strong>Ollama</strong> on your local machine.
              Get Ollama for macOS, Windows, or Linux at <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>.
              Once running, Strictly Spending will connect automatically.
            </Alert>
          )}

          {aiStatus === 'running' && (
            <Alert severity="warning">
              Ollama server is active, but you do not have the default model downloaded yet. Select a model below to pull/download it.
            </Alert>
          )}

          {aiStatus === 'pulling' && (
            <Box sx={{ width: '100%', mt: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                <LinearProgress variant="determinate" value={aiProgressPercent} sx={{ flex: 1, height: 8, borderRadius: 1 }} />
                <Button size="small" variant="outlined" color="error" onClick={cancelPullModel}>
                  Cancel
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {aiProgress}
              </Typography>
            </Box>
          )}

          {aiStatus !== 'ready' && aiStatus !== 'pulling' && aiStatus !== 'uninstalled' && (
            <Button
              variant="contained"
              sx={{ alignSelf: 'flex-start' }}
              onClick={initializeAI}
              disabled={aiStatus === 'checking'}
            >
              Start Connection Check / Setup
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Model Selection */}
      {(aiStatus === 'ready' || aiStatus === 'running' || aiStatus === 'pulling' || aiStatus === 'stopped') && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
                Active Model Selection
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Select from models currently downloaded on your local Ollama server.
              </Typography>

              {installedModels.length > 0 ? (
                <Stack spacing={2.5}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="active-model-select-label">Active Model</InputLabel>
                    <Select
                      labelId="active-model-select-label"
                      value={modelName}
                      label="Active Model"
                      onChange={(e) => handleSelectModel(e.target.value)}
                    >
                      {installedModels.map((m) => (
                        <MenuItem key={m.name} value={m.name}>
                          {m.name} ({Math.round(m.size / 1e6) / 1000} GB)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                      Current Config Summary:
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                      <Typography variant="body2">
                        <strong>Active:</strong> {modelName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Status: {aiLoaded ? 'Connected & Loaded' : 'Connection Pending / Unloaded'}
                      </Typography>
                    </Paper>
                  </Box>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No models detected in Ollama. Please download a model below.
                </Typography>
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
                Pull / Download Model
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Download a model directly from the Ollama library.
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Model Tag (e.g. llama3.2:1b)"
                  placeholder="llama3.2:3b"
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                />
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => handlePullCustomModel(customModelInput)}
                  disabled={!customModelInput.trim() || aiStatus === 'pulling'}
                >
                  Pull
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                Recommended Models:
              </Typography>
              <List disablePadding>
                {RECOMMENDED_OLLAMA_MODELS.map((rec) => {
                  const isInstalled = installedModels.some((m) => {
                    const installed = m.name;
                    if (installed === rec.name) return true;
                    
                    const recBase = rec.name.split(':')[0];
                    const recTag = rec.name.split(':')[1] || 'latest';
                    
                    const instBase = installed.split(':')[0];
                    const instTag = installed.split(':')[1] || 'latest';
                    
                    if (recBase === instBase) {
                      if (recTag === instTag) return true;
                      if ((recTag === 'latest' || recTag === '3b') && (instTag === 'latest' || instTag === '3b')) {
                        return true;
                      }
                    }
                    return false;
                  });

                  const recBase = rec.name.split(':')[0];
                  const recTag = rec.name.split(':')[1] || 'latest';
                  const activeBase = modelName.split(':')[0];
                  const activeTag = modelName.split(':')[1] || 'latest';
                  const isActive = modelName === rec.name || (recBase === activeBase && (
                    recTag === activeTag ||
                    ((recTag === 'latest' || recTag === '3b') && (activeTag === 'latest' || activeTag === '3b'))
                  ));

                  return (
                    <ListItem key={rec.name} divider sx={{ px: 0, py: 1.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {rec.label}
                            </Typography>
                            {isInstalled && (
                              <Chip
                                icon={<CheckCircleIcon color="success" style={{ fontSize: 14 }} />}
                                label="Downloaded"
                                size="small"
                                variant="outlined"
                                color="success"
                                sx={{ height: 20, fontSize: 10 }}
                              />
                            )}
                          </Box>
                        }
                        secondary={rec.desc}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <ListItemSecondaryAction>
                        {isInstalled ? (
                          <Button
                            size="small"
                            variant={isActive ? 'contained' : 'outlined'}
                            color={isActive ? 'primary' : 'inherit'}
                            onClick={() => handleSelectModel(rec.name)}
                          >
                            {isActive ? 'Active' : 'Select'}
                          </Button>
                        ) : (
                          <IconButton
                            color="primary"
                            onClick={() => handlePullCustomModel(rec.name)}
                            disabled={aiStatus === 'pulling'}
                          >
                            <DownloadIcon />
                          </IconButton>
                        )}
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Diagnostic Playground */}
      {aiLoaded && (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Model Diagnostic Playground
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Verify that your offline local model is responsive and respects your custom/active capabilities.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Test Prompt"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
              />
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={runTestPrompt}
                disabled={testingAI}
              >
                Send
              </Button>
            </Stack>

            {testingAI && (
              <Box sx={{ py: 1 }}>
                <LinearProgress />
              </Box>
            )}

            {testResponse && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                  Response from {formatModelName(modelName)}:
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {testResponse}
                </Paper>
              </Box>
            )}

            {testError && (
              <Alert severity="error" icon={<ErrorOutlineIcon />}>
                Diagnostic failed: {testError}
              </Alert>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
