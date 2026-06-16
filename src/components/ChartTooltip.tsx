import { Paper, Box, Typography, Divider } from '@mui/material';
import { useAxisTooltip } from '@mui/x-charts/ChartsTooltip';
import { usd } from '../lib';
import { useFilters } from '../store';

export default function CustomAxisTooltipContent() {
  const data = useAxisTooltip();
  const spendOnly = useFilters((s) => s.spendOnly);
  if (!data) return null;
  const { axisFormattedValue, seriesItems } = data;

  const incomeItem = seriesItems.find((s) => s.seriesId === 'income');
  const runwayItem = seriesItems.find((s) => s.seriesId === 'runway');
  const spendItems = seriesItems.filter((s) => s.seriesId !== 'income' && s.seriesId !== 'runway');

  // Filter out zero-value rows and sort by value desc.
  const sorted = spendItems
    .map((s) => ({
      seriesId: s.seriesId,
      label: s.formattedLabel || String(s.seriesId),
      color: s.color,
      value: typeof s.value === 'number' ? s.value : 0,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalSpend = sorted.reduce((sum, s) => sum + s.value, 0);
  const incomeValue = incomeItem && typeof incomeItem.value === 'number' ? incomeItem.value : 0;
  const runwayValue = runwayItem && typeof runwayItem.value === 'number' ? runwayItem.value : 0;
  const remaining = incomeValue - totalSpend;

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
      {sorted.length === 0 && incomeValue === 0 && runwayValue === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No activity
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

            {spendOnly ? (
              // Spend only mode: Show Total Spend as summary
              sorted.length > 0 && (
                <>
                  <Box component="tr">
                    <Box component="td" colSpan={3} sx={{ py: 0.5 }}>
                      <Divider />
                    </Box>
                  </Box>
                  <Box component="tr">
                    <Box component="td" />
                    <Box component="td" sx={{ py: 0.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Total Spend
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
                        {usd.format(totalSpend)}
                      </Typography>
                    </Box>
                  </Box>
                </>
              )
            ) : (
              // Net flow mode: Show Spend, Income, and Remaining as summary
              (totalSpend > 0 || incomeValue > 0) && (
                <>
                  <Box component="tr">
                    <Box component="td" colSpan={3} sx={{ py: 0.5 }}>
                      <Divider />
                    </Box>
                  </Box>

                  {totalSpend > 0 && (
                    <Box component="tr">
                      <Box component="td" />
                      <Box component="td" sx={{ py: 0.25 }}>
                        <Typography variant="body2" color="text.secondary">
                          Total Spend
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
                        <Typography variant="body2" color="text.secondary">
                          -{usd.format(totalSpend)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {incomeValue > 0 && (
                    <Box component="tr">
                      <Box
                        component="td"
                        sx={{ width: 12, pr: 1, verticalAlign: 'middle' }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: incomeItem?.color || '#2e7d32',
                          }}
                        />
                      </Box>
                      <Box component="td" sx={{ py: 0.25 }}>
                        <Typography variant="body2" color="success.main">
                          Income
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
                        <Typography variant="body2" color="success.main">
                          +{usd.format(incomeValue)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  <Box component="tr">
                    <Box component="td" colSpan={3} sx={{ py: 0.5 }}>
                      <Divider />
                    </Box>
                  </Box>

                  <Box component="tr">
                    <Box component="td" />
                    <Box component="td" sx={{ py: 0.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Remaining
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
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: remaining >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {remaining >= 0 ? `+${usd.format(remaining)}` : usd.format(remaining)}
                      </Typography>
                    </Box>
                  </Box>
                </>
              )
            )}

            {runwayValue > 0 && (
              <>
                {(sorted.length > 0 || incomeValue > 0) && (
                  <Box component="tr">
                    <Box component="td" colSpan={3} sx={{ py: 0.5 }}>
                      <Divider />
                    </Box>
                  </Box>
                )}
                <Box component="tr">
                  <Box
                    component="td"
                    sx={{ width: 12, pr: 1, verticalAlign: 'middle' }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: runwayItem?.color || '#90caf9',
                      }}
                    />
                  </Box>
                  <Box component="td" sx={{ py: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      Projected Cash
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
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {usd.format(runwayValue)}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
