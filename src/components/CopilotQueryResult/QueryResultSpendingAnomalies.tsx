import { Box, Typography, Stack } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { SpendingAnomalies } from '../../copilotAnalytics';
import { formatCurrency } from './utils';

interface Props {
  anomalies?: SpendingAnomalies;
}

export function QueryResultSpendingAnomalies({ anomalies }: Props) {
  if (!anomalies) return null;

  if ((anomalies.categorySpikes?.length || 0) === 0 && (anomalies.outliers?.length || 0) === 0) {
    return (
      <Box
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.3)' : 'success.100',
          bgcolor: 'rgba(46, 125, 50, 0.02)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: (theme) => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark' }}>
          No Anomalies Found!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your spending in these categories matches baseline levels, and no outlier transactions were found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Category Spikes */}
      {(anomalies.categorySpikes?.length || 0) > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
            CATEGORY SPENDING SPIKES
          </Typography>
          <Stack spacing={1}>
            {anomalies.categorySpikes.map((spike, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(239, 83, 80, 0.3)' : 'error.100',
                  bgcolor: 'rgba(239, 83, 80, 0.02)',
                }}
              >
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {spike.category}
                  </Typography>
                  <Typography variant="body2" sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'error.light' : 'error.dark', fontWeight: 700 }}>
                    +{Math.round(spike.percentageChange)}% Spike
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Current rate: {formatCurrency(spike.currentPeriodSpend * (1 / spike.durationMonths))}/mo (vs baseline {formatCurrency(spike.baselineMonthlySpend)}/mo)
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Outlier Transactions */}
      {(anomalies.outliers?.length || 0) > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
            OUTLIER / LARGE TRANSACTIONS
          </Typography>
          <Stack spacing={1}>
            {anomalies.outliers.map((outlier, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.3)' : 'warning.100',
                  bgcolor: 'rgba(237, 108, 2, 0.02)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {outlier.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {outlier.date} | {outlier.category}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark', fontWeight: 700 }}>
                    {formatCurrency(outlier.amount)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {outlier.multiplier.toFixed(1)}x category avg
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
