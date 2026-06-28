import { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, Grid, Stack, TextField, Button, MenuItem, useTheme, Tabs, Tab, Divider, Chip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DataObjectIcon from '@mui/icons-material/DataObject';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../api';
import { API_WORKFLOWS, type ApiWorkflow, type ApiWorkflowStep } from '../apiWorkflows';
import { queryClient } from '../queryClient';

export default function ApiPlayground() {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);
  
  // -- TAB 0: SINGLE ENDPOINT --
  const endpoints = useMemo(() => {
    return Object.keys(api)
      .filter((key) => typeof (api as any)[key] === 'function')
      .sort();
  }, []);

  const [selectedEndpoint, setSelectedEndpoint] = useState<string>(endpoints[0] || '');
  const [argsInput, setArgsInput] = useState<string>('[]');
  const [result, setResult] = useState<string>('Run an API to see results here...');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);

  const handleExecuteSingle = async () => {
    if (!selectedEndpoint) return;
    
    setIsLoading(true);
    setIsError(false);
    setResult('Executing...');
    
    try {
      let args: any[] = [];
      const trimmedArgs = argsInput.trim();
      
      if (trimmedArgs) {
        try {
          args = JSON.parse(trimmedArgs);
          if (!Array.isArray(args)) {
            throw new Error("Arguments must be a valid JSON array.");
          }
        } catch (e: any) {
          throw new Error(`Failed to parse arguments JSON: ${e.message}`);
        }
      }

      const fn = (api as any)[selectedEndpoint];
      const res = await fn(...args);
      setIsError(false);
      setResult(JSON.stringify(res, null, 2) || 'undefined');
      
      // If this was a mutation (add/put/update/delete/clear), invalidate the UI cache!
      if (/^(add|put|update|delete|clear)/.test(selectedEndpoint)) {
        await queryClient.invalidateQueries();
      }
    } catch (e: any) {
      setIsError(true);
      setResult(e instanceof Error ? e.stack || e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  // -- TAB 1: WORKFLOWS --
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(API_WORKFLOWS[0]?.id || '');
  const activeWorkflow = useMemo(() => API_WORKFLOWS.find(w => w.id === selectedWorkflowId) || null, [selectedWorkflowId]);
  
  const [workflowResults, setWorkflowResults] = useState<Record<number, string>>({});
  const [workflowLoading, setWorkflowLoading] = useState<Record<number, boolean>>({});
  const [workflowArgs, setWorkflowArgs] = useState<Record<number, string>>({});

  // Initialize args when workflow changes
  useMemo(() => {
    if (activeWorkflow) {
      const initialArgs: Record<number, string> = {};
      activeWorkflow.steps.forEach((step, idx) => {
        initialArgs[idx] = step.defaultArgs;
      });
      setWorkflowArgs(initialArgs);
      setWorkflowResults({});
    }
  }, [activeWorkflow]);

  const handleExecuteWorkflowStep = async (stepIndex: number, step: ApiWorkflowStep) => {
    setWorkflowLoading(prev => ({ ...prev, [stepIndex]: true }));
    try {
      let args: any[] = [];
      const trimmedArgs = workflowArgs[stepIndex]?.trim();
      if (trimmedArgs) {
        args = JSON.parse(trimmedArgs);
      }
      
      const fn = (api as any)[step.endpoint];
      if (!fn) throw new Error(`Endpoint ${step.endpoint} not found in api.ts`);
      
      const res = await fn(...args);
      setWorkflowResults(prev => ({ ...prev, [stepIndex]: JSON.stringify(res, null, 2) || 'undefined' }));

      // If this was a mutation (add/put/update/delete/clear), invalidate the UI cache!
      if (/^(add|put|update|delete|clear)/.test(step.endpoint)) {
        await queryClient.invalidateQueries();
      }
    } catch (e: any) {
      const errMsg = e instanceof Error ? (e.stack || e.message) : String(e);
      setWorkflowResults(prev => ({ ...prev, [stepIndex]: `ERROR: ${errMsg}` }));
    } finally {
      setWorkflowLoading(prev => ({ ...prev, [stepIndex]: false }));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          API Playground & Workflows
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Execute single endpoints or run complex, multi-step API workflows to verify data dependencies.
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, val) => setTabValue(val)}>
          <Tab label="Single Endpoint" sx={{ fontWeight: 600, textTransform: 'none' }} />
          <Tab label="API Workflows" sx={{ fontWeight: 600, textTransform: 'none' }} />
        </Tabs>
      </Box>

      {/* --- SINGLE ENDPOINT TAB --- */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Stack spacing={3}>
                  <TextField
                    select
                    label="Select Endpoint"
                    value={selectedEndpoint}
                    onChange={(e) => setSelectedEndpoint(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    {endpoints.map((ep) => (
                      <MenuItem key={ep} value={ep}>
                        <Typography sx={{ fontFamily: 'monospace' }}>{ep}</Typography>
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Arguments (JSON Array)"
                    multiline
                    rows={8}
                    value={argsInput}
                    onChange={(e) => setArgsInput(e.target.value)}
                    fullWidth
                    placeholder={'["arg1", 2, { "key": "value" }]'}
                    InputProps={{
                      sx: { fontFamily: 'monospace', fontSize: '14px' }
                    }}
                    helperText="Provide arguments as a JSON array."
                  />

                  <Button 
                    variant="contained" 
                    color="primary"
                    fullWidth
                    size="large"
                    onClick={handleExecuteSingle}
                    disabled={!selectedEndpoint || isLoading}
                    startIcon={<PlayArrowIcon />}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    {isLoading ? 'Executing...' : 'Execute'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f5f5f5' }}>
              <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <DataObjectIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" fontWeight="600" color="text.secondary">
                  Response Output
                </Typography>
              </Box>
              <CardContent sx={{ flexGrow: 1, p: 0, '&:last-child': { pb: 0 } }}>
                <Box sx={{ height: '100%', minHeight: 400, maxHeight: 600, overflow: 'auto', p: 2 }}>
                  <Typography
                    component="pre"
                    sx={{ 
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      m: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: isError ? 'error.main' : 'text.primary'
                    }}
                  >
                    {result}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* --- WORKFLOWS TAB --- */}
      {tabValue === 1 && activeWorkflow && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Playbook
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Select a predefined workflow to step through. This same playbook is injected into the LLM's system prompt for orientation.
                </Typography>
                <Stack spacing={1}>
                  {API_WORKFLOWS.map((wf) => (
                    <Card 
                      key={wf.id}
                      variant="outlined"
                      sx={{ 
                        cursor: 'pointer',
                        bgcolor: selectedWorkflowId === wf.id ? 'primary.light' : 'transparent',
                        borderColor: selectedWorkflowId === wf.id ? 'primary.main' : 'divider',
                        transition: 'all 0.2s',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                      onClick={() => setSelectedWorkflowId(wf.id)}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Typography variant="subtitle2" fontWeight="bold" color={selectedWorkflowId === wf.id ? 'primary.contrastText' : 'text.primary'}>
                          {wf.title}
                        </Typography>
                        <Typography variant="caption" color={selectedWorkflowId === wf.id ? 'primary.contrastText' : 'text.secondary'} sx={{ opacity: 0.8 }}>
                          {wf.steps.length} Steps
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={8}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h5" fontWeight="bold">{activeWorkflow.title}</Typography>
                <Typography variant="body1" color="text.secondary">{activeWorkflow.description}</Typography>
              </Box>

              {['setup', 'execution', 'teardown'].map(phase => {
                const phaseSteps = activeWorkflow.steps.map((s, i) => ({ ...s, originalIdx: i })).filter(s => s.phase === phase);
                if (phaseSteps.length === 0) return null;

                const getPhaseStyles = (p: string) => {
                  switch (p) {
                    case 'setup': return { headerBg: theme.palette.mode === 'dark' ? '#333' : '#e0e0e0', color: 'text.secondary' };
                    case 'execution': return { headerBg: theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light', color: theme.palette.mode === 'dark' ? 'primary.contrastText' : 'primary.dark' };
                    case 'teardown': return { headerBg: theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light', color: theme.palette.mode === 'dark' ? 'warning.contrastText' : 'warning.dark' };
                    default: return { headerBg: 'background.default', color: 'text.primary' };
                  }
                };
                const phaseStyles = getPhaseStyles(phase);

                return (
                  <Box key={phase} sx={{ mb: 4 }}>
                    <Typography variant="overline" sx={{ color: phaseStyles.color, fontWeight: 'bold', fontSize: '0.85rem' }}>
                      {phase} Phase
                    </Typography>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                      {phaseSteps.map((step) => {
                        const idx = step.originalIdx;
                        return (
                          <Card key={idx} variant="outlined" sx={{ borderColor: phase === 'execution' ? 'primary.main' : 'divider', borderWidth: phase === 'execution' ? 2 : 1 }}>
                            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: phaseStyles.headerBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Stack direction="row" spacing={2} alignItems="center">
                                <Chip label={`Step ${idx + 1}`} size="small" color={phase === 'execution' ? 'primary' : 'default'} />
                                <Typography variant="subtitle1" fontWeight="bold" sx={{ fontFamily: 'monospace', color: phase === 'setup' ? 'text.primary' : 'inherit' }}>
                                  api.{step.endpoint}(...)
                                </Typography>
                              </Stack>
                              <Button 
                                variant="contained" 
                                size="small" 
                                color={phase === 'teardown' ? 'warning' : (phase === 'setup' ? 'inherit' : 'primary')}
                                onClick={() => handleExecuteWorkflowStep(idx, step)}
                                disabled={workflowLoading[idx]}
                                startIcon={<PlayArrowIcon />}
                              >
                                {workflowLoading[idx] ? 'Running...' : 'Run Step'}
                              </Button>
                            </Box>
                            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                              <Grid container>
                                <Grid item xs={12} sm={5} sx={{ borderRight: 1, borderColor: 'divider', p: 2 }}>
                                  <Typography variant="body2" color="text.secondary" paragraph>
                                    {step.description}
                                  </Typography>
                                  <Typography variant="caption" fontWeight="bold" color="text.secondary" gutterBottom>
                                    JSON Arguments Array
                                  </Typography>
                                  <TextField
                                    multiline
                                    fullWidth
                                    size="small"
                                    value={workflowArgs[idx] || ''}
                                    onChange={(e) => setWorkflowArgs(prev => ({ ...prev, [idx]: e.target.value }))}
                                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: '13px' } }}
                                  />
                                </Grid>
                                <Grid item xs={12} sm={7} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" fontWeight="bold" color="text.secondary">
                                      Output
                                    </Typography>
                                    {workflowResults[idx] && (
                                      <Button size="small" sx={{ minWidth: 0, p: 0 }} onClick={() => copyToClipboard(workflowResults[idx])}>
                                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                                      </Button>
                                    )}
                                  </Box>
                                  <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                                    <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: '12px', m: 0, color: workflowResults[idx]?.startsWith('ERROR') ? 'error.main' : 'text.primary' }}>
                                      {workflowResults[idx] || 'Not executed yet.'}
                                    </Typography>
                                  </Box>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
