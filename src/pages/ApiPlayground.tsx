import { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, Grid, Stack, TextField, Button, MenuItem, useTheme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { api } from '../api';

export default function ApiPlayground() {
  const theme = useTheme();
  
  // Extract all API endpoints from the api object
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

  const handleExecute = async () => {
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
            throw new Error("Arguments must be a valid JSON array. Example: [\"2024-01-01\", \"2024-12-31\"]");
          }
        } catch (e: any) {
          throw new Error(`Failed to parse arguments JSON: ${e.message}`);
        }
      }

      const fn = (api as any)[selectedEndpoint];
      const res = await fn(...args);
      
      setResult(JSON.stringify(res, null, 2) || 'undefined');
    } catch (e: any) {
      setIsError(true);
      setResult(e instanceof Error ? e.stack || e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          API Playground
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Execute and test native backend API endpoints directly from the browser.
        </Typography>
      </Box>

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
                  onClick={handleExecute}
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
              <Box 
                sx={{ 
                  height: '100%', 
                  minHeight: 400, 
                  maxHeight: 600, 
                  overflow: 'auto', 
                  p: 2,
                }}
              >
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
    </Box>
  );
}
