import { Paper, Box, Typography, Divider } from '@mui/material';
import { useAxisTooltip } from '@mui/x-charts/ChartsTooltip';
import { usd } from '../lib';

export default function CustomAxisTooltipContent() {
  const data = useAxisTooltip();
  if (!data) return null;
  const { axisFormattedValue, seriesItems } = data;

  // Filter out zero-value rows and sort by value desc.
  const sorted = seriesItems
    .map((s) => ({
      seriesId: s.seriesId,
      label: s.formattedLabel || String(s.seriesId),
      color: s.color,
      value: typeof s.value === 'number' ? s.value : 0,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = sorted.reduce((sum, s) => sum + s.value, 0);

  return (
    <Paper
      sx={{
        p: 1.5,
        minWidth: 220,
        maxWidth: 300,
        border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {axisFormattedValue}
      </Typography>
      {sorted.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No spend
        </Typography>
      ) : (
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
          <Box component="tbody">
            {sorted.map((s) => (
              <Box component="tr" key={String(s.seriesId)}>
                <Box
                  component="td"
                  sx={{ width: 12, pr: 1, verticalAlign: 'middle' }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: s.color,
                    }}
                  />
                </Box>
                <Box
                  component="td"
                  sx={{
                    py: 0.25,
                    pr: 2,
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Typography variant="body2">{s.label}</Typography>
                </Box>
                <Box
                  component="td"
                  sx={{ py: 0.25, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                >
                  <Typography variant="body2">{usd.format(s.value)}</Typography>
                </Box>
              </Box>
            ))}
            <Box component="tr">
              <Box component="td" colSpan={3} sx={{ py: 0.5 }}>
                <Divider />
              </Box>
            </Box>
            <Box component="tr">
              <Box component="td" />
              <Box component="td" sx={{ py: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Total
                </Typography>
              </Box>
              <Box
                component="td"
                sx={{
                  py: 0.25,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {usd.format(total)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
