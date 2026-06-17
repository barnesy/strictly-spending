import React from 'react';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

export interface LicenseGateProps {
  licenseKey: string;
  setLicenseKey: (key: string) => void;
  licenseError: string | null;
  onActivateLicense: () => void;
}

export const LicenseGate: React.FC<LicenseGateProps> = ({
  licenseKey,
  setLicenseKey,
  licenseError,
  onActivateLicense,
}) => {
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
          Unlock advanced local features like private Local AI transaction reviews, custom Agent Skills, and native Watch Folders with a one-time license key purchase.
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
};
