import { Box, Typography, Stack } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { SubscriptionAlerts } from '../../copilotAnalytics';
import { formatCurrency } from './utils';

interface Props {
  alerts?: SubscriptionAlerts;
}

export function QueryResultSubscriptionAlerts({ alerts }: Props) {
  if (!alerts) return null;

  if (
    alerts.priceSpikes?.length === 0 &&
    alerts.duplicateCharges?.length === 0 &&
    alerts.overlappingSubscriptions?.length === 0
  ) {
    return (
      <Box
        sx={{
          p: 2.5,
          borderRadius: 1,
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
          All Clear!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No subscription price spikes, duplicate charges, or overlapping services detected in your history.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Price Spikes */}
      {(alerts.priceSpikes?.length || 0) > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
            PRICE INCREASE DETECTED
          </Typography>
          <Stack spacing={1}>
            {alerts.priceSpikes.map((spike, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(239, 83, 80, 0.3)' : 'error.100',
                  bgcolor: 'rgba(239, 83, 80, 0.02)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {spike.merchantName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Increased on {spike.date}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'error.light' : 'error.dark', fontWeight: 700 }}>
                    {formatCurrency(spike.newPrice)}/mo
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    was {formatCurrency(spike.oldPrice)} (+{Math.round(spike.percentageChange)}%)
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Duplicate Billing */}
      {(alerts.duplicateCharges?.length || 0) > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
            POTENTIAL DOUBLE-BILLING / DUPLICATES
          </Typography>
          <Stack spacing={1}>
            {alerts.duplicateCharges.map((dup, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 1,
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
                    {dup.merchantName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Charged twice: {dup.dates.map(d => d.slice(5)).join(' & ')}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark', fontWeight: 700 }}>
                  {formatCurrency(dup.amount)} each
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Overlapping Subscriptions */}
      {(alerts.overlappingSubscriptions?.length || 0) > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
            OVERLAPPING SERVICE BUNDLES
          </Typography>
          <Stack spacing={1}>
            {alerts.overlappingSubscriptions.map((overlap, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'transparent',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {overlap.groupName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Total: {formatCurrency(overlap.totalEstMonthly)}/mo
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Active: {overlap.merchants.join(', ')}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
